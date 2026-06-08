import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_BACKEND_ENDPOINTS, DASHBOARD_PLACEHOLDER_MODE } from './dashboardState.js';

test('dashboard remains an explicit placeholder until real backend endpoints are declared', () => {
  assert.equal(DASHBOARD_PLACEHOLDER_MODE, true);
  assert.deepEqual([...DASHBOARD_BACKEND_ENDPOINTS], []);
});
