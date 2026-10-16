import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendEquityObservation,
  buildActivitySeries,
  buildSymbolActivity,
  parseActivityTimestamp,
} from './dashboardActivityData.js';

test('activity timestamps accept seconds, milliseconds, and ISO UTC strings', () => {
  const timestamp = Date.UTC(2026, 8, 28, 11, 30);
  assert.equal(parseActivityTimestamp(timestamp / 1000), timestamp);
  assert.equal(parseActivityTimestamp(timestamp), timestamp);
  assert.equal(parseActivityTimestamp('2026-09-28T11:30:00Z'), timestamp);
  assert.equal(parseActivityTimestamp('invalid'), null);
});

test('equity history keeps the newest real reading per five minute slot', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const first = appendEquityObservation([], { timestamp: now - 4 * 60_000, equity: 100 }, now);
  const second = appendEquityObservation(first, { timestamp: now - 3 * 60_000, equity: 125 }, now);
  const stale = appendEquityObservation(second, { timestamp: now - 4 * 60_000, equity: 90 }, now);
  assert.deepEqual(stale, [{ timestamp: now - 3 * 60_000, equity: 125 }]);
});

test('activity chart buckets executed real-account lots and actual equity readings', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const deals = [
    { ticket: 1, login: '100', symbol: 'EURUSD', action: 'deal_buy', volume: 0.25, time: Date.UTC(2026, 8, 28, 9, 20) / 1000 },
    { ticket: 1, login: '100', symbol: 'EURUSD', action: 'deal_buy', volume: 0.25, time: Date.UTC(2026, 8, 28, 9, 20) / 1000 },
    { ticket: 2, login: '100', symbol: 'XAUUSD', action: 1, volume: 0.5, time: Date.UTC(2026, 8, 28, 11, 20) / 1000 },
    { ticket: 3, login: '200', symbol: 'EURUSD', action: 'SELL', volume: 10, time: Date.UTC(2026, 8, 28, 11, 20) / 1000 },
    { ticket: 4, login: '100', symbol: '', action: 'BUY', volume: 4, time: Date.UTC(2026, 8, 28, 11, 20) / 1000 },
    { ticket: 5, login: '100', symbol: 'EURUSD', action: 'BALANCE', volume: 4, time: Date.UTC(2026, 8, 28, 11, 20) / 1000 },
  ];
  const points = buildActivitySeries({
    now,
    deals,
    equityHistory: [
      { timestamp: Date.UTC(2026, 8, 28, 9, 30), equity: 249000 },
      { timestamp: Date.UTC(2026, 8, 28, 11, 40), equity: 249900 },
    ],
    volumeCoverageFrom: now - 24 * 60 * 60_000,
    realLogins: new Set(['100']),
  });
  const at = (hour) => points.find((point) => point.timestamp === Date.UTC(2026, 8, 28, hour));
  assert.deepEqual({ volume: at(8).volume, equity: at(8).equity }, { volume: 0.25, equity: 249000 });
  assert.deepEqual({ volume: at(10).volume, equity: at(10).equity }, { volume: 0.5, equity: 249900 });
  assert.equal(at(10).equityAsOf, Date.UTC(2026, 8, 28, 11, 40));
  assert.equal(at(6).volume, 0);
  assert.equal(at(6).equity, null);
});

test('incomplete deal coverage leaves older area points unknown instead of showing false zeroes', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const points = buildActivitySeries({
    now,
    deals: [],
    volumeCoverageFrom: Date.UTC(2026, 8, 28, 9, 15),
  });
  assert.equal(points.find((point) => point.timestamp === Date.UTC(2026, 8, 28, 8)).volume, null);
  assert.equal(points.find((point) => point.timestamp === Date.UTC(2026, 8, 28, 10)).volume, 0);
});

test('new buckets after the latest backend deal read remain unknown until refreshed', () => {
  const now = Date.UTC(2026, 8, 28, 12);
  const points = buildActivitySeries({
    now,
    volumeCoverageFrom: now - 24 * 60 * 60_000,
    volumeCoverageTo: Date.UTC(2026, 8, 28, 9),
  });
  assert.equal(points.find((point) => point.timestamp === Date.UTC(2026, 8, 28, 8)).volume, 0);
  assert.equal(points.find((point) => point.timestamp === Date.UTC(2026, 8, 28, 10)).volume, null);
});

test('the current time bucket is marked as a partial live total', () => {
  const now = Date.UTC(2026, 8, 28, 12, 15);
  const points = buildActivitySeries({
    now,
    volumeCoverageFrom: now - 24 * 60 * 60_000,
    volumeCoverageTo: now,
  });
  assert.equal(points.at(-1).volume, 0);
  assert.equal(points.at(-1).volumePartial, true);
  assert.equal(points.at(-2).volumePartial, false);
});

test('symbol rankings use the chart scope, exclude non-trades, and deduplicate executed deals', () => {
  const now = Date.UTC(2026, 9, 12, 12);
  const recent = (ticket, symbol, volume, extra = {}) => ({ ticket, symbol, volume, time: now - 20 * 60_000, login: 'real', action: 'buy', ...extra });
  const deals = [
    recent(1, 'EURUSD', 0.1), recent(1, 'EURUSD', 0.1), recent(2, 'EURUSD', 0.2),
    recent(3, 'XAUUSD', 0.7, { action: 1 }),
    recent(4, 'BTCUSD', 100, { login: 'demo' }),
    recent(5, 'EURUSD', 100, { action: 'balance' }),
    recent(6, '', 100), recent(7, 'EURUSD', -10),
    recent(8, 'EURUSD', 100, { time: now + 1 }),
    recent(9, 'EURUSD', 100, { time: now - 2 * 60 * 60_000 }),
  ];
  const options = { range: '1H', now, deals, realLogins: new Set(['real']) };
  const ranked = buildSymbolActivity(options);
  assert.equal(ranked.totalDeals, 3);
  assert.equal(ranked.totalVolume, 1);
  assert.deepEqual(ranked.rows.map(({ symbol, volume, deals }) => ({ symbol, volume, deals })), [
    { symbol: 'XAUUSD', volume: 0.7, deals: 1 },
    { symbol: 'EURUSD', volume: 0.3, deals: 2 },
  ]);
  assert.ok(Math.abs(ranked.rows.reduce((total, row) => total + row.share, 0) - 100) < 1e-9);
  const chart = buildActivitySeries({ ...options, volumeCoverageFrom: 0 });
  assert.equal(chart.reduce((total, point) => total + point.volume, 0), ranked.totalVolume);
});

test('symbol rankings follow the selected period and return a genuine empty state', () => {
  const now = Date.UTC(2026, 9, 12, 12);
  const deals = [{ ticket: 1, login: 'real', symbol: 'EURUSD', action: 'sell', volume: 2, time: now - 2 * 60 * 60_000 }];
  assert.deepEqual(buildSymbolActivity({ range: '1H', now, deals }), { rows: [], totalDeals: 0, totalVolume: 0 });
  assert.equal(buildSymbolActivity({ range: '6H', now, deals }).totalVolume, 2);
  assert.deepEqual(buildSymbolActivity({ range: '6H', now, deals, realLogins: new Set() }), { rows: [], totalDeals: 0, totalVolume: 0 });
});

test('equal-volume rankings sort by execution count and then symbol', () => {
  const now = Date.UTC(2026, 9, 12, 12);
  const deals = [
    { ticket: 1, symbol: 'EURUSD', volume: 0.5 }, { ticket: 2, symbol: 'EURUSD', volume: 0.5 },
    { ticket: 3, symbol: 'XAUUSD', volume: 1 }, { ticket: 4, symbol: 'AUDUSD', volume: 1 },
  ].map(deal => ({ ...deal, time: now, action: 'deal_sell' }));
  assert.deepEqual(buildSymbolActivity({ now, deals }).rows.map(row => row.symbol), ['EURUSD', 'AUDUSD', 'XAUUSD']);
});

