import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDonutChartSignature,
  buildDonutStateSnapshot,
  easeOutCubic,
  interpolateDonutChartSegments,
} from './donutChartAnimationModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('DonutChart entrance and data-update interpolation animates from 0, applies rotational reveal, synchronizes center/legends, locks static on completion, and respects reduced motion', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.8, 'easeOutCubic decelerates smoothly');

  const sampleData = [
    { label: 'Auj/demo', value: 61, color: '#008ffb' },
    { label: 'orrnn/demo-std', value: 31, color: '#f2c94c' },
    { label: 'Others', value: 57, color: '#6f98a8' },
  ];
  const total = 149;

  // Deterministic signature does not change when array is re-created with same values
  const sigA = buildDonutChartSignature(sampleData, total);
  const sigB = buildDonutChartSignature(
    sampleData.map((item) => ({ ...item })),
    total
  );
  assert.equal(sigA, sigB);
  assert.equal(buildDonutChartSignature([], 0), 'donut:empty');

  // Initial load Frame 0: starts at 0% and rotated -18deg
  const frame0 = interpolateDonutChartSegments(sampleData, total, {}, 0, {
    isInitialEntrance: true,
    reducedMotion: false,
  });
  assert.equal(frame0.isStatic, false);
  assert.equal(frame0.rotationDeg, -18);
  assert.equal(frame0.scale, 0.96);
  assert.equal(frame0.animatedTotal, 0);
  assert.equal(frame0.segments[0].animatedPercentage, 0);
  assert.equal(frame0.segments[0].animatedValue, 0);
  assert.equal(frame0.segments[0].animatedPercentLabel, '0.00%');

  // Mid-animation frame: progressively expands with stagger and synchronized counts/labels
  const frameMid = interpolateDonutChartSegments(sampleData, total, {}, 0.5, {
    isInitialEntrance: true,
    reducedMotion: false,
  });
  assert.equal(frameMid.isStatic, false);
  assert.ok(frameMid.rotationDeg > -18 && frameMid.rotationDeg < 0);
  assert.ok(frameMid.animatedTotal > 100 && frameMid.animatedTotal < total);
  assert.ok(frameMid.segments[0].animatedPercentage > 30 && frameMid.segments[0].animatedPercentage < 40.94);
  assert.ok(frameMid.segments[1].animatedPercentage > 15 && frameMid.segments[1].animatedPercentage < 20.81);
  assert.equal(
    Number(frameMid.segments[1].animatedOffset.toFixed(6)),
    Number(frameMid.segments[0].animatedPercentage.toFixed(6))
  );

  // Completed state: locks static at exact final values
  const frameDone = interpolateDonutChartSegments(sampleData, total, {}, 1, {
    isInitialEntrance: true,
    reducedMotion: false,
  });
  assert.equal(frameDone.isStatic, true);
  assert.equal(frameDone.rotationDeg, 0);
  assert.equal(frameDone.scale, 1);
  assert.equal(frameDone.animatedTotal, 149);
  assert.equal(frameDone.segments[0].animatedValue, 61);
  assert.equal(frameDone.segments[0].animatedPercentLabel, '40.94%');
  assert.equal(frameDone.segments[1].animatedValue, 31);
  assert.equal(frameDone.segments[1].animatedPercentLabel, '20.81%');
  assert.equal(frameDone.segments[2].animatedValue, 57);
  assert.equal(frameDone.segments[2].animatedPercentLabel, '38.26%');

  // Data update: smoothly interpolates from previous snapshot instead of resetting to 0
  const fromSnapshot = buildDonutStateSnapshot(frameDone.segments, frameDone.animatedTotal);
  const updatedData = [
    { label: 'Auj/demo', value: 90, color: '#008ffb' },
    { label: 'orrnn/demo-std', value: 30, color: '#f2c94c' },
    { label: 'Others', value: 30, color: '#6f98a8' },
  ];
  const updateFrame0 = interpolateDonutChartSegments(updatedData, 150, fromSnapshot, 0, {
    isInitialEntrance: false,
    reducedMotion: false,
  });
  assert.equal(updateFrame0.isStatic, false);
  assert.equal(updateFrame0.segments[0].animatedValue, 61);
  assert.equal(updateFrame0.segments[0].animatedPercentLabel, '40.94%');

  const updateMid = interpolateDonutChartSegments(updatedData, 150, fromSnapshot, 0.5, {
    isInitialEntrance: false,
    reducedMotion: false,
  });
  assert.ok(updateMid.segments[0].animatedValue > 61 && updateMid.segments[0].animatedValue < 90);
  assert.ok(updateMid.segments[0].animatedPercentage > 40.94 && updateMid.segments[0].animatedPercentage < 60);

  // Prefers-reduced-motion: immediately static even at progress 0
  const reduced = interpolateDonutChartSegments(sampleData, total, {}, 0, {
    isInitialEntrance: true,
    reducedMotion: true,
  });
  assert.equal(reduced.isStatic, true);
  assert.equal(reduced.rotationDeg, 0);
  assert.equal(reduced.animatedTotal, 149);
  assert.equal(reduced.segments[0].animatedPercentLabel, '40.94%');
});

test('DonutChart, TradingAccountsDashboard, and OnlineUsersDonut wire synchronized donut animation and reduced-motion styles', () => {
  const donutChartSource = fs.readFileSync(
    path.resolve(__dirname, './donut-chart.jsx'),
    'utf8'
  );
  const tradingAccountsSource = fs.readFileSync(
    path.resolve(__dirname, '../../features/analytics/TradingAccountsDashboard.jsx'),
    'utf8'
  );
  const onlineUsersDonutSource = fs.readFileSync(
    path.resolve(__dirname, '../../features/analytics/components/OnlineUsersDonut.jsx'),
    'utf8'
  );
  const indexCss = fs.readFileSync(
    path.resolve(__dirname, '../../index.css'),
    'utf8'
  );

  assert.match(donutChartSource, /useDonutChartAnimation/);
  assert.match(donutChartSource, /donut-chart-rotor/);
  assert.match(donutChartSource, /data-chart-static=\{isStatic \? "true" : "false"\}/);
  assert.match(donutChartSource, /segment\.animatedPercentage/);
  assert.match(donutChartSource, /segment\.animatedOffset/);

  assert.match(tradingAccountsSource, /useDonutChartAnimation\(donutData,\s*report\.total\)/);
  assert.match(tradingAccountsSource, /animationState=\{donutAnimation\}/);
  assert.match(tradingAccountsSource, /segment\.animatedValue/);
  assert.match(tradingAccountsSource, /segment\.animatedPercentLabel/);

  assert.match(onlineUsersDonutSource, /useDonutChartAnimation\(donutData,\s*totalCount\)/);
  assert.match(onlineUsersDonutSource, /animationState=\{donutAnimation\}/);
  assert.match(onlineUsersDonutSource, /segment\.animatedValue/);
  assert.match(onlineUsersDonutSource, /segment\.animatedPercentLabel/);

  assert.match(indexCss, /@keyframes donut-chart-rotate-reveal/);
  assert.match(indexCss, /\.donut-chart-rotor\.is-static/);
  assert.match(indexCss, /@media \(prefers-reduced-motion: reduce\)/);
});
