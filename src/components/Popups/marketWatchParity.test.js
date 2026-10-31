import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildMarketWatchSymbolDetails,
  formatDailyChange,
  formatMarketWatchDetailsNumber,
  formatMarketWatchDetailsPrice,
  readMarketWatchSymbolSpecification,
} from './marketWatchSymbolDetailsModel.js';
import {
  buildTickChartCrosshair,
  buildTickChartGeometry,
  MARKET_WATCH_TICK_CHART_LIMIT,
} from './tickChartGeometry.js';
import {
  buildMt5SymbolContextMenuItems,
  buildMt5TickChartContextMenuItems,
  exportTickChartImage,
  matchesSymbolProfile,
} from './marketWatchSymbolMenuModel.js';

const marketDataSrc = readFileSync(new URL('./MarketData.jsx', import.meta.url), 'utf8');
const viewsCssSrc = readFileSync(new URL('./market-watch-views.css', import.meta.url), 'utf8');

test('marketWatchSymbolDetailsModel resolves nested specifications before root and never guesses digits', () => {
  const spec = readMarketWatchSymbolSpecification(
    {
      tick_size: 0.01,
      tick_value: 1,
      digits: 2,
      brokerSpecification: {
        trade_tick_size: 0.00001,
        trade_tick_value: 10,
        digits: 5,
      },
    },
    { digits: 3 }
  );
  assert.equal(spec.tickSize, 0.00001);
  assert.equal(spec.tickValue, 10);
  assert.equal(spec.digits, 5);

  const noDigitsSpec = readMarketWatchSymbolSpecification({ symbol: 'EURUSD', point_size: 0.0001 });
  assert.equal(noDigitsSpec.digits, null);
  assert.equal(noDigitsSpec.tickSize, 0.0001);
  assert.equal(formatMarketWatchDetailsPrice(1.2345678, null), '1.2345678');
  assert.equal(formatMarketWatchDetailsPrice(1.2, 5), '1.20000');
  assert.equal(formatMarketWatchDetailsNumber(null), null);
});

test('buildMarketWatchSymbolDetails shifts session extremes by spread markup and clamps against live quote', () => {
  const details = buildMarketWatchSymbolDetails({
    symbol: 'XAUUSD',
    instrument: {
      specification: {
        tickSize: 0.01,
        tickValue: 1,
        digits: 2,
      },
    },
    tick: {
      bid: 2400.5,
      ask: 2401.0,
      rawBid: 2400.6,
      rawAsk: 2400.9,
      daily_open: 2390.0,
      previous_close: 2380.0,
      session: {
        high_bid: 2400.4,
        low_bid: 2395.6,
        high_ask: 2400.7,
        low_ask: 2395.9,
      },
    },
  });

  assert.equal(details.hasLiveQuote, true);
  assert.equal(details.bid, 2400.5);
  assert.equal(details.ask, 2401.0);
  // shifted rawBidHigh (2400.4 - 0.1 = 2400.3) clamped to liveBid 2400.5
  assert.equal(details.bidHigh, 2400.5);
  // shifted rawBidLow (2395.6 - 0.1 = 2395.5)
  assert.ok(Math.abs(details.bidLow - 2395.5) < 1e-9);
  // shifted rawAskHigh (2400.7 + 0.1 = 2400.8) clamped to liveAsk 2401.0
  assert.equal(details.askHigh, 2401.0);
  // shifted rawAskLow (2395.9 + 0.1 = 2396.0)
  assert.ok(Math.abs(details.askLow - 2396.0) < 1e-9);
  assert.equal(details.open, 2390.0);
  assert.equal(details.close, 2380.0);
  assert.equal(formatDailyChange(details.dailyChangePrice, 2, false), '+20.50');
  assert.equal(formatDailyChange(details.dailyChange, 2, true), '+0.86%');
});

test('buildTickChartGeometry and buildTickChartCrosshair compute 2000-tick window, last line, and crosshair tags', () => {
  assert.equal(MARKET_WATCH_TICK_CHART_LIMIT, 2_000);
  const ticks = [
    { timestamp: 1700000000000, bid: 1.0851, ask: 1.0853, last: 1.0852 },
    { timestamp: 1700000001000, bid: 1.0854, ask: 1.0856, last: 1.0855 },
    { timestamp: 1700000002000, bid: 1.0852, ask: 1.0855, last: 1.0853 },
  ];
  const geometry = buildTickChartGeometry(ticks, {
    width: 320,
    height: 240,
    fontSize: 11,
    digits: 5,
    includeLast: true,
    formatDate: () => '2026.10.28',
    formatTime: () => '12:00:00',
  });

  assert.ok(geometry);
  assert.equal(geometry.visibleCount, 3);
  assert.equal(geometry.totalCount, 3);
  assert.ok(geometry.bidPath.startsWith('M'));
  assert.ok(geometry.askPath.startsWith('M'));
  assert.ok(geometry.lastPath.startsWith('M'));
  assert.equal(geometry.bidTag.label, '1.08520');
  assert.equal(geometry.askTag.label, '1.08550');
  assert.equal(geometry.lastTag?.label, '1.08530');

  const crosshair = buildTickChartCrosshair(
    geometry,
    { x: geometry.plot.left + 20, y: geometry.plot.top + 30 },
    { width: 320, height: 240, fontSize: 11, digits: 5, formatDate: () => '2026.10.28', formatTime: () => '12:00:01' }
  );
  assert.ok(crosshair);
  assert.equal(crosshair.timeLabel, '2026.10.28 12:00:01');
  assert.match(crosshair.priceLabel, /^\d+\.\d{5}$/);
});

test('MarketData.jsx and market-watch-views.css include all 12 Details rows and 12 Ticks SVG layers', () => {
  for (const rowKey of [
    'tickSize', 'tickValue', 'bid', 'bidHigh', 'bidLow',
    'ask', 'askHigh', 'askLow', 'dailyChangePrice', 'dailyChange', 'open', 'close',
  ]) {
    assert.ok(marketDataSrc.includes(`key: '${rowKey}'`), `Details row ${rowKey} must be rendered`);
  }
  assert.ok(marketDataSrc.includes('rtx-market-watch-details__list'), 'Details dl list class must exist');
  assert.ok(marketDataSrc.includes('rtx-market-tick-chart__crosshair'), 'Tick chart crosshair layer must exist');
  assert.ok(marketDataSrc.includes('rtx-market-tick-chart__price-lines'), 'Tick chart price reference lines must exist');
  assert.ok(viewsCssSrc.includes(".rtx-market-watch-details[data-grid='false']"), 'Details grid CSS must exist');
  assert.ok(viewsCssSrc.includes('.rtx-market-tick-chart__tag--crosshair'), 'Tick chart crosshair CSS must exist');
});

test('MarketWatchSymbolMenu implements all 19 MT5 Manager right-click symbol context menu options', () => {
  const items = buildMt5SymbolContextMenuItems({
    symbolName: 'EURUSD',
    showRawQuotes: false,
    useSystemColors: false,
    showMilliseconds: false,
    trackRequests: true,
    autoArrange: true,
    showGrid: true,
    activeProfile: 'Default',
  });
  const labels = items.filter((item) => !item.divider && item.type !== 'separator').map((item) => item.label);
  assert.deepEqual(labels, [
    'Properties',
    'Profiles',
    'Show Raw Quotes',
    'Details',
    'Tick Chart',
    'Depth Of Market',
    'Specification',
    'Hide',
    'Hide All',
    'Show All',
    'Symbols',
    'Sort',
    'Export',
    'Use System Colors',
    'Show Milliseconds',
    'Track Requests',
    'Auto Arrange',
    'Grid',
    'Columns',
  ]);
  const domItem = items.find((item) => item.key === 'dom');
  const hideItem = items.find((item) => item.key === 'hide');
  const symbolsItem = items.find((item) => item.key === 'symbols');
  assert.equal(domItem?.shortcut, 'Alt+B');
  assert.equal(domItem?.disabled, true);
  assert.equal(hideItem?.shortcut, 'Delete');
  assert.equal(symbolsItem?.shortcut, 'Ctrl+U');
  assert.equal(matchesSymbolProfile('EURUSD', 'Forex'), true);
  assert.equal(matchesSymbolProfile('XAUUSD', 'Metals'), true);
  assert.equal(matchesSymbolProfile('BTCUSD', 'Crypto'), true);
  assert.ok(marketDataSrc.includes('buildMt5SymbolContextMenuItems'), 'MarketData must use buildMt5SymbolContextMenuItems');
});

test('MT5 Manager Ticks chart enables hover crosshair (+) and Bid / Ask value readout by default with memoized geometry', () => {
  assert.ok(
    marketDataSrc.includes('const [crosshairEnabled, setCrosshairEnabled] = useState(true);'),
    'Tick chart hover crosshair must be enabled by default'
  );
  assert.ok(
    marketDataSrc.includes('const tickChartModel = useMemo('),
    'Tick chart geometry must be memoized separately from pointer hover state'
  );
  assert.ok(
    viewsCssSrc.includes('cursor: crosshair;'),
    'Tick chart canvas and plot must show the + crosshair cursor on hover'
  );
  assert.ok(
    viewsCssSrc.includes('.rtx-market-tick-chart__price-line--bid'),
    'Tick chart CSS must style current-price reference lines'
  );

  const ticks = [
    { timestamp: 1700000000000, bid: 0.78822, ask: 0.78852 },
    { timestamp: 1700000002000, bid: 0.78797, ask: 0.78827 },
  ];
  const bidOnlyGeometry = buildTickChartGeometry(ticks, {
    width: 320,
    height: 240,
    fontSize: 11,
    digits: 5,
    includeBid: true,
    includeAsk: false,
    formatDate: () => '2026.10.30',
    formatTime: () => '10:31:16',
  });
  assert.ok(bidOnlyGeometry);
  assert.ok(Number.isFinite(bidOnlyGeometry.lastX), 'Geometry exposes lastX for right-edge price projection');
  assert.match(bidOnlyGeometry.bidPath, /^M[\d.]+ [\d.]+L[\d.]+ [\d.]+H[\d.]+$/, 'Tick path uses smooth point-to-point L segments with right-edge H projection');
  assert.ok(
    marketDataSrc.includes('x1={geometry.lastX ?? geometry.plot.right}'),
    'Current price line starts at latest tick X instead of slicing across the entire plot'
  );
  assert.equal(bidOnlyGeometry.timeTicks[bidOnlyGeometry.timeTicks.length - 1]?.isLast, true);
  assert.ok(bidOnlyGeometry.maximumPrice < 0.78852, 'Bid-only chart auto-scales tightly to Bid range');

  const crosshair = buildTickChartCrosshair(
    bidOnlyGeometry,
    { x: bidOnlyGeometry.plot.left + 2, y: bidOnlyGeometry.plot.top + 40 },
    { fontSize: 11, digits: 5, formatDate: () => '2026.10.30', formatTime: () => '10:28:01' }
  );
  assert.ok(crosshair);
  assert.equal(crosshair.quotePill.label, '0.78822 / 0.78852');
  assert.equal(crosshair.timeTag.label, '2026.10.30 10:28:01');
});

test('MT5 Tick Chart right-click menu provides Current, Request, Save image download, and S/C/B/A/L/G toggles', () => {
  let savedCalled = false;
  let selectedSource = null;
  const items = buildMt5TickChartContextMenuItems({
    tickSourceMode: 'current',
    onSelectTickSource: (mode) => { selectedSource = mode; },
    onSaveTickChart: () => { savedCalled = true; },
    autoScroll: true,
    crosshairEnabled: true,
    showBidLine: true,
    showAskLine: true,
    showLastLine: true,
    showTickGrid: true,
  });

  const labels = items.filter((item) => !item.divider).map((item) => item.label);
  assert.deepEqual(labels, [
    'Current',
    'Request',
    'Save',
    'Auto Scroll',
    'Crosshair',
    'Bid Line',
    'Ask Line',
    'Last Line',
    'Grid',
  ]);
  assert.equal(items[0].checked, true, 'Current is checked by default');
  assert.equal(items[1].checked, false, 'Request is unchecked when Current is active');
  assert.equal(items[2].checked, undefined, 'Save is an action item without a checkbox');
  assert.equal(items[3].divider, true, 'Single divider separates Current/Request/Save from chart toggles');

  const saveItem = items.find((item) => item.key === 'save');
  saveItem.onSelect();
  assert.equal(savedCalled, true, 'Clicking Save triggers the tick chart image download handler');

  const requestItem = items.find((item) => item.key === 'request');
  requestItem.onSelect();
  assert.equal(selectedSource, 'request', 'Clicking Request switches tick source mode to request');

  assert.equal(typeof exportTickChartImage, 'function');
  assert.ok(marketDataSrc.includes('buildMt5TickChartContextMenuItems'), 'MarketData must use buildMt5TickChartContextMenuItems');
  assert.ok(marketDataSrc.includes('exportTickChartImage'), 'MarketData must wire Save to exportTickChartImage');
});

