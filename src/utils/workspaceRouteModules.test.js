import test from 'node:test';
import assert from 'node:assert/strict';
import { FREQUENT_WORKSPACE_ROUTE_KEYS } from './workspaceRouteModules.js';

test('dynamic route warming is limited to the three latency-sensitive analytics views', () => {
  assert.deepEqual(FREQUENT_WORKSPACE_ROUTE_KEYS, [
    'onlineUsersDashboard',
    'openPositionsPage',
    'openOrdersDashboard',
  ]);
});
