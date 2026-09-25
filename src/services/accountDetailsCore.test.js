import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAccountDetailsStore } from './accountDetailsCore.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

const createHarness = (options = {}) => {
  const requests = [];
  let clock = 1_000;
  const store = createAccountDetailsStore({
    request: (login) => { const pending = deferred(); requests.push({ login, ...pending }); return pending.promise; },
    now: () => clock,
    ...options,
  });
  return { store, requests, advance: (ms) => { clock += ms; } };
};

test('a prefetch in flight is joined by the open instead of starting a second request', async () => {
  const { store, requests } = createHarness();
  store.prefetch(200001);
  const opened = store.load('200001');
  assert.equal(requests.length, 1);
  requests[0].resolve({ FirstName: 'Animesh' });
  assert.deepEqual(await opened, { FirstName: 'Animesh' });
  assert.deepEqual(store.peek(200001), { FirstName: 'Animesh' });
});

test('a fresh payload is served from memory; an older one stays visible while it revalidates', async () => {
  const { store, requests, advance } = createHarness({ freshMs: 10_000 });
  const first = store.load('7');
  requests[0].resolve({ Email: 'old@example.com' });
  await first;

  assert.deepEqual(await store.load('7'), { Email: 'old@example.com' });
  assert.equal(requests.length, 1, 'fresh payload must not hit the network');

  advance(10_000);
  const revalidation = store.load('7');
  assert.equal(requests.length, 2);
  assert.deepEqual(store.peek('7'), { Email: 'old@example.com' }, 'last-known details paint while revalidating');
  requests[1].resolve({ Email: 'new@example.com' });
  assert.deepEqual(await revalidation, { Email: 'new@example.com' });
});

test('force starts a new request and a slower older response cannot overwrite it', async () => {
  const { store, requests } = createHarness();
  const older = store.load('7');
  const forced = store.load('7', { force: true });
  assert.equal(requests.length, 2);
  requests[1].resolve({ Phone: 'new' });
  await forced;
  requests[0].resolve({ Phone: 'old' });
  assert.deepEqual(await older, { Phone: 'new' }, 'callers of the older request get the newer payload');
  assert.deepEqual(store.peek('7'), { Phone: 'new' });
});

test('a saved local update wins over a response requested before it, and is not treated as fresh', async () => {
  const { store, requests } = createHarness();
  const inflight = store.load('7');
  store.update('7', { City: 'Kolkata' });
  requests[0].resolve({ City: 'Old City', Email: 'a@example.com' });
  await inflight;
  assert.deepEqual(store.peek('7'), { City: 'Kolkata' });

  const next = store.load('7');
  assert.equal(requests.length, 2, 'a patch alone must not satisfy the next open');
  requests[1].resolve({ City: 'Kolkata', Email: 'a@example.com' });
  await next;
});

test('clear drops personal data and ignores responses still in flight', async () => {
  const { store, requests } = createHarness();
  const inflight = store.load('7');
  store.clear();
  requests[0].resolve({ Email: 'private@example.com' });
  await inflight;
  assert.equal(store.peek('7'), undefined);
});

test('subscribers are notified when details arrive, and failures are not cached', async () => {
  const { store, requests } = createHarness();
  const seen = [];
  const unsubscribe = store.subscribe((login) => seen.push(login));
  const failing = store.load('7');
  requests[0].reject(new Error('Internal error'));
  await assert.rejects(failing, /Internal error/);
  assert.equal(store.peek('7'), undefined);
  assert.deepEqual(seen, []);

  const retry = store.load('7');
  assert.equal(requests.length, 2, 'a failed request must not block the retry');
  requests[1].resolve({ Email: 'a@example.com' });
  await retry;
  assert.deepEqual(seen, ['7']);
  unsubscribe();
});

test('the cache stays bounded, evicting the least recently stored login', async () => {
  const { store, requests } = createHarness({ maxEntries: 2 });
  for (const login of ['1', '2', '3']) {
    const pending = store.load(login);
    requests.at(-1).resolve({ login });
    await pending;
  }
  assert.equal(store.peek('1'), undefined);
  assert.deepEqual(store.peek('3'), { login: '3' });
});
