import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDashboardGroups } from './dashboardGroupPages.js';

test('group collection confirms completeness only after the final page', async () => {
  const offsets = [];
  const result = await collectDashboardGroups(async ({ offset }) => {
    offsets.push(offset);
    return offset === 0
      ? { rows: [{ name: 'real/A' }, { name: 'real/B' }], total: 3, hasMore: true, nextOffset: 2 }
      : { rows: [{ name: 'demo/A' }], total: 3, hasMore: false };
  });
  assert.deepEqual(offsets, [0, 2]);
  assert.equal(result.complete, true);
  assert.equal(result.rows.length, 3);
});

test('incomplete group pagination cannot produce a complete risk snapshot', async () => {
  const stalled = await collectDashboardGroups(async () => ({ rows: [], total: 4, hasMore: true }));
  assert.equal(stalled.complete, false);

  const inconsistent = await collectDashboardGroups(async () => ({ rows: [{ name: 'real/A' }], total: 2, hasMore: false }));
  assert.equal(inconsistent.complete, false);
});
