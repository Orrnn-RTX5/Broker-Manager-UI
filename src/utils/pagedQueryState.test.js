import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_PAGED_ROWS, getPagedRows } from './pagedQueryState.js';

test('uses one stable empty row snapshot while data is unavailable', () => {
  const first = getPagedRows(undefined, true);
  const second = getPagedRows(undefined, true);
  const disabled = getPagedRows({ rows: [{ id: 1 }] }, false);

  assert.strictEqual(first, EMPTY_PAGED_ROWS);
  assert.strictEqual(second, first);
  assert.strictEqual(disabled, first);
  assert.equal(Object.isFrozen(first), true);
});

test('preserves the query row reference once data is available', () => {
  const rows = [{ id: 1 }];
  assert.strictEqual(getPagedRows({ rows }, true), rows);
});
