import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountSummary, buildSymbolExposure, collectTerminalGroups, positionLots, positionSide } from './terminalOperationsData.js';
import { assessConfiguredMarginAlerts, buildGroupMarginLevels } from './terminalAlerts.js';

test('account summary includes accounts without positions and preserves unavailable readings', () => {
  const accounts = [{ login: '2', Name: 'Two', currency: 'EUR', equity: 120, margin: 100 }, { login: '1', currency: 'USD', margin: 0 }];
  const positions = [{ ticket: '3', login: '2', symbol: 'EURUSD', volumeExt: 2500, profit: -4 },
    { ticket: '3', login: '2', symbol: 'EURUSD', volumeExt: 2500, profit: -4 },
    { ticket: '4', login: '2', symbol: 'GBPUSD', lots: 0.5, profit: 0 }];
  const [one, two] = buildAccountSummary({ accounts, positions });
  assert.equal(one.positions, 0);
  assert.equal(one.equity, null);
  assert.equal(one.marginLevel, null);
  assert.equal(two.positions, 2);
  assert.equal(two.lots, 0.75);
  assert.equal(two.profit, -4);
  assert.equal(two.marginLevel, 120);
  assert.equal(two.currency, 'EUR');
  assert.equal(buildAccountSummary({ accounts, positions, positionsLoaded: false })[1].positions, null);
});

test('unknown position volume and profit do not become zero in account totals', () => {
  const [row] = buildAccountSummary({ positions: [{ ticket: '1', login: '7', symbol: 'XAUUSD' }] });
  assert.equal(row.positions, 1);
  assert.equal(row.lots, null);
  assert.equal(row.profit, null);
  assert.equal(positionLots({ lots: 0, Volume: 10000 }), 0);
  assert.equal(positionLots({ Volume: 10000 }), 1);
  assert.equal(positionSide({ Action: 1 }), 'sell');
  assert.equal(positionSide({ type: 'unknown' }), null);
});

test('symbol exposure nets buys/sells, deduplicates tickets and counts unique accounts', () => {
  const positions = [{ ticket: '1', login: '7', Symbol: 'EURUSD', Action: 0, Volume: 15000, Profit: 2 },
    { ticket: '2', login: '7', symbol: 'EURUSD', side: 'sell', lots: 0.5, profit: -1 },
    { ticket: '3', login: '8', symbol: 'EURUSD', type: 'buy', volume: 1, profit: 5 }];
  const [row] = buildSymbolExposure([...positions, positions[0]], [{ login: '7', currency: 'USD' }, { login: '8', Currency: 'USD' }]);
  assert.deepEqual(row, { symbol: 'EURUSD', positions: 3, accounts: 2, buyLots: 2.5, sellLots: 0.5, netLots: 2,
    profit: 6, currency: 'USD', mixedCurrencies: false });
});

test('exposure withholds mixed-currency profit and unknown-side net lots', () => {
  const positions = [{ ticket: '1', login: '7', symbol: 'XAUUSD', side: 'buy', lots: 1, profit: 10 },
    { ticket: '2', login: '8', symbol: 'XAUUSD', side: 'sell', lots: 1, profit: 20 }];
  const [mixed] = buildSymbolExposure(positions, [{ login: '7', currency: 'USD' }, { login: '8', currency: 'EUR' }]);
  assert.equal(mixed.netLots, 0);
  assert.equal(mixed.profit, null);
  assert.equal(mixed.mixedCurrencies, true);
  assert.equal(buildSymbolExposure(positions)[0].profit, null);
  assert.equal(buildSymbolExposure([{ ...positions[0], side: 'unknown' }])[0].netLots, null);
});

test('group settings follow server continuation and reject incomplete or repeating pages', async () => {
  const offsets = [];
  const groups = await collectTerminalGroups(async ({ offset }) => {
    offsets.push(offset);
    return offset === 0 ? { rows: [{ name: 'A' }], hasMore: true, nextOffset: 1 }
      : { rows: [{ name: 'B', marginCallLevel: 120 }], hasMore: false };
  });
  assert.deepEqual(offsets, [0, 1]);
  assert.equal(groups.length, 2);
  await assert.rejects(collectTerminalGroups(async () => ({ rows: [{ name: 'A' }], hasMore: true })), /incomplete/);
  await assert.rejects(collectTerminalGroups(async () => ({})), /unavailable/);
});

test('configured alerts use actual thresholds and disclose missing readings/configuration', () => {
  const groups = buildGroupMarginLevels([{ name: 'real', marginCallLevel: 150, stopOutLevel: 80 }]);
  const result = assessConfiguredMarginAlerts([
    { login: '1', group: 'REAL', margin: 100, equity: 60, marginLevel: 0 },
    { login: '2', group: 'real', margin: 100, equity: 120 },
    { login: '3', group: 'other', margin: 100, marginLevel: 90 },
    { login: '4', margin: 100, marginLevel: 0, marginCallLevel: 100, stopOutLevel: 50 },
    { login: '5', margin: 0 },
    { login: '6', margin: 100, marginLevel: 80, marginCallLevel: 40, stopOutLevel: 50 },
  ], groups);
  // Group names are case-sensitive: 'REAL' is not the configured 'real', so login 1 has no thresholds.
  assert.deepEqual(result.alerts.map((row) => [row.login, row.type, row.threshold]), [['2', 'margin-call', 150]]);
  assert.deepEqual(result.unresolved.map((row) => row.login), ['1', '3', '4', '6']);
  assert.equal(result.unresolved[0].reason, 'Broker margin thresholds unavailable');
  assert.deepEqual(assessConfiguredMarginAlerts([{ login: '7', margin: 100, equity: 0, marginCallLevel: 100, stopOutLevel: 0 }]).alerts.map((row) => row.type), ['stop-out']);
});
