import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DASHBOARD_BACKEND_ENDPOINTS,
  DASHBOARD_PLACEHOLDER_MODE,
  DASHBOARD_REQUIRED_AGGREGATION_ENDPOINTS,
} from './dashboardState.js';

test('dashboard declares the existing backend endpoints used for live KPI values', () => {
  assert.equal(DASHBOARD_PLACEHOLDER_MODE, false);
  assert.deepEqual([...DASHBOARD_BACKEND_ENDPOINTS], [
    '/reports/v1/summary',
    '/AccountLimitStatus',
    '/AccountDetailsMany',
    '/PositionsAll',
  ]);
});

test('dashboard tracks capabilities still absent from the manager contract', () => {
  assert.deepEqual([...DASHBOARD_REQUIRED_AGGREGATION_ENDPOINTS], [
    'intraday account/equity series',
    'account source breakdown',
    'liquidity provider aggregate',
    'approval queue aggregate',
  ]);
});
