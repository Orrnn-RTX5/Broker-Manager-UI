import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardMetrics,
  buildDashboardFallbackMetrics,
  isDemoAccount,
  isRealAccount,
  normalizeDashboardSummary,
  toFiniteNumber,
} from './dashboardMetrics.js';

test('dashboard metric parsing accepts finite numeric values only', () => {
  assert.equal(toFiniteNumber(1250.5), 1250.5);
  assert.equal(toFiniteNumber('1,250.50'), 1250.5);
  assert.equal(toFiniteNumber('1 250.50'), 1250.5);
  assert.equal(toFiniteNumber(''), null);
  assert.equal(toFiniteNumber('n/a'), null);
  assert.equal(toFiniteNumber(Number.POSITIVE_INFINITY), null);
});

test('dashboard account classification treats demo groups as non-real accounts', () => {
  assert.equal(isDemoAccount({ group: 'Demo\\STD' }), true);
  assert.equal(isDemoAccount({ Group: 'demo\\PRO' }), true);
  assert.equal(isDemoAccount({ accountGroup: 'Real\\Standard' }), false);
  assert.equal(isRealAccount({ group: 'Real\\VIP' }), true);
});

test('dashboard metrics use real account count, real equity, and open position count', () => {
  const metrics = buildDashboardMetrics({
    accounts: [
      { login: '1001', group: 'Real\\Standard', equity: 1000 },
      { login: '1002', group: 'demo\\STD', equity: 999999 },
      { login: '1003', group: 'Real\\VIP', equity: '2,500.75' },
      { login: '1004', group: '', equity: 'bad-value' },
      { login: '1005', Group: 'Real\\Raw', Equity: 300 },
    ],
    positions: [
      { position: 1 },
      { position: 2 },
      { position: 3 },
    ],
  });

  assert.deepEqual(metrics, {
    realAccounts: 4,
    openPositions: 3,
    equity: 3800.75,
  });
});

test('dashboard metrics handle missing backend arrays without fake values', () => {
  assert.deepEqual(buildDashboardMetrics(), {
    realAccounts: 0,
    openPositions: 0,
    equity: 0,
  });
});

test('dashboard summary normalizer accepts aggregate KPI fields', () => {
  assert.deepEqual(normalizeDashboardSummary({
    real_accounts: '40,000',
    open_positions: 125,
    total_equity: '1,250,500.25',
    deposits_24h: '10000',
  }), {
    realAccounts: 40000,
    openPositions: 125,
    equity: 1250500.25,
    deposits24h: 10000,
  });
});

test('dashboard summary normalizer rejects unsupported payloads', () => {
  assert.equal(normalizeDashboardSummary({ status: 'ok' }), null);
  assert.equal(normalizeDashboardSummary(null), null);
});

test('dashboard fallback metrics use paged totals without requiring page rows', () => {
  assert.deepEqual(buildDashboardFallbackMetrics({
    accountsPage: { rows: [{ login: 1 }], total: 40000 },
    positionsPage: { rows: [], total: '125' },
  }), {
    realAccounts: 40000,
    openPositions: 125,
    equity: null,
    deposits24h: null,
  });
});

test('dashboard fallback metrics reject pages without totals', () => {
  assert.equal(buildDashboardFallbackMetrics({
    accountsPage: { rows: [{ login: 1 }], total: null },
    positionsPage: { rows: [{ position: 1 }], total: null },
  }), null);
});
