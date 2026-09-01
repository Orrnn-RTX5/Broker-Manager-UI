import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import {
  CLIENTS_INITIAL_PARAMS,
  GROUPS_INITIAL_PARAMS,
  ORDERS_INITIAL_PARAMS,
  WORKSPACE_QUERY_META,
  createClientsInitialQueryOptions,
  createGroupsInitialQueryOptions,
  createOrdersInitialQueryOptions,
} from './workspaceQueryOptions.js';

const createClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

test('frequent workspace query keys match the first page rendered by each destination', () => {
  const request = async () => ({ rows: [] });

  assert.deepEqual(createClientsInitialQueryOptions({ request }).queryKey, [
    'clients', 'page', CLIENTS_INITIAL_PARAMS,
  ]);
  assert.deepEqual(createOrdersInitialQueryOptions({ request }).queryKey, [
    'orders', 'page', ORDERS_INITIAL_PARAMS,
  ]);
  assert.deepEqual(createGroupsInitialQueryOptions({ request }).queryKey, [
    'groups', 'all', GROUPS_INITIAL_PARAMS,
  ]);
});

test('prefetched workspace data is reused without duplicate requests', async () => {
  for (const createOptions of [
    createClientsInitialQueryOptions,
    createOrdersInitialQueryOptions,
    createGroupsInitialQueryOptions,
  ]) {
    const client = createClient();
    let requests = 0;
    const options = createOptions({
      request: async () => {
        requests += 1;
        return { rows: [{ id: 9000 }], total: 1, hasMore: false };
      },
    });

    await client.prefetchQuery(options);
    await client.fetchQuery(options);

    assert.equal(requests, 1);
    client.clear();
  }
});

test('workspace warmup queries never activate the global loader', () => {
  const request = async () => ({ rows: [] });

  assert.equal(createClientsInitialQueryOptions({ request }).meta, WORKSPACE_QUERY_META);
  assert.equal(createOrdersInitialQueryOptions({ request }).meta, WORKSPACE_QUERY_META);
  assert.equal(createGroupsInitialQueryOptions({ request }).meta, WORKSPACE_QUERY_META);
  assert.equal(WORKSPACE_QUERY_META.suppressGlobalLoader, true);
});
