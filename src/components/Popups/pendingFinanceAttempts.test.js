import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACKNOWLEDGED_LOG_LIMIT,
  PENDING_FINANCE_ATTEMPT_TTL_MS,
  PENDING_FINANCE_ATTEMPTS_STORAGE_KEY,
  buildFinanceAttemptScope,
  createPendingFinanceAttemptStore,
  fingerprintOperation,
  parseFinanceAttemptScope,
  resolveFinanceAttemptTtlMs,
} from './pendingFinanceAttempts.js';

// Fake logins and brokers only.
const LOGIN = '710001';
const OTHER_LOGIN = '710002';
const SCOPE = buildFinanceAttemptScope({ managerLogin: 'mgr-a', brokerId: 'broker-a' });
const OTHER_MANAGER_SCOPE = buildFinanceAttemptScope({ managerLogin: 'mgr-b', brokerId: 'broker-a' });
const H = 3600e3;

const createFakeStorage = () => {
  const values = new Map();
  const storage = {
    values,
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    failGet: false,
    failSet: false,
    onSet: null,
    getItem: (key) => {
      if (storage.failGet) throw new Error('SecurityError');
      return values.has(key) ? values.get(key) : null;
    },
    setItem: (key, value) => {
      if (storage.failSet) throw new Error('QuotaExceededError');
      values.set(key, storage.transform ? storage.transform(key, String(value)) : String(value));
    },
    removeItem: (key) => {
      if (storage.failSet) throw new Error('QuotaExceededError');
      values.delete(key);
    },
    blob: (login = LOGIN) => values.get(`${PENDING_FINANCE_ATTEMPTS_STORAGE_KEY}:broker-a:${login}`) ?? null,
  };
  return storage;
};

const createFakeWebLocks = () => {
  const held = new Set();
  return {
    held,
    async request(name, optionsOrCallback, maybeCallback) {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      const options = typeof optionsOrCallback === 'object' && optionsOrCallback ? optionsOrCallback : {};
      if (held.has(name)) return callback(options.ifAvailable ? null : undefined);
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
};

const createClock = (start = Date.parse('2026-11-02T10:00:00Z')) => {
  const clock = { t: start, now: () => clock.t };
  return clock;
};

const makeStore = (storage, clock, extra = {}) => {
  const locks = extra.locks ?? createFakeWebLocks();
  const { locks: _ignored, ...rest } = extra;
  return createPendingFinanceAttemptStore({
    getStorage: () => storage,
    getLocks: () => locks,
    now: clock.now,
    advisoryIntervalMs: 0,
    ...rest,
  });
};

// Runs `task(lease)` for one account, the way the controller does.
const underLock = (store, loginKey, task, scope = SCOPE) => store.runWithAccountLease({ scope, loginKey }, task);

const prepareFor = (store, { loginKey = LOGIN, scope = SCOPE, key = 'K1', amount = '100.00' } = {}) => underLock(store, loginKey, (lease) => store.prepare({
  scope,
  loginKey,
  lease,
  type: 'balance',
  direction: 'in',
  endpointKey: 'deposit',
  payload: { login: Number(loginKey), amount, comment: 'Client deposit' },
  createKey: () => key,
}));

const recordFor = (key, overrides = {}) => ({
  scope: SCOPE,
  loginKey: LOGIN,
  fingerprint: 'fp-same',
  type: 'balance',
  direction: 'in',
  endpointKey: 'deposit',
  payload: { login: 710001, amount: '100.00', comment: 'x', idempotency_key: key },
  status: 'pending',
  code: null,
  reversal: null,
  createdAt: Date.parse('2026-11-02T10:00:00Z'),
  acknowledgedAt: null,
  acknowledgedBy: null,
  expired: false,
  ...overrides,
});

test('scope: manager and broker are both required, and parse back', () => {
  assert.equal(buildFinanceAttemptScope({ managerLogin: 'mgr-a', brokerId: 'broker-a' }), 'manager:mgr-a|broker:broker-a');
  assert.equal(buildFinanceAttemptScope({ managerLogin: '', brokerId: 'broker-a' }), null);
  assert.equal(buildFinanceAttemptScope({ managerLogin: 'mgr-a', brokerId: null }), null);
  assert.deepEqual(parseFinanceAttemptScope(SCOPE), { managerLogin: 'mgr-a', brokerId: 'broker-a' });
  assert.deepEqual(parseFinanceAttemptScope('garbage'), { managerLogin: '', brokerId: '' });
});

test('fingerprint ignores the idempotency key and is display-only', () => {
  const a = fingerprintOperation({ type: 'balance', direction: 'in', endpointKey: 'deposit', payload: { login: 1, amount: '1.00', idempotency_key: 'K1' } });
  const b = fingerprintOperation({ type: 'balance', direction: 'in', endpointKey: 'deposit', payload: { login: 1, amount: '1.00', idempotency_key: 'K2' } });
  assert.equal(a, b);
});

test('TTL: min(24 h, window - margin) is 23 h by default and is capped at 24 h', () => {
  assert.equal(PENDING_FINANCE_ATTEMPT_TTL_MS, 82_800_000);
  assert.equal(resolveFinanceAttemptTtlMs({ windowMs: 48 * H, marginMs: H }), 24 * H);
  assert.equal(resolveFinanceAttemptTtlMs({ windowMs: 10 * H, marginMs: H }), 9 * H);
});

test('prepare: refuses without a lease token for the account, and writes nothing', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  const noLease = store.prepare({ scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: 'in', endpointKey: 'deposit', payload: { login: 710001, amount: '1.00' }, createKey: () => 'K1' });
  assert.equal(noLease.blocked, true);
  assert.equal(noLease.reason, 'no-lease');
  assert.equal(storage.blob(), null);
  const wrongAccount = await underLock(store, OTHER_LOGIN, (lease) => store.prepare({ scope: SCOPE, loginKey: LOGIN, lease, type: 'balance', direction: 'in', endpointKey: 'deposit', payload: { login: 710001, amount: '1.00' }, createKey: () => 'K1' }));
  assert.equal(wrongAccount.result.reason, 'no-lease', 'a lease for another account does not count');
});

test('prepare: saves and verifies the record under the lock, then refuses a second operation on the account', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  const first = await prepareFor(store, { key: 'K1' });
  assert.equal(first.result.saved, true);
  assert.equal(first.result.record.payload.idempotency_key, 'K1');
  const again = await prepareFor(store, { key: 'K2' });
  assert.equal(again.result.blocked, true);
  assert.equal(again.result.reason, 'blocked');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 1);
});

test('records are matched by idempotency key, never by fingerprint: forgetting K1 leaves K2 with the same fingerprint', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await underLock(store, LOGIN, (lease) => {
    assert.equal(store.remember(recordFor('K1'), lease).saved, true);
    assert.equal(store.remember(recordFor('K2'), lease).saved, true);
  });
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN }), null, 'no find without a key');
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, fingerprint: 'fp-same' }), null, 'fingerprint is not a key');
  const removed = await underLock(store, LOGIN, (lease) => store.forget({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', lease }));
  assert.deepEqual(removed.result, { removed: true, saved: true, completionRecorded: false });
  assert.deepEqual(store.list({ scope: SCOPE, loginKey: LOGIN }).map((r) => r.payload.idempotency_key), ['K2']);
});

test('remember without the lease token refuses and writes nothing', () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  assert.deepEqual(store.remember(recordFor('K1'), null), { saved: false });
  assert.equal(storage.blob(), null);
});

test('storage is per account: writes for two accounts do not overwrite each other (no lost update)', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await prepareFor(store, { loginKey: LOGIN, key: 'K-one' });
  await prepareFor(store, { loginKey: OTHER_LOGIN, key: 'K-two' });
  assert.deepEqual(store.list({ scope: SCOPE, loginKey: LOGIN }).map((r) => r.payload.idempotency_key), ['K-one']);
  assert.deepEqual(store.list({ scope: SCOPE, loginKey: OTHER_LOGIN }).map((r) => r.payload.idempotency_key), ['K-two']);
});

test('barrier scope: another manager on the same broker sees the same unresolved record', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  await prepareFor(store, { key: 'K1' });
  assert.equal(store.list({ scope: OTHER_MANAGER_SCOPE, loginKey: LOGIN }).length, 1);
  assert.equal(store.hasUnresolved({ scope: OTHER_MANAGER_SCOPE, loginKey: LOGIN }), true);
});

test('fail closed: unreadable storage is memory-only and blocks prepare with no write', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  storage.failGet = true;
  assert.equal(store.storageStatus({ scope: SCOPE, loginKey: LOGIN }), 'memory-only');
  const out = await prepareFor(store, { key: 'K1' });
  assert.equal(out.result.blocked, true);
  assert.equal(out.result.reason, 'storage-unavailable');
  storage.failGet = false;
  assert.equal(storage.blob(), null);
});

test('fail closed: a failed write means nothing is saved and nothing can be sent', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  storage.failSet = true;
  const out = await prepareFor(store, { key: 'K1' });
  storage.failSet = false;
  assert.equal(out.result.reason, 'storage-unavailable');
  assert.equal(out.result.saved, false);
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 0);
});

test('fail closed: a write that does not read back byte for byte is refused', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  // The stored text is altered once, on the first write, so the read-back no longer matches what was written.
  storage.transform = (key, value) => {
    storage.transform = null;
    return value.replace('"amount":"100.00"', '"amount":"999.00"');
  };
  const out = await prepareFor(store, { key: 'K1' });
  assert.equal(out.result.reason, 'storage-unavailable', 'the altered write is detected');
});

test('fail closed: a corrupt blob is never overwritten and blocks the account', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  storage.values.set(`${PENDING_FINANCE_ATTEMPTS_STORAGE_KEY}:broker-a:${LOGIN}`, '{not json');
  assert.equal(store.storageStatus({ scope: SCOPE, loginKey: LOGIN }), 'memory-only');
  assert.equal((await prepareFor(store, { key: 'K1' })).result.reason, 'storage-unavailable');
  assert.equal(storage.blob(), '{not json');
  assert.deepEqual(store.remember(recordFor('K9'), null), { saved: false });
});

test('checkpoint: proves the record and the storage just before a send, and reports gone and storage separately', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  await prepareFor(store, { key: 'K1' });
  const ok = await underLock(store, LOGIN, (lease) => store.checkpoint({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', lease }));
  assert.deepEqual(ok.result, { ok: true, reason: null });
  const gone = await underLock(store, LOGIN, (lease) => store.checkpoint({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K-none', lease }));
  assert.deepEqual(gone.result, { ok: false, reason: 'gone' });
  storage.failSet = true;
  const broken = await underLock(store, LOGIN, (lease) => store.checkpoint({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', lease }));
  storage.failSet = false;
  assert.deepEqual(broken.result, { ok: false, reason: 'storage-unavailable' });
});

test('expiry: 23 h minus one second is live; at the TTL the record is expired, still listed and still blocking', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await prepareFor(store, { key: 'K1' });
  const created = clock.t;
  clock.t = created + PENDING_FINANCE_ATTEMPT_TTL_MS - 1000;
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].expired, false);
  clock.t = created + PENDING_FINANCE_ATTEMPT_TTL_MS + 1000;
  const [expired] = store.list({ scope: SCOPE, loginKey: LOGIN });
  assert.equal(expired.expired, true);
  assert.equal(expired.status, 'expired');
  assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), true, 'never dropped, still blocking');
});

test('expiry: a backward clock jump or a huge forward jump marks the record expired, never drops it', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await prepareFor(store, { key: 'K1' });
  clock.t -= 3 * H;
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].expired, true);
  clock.t += 3 * H + 365 * 24 * H;
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].expired, true);
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 1);
});

test('acknowledge: needs the lease, reports none when nothing is unresolved, and stamps the record when it is', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await prepareFor(store, { key: 'K1' });
  const noLease = store.acknowledge({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', acknowledgedBy: 'mgr-a', at: clock.t, lease: null });
  assert.equal(noLease.ok, false);
  const acked = await underLock(store, LOGIN, (lease) => store.acknowledge({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', acknowledgedBy: 'mgr-a', at: clock.t, lease }));
  assert.equal(acked.result.ok, true);
  assert.equal(acked.result.acknowledged[0].acknowledgedBy, 'mgr-a');
  assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), false);
  const again = await underLock(store, LOGIN, (lease) => store.acknowledge({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', lease }));
  assert.deepEqual(again.result, { ok: false, reason: 'none', acknowledged: [] });
});

test('R9 acknowledge: touches only the record with the given key; no key, or a key that is not pending, is none', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await prepareFor(store, { key: 'K1' });
  // A second unresolved record on the same login, written under the lock (the barrier forbids it through prepare).
  const first = store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1' });
  await underLock(store, LOGIN, (lease) => store.remember({
    ...first, payload: { ...first.payload, idempotency_key: 'K2' }, fingerprint: `${first.fingerprint}-2`, createdAt: first.createdAt + 1,
  }, lease));
  const noKey = await underLock(store, LOGIN, (lease) => store.acknowledge({ scope: SCOPE, loginKey: LOGIN, lease }));
  assert.deepEqual(noKey.result, { ok: false, reason: 'none', acknowledged: [] });
  const unknownKey = await underLock(store, LOGIN, (lease) => store.acknowledge({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K9', lease }));
  assert.equal(unknownKey.result.reason, 'none');
  const acked = await underLock(store, LOGIN, (lease) => store.acknowledge({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K2', lease }));
  assert.equal(acked.result.ok, true);
  assert.deepEqual(acked.result.acknowledged.map((item) => item.payload.idempotency_key), ['K2']);
  const pendingKeys = store.list({ scope: SCOPE, loginKey: LOGIN }).filter((item) => item.acknowledgedAt === null).map((item) => item.payload.idempotency_key);
  assert.deepEqual(pendingKeys, ['K1'], 'K1 is still pending');
  assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), true, 'K1 keeps the barrier');
});

test('R9 record version: prepare is version 1; a content change bumps it by one; an unchanged write and a proof write do not', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  await prepareFor(store, { key: 'K1' });
  const versionOf = () => store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1' }).version;
  assert.equal(versionOf(), 1);
  const held = store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1' });
  await underLock(store, LOGIN, (lease) => store.remember({ ...held, status: 'pending', code: 'OUTCOME_UNKNOWN' }, lease));
  assert.equal(versionOf(), 2, 'a changed code is a record write');
  await underLock(store, LOGIN, (lease) => store.remember({ ...store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1' }), code: 'OUTCOME_UNKNOWN' }, lease));
  assert.equal(versionOf(), 2, 'the same content keeps the version');
  const proof = await underLock(store, LOGIN, (lease) => store.checkpoint({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', lease }));
  assert.equal(proof.result.ok, true);
  assert.equal(versionOf(), 2, 'a proof write keeps the version');
});


test('acknowledge: a failed persist returns storage-unavailable and the record stays pending', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  await prepareFor(store, { key: 'K1' });
  storage.failSet = true;
  const out = await underLock(store, LOGIN, (lease) => store.acknowledge({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', lease }));
  storage.failSet = false;
  assert.deepEqual(out.result, { ok: false, reason: 'storage-unavailable', acknowledged: [] });
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedAt, null);
});

test('forget: a failed persist is reported, and the record is not treated as removed', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  await prepareFor(store, { key: 'K1' });
  storage.failSet = true;
  const out = await underLock(store, LOGIN, (lease) => store.forget({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', lease }));
  storage.failSet = false;
  assert.deepEqual(out.result, { removed: false, saved: false, completionRecorded: false });
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 1, 'still blocking');
});

test('retention: acknowledged records older than the replay window are pruned, and the log keeps at most 20', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const base = clock.t;
  await underLock(store, LOGIN, (lease) => {
    for (let i = 0; i < 25; i += 1) {
      store.remember(recordFor(`A${i}`, { createdAt: base, acknowledgedAt: base + i, acknowledgedBy: 'mgr-a' }), lease);
    }
  });
  await underLock(store, LOGIN, (lease) => store.remember(recordFor('U1', { createdAt: base }), lease));
  const acked = store.list({ scope: SCOPE, loginKey: LOGIN }).filter((r) => r.acknowledgedAt !== null);
  assert.equal(acked.length, ACKNOWLEDGED_LOG_LIMIT, 'bounded to the last 20');
  assert.equal(acked[0].payload.idempotency_key, 'A24', 'the newest are kept');
  clock.t = base + 25 * 3600e3;
  await underLock(store, LOGIN, (lease) => store.remember(recordFor('U2', { createdAt: clock.t }), lease));
  const after = store.list({ scope: SCOPE, loginKey: LOGIN }).filter((r) => r.acknowledgedAt !== null);
  assert.equal(after.length, 0, 'acknowledged records past the 24 h window are pruned');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).filter((r) => r.acknowledgedAt === null).length, 2, 'unresolved records are never pruned');
});

test('locks unsupported: storage is memory-only and no lease can be run', async () => {
  const store = makeStore(createFakeStorage(), createClock(), { getLocks: () => null });
  assert.equal(store.locksSupported(), false);
  assert.equal(store.storageStatus({ scope: SCOPE, loginKey: LOGIN }), 'memory-only');
  assert.deepEqual(await store.runWithAccountLease({ scope: SCOPE, loginKey: LOGIN }, async () => 'x'), {
    acquired: false, reason: 'no-locks', lockName: 'rtx-fin:broker-a:710001',
  });
});

test('a storage key per account: the blob name carries broker and login only', () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  assert.equal(store.leaseKey({ scope: SCOPE, loginKey: LOGIN }), 'rtx-fin:broker-a:710001');
});

test('R10 H2 store: a view never moves the account mark; a locked write does; clockOf reports a stepped clock and the anchor', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await prepareFor(store, { key: 'K1' });
  const mark = clock.t;
  assert.equal(JSON.parse(storage.blob()).clockHighWaterMs, mark, 'the prepare write set the mark');
  clock.t = mark + 5 * H;
  store.list({ scope: SCOPE, loginKey: LOGIN });
  store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1' });
  store.recentCompletions({ scope: SCOPE, loginKey: LOGIN });
  store.expiryUnsaved({ scope: SCOPE, loginKey: LOGIN });
  assert.equal(JSON.parse(storage.blob()).clockHighWaterMs, mark, 'views write nothing: the mark did not move');
  assert.equal(store.clockOf({ scope: SCOPE, loginKey: LOGIN }).stepped, false, 'a clock ahead of the mark is not stepped');
  const checked = await underLock(store, LOGIN, (lease) => store.checkpoint({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', lease, recordAttempt: true }));
  assert.equal(checked.result.ok, true);
  assert.equal(JSON.parse(storage.blob()).clockHighWaterMs, mark + 5 * H, 'a locked write moves the mark to the clock');
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1' }).lastAttemptAt, mark + 5 * H, 'the attempt is stamped with the clock anchor');
  clock.t = mark + 2 * H;
  const behind = store.clockOf({ scope: SCOPE, loginKey: LOGIN });
  assert.equal(behind.stepped, true, 'behind the mark');
  assert.equal(behind.anchor, mark + 5 * H, 'the anchor is the mark, never the earlier clock');
});

test('R7 L2 store: completions are anchored to the high-water mark; a backward step keeps the window to the mark and it ends 60 s after the clock passes it', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await prepareFor(store, { key: 'K1' });
  const forgot = await underLock(store, LOGIN, (lease) => store.forget({
    scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', lease, completion: { type: 'balance', direction: 'in', amount: '100.00' },
  }));
  assert.equal(forgot.result.completionRecorded, true);
  const mark = clock.t;
  assert.equal(store.recentCompletions({ scope: SCOPE, loginKey: LOGIN }).length, 1);
  clock.t = mark - 2 * H;
  assert.equal(store.recentCompletions({ scope: SCOPE, loginKey: LOGIN }).length, 1, 'kept while the clock is behind the mark');
  clock.t = mark + 61_000;
  assert.equal(store.recentCompletions({ scope: SCOPE, loginKey: LOGIN }).length, 0, 'ends when the clock passes the mark by 60 s');
});
