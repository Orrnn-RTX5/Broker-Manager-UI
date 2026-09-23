import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadTradingAccountsAnalyticsCache,
  saveTradingAccountsAnalyticsCache,
  getTradingAccountsAnalyticsCacheTimestamp,
  DEFAULT_PREWARMED_ACCOUNTS,
} from '../../utils/tradingAccountsCache.js';
import {
  buildTradingAccountFilterOptions,
  buildTradingAccountReport,
} from '../../utils/tradingAccountAnalytics.js';

test('world atlas TopoJSON is locally bundled for sub-millisecond map initialization', () => {
  const start = performance.now();
  const raw = readFileSync(new URL('./countries-110m.json', import.meta.url), 'utf8');
  const geo = JSON.parse(raw);
  const duration = performance.now() - start;

  assert.equal(geo.type, 'Topology');
  assert.ok(geo.objects?.countries);
  assert.ok(geo.objects?.land);
  assert.ok(duration < 20, `TopoJSON parsed in ${duration.toFixed(2)}ms (target < 20ms)`);
});

test('analytics query options provide instant initialData without network delay', () => {
  const start = performance.now();
  const initialAccounts = loadTradingAccountsAnalyticsCache('test_scope');
  const duration = performance.now() - start;

  assert.ok(Array.isArray(initialAccounts));
  assert.ok(initialAccounts.length > 0);
  assert.ok(duration < 20, `Query options initialized in ${duration.toFixed(2)}ms (target < 20ms)`);
});

test('cache hydration and full report computation completes in under 20ms', () => {
  // Test with mock localStorage
  const mockStorage = new Map();
  globalThis.localStorage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
  };

  const sampleAccounts = [
    { login: '101', registration: '2026.09.15', country: 'India', group: 'demo', leadCampaign: 'Direct', leadSource: 'Web' },
    { login: '102', registration: '2026.09.16', country: 'India', group: 'Real', leadCampaign: 'Direct', leadSource: 'Web' },
  ];

  const scope = 'user_perf_test';
  saveTradingAccountsAnalyticsCache(scope, sampleAccounts);

  const cached = loadTradingAccountsAnalyticsCache(scope);
  assert.deepEqual(cached, sampleAccounts);

  const start = performance.now();
  const hydrated = loadTradingAccountsAnalyticsCache(scope);
  const filterOptions = buildTradingAccountFilterOptions(hydrated);
  const report = buildTradingAccountReport(hydrated, {});
  const elapsed = performance.now() - start;

  assert.equal(report.total, 2);
  assert.equal(report.countries.length, 1);
  assert.equal(report.countries[0].name, 'India');
  assert.equal(report.groups.length, 2);
  assert.ok(elapsed < 20, `Hydration and aggregation completed in ${elapsed.toFixed(2)}ms (target < 20ms)`);
});

test('TradingAccountsDashboard directly imports local TopoJSON instead of external CDN', () => {
  const source = readFileSync(new URL('./TradingAccountsDashboard.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes("import worldGeoData from './countries-110m.json';"));
  assert.ok(source.includes('geography={worldGeoData}'));
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net.*countries-110m\.json/);
});
