import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardMetrics,
  buildDashboardFallbackMetrics,
  isDemoAccount,
  isRealAccount,
  normalizeAccountLimitStatus,
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

test('dashboard metrics use real account count, demo account count, real equity, and open position count', () => {
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
    demoAccounts: 1,
    openPositions: 3,
    equity: 3800.75,
  });
});

test('dashboard metrics handle missing backend arrays without fake values', () => {
  assert.deepEqual(buildDashboardMetrics(), {
    realAccounts: 0,
    demoAccounts: 0,
    openPositions: 0,
    equity: 0,
  });
});

test('dashboard summary normalizer accepts aggregate KPI fields', () => {
  assert.deepEqual(normalizeDashboardSummary({
    real_accounts: '40,000',
    demo_accounts: '5,000',
    open_positions: 125,
    total_equity: '1,250,500.25',
    deposits_24h: '10000',
  }), {
    realAccounts: 40000,
    demoAccounts: 5000,
    openPositions: 125,
    equity: 1250500.25,
    deposits24h: 10000,
    withdrawals24h: null,
    netFlow24h: null,
  });
});

test('dashboard summary normalizer maps the documented USD reports envelope without mixing currencies', () => {
  assert.deepEqual(normalizeDashboardSummary({
    data: [
      { currency: 'EUR', total_deposits: '999999', total_withdrawals: '-888888' },
      {
        currency: 'USD', date: '2026-09-05', finalized: true,
        active_accounts: 1248, total_accounts: 5600, total_deals: 426,
        total_deposits: '186420.25', total_withdrawals: '-142300.10',
        total_volume: '1284.5', total_profit: '44120.15',
      },
    ],
    meta: { currency: 'USD', finalized: true },
  }), {
    realAccounts: null,
    demoAccounts: null,
    openPositions: null,
    equity: null,
    deposits24h: 186420.25,
    withdrawals24h: 142300.1,
    netFlow24h: 44120.15,
    activeAccounts: 1248,
    totalAccounts: 5600,
    totalDeals: 426,
    totalVolume: 1284.5,
    totalProfit: 44120.15,
    reportCurrency: 'USD',
    reportDate: '2026-09-05',
    reportFinalized: true,
  });
});

test('dashboard summary normalizer refuses an ambiguous multi-currency report without USD', () => {
  assert.equal(normalizeDashboardSummary({
    data: [
      { currency: 'EUR', total_deposits: '100' },
      { currency: 'GBP', total_deposits: '200' },
    ],
  }), null);
});

test('dashboard summary normalizer rejects unsupported payloads', () => {
  assert.equal(normalizeDashboardSummary({ status: 'ok' }), null);
  assert.equal(normalizeDashboardSummary(null), null);
});

test('account limit normalizer accepts broker account count fields', () => {
  assert.deepEqual(normalizeAccountLimitStatus({
    real_account_count: '12,500',
    demo_account_count: 300,
  }), {
    realAccounts: 12500,
    demoAccounts: 300,
  });
  assert.equal(normalizeAccountLimitStatus({ status: 'ok' }), null);
});

test('dashboard fallback metrics prefer explicit totals and account limit counts', () => {
  assert.deepEqual(buildDashboardFallbackMetrics({
    accountLimitStatus: { real_account_count: 50000, demo_account_count: 300 },
    accountsPage: { rows: [{ login: 1 }], total: 40000 },
    positionsPage: { rows: [], total: '125' },
  }), {
    realAccounts: 50000,
    demoAccounts: 300,
    openPositions: 125,
    equity: null,
    deposits24h: null,
    withdrawals24h: null,
    netFlow24h: null,
  });
});

test('dashboard fallback metrics compute from complete endpoint rows when totals are absent', () => {
  assert.deepEqual(buildDashboardFallbackMetrics({
    accountsPage: {
      rows: [
        { login: '1001', group: 'Real\\Standard', equity: 1000 },
        { login: '1002', group: 'demo\\STD', equity: 999999 },
        { login: '1003', Group: 'Real\\Raw', Equity: 250 },
      ],
      total: null,
      hasMore: false,
    },
    positionsPage: {
      rows: [{ position: 1 }, { position: 2 }],
      total: null,
      hasMore: false,
    },
  }), {
    realAccounts: 2,
    demoAccounts: 1,
    openPositions: 2,
    equity: 1250,
    deposits24h: null,
    withdrawals24h: null,
    netFlow24h: null,
  });
});

test('dashboard fallback metrics do not report partial row snapshots as complete KPIs', () => {
  assert.equal(buildDashboardFallbackMetrics({
    accountsPage: { rows: [{ login: 1, equity: 100 }], total: null, hasMore: true },
    positionsPage: { rows: [{ position: 1 }], total: null, hasMore: true },
  }), null);
});
