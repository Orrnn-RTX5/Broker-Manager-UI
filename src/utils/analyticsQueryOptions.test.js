import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import {
  ANALYTICS_QUERY_META,
  createOnlineUsersQueryOptions,
  createOpenedOrdersQueryOptions,
  createOpenPositionsQueryOptions,
} from './analyticsQueryOptions.js';

const createClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('prefetched online users are reused without a duplicate request', async () => {
  const client = createClient();
  let requests = 0;
  const options = createOnlineUsersQueryOptions({
    request: async () => {
      requests += 1;
      return { rows: [{ login: '1' }], total: 1, hasMore: false };
    },
  });

  await client.prefetchQuery(options);
  const data = await client.fetchQuery(options);

  assert.equal(requests, 1);
  assert.equal(data.rows[0].login, '1');
  client.clear();
});

test('concurrent position prefetches are deduplicated by query key', async () => {
  const client = createClient();
  const pending = deferred();
  let requests = 0;
  const options = createOpenPositionsQueryOptions({
    request: () => {
      requests += 1;
      return pending.promise;
    },
  });

  const first = client.fetchQuery(options);
  const second = client.fetchQuery(options);
  pending.resolve({ rows: [], total: 0, hasMore: false });
  await Promise.all([first, second]);

  assert.equal(requests, 1);
  client.clear();
});

test('opened-order results remain isolated when logins resolve out of order', async () => {
  const client = createClient();
  const first = deferred();
  const second = deferred();
  const request = (login) => login === '100' ? first.promise : second.promise;
  const firstOptions = createOpenedOrdersQueryOptions({ login: '100', request });
  const secondOptions = createOpenedOrdersQueryOptions({ login: '200', request });

  const firstFetch = client.fetchQuery(firstOptions);
  const secondFetch = client.fetchQuery(secondOptions);
  second.resolve([{ ticket: 2, login: 200 }]);
  await secondFetch;
  first.resolve([{ ticket: 1, login: 100 }]);
  await firstFetch;

  assert.equal(client.getQueryData(firstOptions.queryKey)[0].login, 100);
  assert.equal(client.getQueryData(secondOptions.queryKey)[0].login, 200);
  assert.notDeepEqual(firstOptions.queryKey, secondOptions.queryKey);
  client.clear();
});

test('query options forward cancellation signals to every request type', async () => {
  const controller = new AbortController();
  const received = [];
  const request = async (_params, options) => {
    received.push(options.signal);
    return { rows: [] };
  };

  await createOnlineUsersQueryOptions({ request }).queryFn({ signal: controller.signal });
  await createOpenPositionsQueryOptions({ request }).queryFn({ signal: controller.signal });
  await createOpenedOrdersQueryOptions({ login: '100', request }).queryFn({ signal: controller.signal });

  assert.deepEqual(received, [controller.signal, controller.signal, controller.signal]);
});

test('analytics requests use local loading states instead of the global loader', () => {
  const request = async () => ({ rows: [] });

  assert.equal(createOnlineUsersQueryOptions({ request }).meta, ANALYTICS_QUERY_META);
  assert.equal(createOpenPositionsQueryOptions({ request }).meta, ANALYTICS_QUERY_META);
  assert.equal(createOpenedOrdersQueryOptions({ login: '100', request }).meta, ANALYTICS_QUERY_META);
  assert.equal(ANALYTICS_QUERY_META.suppressGlobalLoader, true);
});
