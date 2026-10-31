import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAccountSummary,
  buildMt5AssetExposure,
  buildMt5ExposureChartSlices,
  buildMt5SymbolSummary,
  buildSymbolExposure,
  collectTerminalGroups,
  formatMt5ExposureCompactQty,
  formatMt5ExposureRate,
  formatMt5SpaceGroupedInt,
  formatMt5SpaceGroupedMoney,
  getMt5ExposureDiagramTitle,
  positionLots,
  positionSide,
} from './terminalOperationsData.js';
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

test('MT5 symbol summary calculates weighted average buy/sell prices, net volume, and uncovered profit', () => {
  const positions = [
    { ticket: '10', login: '1001', symbol: 'EURUSD', type: 'buy', volume: 0.5, priceOpen: 1.11700, profit: 5.5 },
    { ticket: '11', login: '1002', symbol: 'EURUSD', type: 'buy', volume: 0.5, priceOpen: 1.11740, profit: 4.5 },
    { ticket: '12', login: '1003', symbol: 'EURUSD', type: 'sell', volume: 1.5, priceOpen: 1.11661, profit: -2.16 },
    { ticket: '13', login: '1001', symbol: 'USDJPY', type: 'buy', volume: 0.2, priceOpen: 157.387, profit: 87.0 },
  ];
  const [eurusd, usdjpy] = buildMt5SymbolSummary(positions);
  assert.equal(eurusd.symbol, 'EURUSD');
  assert.equal(eurusd.digits, 5);
  assert.equal(eurusd.positions, 3);
  assert.equal(eurusd.buyVolume, 1);
  assert.equal(Number(eurusd.buyPrice.toFixed(5)), 1.1172);
  assert.equal(eurusd.sellVolume, 1.5);
  assert.equal(Number(eurusd.sellPrice.toFixed(5)), 1.11661);
  assert.equal(eurusd.netVolume, -0.5);
  assert.equal(eurusd.profit, 7.84);
  assert.equal(eurusd.uncoveredProfit, 7.84);

  assert.equal(usdjpy.symbol, 'USDJPY');
  assert.equal(usdjpy.digits, 3);
  assert.equal(usdjpy.sellPrice, 0);
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

test('MT5 asset exposure dynamically decomposes FX, metals, crypto and CFDs with live rates and pie slices', () => {
  const positions = [
    { ticket: '101', login: '1001', symbol: 'GBPUSD', type: 'sell', volume: 4.4218315, priceOpen: 1.32925 },
    { ticket: '102', login: '1001', symbol: 'AUDUSD', type: 'buy', volume: 9.3170093, priceOpen: 0.70336 },
    { ticket: '103', login: '1002', symbol: 'XAUUSD', type: 'buy', volume: 1.08, priceOpen: 4049.52 },
    { ticket: '104', login: '1002', symbol: 'JAP225', type: 'buy', volume: 0.06, priceOpen: 68661.0 },
    { ticket: '105', login: '1003', symbol: 'BTCUSD', type: 'buy', volume: 0.11, priceOpen: 81677.04 },
  ];
  const symbols = {
    GBPUSD: { symbol: 'GBPUSD', bid: 1.32925, ask: 1.32945, digits: 5 },
    AUDUSD: { symbol: 'AUDUSD', bid: 0.70336, ask: 0.70350, digits: 5 },
    XAUUSD: { symbol: 'XAUUSD', bid: 4049.52, ask: 4050.10, digits: 2, contract_size: 100 },
    JAP225: { symbol: 'JAP225', bid: 68661.0, ask: 68665.0, digits: 2, contract_size: 1 },
    BTCUSD: { symbol: 'BTCUSD', bid: 81677.04, ask: 81690.0, digits: 2, contract_size: 1 },
  };

  const model = buildMt5AssetExposure({ positions, symbols, currency: 'USD' });
  const byAsset = Object.fromEntries(model.rows.map((r) => [r.asset, r]));

  assert.equal(formatMt5ExposureCompactQty(byAsset.GBP.clients), '-442.18315K');
  assert.equal(formatMt5SpaceGroupedInt(byAsset.GBP.net), '-442 183');
  assert.equal(formatMt5ExposureRate(byAsset.GBP.rate), '1.32925');
  assert.equal(formatMt5SpaceGroupedMoney(byAsset.GBP.netUsd), '-587 771.95');
  assert.equal(byAsset.GBP.positiveUsd, null);

  assert.equal(formatMt5ExposureCompactQty(byAsset.AUD.clients), '931.70093K');
  assert.equal(formatMt5SpaceGroupedInt(byAsset.AUD.net), '931 701');
  assert.equal(formatMt5SpaceGroupedMoney(byAsset.AUD.netUsd), '655 321.17');
  assert.equal(formatMt5SpaceGroupedMoney(byAsset.AUD.positiveUsd), '655 321.17');

  assert.equal(byAsset.XAU.clients, 108);
  assert.equal(formatMt5SpaceGroupedMoney(byAsset.XAU.netUsd), '437 348.16');

  assert.equal(byAsset.JAP225.clients, 0.06);
  assert.equal(formatMt5SpaceGroupedInt(byAsset.JAP225.net), '0');
  assert.equal(formatMt5SpaceGroupedMoney(byAsset.JAP225.netUsd), '4 119.66');

  assert.equal(byAsset.BTC.clients, 0.11);
  assert.equal(formatMt5SpaceGroupedMoney(byAsset.BTC.netUsd), '8 984.47');

  assert.ok(model.longChartSlices.some((s) => s.asset === 'AUD'));
  assert.ok(model.longChartSlices.some((s) => s.asset === 'XAU'));
  assert.ok(model.shortChartSlices.some((s) => s.asset === 'GBP'));
  assert.ok(byAsset.GBP.clientsBarPct < 0);
  assert.ok(byAsset.AUD.netBarPct > byAsset.JAP225.netBarPct);

  assert.equal(getMt5ExposureDiagramTitle({ direction: 'short', basis: 'net' }), 'Net Shorts');
  assert.equal(getMt5ExposureDiagramTitle({ direction: 'long', basis: 'clients' }), 'Clients Longs');
  assert.equal(getMt5ExposureDiagramTitle({ direction: 'short', basis: 'coverage' }), 'Coverage Shorts');
  assert.equal(buildMt5ExposureChartSlices(model.allRows, { direction: 'short', basis: 'clients' })[0].asset, 'GBP');
});
