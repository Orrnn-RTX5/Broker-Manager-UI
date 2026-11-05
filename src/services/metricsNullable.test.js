import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { METRICS_NULLABLE_PATHS, accountMetricValue, withMetricsNullable } from './metricsNullable.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const runtime = { urls: [] };
globalThis.__metricsNullableTest = runtime;

// Bundles the real fetch wrappers and row normalizer with the network,
// session refresh stubbed, so each test sees the exact URL sent.
const bundle = await build({
  stdin: {
    contents: [
      "export { fetchManagerApi } from './managerFetch.js';",
      "export { default as apiClient } from './apiClient.js';",
      "export { normalizeTradingAccountRow } from './api.js';",
    ].join('\n'),
    resolveDir: here,
    loader: 'js',
  },
  bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'metrics-nullable-network', setup(builder) {
    builder.onResolve({ filter: /\/(desktopHttp|authRequest)(\.js)?$/ }, (args) => ({ path: args.path, namespace: 'mfc-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'mfc-test' }, (args) => ({ loader: 'js', contents:
      args.path.includes('desktopHttp')
        ? 'export const desktopFetch = (url, init) => globalThis.__metricsNullableTest.fetch(url, init);'
        : 'export const sendWithSessionRefresh = (send) => send("");',
    }));
  } }],
});
const { fetchManagerApi, apiClient, normalizeTradingAccountRow } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

beforeEach(() => {
  runtime.urls = [];
  runtime.fetch = (url, init = {}) => {
    runtime.urls.push({ url: String(url), method: init.method || 'GET' });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
});
after(() => { delete globalThis.__metricsNullableTest; });

const sentQuery = (index = 0) => new URL(runtime.urls[index].url, 'http://localhost').searchParams;

test('the flag covers exactly the four metric-carrying account reads', () => {
  assert.deepEqual([...METRICS_NULLABLE_PATHS], ['/AccountDetails', '/AccountDetailsMany', '/AccountsSummary', '/api/v1/manager/accounts']);
});

test('withMetricsNullable adds metricsNullable=1 to GETs of those routes and keeps the existing query', () => {
  assert.equal(withMetricsNullable('/AccountDetails?login=200001'), '/AccountDetails?login=200001&metricsNullable=1');
  assert.equal(withMetricsNullable('/AccountDetailsMany?login[]=1&login[]=2'), '/AccountDetailsMany?login[]=1&login[]=2&metricsNullable=1');
  assert.equal(withMetricsNullable('/AccountDetailsMany?limit=30&offset=0', 'GET'), '/AccountDetailsMany?limit=30&offset=0&metricsNullable=1');
  assert.equal(withMetricsNullable('/AccountsSummary?login[]=7'), '/AccountsSummary?login[]=7&metricsNullable=1');
  assert.equal(withMetricsNullable('/api/v1/manager/accounts'), '/api/v1/manager/accounts?metricsNullable=1');
  // An existing flag of any value is replaced, never duplicated.
  assert.equal(withMetricsNullable('/AccountDetails?metricsNullable=0&login=5'), '/AccountDetails?login=5&metricsNullable=1');
});

test('withMetricsNullable leaves writes, sub-routes and other endpoints untouched', () => {
  assert.equal(withMetricsNullable('/api/v1/manager/accounts', 'POST'), '/api/v1/manager/accounts');
  assert.equal(withMetricsNullable('/api/v1/manager/accounts/200001', 'PATCH'), '/api/v1/manager/accounts/200001');
  assert.equal(withMetricsNullable('/api/v1/manager/accounts/200001/balance-history?from=1'), '/api/v1/manager/accounts/200001/balance-history?from=1');
  assert.equal(withMetricsNullable('/AccountsOnline'), '/AccountsOnline');
  assert.equal(withMetricsNullable('/AccountDetailsManyX?limit=1'), '/AccountDetailsManyX?limit=1');
  assert.equal(withMetricsNullable('/PositionsAll?limit=30'), '/PositionsAll?limit=30');
});

test('fetchManagerApi sends metricsNullable=1 on account reads only', async () => {
  await fetchManagerApi('/AccountDetails?login=200001', { method: 'GET' });
  await fetchManagerApi('/AccountsSummary?login[]=200001');
  await fetchManagerApi('/OrderHistory?login=200001', { method: 'GET' });
  await fetchManagerApi('/api/v1/manager/accounts', { method: 'POST', body: '{}' });
  assert.equal(sentQuery(0).get('metricsNullable'), '1');
  assert.equal(sentQuery(0).get('login'), '200001');
  assert.equal(sentQuery(1).get('metricsNullable'), '1');
  assert.deepEqual(sentQuery(1).getAll('login[]'), ['200001']);
  assert.equal(sentQuery(2).has('metricsNullable'), false);
  assert.equal(sentQuery(3).has('metricsNullable'), false);
});

test('apiClient sends metricsNullable=1 on paged, by-login and list account reads', async () => {
  await apiClient.getRaw('/AccountDetailsMany?limit=30&offset=0');
  await apiClient.get('/AccountDetailsMany?login[]=1&login[]=2');
  await apiClient.get('/AccountDetails?login=9');
  await apiClient.getText('/api/v1/manager/accounts?limit=30&offset=0');
  await apiClient.get('/PositionsAll?limit=30');
  for (let index = 0; index < 4; index += 1) {
    assert.equal(sentQuery(index).get('metricsNullable'), '1', runtime.urls[index].url);
  }
  assert.deepEqual(sentQuery(1).getAll('login[]'), ['1', '2']);
  assert.equal(sentQuery(4).has('metricsNullable'), false);
});

test('accountMetricValue keeps a server null as null and never turns it into 0', () => {
  assert.equal(accountMetricValue({ equity: null }, ['equity', 'Equity']), null);
  assert.equal(accountMetricValue({ equity: 12.5, metricsAvailable: false }, ['equity']), null);
  assert.equal(accountMetricValue({ Equity: 3, MetricsAvailable: false }, ['equity', 'Equity']), null);
  assert.equal(accountMetricValue({ equity: 0 }, ['equity']), 0);
  assert.equal(accountMetricValue({ Equity: '101.25' }, ['equity', 'Equity']), '101.25');
  // Older servers that omit the key keep the previous default.
  assert.equal(accountMetricValue({}, ['equity', 'Equity']), 0);
});

test('trading account rows keep unavailable metrics null', () => {
  const missing = normalizeTradingAccountRow({
    login: 200001, balance: 1000, Credit: 50, equity: null, margin: null, marginFree: null,
    marginLevel: null, profit: null, metricsAvailable: false, metricsUnavailableReason: 'METRICS_CACHE_MISS',
  });
  assert.equal(missing.balance, 1000);
  assert.equal(missing.credit, 50);
  for (const key of ['equity', 'profit', 'margin', 'marginFree', 'marginLevel']) {
    assert.equal(missing[key], null, key);
  }
  assert.equal(missing.metricsAvailable, false);

  const live = normalizeTradingAccountRow({
    login: 200002, balance: 1000, equity: 1010.5, margin: 20, marginFree: 990.5, marginLevel: 5052.5, profit: 10.5, metricsAvailable: true,
  });
  assert.deepEqual(
    [live.equity, live.margin, live.marginFree, live.marginLevel, live.profit, live.metricsAvailable],
    [1010.5, 20, 990.5, 5052.5, 10.5, true],
  );
  const zeroMargin = normalizeTradingAccountRow({ login: 200003, equity: 5, margin: 0, marginFree: 5, marginLevel: 0, profit: 0 });
  assert.deepEqual([zeroMargin.margin, zeroMargin.marginLevel, zeroMargin.profit], [0, 0, 0]);
});

test('the account grid and account popup render a missing metric as "—"', () => {
  const grid = readFileSync(new URL('../features/clients/components/TradingAccountsDataGrid.jsx', import.meta.url), 'utf8');
  assert.match(grid, /\{fmtMetric\(row\.equity\)\}/);
  assert.match(grid, /\{fmtMetric\(row\.profit\)\}/);
  assert.match(grid, /const fmtMetric = \(n\) => \(n === null \|\| n === undefined \|\| n === '' \|\| !Number\.isFinite\(Number\(n\)\) \? '—' : fmt\(n\)\);/);

  const modal = readFileSync(new URL('../components/Popups/AccountDetailsModal.jsx', import.meta.url), 'utf8');
  assert.match(modal, /const profitVal = getFieldValue\('Profit', null\);/);
  assert.match(modal, /const profitSpaceVal = profitVal === null \|\| profitVal === undefined \|\| profitVal === '' \? '—' : formatSpaceNumber\(profitVal\);/);
  assert.equal(modal.split("{profitSpaceVal === '—' ? '—' :").length - 1, 2);
  assert.doesNotMatch(modal, /: profitSpaceVal\} \{currencyValue\}/);
});
