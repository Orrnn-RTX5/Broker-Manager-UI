import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Bundle the real API module (including its real keyed-cache implementation)
// with controlled network dependencies. This exercises out-of-order completion,
// not a duplicate implementation of the cache.
const runtime = { client: {}, loadSymbols: null };
globalThis.__rtxRealtimeCacheTest = runtime;
const bundle = await build({
  stdin: { contents: "export * from './api.js'; export * from './sidebarAccounts.js';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, write: false, format: 'esm', platform: 'browser',
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'controlled-api-network', setup(builder) {
    builder.onResolve({ filter: /\/(apiClient|symbolManagementLoader)(\.js)?$/ }, args => ({
      path: args.path.includes('symbolManagementLoader') ? 'symbols' : 'client', namespace: 'test-network',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'test-network' }, args => ({
      contents: args.path === 'client'
        ? 'export default globalThis.__rtxRealtimeCacheTest.client;'
        : 'export const loadSymbolManagement = options => globalThis.__rtxRealtimeCacheTest.loadSymbols(options);',
      loader: 'js',
    }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('deal quantities use normalized lots for dashboard activity', () => {
  assert.equal(api.normalizeDealRow({ action: 0 }).action, 0);
  assert.equal(api.normalizeDealRow({ timeDone: 123 }).time, 123);
  assert.equal(api.normalizeDealRow({ volume: 0.75 }).volume, 0.75);
  assert.equal(api.normalizeDealRow({ volume_lots: 0.25, volume: 2500 }).volume, 0.25);
  assert.equal(api.normalizeDealRow({ volumeExt: 2500 }).volume, 0.25);
  assert.equal(api.normalizeDealRow({ Volume: 2500 }).volume, 0.25);
});
test('explicit 100-lot quantities and version tokens retain their units and precision', () => {
  const row = api.normalizePositionRow({ lots: 100, state_version: '18000000000000000001', priceCurrent: 1.12345 });
  assert.equal(row.volume, 100);
  assert.equal(row.state_version, '18000000000000000001');
  assert.equal(row.priceCurrent, 1.12345);
});
test('position and pending-order units follow field contracts instead of quantity thresholds', () => {
  for (const normalize of [api.normalizePositionRow, api.normalizeOrderRow]) {
    assert.equal(normalize({ lots: 100, volume: 1000000 }).volume, 100);
    assert.equal(normalize({ volume: 100 }).volume, 100);
    assert.equal(normalize({ lots: 0, volume: 1000000 }).volume, 0);
    assert.equal(normalize({ volumeExt: 1000000 }).volume, 100);
    assert.equal(normalize({ Volume: 100 }).volume, 0.01);
    assert.equal(normalize({ volumeExt: 50 }).volume, 0.005);
  }
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const accountResponse = balance => new Response(JSON.stringify({
  accounts: [{ login: 1001, balance }], total: 1, hasMore: false,
}), { headers: { 'content-type': 'application/json' } });
let storage;
beforeEach(() => {
  storage = new Map();
  globalThis.sessionStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  globalThis.window = { sessionStorage: globalThis.sessionStorage };
  api.invalidateRealtimeCaches();
});
after(() => { delete globalThis.window; delete globalThis.sessionStorage; delete globalThis.__rtxRealtimeCacheTest; });

test('state invalidation bypasses first-page TTL and discards an older late response', async () => {
  const requests = [];
  runtime.client.getRaw = () => {
    const request = deferred(); requests.push(request); return request.promise;
  };
  const old = api.getAccountDetailsManyPage();
  api.invalidateRealtimeCaches('accounts');
  const fresh = api.getAccountDetailsManyPage();
  assert.equal(requests.length, 2, 'fresh reload must not share pre-event work');
  requests[1].resolve(accountResponse(20));
  await fresh;
  requests[0].resolve(accountResponse(10));
  await old;
  assert.equal(api.peekAccountDetailsManyPage().rows[0].balance, 20);
  assert.equal(JSON.parse(storage.get('rtx5_account_details_many_v3')).rows[0].balance, 20);
  assert.equal((await api.getAccountDetailsManyPage()).rows[0].balance, 20);
  assert.equal(requests.length, 2);
});

test('old account completion cannot detach a newer pending request', async () => {
  const requests = [];
  runtime.client.getRaw = () => { const pending = deferred(); requests.push(pending); return pending.promise; };
  const old = api.getAccountDetailsManyPage();
  api.invalidateRealtimeCaches('accounts');
  const fresh = api.getAccountDetailsManyPage();
  requests[0].resolve(accountResponse(10)); await old;
  const joined = api.getAccountDetailsManyPage();
  assert.equal(requests.length, 2, 'old finally must not erase the new in-flight request');
  requests[1].resolve(accountResponse(30));
  await Promise.all([fresh, joined]);
});

test('cancelling the caller that started the shared first page does not fail callers that joined it', async () => {
  const requests = [];
  runtime.client.getRaw = (_endpoint, options = {}) => {
    const pending = deferred(); requests.push({ pending, options }); return pending.promise;
  };
  const controller = new AbortController();
  const starter = api.getAccountDetailsManyPage({}, { signal: controller.signal });
  const joined = api.getAccountDetailsManyPage();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.signal, undefined, 'shared request must not carry one caller\'s signal');
  controller.abort();
  requests[0].pending.resolve(accountResponse(40));
  assert.equal((await joined).rows[0].balance, 40);
  await starter;
});

test('late sidebar pagination cannot repopulate invalidated storage', async () => {
  const requests = [];
  runtime.client.getRaw = () => { const pending = deferred(); requests.push(pending); return pending.promise; };
  const old = api.fetchAllSidebarAccounts();
  api.invalidateRealtimeCaches('accounts');
  const fresh = api.fetchAllSidebarAccounts();
  requests[1].resolve(accountResponse(40)); await fresh;
  const freshStorage = storage.get('rtx5_sidebar_accounts_cache_v3');
  assert.ok(freshStorage, 'fresh sidebar must populate storage');
  requests[0].resolve(accountResponse(10)); await old;
  assert.equal(storage.get('rtx5_sidebar_accounts_cache_v3'), freshStorage);
});

test('invalidated symbol progress/results cannot replace fresh configuration or listeners', async () => {
  const loads = [];
  runtime.loadSymbols = options => { const pending = deferred(); loads.push({ ...pending, options }); return pending.promise; };
  const old = api.symbolManagementList();
  api.invalidateRealtimeCaches('instruments');
  const progress = [];
  const fresh = api.symbolManagementList({ onProgress: update => progress.push(update) });
  assert.equal(loads.length, 2);
  loads[0].options.onProgress({ symbols: [{ symbol: 'OLD' }] });
  assert.equal(progress.length, 0, 'stale progress reached current subscribers');
  loads[0].resolve({ symbols: [{ symbol: 'OLD' }], categories: [] });
  await old;
  assert.equal(api.peekSymbolManagementData(), null);
  loads[1].options.onProgress({ symbols: [{ symbol: 'NEW' }] });
  assert.equal(progress.length, 1, 'old completion erased fresh progress listener');
  loads[1].resolve({ symbols: [{ symbol: 'NEW' }], categories: [] });
  await fresh;
  assert.equal(api.peekSymbolManagementData().symbols[0].symbol, 'NEW');
  assert.equal(JSON.parse(storage.get('rtx5_symbol_management_v2')).symbols[0].symbol, 'NEW');
});

test('symbol names share a request and load immediately from the scoped browser cache', async () => {
  const pending = deferred();
  let calls = 0;
  runtime.client.get = endpoint => {
    assert.equal(endpoint, '/SymbolsList');
    calls += 1;
    return pending.promise;
  };
  const first = api.symbolsList();
  const joined = api.symbolsList();
  assert.equal(calls, 1);
  pending.resolve(['EURUSD', 'XAUUSD']);
  assert.deepEqual(await Promise.all([first, joined]), [
    ['EURUSD', 'XAUUSD'], ['EURUSD', 'XAUUSD'],
  ]);
  const snapshot = api.peekSymbolsList();
  assert.deepEqual(snapshot.symbols, ['EURUSD', 'XAUUSD']);
  assert.equal(JSON.parse(storage.get('rtx5_symbols_list_v1')).savedAt, snapshot.savedAt);
  assert.deepEqual(await api.symbolsList(), ['EURUSD', 'XAUUSD']);
  assert.equal(calls, 1, 'a fresh result should not request the server again');

  // Restore the persisted value after clearing memory, as a hard refresh does.
  const stored = storage.get('rtx5_symbols_list_v1');
  api.invalidateSymbolManagementData();
  storage.set('rtx5_symbols_list_v1', stored);
  assert.deepEqual(api.peekSymbolsList()?.symbols, ['EURUSD', 'XAUUSD']);
  assert.equal(calls, 1);
});

test('symbol cache invalidation discards a late response from an older request', async () => {
  const requests = [];
  runtime.client.get = endpoint => {
    assert.equal(endpoint, '/SymbolsList');
    const pending = deferred();
    requests.push(pending);
    return pending.promise;
  };
  const old = api.symbolsList();
  api.invalidateSymbolManagementData();
  const fresh = api.symbolsList();
  assert.equal(requests.length, 2);
  requests[1].resolve(['NEW']);
  await fresh;
  requests[0].resolve(['OLD']);
  await assert.rejects(old, /invalidated/);
  assert.deepEqual(api.peekSymbolsList()?.symbols, ['NEW']);
  assert.deepEqual(JSON.parse(storage.get('rtx5_symbols_list_v1')).symbols, ['NEW']);
});

test('forced symbol refresh bypasses fresh cache and invalid stored scope is ignored', async () => {
  const responses = [['EURUSD'], ['GBPUSD']];
  let calls = 0;
  runtime.client.get = () => Promise.resolve(responses[calls++]);
  assert.deepEqual(await api.symbolsList(), ['EURUSD']);
  assert.deepEqual(await api.symbolsList({ force: true }), ['GBPUSD']);
  assert.equal(calls, 2);
  assert.deepEqual(api.peekSymbolsList()?.symbols, ['GBPUSD']);

  const stored = JSON.parse(storage.get('rtx5_symbols_list_v1'));
  api.invalidateSymbolManagementData();
  storage.set('rtx5_symbols_list_v1', JSON.stringify({ ...stored, scope: 'different-session' }));
  assert.equal(api.peekSymbolsList(), null);
});

test('changing manager session rejects an older symbol response', async () => {
  const requests = [];
  runtime.client.get = () => {
    const pending = deferred();
    requests.push(pending);
    return pending.promise;
  };
  storage.set('auth', JSON.stringify({ session_scope: 'session-one', login: 1001, broker_id: 'broker' }));
  const old = api.symbolsList();
  storage.set('auth', JSON.stringify({ session_scope: 'session-two', login: 1002, broker_id: 'broker' }));
  const fresh = api.symbolsList();
  assert.equal(requests.length, 2);
  requests[1].resolve(['NEW']);
  await fresh;
  requests[0].resolve(['OLD']);
  await assert.rejects(old, /invalidated/);
  assert.deepEqual(api.peekSymbolsList()?.symbols, ['NEW']);
});

test('symbol snapshot expires after its bounded storage lifetime', async () => {
  runtime.client.get = () => Promise.resolve(['EURUSD']);
  await api.symbolsList();
  const stored = JSON.parse(storage.get('rtx5_symbols_list_v1'));
  api.invalidateSymbolManagementData();
  storage.set('rtx5_symbols_list_v1', JSON.stringify({
    ...stored, savedAt: Date.now() - 31 * 60 * 1000,
  }));
  assert.equal(api.peekSymbolsList(), null);
});

test('aborting one symbol-list subscriber preserves its shared request', async () => {
  const pending = deferred();
  let requestOptions;
  runtime.client.get = (_endpoint, options) => {
    requestOptions = options;
    return pending.promise;
  };
  const controller = new AbortController();
  const aborted = api.symbolsList({ signal: controller.signal });
  const survivor = api.symbolsList();
  controller.abort();
  await assert.rejects(aborted, { name: 'AbortError' });
  pending.resolve(['GBPUSD']);
  assert.deepEqual(await survivor, ['GBPUSD']);
  assert.ok(requestOptions?.signal instanceof AbortSignal, 'the shared fetch has its own timeout');
  assert.notEqual(requestOptions.signal, controller.signal, 'one subscriber cannot cancel the shared fetch');
});
