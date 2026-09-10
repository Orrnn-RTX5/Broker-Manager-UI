import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAccountPages } from './collectAccountPages.js';

test('collects all server-capped pages and merges duplicate accounts', async () => {
  const offsets = [];
  const result = await collectAccountPages(async (offset) => {
    offsets.push(offset);
    return offset === 0
      ? { rows: [{ login: '1' }, { login: '2' }], hasMore: true, nextOffset: 2 }
      : { rows: [{ login: '2', balance: 12 }, { login: '3' }], hasMore: false };
  });
  assert.deepEqual(offsets, [0, 2]);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[1].balance, 12);
  assert.equal(result.hasMore, false);
});

test('rejects a repeated page instead of looping forever', async () => {
  await assert.rejects(collectAccountPages(async () => ({
    rows: [{ login: '1' }], hasMore: true, nextOffset: 1,
  })), /did not advance/);
});

test('aborted loads do not request another page', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(collectAccountPages(async () => {
    calls++;
    controller.abort();
    return { rows: [{ login: '1' }], hasMore: true, nextOffset: 1 };
  }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
