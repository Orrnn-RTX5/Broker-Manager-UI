import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DASHBOARD_BACKEND_ENDPOINTS,
  DASHBOARD_PLACEHOLDER_MODE,
  DASHBOARD_REQUIRED_AGGREGATION_ENDPOINTS,
} from './dashboardState.js';

test('dashboard declares the existing backend endpoints used for live KPI values', () => {
  assert.equal(DASHBOARD_PLACEHOLDER_MODE, false);
  assert.deepEqual([...DASHBOARD_BACKEND_ENDPOINTS], ['/AccountDetailsMany', '/PositionsAll']);
});

test('dashboard tracks aggregation endpoints still required for chart and cashflow metrics', () => {
  assert.deepEqual([...DASHBOARD_REQUIRED_AGGREGATION_ENDPOINTS], [
    '/DashboardSummary',
    '/Dashboard/AccountsSeries',
    '/Dashboard/CashflowSeries',
    '/Dashboard/AccountsBySource',
    '/Dashboard/LiquidityProviders',
  ]);
});
