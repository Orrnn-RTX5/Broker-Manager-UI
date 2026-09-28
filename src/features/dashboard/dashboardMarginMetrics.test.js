import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardMarginMetrics } from './dashboardMarginMetrics.js';

const page = (rows, other = {}) => ({ rows, total: rows.length, hasMore: false, ...other });

test('complete account and group snapshots yield currency-safe margin and live alert counts', () => {
  const accountsPage = page([
    { login: '1', Name: 'Trader One', group: 'Real/USD', currency: 'usd', Margin: 100, Equity: 120 },
    { login: '2', group: 'Real/USD', Currency: 'USD', margin: 50, marginLevel: 40 },
    { login: '3', group: 'Real/USD', Currency: 'USD', margin: 0 },
    { login: '4', group: 'demo/USD', Currency: 'USD', margin: 900, marginLevel: 20 },
  ]);
  const result = buildDashboardMarginMetrics({
    accountsPage,
    groups: [{ name: 'Real/USD', marginCallLevel: 150, stopOutLevel: 60 }],
    groupsComplete: true,
  });

  assert.deepEqual(result, {
    usedMarginTotal: 150,
    marginCurrency: 'USD',
    accountsWithMargin: 2,
    marginAlertCount: 2,
    marginCallCount: 1,
    stopOutCount: 1,
  });
});

test('mixed currencies permit an account count but not a money total', () => {
  const result = buildDashboardMarginMetrics({
    accountsPage: page([
      { login: '1', group: 'real/USD', Currency: 'USD', Margin: 40, MarginLevel: 200 },
      { login: '2', group: 'real/EUR', Currency: 'EUR', Margin: 20, MarginLevel: 200 },
    ]),
    groups: [{ name: 'real/USD' }, { name: 'real/EUR' }],
    groupsComplete: true,
  });
  assert.equal(result.usedMarginTotal, null);
  assert.equal(result.marginCurrency, null);
  assert.equal(result.accountsWithMargin, 2);
  assert.equal(result.marginAlertCount, 0);
});

test('incomplete pages, unknown account types, and missing margins do not produce totals', () => {
  const row = { login: '1', group: 'real/USD', Currency: 'USD', Margin: 40 };
  for (const accountsPage of [
    page([row], { hasMore: true }),
    page([row], { total: 2 }),
    page([{ login: '1', Currency: 'USD', Margin: 40 }]),
    page([{ login: '1', group: 'real/USD', Currency: 'USD' }]),
  ]) {
    const result = buildDashboardMarginMetrics({ accountsPage });
    assert.equal(result.usedMarginTotal, null);
    assert.equal(result.accountsWithMargin, null);
    assert.equal(result.marginAlertCount, null);
  }
});

test('unknown live levels and incomplete group data leave alert counts unavailable', () => {
  const missingLevel = buildDashboardMarginMetrics({
    accountsPage: page([{ login: '1', group: 'real/USD', Currency: 'USD', Margin: 40 }]),
    groupsComplete: true,
  });
  assert.equal(missingLevel.usedMarginTotal, 40);
  assert.equal(missingLevel.marginAlertCount, null);

  const incompleteGroups = buildDashboardMarginMetrics({
    accountsPage: page([{ login: '1', group: 'real/USD', Currency: 'USD', Margin: 40, Equity: 30 }]),
    groups: [{ name: 'real/USD', marginCallLevel: 100, stopOutLevel: 50 }],
    groupsComplete: false,
  });
  assert.equal(incompleteGroups.accountsWithMargin, 1);
  assert.equal(incompleteGroups.marginAlertCount, null);

  const unknownGroup = buildDashboardMarginMetrics({
    accountsPage: page([{ login: '1', group: 'real/USD', Currency: 'USD', Margin: 40, Equity: 30 }]),
    groups: [{ name: 'other' }],
    groupsComplete: true,
  });
  assert.equal(unknownGroup.marginAlertCount, null);
});

test('account thresholds can produce alert counts before a complete group list arrives', () => {
  const result = buildDashboardMarginMetrics({
    accountsPage: page([
      { login: '1', group: 'real/USD', Currency: 'USD', Margin: 100, Equity: 70, MarginCallLevel: 80, StopOutLevel: 50 },
      { login: '2', group: 'real/USD', Currency: 'USD', Margin: 0 },
    ]),
  });
  assert.equal(result.accountsWithMargin, 1);
  assert.equal(result.marginAlertCount, 1);
  assert.equal(result.marginCallCount, 1);
  assert.equal(result.stopOutCount, 0);
});

test('formatted numeric account fields retain the correct alert classification', () => {
  const result = buildDashboardMarginMetrics({
    accountsPage: page([{
      login: '1', group: 'real/USD', Currency: 'USD', Margin: '1,000',
      Equity: '400', MarginCallLevel: '100', StopOutLevel: '50',
    }]),
  });
  assert.equal(result.usedMarginTotal, 1000);
  assert.equal(result.marginAlertCount, 1);
  assert.equal(result.stopOutCount, 1);
});

test('a complete snapshot with no margin yields zero alerts without threshold data', () => {
  const result = buildDashboardMarginMetrics({
    accountsPage: page([{ login: '1', group: 'real/USD', Currency: 'USD', Margin: 0 }]),
  });
  assert.equal(result.usedMarginTotal, 0);
  assert.equal(result.accountsWithMargin, 0);
  assert.equal(result.marginAlertCount, 0);
});
