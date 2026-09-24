import assert from 'node:assert/strict';
import test from 'node:test';
import { createKeyedRequestCache } from './keyedRequestCache.js';

test('shares one in-flight request for the same account', async () => {
  let requests = 0;
  let resolveRequest;
  const cache = createKeyedRequestCache({
    load: () => {
      requests += 1;
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
  });

  const first = cache.get(200008);
  const second = cache.get('200008');
  await Promise.resolve();
  assert.equal(requests, 1);

  resolveRequest([{ position: 42 }]);
  assert.deepEqual(await first, [{ position: 42 }]);
  assert.deepEqual(await second, [{ position: 42 }]);
});

test('caches empty results and expires them after the configured ttl', async () => {
  let requests = 0;
  let clock = 1_000;
  const cache = createKeyedRequestCache({
    load: async () => {
      requests += 1;
      return [];
    },
    ttlMs: 5_000,
    now: () => clock,
  });

  await cache.get('200003');
  clock += 4_999;
  await cache.get('200003');
  assert.equal(requests, 1);
  assert.deepEqual(cache.peek('200003'), []);

  clock += 1;
  assert.equal(cache.peek('200003'), undefined);
  await cache.get('200003');
  assert.equal(requests, 2);
});

test('invalidates one account without discarding other cached accounts', async () => {
  const requests = [];
  const cache = createKeyedRequestCache({
    load: async (login) => {
      requests.push(login);
      return [login];
    },
  });

  await Promise.all([cache.get('200002'), cache.get('200008')]);
  cache.invalidate('200002');
  await Promise.all([cache.get('200002'), cache.get('200008')]);

  assert.deepEqual(requests, ['200002', '200008', '200002']);
});

test('an invalidated in-flight result cannot overwrite the trailing fresh result', async () => {
  const resolvers = [];
  const cache = createKeyedRequestCache({
    load: () => new Promise((resolve) => resolvers.push(resolve)),
  });

  const staleRequest = cache.get('200008');
  await Promise.resolve();
  cache.invalidate('200008');
  const freshRequest = cache.get('200008');
  await Promise.resolve();

  assert.equal(resolvers.length, 2);
  resolvers[1]([{ position: 'fresh' }]);
  assert.deepEqual(await freshRequest, [{ position: 'fresh' }]);

  resolvers[0]([{ position: 'stale' }]);
  assert.deepEqual(await staleRequest, [{ position: 'stale' }]);
  assert.deepEqual(cache.peek('200008'), [{ position: 'fresh' }]);
});

test('clearing all accounts prevents old requests from repopulating the cache', async () => {
  let resolveRequest;
  const cache = createKeyedRequestCache({
    load: () => new Promise((resolve) => { resolveRequest = resolve; }),
  });

  const staleRequest = cache.get('200003');
  await Promise.resolve();
  cache.invalidate();
  resolveRequest([]);
  await staleRequest;

  assert.equal(cache.peek('200003'), undefined);
});

test('an adopted batch promise is shared with keyed readers and caches empty rows', async () => {
  let resolveBatch;
  let individualRequests = 0;
  const cache = createKeyedRequestCache({
    load: async () => {
      individualRequests += 1;
      return ['individual'];
    },
  });
  const batch = new Promise((resolve) => { resolveBatch = resolve; });

  const adopted = cache.adopt('200003', batch);
  const reader = cache.get('200003');
  assert.equal(cache.hasPending('200003'), true);
  assert.equal(individualRequests, 0);

  resolveBatch([]);
  assert.deepEqual(await adopted, []);
  assert.deepEqual(await reader, []);
  assert.deepEqual(cache.peek('200003'), []);
  assert.equal(cache.hasPending('200003'), false);
});

test('invalidating an adopted request prevents its result from being cached', async () => {
  let resolveBatch;
  const cache = createKeyedRequestCache({ load: async () => ['fresh'] });
  const batch = new Promise((resolve) => { resolveBatch = resolve; });

  const adopted = cache.adopt('200008', batch);
  cache.invalidate('200008');
  resolveBatch(['stale']);
  assert.deepEqual(await adopted, ['stale']);
  assert.equal(cache.peek('200008'), undefined);
  assert.deepEqual(await cache.get('200008'), ['fresh']);
});

test('replaces a cached first page only while that exact snapshot is current', async () => {
  const firstPage = ['first'];
  const cache = createKeyedRequestCache({ load: async () => firstPage });
  await cache.get('200008');

  const complete = ['first', 'second'];
  assert.equal(cache.replaceIf('200008', firstPage, complete), true);
  assert.equal(cache.peek('200008'), complete);

  cache.invalidate('200008');
  assert.equal(cache.replaceIf('200008', complete, ['stale']), false);
  assert.equal(cache.peek('200008'), undefined);
});

for (const requestType of ['get', 'adopt']) {
  const startPendingRequest = () => {
    let resolveRequest;
    const source = new Promise((resolve) => { resolveRequest = resolve; });
    const cache = createKeyedRequestCache({ load: () => source });
    const request = requestType === 'get'
      ? cache.get('200008')
      : cache.adopt('200008', source);
    return { cache, request, resolveRequest };
  };

  test(`a live snapshot supersedes an older ${requestType} result for every reader`, async () => {
    const { cache, request, resolveRequest } = startPendingRequest();
    const sharedReader = cache.get(200008);
    await Promise.resolve();
    const liveRows = [{ position: 42, profit: 25 }];
    cache.set(200008, liveRows);

    assert.equal(await cache.get('200008'), liveRows);
    resolveRequest([{ position: 42, profit: 10 }]);

    assert.equal(await request, liveRows);
    assert.equal(await sharedReader, liveRows);
    assert.equal(cache.peek('200008'), liveRows);
    assert.equal(cache.hasPending('200008'), false);
  });

  test(`an empty live snapshot prevents an older ${requestType} from restoring closed positions`, async () => {
    const { cache, request, resolveRequest } = startPendingRequest();
    await Promise.resolve();
    const emptyRows = [];
    cache.set('200008', emptyRows);
    resolveRequest([{ position: 42 }]);

    assert.equal(await request, emptyRows);
    assert.equal(cache.peek('200008'), emptyRows);
    assert.equal(await cache.get('200008'), emptyRows);
  });

  test(`the latest of repeated live writes wins over an older ${requestType}`, async () => {
    const { cache, request, resolveRequest } = startPendingRequest();
    await Promise.resolve();
    cache.set('200008', [{ position: 42, profit: 10 }]);
    cache.set('200008', []);
    const latestRows = [{ position: 43, profit: 30 }];
    cache.set('200008', latestRows);
    resolveRequest([{ position: 42, profit: 5 }]);

    assert.equal(await request, latestRows);
    assert.equal(cache.peek('200008'), latestRows);
  });

  test(`invalidation after a live write still isolates an older ${requestType}`, async () => {
    const { cache, request, resolveRequest } = startPendingRequest();
    await Promise.resolve();
    cache.set('200008', [{ position: 42 }]);
    cache.invalidate('200008');
    const currentRows = [{ position: 43 }];
    cache.set('200008', currentRows);
    const oldRows = [{ position: 41 }];
    resolveRequest(oldRows);

    assert.equal(await request, oldRows);
    assert.equal(cache.peek('200008'), currentRows);
  });
}
