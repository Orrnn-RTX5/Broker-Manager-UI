import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDashboardDealPages } from './dashboardDealPages.js';

const rows = (start, amount) => Array.from({ length: amount }, (_, index) => ({
  ticket: start + index,
  time: 1_700_000_000 + start + index,
}));

test('collects known-total pages with bounded concurrency and a server page-size cap', async () => {
  const offsets = [];
  let active = 0;
  let maxActive = 0;
  const result = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 250), total: 1_500, hasMore: true },
    fetchPage: async ({ offset, limit }) => {
      assert.equal(limit, 1_000);
      offsets.push(offset);
      active += 1;
      maxActive = Math.max(active, maxActive);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { rows: rows(offset + 1, 250), total: 1_500, hasMore: offset < 1_250 };
    },
  });

  assert.equal(result.complete, true);
  assert.equal(result.partial, false);
  assert.equal(result.deals.length, 1_500);
  assert.deepEqual(offsets.sort((a, b) => a - b), [250, 500, 750, 1_000, 1_250]);
  assert.equal(maxActive, 4);
});

test('supports a one-request budget through short capped pages and an empty probe', async () => {
  const offsets = [];
  let active = 0;
  let maxActive = 0;
  const result = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 2, hasMore: false },
    concurrency: 1,
    fetchPage: async ({ offset }) => {
      offsets.push(offset);
      active += 1;
      maxActive = Math.max(active, maxActive);
      await Promise.resolve();
      active -= 1;
      if (offset === 2) return { rows: rows(3, 2), total: 4, hasMore: false };
      if (offset === 4) return { rows: rows(5, 1), total: 5, hasMore: false };
      return { rows: [], total: 5, hasMore: false };
    },
  });

  assert.equal(result.complete, true);
  assert.equal(result.total, 5);
  assert.deepEqual(result.deals.map((deal) => deal.ticket), [1, 2, 3, 4, 5]);
  assert.deepEqual(offsets, [2, 4, 5]);
  assert.equal(maxActive, 1);
});

test('fetches inferred-total pages in bounded parallel batches after confirming the cap', async () => {
  const offsets = [];
  let active = 0;
  let maxActive = 0;
  const result = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 2, hasMore: false },
    pageSize: 10,
    maxRows: 30,
    fetchPage: async ({ offset }) => {
      offsets.push(offset);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      const amount = Math.max(0, Math.min(2, 17 - offset));
      return { rows: rows(offset + 1, amount), total: offset + amount, hasMore: false };
    },
  });
  assert.equal(result.complete, true);
  assert.equal(result.deals.length, 17);
  assert.equal(maxActive, 4);
  assert.equal(offsets[0], 2);
  assert.ok(offsets.includes(17), 'a short tail is probed at its exact next offset');
});

test('treats a short tail as complete only after exact and speculative probes are empty', async () => {
  const offsets = [];
  const result = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 2, hasMore: false },
    pageSize: 10,
    maxRows: 12,
    fetchPage: async ({ offset }) => {
      offsets.push(offset);
      const amount = Math.max(0, Math.min(2, 5 - offset));
      return { rows: rows(offset + 1, amount), total: offset + amount, hasMore: false };
    },
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.deals.map((deal) => deal.ticket), [1, 2, 3, 4, 5]);
  assert.ok(offsets.includes(5));
  assert.ok(offsets.includes(6));
});

test('rejects repeated and shifted pages in an unknown-total parallel batch', async () => {
  for (const shifted of [false, true]) {
    const result = await collectDashboardDealPages({
      firstPage: { rows: rows(1, 2), total: null, hasMore: true },
      pageSize: 2,
      maxRows: 12,
      fetchPage: async ({ offset }) => {
        if (offset === 2) return { rows: rows(3, 2), total: null, hasMore: true };
        if (offset === 4) return { rows: rows(shifted ? 4 : 3, 2), total: null, hasMore: true };
        return { rows: rows(offset + 1, 2), total: null, hasMore: true };
      },
    });
    assert.equal(result.complete, false);
    assert.equal(result.deals.length, 4);
  }
});

test('verifies the exact row cap with a final empty page', async () => {
  for (const extraDeal of [false, true]) {
    const result = await collectDashboardDealPages({
      firstPage: { rows: rows(1, 2), total: null, hasMore: true },
      pageSize: 2,
      maxRows: 6,
      fetchPage: async ({ offset }) => ({
        rows: offset < 6 ? rows(offset + 1, 2) : extraDeal ? rows(7, 1) : [],
        total: null,
        hasMore: extraDeal && offset >= 6,
      }),
    });
    assert.equal(result.complete, !extraDeal);
    assert.equal(result.deals.length, 6);
  }
});

test('rejects missing pages or changed totals rather than labeling partial volume complete', async () => {
  const missing = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 6, hasMore: true },
    fetchPage: async ({ offset }) => ({
      rows: offset === 2 ? rows(3, 2) : rows(5, 1),
      total: 6,
      hasMore: true,
    }),
    pageSize: 2,
  });
  assert.equal(missing.complete, false);
  assert.equal(missing.partial, true);

  const changed = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 6, hasMore: true },
    fetchPage: async ({ offset }) => ({
      rows: rows(offset + 1, 2),
      total: 7,
      hasMore: true,
    }),
    pageSize: 2,
  });
  assert.equal(changed.complete, false);
});

test('detects repeated pages, including pages without ticket identifiers', async () => {
  const repeated = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 4, hasMore: true },
    fetchPage: async () => ({ rows: rows(1, 2), total: 4, hasMore: false }),
    pageSize: 2,
  });
  assert.equal(repeated.complete, false);

  const anonymous = [{ ticket: 0, time: 1 }, { ticket: 0, time: 2 }];
  const repeatedAnonymous = await collectDashboardDealPages({
    firstPage: { rows: anonymous, total: null, hasMore: true },
    fetchPage: async () => ({ rows: anonymous, total: null, hasMore: true }),
    pageSize: 2,
  });
  assert.equal(repeatedAnonymous.complete, false);
});

test('does not accept a capped unknown-total book as complete', async () => {
  const result = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: null, hasMore: true },
    fetchPage: async ({ offset }) => ({ rows: rows(offset + 1, 2), total: null, hasMore: true }),
    pageSize: 2,
    maxRows: 4,
  });
  assert.equal(result.complete, false);
  assert.equal(result.deals.length, 4);
});

test('stops before more requests when the reported total exceeds the row cap', async () => {
  let requests = 0;
  const result = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 7, hasMore: true },
    fetchPage: async () => {
      requests += 1;
      return { rows: [], total: 7, hasMore: false };
    },
    pageSize: 2,
    maxRows: 6,
  });
  assert.equal(result.complete, false);
  assert.equal(result.total, 7);
  assert.equal(requests, 0);
});

test('requires an empty final probe when the last known-total page still says more', async () => {
  const offsets = [];
  const result = await collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 4, hasMore: true },
    fetchPage: async ({ offset }) => {
      offsets.push(offset);
      return offset === 2
        ? { rows: rows(3, 2), total: null, hasMore: true }
        : { rows: [], total: 4, hasMore: false };
    },
    pageSize: 2,
  });
  assert.equal(result.complete, true);
  assert.deepEqual(offsets, [2, 4]);
});

test('aborts before and during collection', async () => {
  const before = new AbortController();
  before.abort();
  await assert.rejects(collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 4, hasMore: true },
    fetchPage: async () => ({ rows: rows(3, 2), total: 4, hasMore: false }),
    signal: before.signal,
  }), { name: 'AbortError' });

  const during = new AbortController();
  await assert.rejects(collectDashboardDealPages({
    firstPage: { rows: rows(1, 2), total: 4, hasMore: true },
    fetchPage: async () => {
      during.abort();
      return { rows: rows(3, 2), total: 4, hasMore: false };
    },
    signal: during.signal,
    pageSize: 2,
  }), { name: 'AbortError' });
});
