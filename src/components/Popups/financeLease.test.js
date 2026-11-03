import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinanceLeaseKey,
  createFinanceLeaseManager,
} from './financeLease.js';

// A navigator.locks fake with ifAvailable semantics (callback(null) when held) and query().
const createFakeWebLocks = () => {
  const held = new Set();
  const requests = [];
  return {
    held,
    requests,
    async request(name, optionsOrCallback, maybeCallback) {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      const options = typeof optionsOrCallback === 'object' && optionsOrCallback ? optionsOrCallback : {};
      requests.push({ name, options });
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        throw new Error(`Lock ${name} already held`);
      }
      held.add(name);
      try {
        return await callback({ name, mode: options.mode || 'exclusive' });
      } finally {
        held.delete(name);
      }
    },
    async query() {
      return { held: [...held].map((name) => ({ name, mode: 'exclusive' })), pending: [] };
    },
  };
};

const NAME = 'rtx-fin:broker-a:710001';
const ID = { brokerId: 'broker-a', loginKey: 710001 };

test('buildFinanceLeaseKey: canonical rtx-fin:<broker>:<login>, and null for an empty broker or login', () => {
  assert.equal(buildFinanceLeaseKey(ID), NAME);
  assert.equal(buildFinanceLeaseKey({ brokerId: '', loginKey: 1 }), null);
  assert.equal(buildFinanceLeaseKey({ brokerId: 'broker-a' }), null);
});

test('runWithLease: runs the task under an exclusive, ifAvailable request and releases the lock after it', async () => {
  const locks = createFakeWebLocks();
  const manager = createFinanceLeaseManager({ getLocks: () => locks, advisoryIntervalMs: 0 });
  const seen = [];
  const out = await manager.runWithLease(ID, async (lease) => {
    seen.push(lease.lockName);
    assert.equal(locks.held.has(NAME), true, 'held while the task runs');
    return 'done';
  });
  assert.deepEqual(out, { acquired: true, reason: null, lockName: NAME, result: 'done' });
  assert.deepEqual(seen, [NAME]);
  assert.equal(locks.held.has(NAME), false, 'released');
  assert.deepEqual(locks.requests[0].options, { mode: 'exclusive', ifAvailable: true });
});

test('runWithLease: a held lock gives callback(null), so the task never runs and the reason is busy', async () => {
  const locks = createFakeWebLocks();
  locks.held.add(NAME);
  const manager = createFinanceLeaseManager({ getLocks: () => locks, advisoryIntervalMs: 0 });
  let ran = false;
  const out = await manager.runWithLease(ID, async () => { ran = true; });
  assert.equal(ran, false, 'nothing is done when the lock is not granted');
  assert.deepEqual(out, { acquired: false, reason: 'busy', lockName: NAME });
});

test('runWithLease: no navigator.locks means nothing is granted and the reason is no-locks (fail closed)', async () => {
  const manager = createFinanceLeaseManager({ getLocks: () => null, advisoryIntervalMs: 0 });
  let ran = false;
  const out = await manager.runWithLease(ID, async () => { ran = true; });
  assert.equal(ran, false);
  assert.deepEqual(out, { acquired: false, reason: 'no-locks', lockName: NAME });
  assert.equal(manager.supported(), false);
});

test('runWithLease: a rejected locks.request gives lock-error and never runs the task', async () => {
  const manager = createFinanceLeaseManager({
    getLocks: () => ({ request: async () => { throw new Error('lock service unavailable'); } }),
    advisoryIntervalMs: 0,
  });
  let ran = false;
  const out = await manager.runWithLease(ID, async () => { ran = true; });
  assert.equal(ran, false);
  assert.deepEqual(out, { acquired: false, reason: 'lock-error', lockName: NAME });
});

test('runWithLease: a task that throws rejects to the caller, and the lock is still released', async () => {
  const locks = createFakeWebLocks();
  const manager = createFinanceLeaseManager({ getLocks: () => locks, advisoryIntervalMs: 0 });
  await assert.rejects(manager.runWithLease(ID, async () => { throw new Error('task bug'); }), /task bug/);
  assert.equal(locks.held.has(NAME), false);
});

test('two lease managers (two tabs) share one lock: B is busy while A holds it, and granted after A releases', async () => {
  const locks = createFakeWebLocks();
  const tabA = createFinanceLeaseManager({ getLocks: () => locks, advisoryIntervalMs: 0 });
  const tabB = createFinanceLeaseManager({ getLocks: () => locks, advisoryIntervalMs: 0 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pendingA = tabA.runWithLease(ID, async () => gate);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await tabB.runWithLease(ID, async () => 'b')).reason, 'busy');
  release();
  await pendingA;
  const afterB = await tabB.runWithLease(ID, async () => 'b');
  assert.equal(afterB.acquired, true);
  assert.equal(afterB.result, 'b');
});

test('L5 the advisory poll is off at creation and runs only between startPolling and stopPolling (reference-counted)', async () => {
  const locks = createFakeWebLocks();
  let queries = 0;
  const countingQuery = locks.query;
  locks.query = async () => { queries += 1; return countingQuery(); };
  const lease = createFinanceLeaseManager({ getLocks: () => locks, advisoryIntervalMs: 5 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(queries, 0, 'no query at module load or creation');
  lease.startPolling();
  lease.startPolling();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(queries >= 2, 'polling runs while a user is open');
  lease.stopPolling();
  const afterFirstStop = queries;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(queries > afterFirstStop, 'still polling while the second user is open');
  lease.stopPolling();
  const afterLastStop = queries;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(queries, afterLastStop, 'no query after the last user closes');
});

test('advisory state: isBusy follows navigator.locks.query() and is independent of the lock itself', async () => {
  const locks = createFakeWebLocks();
  const manager = createFinanceLeaseManager({ getLocks: () => locks, advisoryIntervalMs: 0 });
  assert.equal(manager.isBusy(ID), false);
  locks.held.add(NAME);
  await manager.refreshAdvisory();
  assert.equal(manager.isBusy(ID), true);
  locks.held.delete(NAME);
  await manager.refreshAdvisory();
  assert.equal(manager.isBusy(ID), false);
});

test('advisory state: a change in the advisory view notifies listeners, and a refresh without change does not', async () => {
  const locks = createFakeWebLocks();
  const manager = createFinanceLeaseManager({ getLocks: () => locks, advisoryIntervalMs: 0 });
  let calls = 0;
  const off = manager.onChange(() => { calls += 1; });
  locks.held.add(NAME);
  await manager.refreshAdvisory();
  assert.equal(calls, 1);
  await manager.refreshAdvisory();
  assert.equal(calls, 1, 'no change, no notification');
  off();
  locks.held.delete(NAME);
  await manager.refreshAdvisory();
  assert.equal(calls, 1, 'unsubscribed');
});

test('no storage lease exists any more: the manager exposes no storage-based API', () => {
  const manager = createFinanceLeaseManager({ getLocks: () => null, advisoryIntervalMs: 0 });
  assert.equal(typeof manager.acquireSync, 'undefined');
  assert.equal(typeof manager.isHeld, 'undefined');
  assert.equal(typeof manager.isHeldByOther, 'undefined');
});
