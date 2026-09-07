import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAGE_LIMIT,
  buildPagedEndpoint,
  buildPagedQueryParams,
  normalizePagedResult,
  normalizePagedStreamResult,
  normalizePagedTextResult,
} from './pagination.js';

test('paged query params include limit/offset/search/sort and omit empty filters', () => {
  const params = buildPagedQueryParams({
    limit: 50,
    offset: 150,
    search: '  1001  ',
    sort_by: 'login',
    sort_dir: 'desc',
    filters: {
      group: 'Real\\VIP',
      status: '',
      country: null,
      tags: ['a', '', 'b'],
    },
  });

  assert.equal(params.get('limit'), '50');
  assert.equal(params.get('offset'), '150');
  assert.equal(params.get('search'), '1001');
  assert.equal(params.get('sort_by'), 'login');
  assert.equal(params.get('sort_dir'), 'desc');
  assert.equal(params.get('group'), 'Real\\VIP');
  assert.deepEqual(params.getAll('tags'), ['a', 'b']);
  assert.equal(params.has('status'), false);
  assert.equal(params.has('country'), false);
});

test('paged endpoint preserves existing query and normalizes invalid pagination', () => {
  const endpoint = buildPagedEndpoint('/BrokerOrders?mode=open', {
    limit: -1,
    offset: Number.NaN,
  });

  const url = new URL(endpoint, 'http://localhost');
  assert.equal(url.pathname, '/BrokerOrders');
  assert.equal(url.searchParams.get('mode'), 'open');
  assert.equal(url.searchParams.get('limit'), String(DEFAULT_PAGE_LIMIT));
  assert.equal(url.searchParams.get('offset'), '0');
});

test('paged response normalizes supported row and total shapes', () => {
  const page = normalizePagedResult(
    { answer: [{ Login: 1 }, { Login: 2 }], total_count: 12 },
    { limit: 2, offset: 4 },
    (row) => ({ login: String(row.Login) })
  );

  assert.deepEqual(page, {
    rows: [{ login: '1' }, { login: '2' }],
    total: 12,
    hasMore: true,
    nextOffset: 6,
    limit: 2,
    offset: 4,
  });
});

test('paged response infers hasMore when total is missing', () => {
  const fullPage = normalizePagedResult([{ id: 1 }, { id: 2 }], { limit: 2, offset: 0 });
  const shortPage = normalizePagedResult([{ id: 1 }], { limit: 2, offset: 2 });

  assert.equal(fullPage.total, null);
  assert.equal(fullPage.hasMore, true);
  assert.equal(fullPage.nextOffset, 2);
  assert.equal(shortPage.total, 3);
  assert.equal(shortPage.hasMore, false);
  assert.equal(shortPage.nextOffset, null);
});

test('paged response filters an unfiltered backend page by search', () => {
  const page = normalizePagedResult(
    { answer: [{ Login: 1001, Name: 'Alice' }, { Login: 2002, Name: 'Bob' }] },
    { limit: 30, offset: 0, search: '2002' },
    (row) => ({ login: String(row.Login), name: row.Name })
  );

  assert.deepEqual(page.rows, [{ login: '2002', name: 'Bob' }]);
  assert.equal(page.hasMore, false);
});

test('paged response search can match normalized fields', () => {
  const page = normalizePagedResult(
    { answer: [{ login: 1001, accountName: 'Alice' }, { login: 2002, accountName: 'Bob' }] },
    { limit: 30, offset: 0, search: 'bob' },
    (row) => ({ login: String(row.login), name: row.accountName })
  );

  assert.deepEqual(page.rows, [{ login: '2002', name: 'Bob' }]);
});

test('paged normalizer processes only the supplied page rows, not a synthetic full dataset', () => {
  const fullDataset = Array.from({ length: 40_000 }, (_, index) => ({ id: index + 1 }));
  const payload = { records: fullDataset.slice(200, 300), total: fullDataset.length };
  let normalizedCount = 0;

  const page = normalizePagedResult(payload, { limit: 100, offset: 200 }, (row) => {
    normalizedCount += 1;
    return row;
  });

  assert.equal(page.rows.length, 100);
  assert.equal(page.total, 40_000);
  assert.equal(normalizedCount, 100);
});

test('paged normalizer clamps an oversized backend response before normalizing it', () => {
  const fullDataset = Array.from({ length: 40_000 }, (_, index) => ({ id: index + 1 }));
  let normalizedCount = 0;

  const page = normalizePagedResult(fullDataset, { limit: 30, offset: 60 }, (row) => {
    normalizedCount += 1;
    return row;
  });

  assert.equal(page.rows.length, 30);
  assert.equal(page.rows[0].id, 61);
  assert.equal(page.rows.at(-1).id, 90);
  assert.equal(page.hasMore, true);
  assert.equal(normalizedCount, 30);
});

test('paged text fallback extracts only the requested page from a full backend payload', async () => {
  const fullDataset = Array.from({ length: 40_000 }, (_, index) => ({ login: index + 1, name: `Account ${index + 1}` }));
  const payloadText = JSON.stringify({ answer: fullDataset, total: fullDataset.length });
  let normalizedCount = 0;

  const page = await normalizePagedTextResult(payloadText, { limit: 50, offset: 100 }, (row) => {
    normalizedCount += 1;
    return { login: row.login };
  });

  assert.equal(page.rows.length, 50);
  assert.equal(page.rows[0].login, 101);
  assert.equal(page.rows.at(-1).login, 150);
  assert.equal(page.total, 40_000);
  assert.equal(page.hasMore, true);
  assert.equal(normalizedCount, 50);
});

test('paged text fallback does not offset rows twice for server-paged payloads', async () => {
  const serverPage = Array.from({ length: 30 }, (_, index) => ({ login: index + 31 }));

  const page = await normalizePagedTextResult(
    JSON.stringify({ answer: serverPage }),
    { limit: 30, offset: 30 },
    (row) => ({ login: row.login }),
    ['answer'],
    { serverPaged: true }
  );

  assert.equal(page.rows.length, 30);
  assert.equal(page.rows[0].login, 31);
  assert.equal(page.rows.at(-1).login, 60);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextOffset, 60);
});

test('paged stream fallback normalizes only the requested 30 rows', async () => {
  const fullDataset = Array.from({ length: 40_000 }, (_, index) => ({ login: index + 1, name: `Account ${index + 1}` }));
  const response = new Response(JSON.stringify({ answer: fullDataset }));
  let normalizedCount = 0;

  const page = await normalizePagedStreamResult(response, { limit: 30, offset: 0 }, (row) => {
    normalizedCount += 1;
    return { login: row.login };
  });

  assert.equal(page.rows.length, 30);
  assert.equal(page.rows[0].login, 1);
  assert.equal(page.rows.at(-1).login, 30);
  assert.equal(page.hasMore, true);
  assert.equal(normalizedCount, 30);
});

test('paged stream fallback does not offset rows twice for server-paged payloads', async () => {
  const serverPage = Array.from({ length: 30 }, (_, index) => ({ login: index + 31 }));
  const response = new Response(JSON.stringify({ answer: serverPage }));
  let normalizedCount = 0;

  const page = await normalizePagedStreamResult(
    response,
    { limit: 30, offset: 30 },
    (row) => {
      normalizedCount += 1;
      return { login: row.login };
    },
    ['answer'],
    { serverPaged: true }
  );

  assert.equal(page.rows.length, 30);
  assert.equal(page.rows[0].login, 31);
  assert.equal(page.rows.at(-1).login, 60);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextOffset, 60);
  assert.equal(normalizedCount, 30);
});

test('paged stream infers an exact total from a short terminal server page', async () => {
  const response = new Response(JSON.stringify({ accounts: [{ login: 200001 }, { login: 200002 }] }));
  const page = await normalizePagedStreamResult(
    response,
    { limit: 30, offset: 30 },
    (row) => row,
    ['accounts'],
    { serverPaged: true }
  );

  assert.equal(page.total, 32);
  assert.equal(page.hasMore, false);
});

test('paged stream reads total metadata placed after the rows array', async () => {
  const response = new Response(JSON.stringify({ accounts: [{ login: 200001 }], total_count: 61 }));
  const page = await normalizePagedStreamResult(
    response,
    { limit: 30, offset: 0 },
    (row) => row,
    ['accounts'],
    { serverPaged: true }
  );

  assert.equal(page.total, 61);
  assert.equal(page.hasMore, true);
});

test('paged stream reads total count from pagination response headers', async () => {
  const response = new Response(JSON.stringify({ accounts: [{ login: 200001 }] }), {
    headers: { 'X-Total-Count': '91' },
  });
  const page = await normalizePagedStreamResult(
    response,
    { limit: 30, offset: 0 },
    (row) => row,
    ['accounts'],
    { serverPaged: true }
  );

  assert.equal(page.total, 91);
  assert.equal(page.hasMore, true);
});

test('paged stream fallback does not decode a whole large chunk for the first page', async () => {
  const fullDataset = Array.from({ length: 40_000 }, (_, index) => ({ login: index + 1, name: `Account ${index + 1}` }));
  const encoded = new TextEncoder().encode(JSON.stringify({ answer: fullDataset }));
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
  const RealTextDecoder = globalThis.TextDecoder;
  let decodedBytes = 0;

  class CountingTextDecoder {
    constructor(...args) {
      this.decoder = new RealTextDecoder(...args);
    }

    decode(input, options) {
      if (input) decodedBytes += input.byteLength;
      return this.decoder.decode(input, options);
    }
  }

  globalThis.TextDecoder = CountingTextDecoder;
  try {
    const page = await normalizePagedStreamResult(new Response(stream), { limit: 30, offset: 0 }, (row) => row);

    assert.equal(page.rows.length, 30);
    assert.ok(decodedBytes < encoded.byteLength / 4);
  } finally {
    globalThis.TextDecoder = RealTextDecoder;
  }
});

test('paged stream fallback honors already-aborted signals', async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    normalizePagedStreamResult(
      new Response(JSON.stringify({ answer: [{ login: 1 }] })),
      { limit: 30, offset: 0 },
      (row) => row,
      ['answer'],
      { signal: controller.signal }
    ),
    { name: 'AbortError' }
  );
});

test('paged text fallback can find searched rows without normalizing the whole payload', async () => {
  const fullDataset = Array.from({ length: 1_000 }, (_, index) => ({ login: index + 1, name: `Account ${index + 1}` }));
  fullDataset[777] = { login: 778, name: 'Needle Client' };
  const payloadText = JSON.stringify({ accounts: fullDataset });
  let normalizedCount = 0;

  const page = await normalizePagedTextResult(payloadText, { limit: 10, offset: 0, search: 'Needle' }, (row) => {
    normalizedCount += 1;
    return row;
  }, ['accounts']);

  assert.deepEqual(page.rows, [{ login: 778, name: 'Needle Client' }]);
  assert.equal(normalizedCount, 1);
});
