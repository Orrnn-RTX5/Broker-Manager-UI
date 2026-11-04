import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAccountExposureBreakdown,
  buildExposureChartSignature,
  buildExposureContextMenuItems,
  easeOutCubic,
  formatAccountExposureRate,
  formatAccountExposureSpaceNumber,
  formatAccountExposureVolume,
  interpolateExposureChartSlices,
  parseAccountExposureSymbol,
} from './accountExposureModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('parseAccountExposureSymbol decomposes FX, precious metals, crypto and CFD symbols', () => {
  assert.deepEqual(parseAccountExposureSymbol('EURUSD'), { base: 'EUR', quote: 'USD' });
  assert.deepEqual(parseAccountExposureSymbol('XAUUSD'), { base: 'XAU', quote: 'USD' });
  assert.deepEqual(parseAccountExposureSymbol('BTCUSDT.pro'), { base: 'BTC', quote: 'USD' });
  assert.deepEqual(parseAccountExposureSymbol('USDJPY'), { base: 'USD', quote: 'JPY' });
});

test('buildAccountExposureBreakdown includes cash deposit currency exposure when no positions are open', () => {
  const breakdown = buildAccountExposureBreakdown({
    positions: [],
    symbols: {},
    accountCurrency: 'USD',
    balance: 5018.09,
    equity: 5018.09,
    margin: 0,
    freeMargin: 5018.09,
    leverage: 100,
  });

  assert.equal(breakdown.rows.length, 1);
  const usdRow = breakdown.rows[0];
  assert.equal(usdRow.asset, 'USD');
  assert.equal(usdRow.color, '#10b981');
  assert.notEqual(usdRow.color, '#3b82f6');
  assert.equal(usdRow.formattedVolume, '5.02K');
  assert.equal(usdRow.formattedRate, '1.00');
  assert.equal(usdRow.formattedValue, '5 018.09');
  assert.equal(usdRow.barPct, 100);
  assert.equal(breakdown.longSlices.length, 1);
  assert.equal(breakdown.longSlices[0].asset, 'USD');
  assert.equal(breakdown.longSlices[0].percentLabel, '100.0%');
  assert.equal(breakdown.shortSlices.length, 0);
});

test('buildAccountExposureBreakdown decomposes long and short open positions alongside deposit currency', () => {
  const breakdown = buildAccountExposureBreakdown({
    positions: [
      {
        symbol: 'XAUUSD',
        type: 'sell',
        volume: 0.01,
        priceOpen: 2745.5,
        priceCurrent: 2750.0,
      },
      {
        symbol: 'EURUSD',
        type: 'buy',
        volume: 0.1,
        priceOpen: 1.085,
        priceCurrent: 1.0865,
      },
    ],
    symbols: {},
    accountCurrency: 'USD',
    balance: 5018.09,
    equity: 5030.0,
    margin: 136.15,
    freeMargin: 4893.85,
    leverage: 100,
  });

  const byAsset = Object.fromEntries(breakdown.rows.map((r) => [r.asset, r]));
  assert.ok(byAsset.USD, 'USD deposit currency row is present');
  assert.ok(byAsset.EUR, 'EUR long position row is present');
  assert.ok(byAsset.XAU, 'XAU short position row is present');

  assert.equal(byAsset.EUR.formattedVolume, '10.00K');
  assert.ok(byAsset.EUR.value > 0);
  assert.ok(byAsset.EUR.barPct > 0);

  assert.equal(byAsset.XAU.formattedVolume, '-1.00');
  assert.ok(byAsset.XAU.value < 0);
  assert.equal(byAsset.XAU.isNegative, true);
  assert.ok(byAsset.XAU.barPct < 0);

  assert.ok(breakdown.longSlices.some((s) => s.asset === 'USD'));
  assert.ok(breakdown.longSlices.some((s) => s.asset === 'EUR'));
  assert.equal(breakdown.shortSlices.length, 1);
  assert.equal(breakdown.shortSlices[0].asset, 'XAU');
});

test('formatAccountExposureVolume, formatAccountExposureRate and formatAccountExposureSpaceNumber format trading numbers', () => {
  assert.equal(formatAccountExposureVolume('USD', 5018.09), '5.02K');
  assert.equal(formatAccountExposureVolume('EUR', -100000), '-100.00K');
  assert.equal(formatAccountExposureVolume('XAU', -1), '-1.00');
  assert.equal(formatAccountExposureRate(1, { isAccountCurrency: true }), '1.00');
  assert.equal(formatAccountExposureRate(1.08654, { digits: 5 }), '1.08654');
  assert.equal(formatAccountExposureSpaceNumber(5018.09, 2), '5 018.09');
});

test('AccountDetailsModal Exposure tab renders live asset rows, SVG donut chart, and unified financial summary strip', () => {
  const modalSource = fs.readFileSync(path.resolve(__dirname, './AccountDetailsModal.jsx'), 'utf8');
  const modalCss = fs.readFileSync(path.resolve(__dirname, './AccountDetailsModal.css'), 'utf8');

  assert.match(modalSource, /buildAccountExposureBreakdown/);
  assert.match(modalSource, /ExposureDonutRatioChart/);
  assert.match(modalSource, /const effectiveChartSide =\s*exposureChartSide === 'short' \? 'short' : 'long';/);
  assert.match(modalSource, /const r = 50;/);
  assert.match(modalSource, /const holeR = 29;/);
  assert.match(modalSource, /const baseStartTheta = -Math\.PI \/ 2;/);
  assert.match(modalSource, /A \$\{r\} \$\{r\} 0 \$\{largeArc\} 1 /);
  assert.match(modalSource, /account-exposure-tab/);
  assert.match(modalSource, /account-exposure-pie-svg/);
  assert.match(modalSource, /account-exposure-pie-rotor/);
  assert.match(modalSource, /account-exposure-summary-strip/);
  assert.match(modalCss, /#root \.account-exposure-grid/);
  assert.match(modalCss, /#root \.account-exposure-chart-box/);
  assert.match(modalCss, /@keyframes account-exposure-donut-rotate-reveal/);
  assert.match(modalCss, /cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
  assert.match(modalCss, /#root \.account-exposure-pie-rotor\.is-static/);
  assert.match(modalCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Donut Ratio Chart entrance and data-update interpolation animates smoothly from 0, synchronizes labels/legends, locks static on completion, and respects reduced motion', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.8, 'easeOutCubic decelerates smoothly');

  const targetSlices = [
    {
      asset: 'USD',
      color: '#3b82f6',
      value: 4000,
      signedValue: 4000,
      formattedValue: '4 000.00',
      ratio: 0.8,
      percentLabel: '80.0%',
    },
    {
      asset: 'EUR',
      color: '#10b981',
      value: 1000,
      signedValue: 1000,
      formattedValue: '1 000.00',
      ratio: 0.2,
      percentLabel: '20.0%',
    },
  ];

  // Signature remains identical across re-renders when slice data is unchanged
  const sigA = buildExposureChartSignature('long', targetSlices);
  const sigB = buildExposureChartSignature('long', [...targetSlices]);
  assert.equal(sigA, sigB);

  // Frame 0 (initial load): starts at 0% and rotated -18deg
  const frame0 = interpolateExposureChartSlices(targetSlices, {}, 0, {
    isInitialEntrance: true,
    moneyDecimals: 2,
    reducedMotion: false,
  });
  assert.equal(frame0.isStatic, false);
  assert.equal(frame0.rotationDeg, -18);
  assert.equal(frame0.slices[0].animatedRatio, 0);
  assert.equal(frame0.slices[0].animatedPercentLabel, '0.0%');
  assert.equal(frame0.slices[0].animatedFormattedValue, '0.00');

  // Mid-animation frame: progressively expands with stagger and synchronized labels
  const frameMid = interpolateExposureChartSlices(targetSlices, {}, 0.5, {
    isInitialEntrance: true,
    moneyDecimals: 2,
    reducedMotion: false,
  });
  assert.equal(frameMid.isStatic, false);
  assert.ok(frameMid.rotationDeg > -18 && frameMid.rotationDeg < 0);
  assert.ok(frameMid.slices[0].animatedRatio > 0.6 && frameMid.slices[0].animatedRatio < 0.8);
  assert.ok(frameMid.slices[1].animatedRatio > 0 && frameMid.slices[1].animatedRatio < 0.2);

  // Completed state: locks static at exact final values
  const frameDone = interpolateExposureChartSlices(targetSlices, {}, 1, {
    isInitialEntrance: true,
    moneyDecimals: 2,
    reducedMotion: false,
  });
  assert.equal(frameDone.isStatic, true);
  assert.equal(frameDone.rotationDeg, 0);
  assert.equal(frameDone.slices[0].animatedRatio, 0.8);
  assert.equal(frameDone.slices[0].animatedPercentLabel, '80.0%');
  assert.equal(frameDone.slices[0].animatedFormattedValue, '4 000.00');
  assert.equal(frameDone.slices[1].animatedRatio, 0.2);
  assert.equal(frameDone.slices[1].animatedPercentLabel, '20.0%');

  // Data update: smoothly interpolates from previous ratios instead of resetting to 0
  const fromState = {
    USD: { ratio: 1.0, signedValue: 5000 },
    EUR: { ratio: 0.0, signedValue: 0 },
  };
  const updateMid = interpolateExposureChartSlices(targetSlices, fromState, 0.5, {
    isInitialEntrance: false,
    moneyDecimals: 2,
    reducedMotion: false,
  });
  assert.ok(updateMid.slices[0].animatedRatio > 0.8 && updateMid.slices[0].animatedRatio < 1.0);
  assert.ok(updateMid.slices[1].animatedRatio > 0.1 && updateMid.slices[1].animatedRatio < 0.2);

  // Prefers-reduced-motion: immediately static even at progress 0
  const reduced = interpolateExposureChartSlices(targetSlices, {}, 0, {
    isInitialEntrance: true,
    moneyDecimals: 2,
    reducedMotion: true,
  });
  assert.equal(reduced.isStatic, true);
  assert.equal(reduced.rotationDeg, 0);
  assert.equal(reduced.slices[0].animatedRatio, 0.8);
  assert.equal(reduced.slices[0].animatedPercentLabel, '80.0%');
});

test('Right-clicking an Exposure asset row opens ExposureContextMenu with Diagram, Report, Auto Arrange (A), and Grid (G)', () => {
  const calls = [];
  const items = buildExposureContextMenuItems({
    chartSide: 'long',
    autoArrange: true,
    showGrid: true,
    onSelectChartSide: (side) => calls.push(['chartSide', side]),
    onCopyReport: () => calls.push(['copyReport']),
    onExportCsv: () => calls.push(['exportCsv']),
    onExportHtml: () => calls.push(['exportHtml']),
    onToggleAutoArrange: () => calls.push(['toggleAutoArrange']),
    onToggleGrid: () => calls.push(['toggleGrid']),
  });

  const labels = items.map((item) => (item.divider ? '---' : item.label));
  assert.deepEqual(labels, [
    'Diagram',
    '---',
    'Report',
    '---',
    'Auto Arrange',
    'Grid',
  ]);

  const byKey = Object.fromEntries(
    items.filter((item) => !item.divider).map((item) => [item.key, item])
  );
  assert.equal(byKey['auto-arrange'].checked, true);
  assert.equal(byKey['auto-arrange'].shortcut, 'A');
  assert.equal(byKey['grid'].checked, true);
  assert.equal(byKey['grid'].shortcut, 'G');
  assert.equal(byKey['diagram'].submenu[0].label, 'Long Positions');
  assert.equal(byKey['diagram'].submenu[0].checked, true);
  assert.equal(byKey['diagram'].submenu[1].label, 'Short Positions');
  assert.equal(byKey['diagram'].submenu[1].checked, false);

  byKey['diagram'].submenu[1].onSelect();
  byKey['report'].submenu[0].onSelect();
  byKey['auto-arrange'].onSelect();
  byKey['grid'].onSelect();

  assert.deepEqual(calls, [
    ['chartSide', 'short'],
    ['copyReport'],
    ['toggleAutoArrange'],
    ['toggleGrid'],
  ]);

  const modalSource = fs.readFileSync(path.resolve(__dirname, './AccountDetailsModal.jsx'), 'utf8');
  assert.match(modalSource, /ExposureContextMenu/);
  assert.match(modalSource, /account-exposure-context-menu/);
  assert.match(modalSource, /setSelectedExposureAsset\(row\.asset\)/);
});

test('AccountDetailsModal Overview tab renders institutional header card, parameter pills, and single-row financial summary metrics', () => {
  const modalSource = fs.readFileSync(path.resolve(__dirname, './AccountDetailsModal.jsx'), 'utf8');
  const modalCss = fs.readFileSync(path.resolve(__dirname, './AccountDetailsModal.css'), 'utf8');

  assert.match(modalSource, /account-overview-header-top/);
  assert.match(modalSource, /account-overview-badges/);
  assert.match(modalSource, /account-overview-pill/);
  assert.doesNotMatch(modalSource, /MetaQuotes ID:/);
  assert.match(modalSource, /account-overview-empty-trades/);
  assert.match(modalSource, /No open trades/);
  assert.match(modalSource, /account-overview-summary-bottom/);
  assert.match(modalSource, /account-overview-metric-item/);
  assert.match(modalSource, /account-overview-metric-label/);
  assert.match(modalSource, /account-overview-metric-value/);
  assert.match(modalSource, /setSelectedOverviewRowKey/);
  assert.match(modalCss, /#root#root#root#root#root#root \.account-details-window \.account-details-tab\.is-active/);
  assert.match(modalCss, /#root \.account-overview-summary-strip\.account-overview-summary-bottom/);
  assert.match(modalCss, /#root \.account-overview-metric-item/);
});
