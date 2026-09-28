import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server;
let api;
let apiClient;

const position = (ticket, login, symbol, overrides = {}) => ({
  positionTicket: ticket,
  login,
  symbol,
  action: 'BUY',
  volumeExt: 10_000,
  priceOpen: 100,
  priceCurrent: 101,
  profit: 10,
  ...overrides,
});

const response = (positions) => new Response(JSON.stringify({ positions }));

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const tickets = (rows) => rows.map((row) => Number(row.position ?? row.positionTicket)).sort((a, b) => a - b);

before(async () => {
  // Load the real service graph while keeping browser-only import syntax valid.
  // A middleware server does not listen, and every exercised API method is stubbed.
  server = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    configFile: false,
    envFile: false,
    appType: 'custom',
    server: { middlewareMode: true, watch: null },
    optimizeDeps: { noDiscovery: true },
    logLevel: 'error',
  });
  api = await server.ssrLoadModule('/src/services/api.js');
  ({ default: apiClient } = await server.ssrLoadModule('/src/services/apiClient.js'));
});

beforeEach(() => {
  api.invalidatePositionsCache();
  apiClient.getRaw = async (endpoint) => { throw new Error(`Unexpected raw API request: ${endpoint}`); };
  apiClient.get = async (endpoint) => { throw new Error(`Unexpected API request: ${endpoint}`); };
});

after(async () => {
  await server?.close();
});

test('a failed global load does not present a sparse websocket frame as a complete page', async () => {
  api.applyPositionsSnapshot([{
    ticket: 202465,
    account_login: 200004,
    price_current: 83152.07,
    profit: -6.92,
  }]);
  apiClient.getRaw = async () => { throw new Error('PositionsAll unavailable'); };

  await assert.rejects(
    api.getPositionsPage({ limit: 30, offset: 0 }),
    /PositionsAll unavailable/,
  );
});

test('a cold sparse websocket frame preserves the server permission error from PositionsAll', async () => {
  api.applyPositionsSnapshot([{ ticket: 202465, account_login: 200004, price_current: 83152.07 }]);
  apiClient.getRaw = async () => new Response(JSON.stringify({
    code: 'MT_RET_ERR_PERMISSIONS',
    message: 'Permission denied: view_positions',
  }), { status: 403, headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    api.getPositionsPage({ limit: 30, offset: 0 }),
    /Permission denied: view_positions/,
  );
});

test('nested permission errors keep their message and status in full and streamed position requests', async () => {
  apiClient.getRaw = async () => new Response(JSON.stringify({
    error: { message: 'Permission denied: view_positions' },
  }), { status: 403, headers: { 'content-type': 'application/json' } });
  const assertDenied = (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, 'Permission denied: view_positions');
    return true;
  };

  await assert.rejects(api.fetchAllPositionsDataset(), assertDenied);
  await assert.rejects(api.getPositionsPage({ limit: 1, offset: 0 }), assertDenied);
});

test('a failed global refresh may retain a previously complete position book', async () => {
  apiClient.getRaw = async () => response([position(1, 10, 'EURUSD')]);
  await api.fetchAllPositionsDataset();
  apiClient.getRaw = async () => { throw new Error('PositionsAll unavailable'); };

  const rows = await api.fetchAllPositionsDataset({ force: true });
  assert.deepEqual(tickets(rows), [1]);
  assert.equal((await api.getPositionsPage({ limit: 30, offset: 0 })).rows[0].symbol, 'EURUSD');
});

test('a 403 after a complete baseline rejects and clears the cached position book', async () => {
  apiClient.getRaw = async () => response([position(1, 10, 'EURUSD')]);
  await api.fetchAllPositionsDataset();
  apiClient.getRaw = async () => new Response(JSON.stringify({
    code: 'MT_RET_ERR_PERMISSIONS',
    message: 'Permission denied: view_positions',
  }), { status: 403, headers: { 'content-type': 'application/json' } });

  await assert.rejects(api.fetchAllPositionsDataset({ force: true }), /Permission denied: view_positions/);
  assert.equal(api.peekStoredPositionsDataset(), null);
  assert.equal(api.peekAccountPositions(10), undefined);
  await assert.rejects(api.getPositionsPage({ limit: 30, offset: 0 }), /Permission denied: view_positions/);
});

test('a streamed 403 clears an expired baseline before a live frame can revive it', async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  apiClient.getRaw = async () => response([position(1, 10, 'EURUSD')]);
  await api.fetchAllPositionsDataset();
  now += 21_000;
  apiClient.getRaw = async () => new Response(JSON.stringify({
    code: 'MT_RET_ERR_PERMISSIONS',
    message: 'Permission denied: view_positions',
  }), { status: 403, headers: { 'content-type': 'application/json' } });

  await assert.rejects(api.getPositionsPage({ limit: 30, offset: 0 }), /Permission denied: view_positions/);
  assert.equal(api.peekStoredPositionsDataset(), null);
  assert.equal(api.peekAccountPositions(10), undefined);
});

test('a 503 response may retain a previously complete position book', async () => {
  apiClient.getRaw = async () => response([position(1, 10, 'EURUSD')]);
  await api.fetchAllPositionsDataset();
  apiClient.getRaw = async () => new Response(JSON.stringify({ message: 'Service unavailable' }), { status: 503 });

  assert.deepEqual(tickets(await api.fetchAllPositionsDataset({ force: true })), [1]);
  assert.equal((await api.getPositionsPage()).rows[0].symbol, 'EURUSD');
});

test('a 200 global snapshot rejects trades missing required identity, symbol, lots, or open price', async () => {
  const invalidRows = [
    position(0, 10, 'EURUSD'),
    position(1, 0, 'EURUSD'),
    position(1, 10, ''),
    position(1, 10, 'EURUSD', { volumeExt: 0 }),
    position(1, 10, 'EURUSD', { priceOpen: 0 }),
    { ticket: 202465, account_login: 200004, price_current: 83152.07, profit: -6.92 },
  ];
  for (const row of invalidRows) {
    api.invalidatePositionsCache();
    apiClient.getRaw = async () => response([row]);
    await assert.rejects(api.fetchAllPositionsDataset(), /Incomplete PositionsAll trade row/);
    assert.equal(api.peekStoredPositionsDataset(), null);
  }

  apiClient.getRaw = async () => response([]);
  assert.deepEqual(await api.fetchAllPositionsDataset(), []);
});

test('a 200 streamed page rejects any sparse trade row before rendering or caching', async () => {
  apiClient.getRaw = async () => response([
    position(1, 10, 'EURUSD'),
    { ticket: 202465, account_login: 200004, price_current: 83152.07, profit: -6.92 },
  ]);

  await assert.rejects(
    api.getPositionsPage({ limit: 30, offset: 0 }),
    /Incomplete PositionsAll trade row/,
  );
  assert.equal(api.peekStoredPositionsDataset(), null);

  apiClient.getRaw = async () => response([]);
  assert.deepEqual((await api.getPositionsPage({ limit: 30, offset: 0 })).rows, []);
});

test('a 200 error envelope is not an empty position book, with or without a response body', async () => {
  apiClient.getRaw = async () => new Response(JSON.stringify({ error: 'upstream unavailable' }));
  await assert.rejects(api.getPositionsPage({ limit: 1 }), /rows array is missing/);
  assert.equal(api.peekStoredPositionsDataset(), null);

  apiClient.getRaw = async () => ({
    ok: true,
    status: 200,
    body: null,
    headers: new Headers(),
    text: async () => JSON.stringify({ error: 'upstream unavailable' }),
  });
  await assert.rejects(api.getPositionsPage({ limit: 1 }), /rows array is missing/);
  assert.equal(api.peekStoredPositionsDataset(), null);

  apiClient.getRaw = async () => response([]);
  assert.deepEqual((await api.getPositionsPage({ limit: 1 })).rows, []);
});

test('a filtered position page ignores sparse rows outside the requested filter', async () => {
  apiClient.getRaw = async () => response([
    position(2, 10, ''),
    position(1, 10, 'EURUSD'),
  ]);

  const page = await api.getPositionsPage({ limit: 1, offset: 0, filters: { symbol: 'EURUSD' } });
  assert.deepEqual(tickets(page.rows), [1]);
  assert.equal(api.peekStoredPositionsDataset(), null);
});

test('a sparse 200 refresh rejects without replacing a previously complete position book', async () => {
  apiClient.getRaw = async () => response([position(1, 10, 'EURUSD')]);
  await api.fetchAllPositionsDataset();
  apiClient.getRaw = async () => response([{ ticket: 1, account_login: 10, price_current: 102 }]);

  await assert.rejects(api.fetchAllPositionsDataset({ force: true }), /Incomplete PositionsAll trade row/);
  assert.equal((await api.getPositionsPage()).rows[0].symbol, 'EURUSD');
});

test('sparse live frames preserve sibling tickets and scopes quiet for more than fifteen seconds', async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  const baseline = [position(1, 10, 'EURUSD'), position(2, 10, 'EURUSD'), position(3, 20, 'BTCUSD')];
  apiClient.getRaw = async () => response(baseline);
  await api.fetchAllPositionsDataset();

  now += 16_000;
  api.applyPositionsSnapshot([{ ticket: 1, account_login: 10, symbol: 'EURUSD', profit: 25 }]);
  api.applyPositionsSnapshot([{ ticket: 2, account_login: 10, symbol: 'EURUSD', profit: 15 }]);
  const page = await api.getPositionsPage({ limit: 30, offset: 0 });

  assert.deepEqual(tickets(page.rows), [1, 2, 3]);
  assert.equal(page.total, 3);
  assert.equal(page.rows.find((row) => Number(row.position) === 1).profit, 25);
  assert.equal(page.rows.find((row) => Number(row.position) === 3).profit, 10);
});

test('a delayed forced HTTP snapshot preserves newer live values and reconciles baseline membership', async () => {
  apiClient.getRaw = async () => response([position(1, 10, 'EURUSD'), position(2, 10, 'EURUSD'), position(3, 20, 'BTCUSD')]);
  await api.fetchAllPositionsDataset();
  const pending = deferred();
  apiClient.getRaw = () => pending.promise;
  const refresh = api.fetchAllPositionsDataset({ force: true });

  api.applyPositionsSnapshot([
    { ticket: 1, account_login: 10, symbol: 'EURUSD', profit: 42, price_current: 105 },
    {
      ticket: 4, account_login: 10, accountName: 'New owner', username: 'new@example.test',
      symbol: 'XAUUSD', volume: 2, price_open: 200, profit: 30,
    },
  ]);
  pending.resolve(response([
    position(1, 10, 'EURUSD', { profit: 12, priceCurrent: 102 }),
    position(2, 10, 'EURUSD'),
    position(5, 30, 'GBPUSD'),
  ]));
  const refreshed = await refresh;
  const page = await api.getPositionsPage({ limit: 30, offset: 0 });

  assert.deepEqual(tickets(refreshed), [1, 2, 4, 5]);
  assert.deepEqual(tickets(page.rows), [1, 2, 4, 5]);
  assert.equal(page.rows.find((row) => Number(row.position) === 1).profit, 42);
  assert.equal(page.rows.find((row) => Number(row.position) === 1).priceCurrent, 105);
  assert.equal(page.rows.find((row) => Number(row.position) === 4).volume, 2);
  assert.deepEqual(tickets(api.peekAccountPositions(10)), [1, 2, 4]);
  assert.deepEqual(api.peekAccountPositions(20), []);
});

test('a new sparse websocket ticket waits for trade and account details before joining complete caches', async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const previous = {
    window: globalThis.window,
    sessionStorage: globalThis.sessionStorage,
    localStorage: globalThis.localStorage,
  };
  const cacheKey = 'rtx5_positions_dataset_v3';

  try {
    globalThis.window = { sessionStorage: storage, localStorage: storage };
    globalThis.sessionStorage = storage;
    globalThis.localStorage = storage;
    storage.setItem('auth', JSON.stringify({ login: 'manager-one', broker_id: 'broker-one', session_scope: 'session-one' }));
    apiClient.getRaw = async () => response([position(1, 10, 'EURUSD')]);
    await api.fetchAllPositionsDataset();

    api.applyPositionsSnapshot([
      { ticket: 2, account_login: 10, price_current: 205, profit: 5 },
      { ticket: 1, profit: 25 },
    ]);
    assert.deepEqual(tickets((await api.getPositionsPage()).rows), [1]);
    assert.equal((await api.getPositionsPage()).rows[0].profit, 25);
    assert.deepEqual(tickets(api.peekAccountPositions(10)), [1]);
    assert.deepEqual(tickets(JSON.parse(storage.getItem(cacheKey)).records), [1]);

    api.applyPositionsSnapshot([{
      ticket: 2, account_login: 10, accountName: 'New owner', username: 'new@example.test',
      symbol: 'XAUUSD', volume: 0.01, price_open: 200,
    }]);
    const page = await api.getPositionsPage();
    assert.deepEqual(tickets(page.rows), [1, 2]);
    assert.equal(page.rows.find((row) => Number(row.position) === 2).priceCurrent, 205);
    assert.deepEqual(tickets(api.peekAccountPositions(10)), [1, 2]);
    assert.deepEqual(tickets(JSON.parse(storage.getItem(cacheKey)).records), [1, 2]);
  } finally {
    api.invalidatePositionsCache();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});

test('an explicit close discards pending details for a new websocket ticket', async () => {
  apiClient.getRaw = async () => response([position(1, 10, 'EURUSD')]);
  await api.fetchAllPositionsDataset();
  api.applyPositionsSnapshot([{ ticket: 2, account_login: 10, symbol: 'XAUUSD', price_current: 205 }]);
  api.applyPositionsSnapshot([{ ticket: 2, account_login: 10, status: 'closed' }]);
  api.applyPositionsSnapshot([{
    ticket: 2, account_login: 10, accountName: 'New owner', username: 'new@example.test',
    volume: 0.01, price_open: 200,
  }]);

  assert.deepEqual(tickets((await api.getPositionsPage()).rows), [1]);
  assert.deepEqual(tickets(api.peekAccountPositions(10)), [1]);
});

test('a valid bodyless streamed page can seed the complete position book', async () => {
  apiClient.getRaw = async () => ({
    ok: true,
    status: 200,
    body: null,
    headers: new Headers(),
    text: async () => JSON.stringify({ positions: [position(1, 10, 'EURUSD')] }),
  });

  const page = await api.getPositionsPage({ limit: 30, offset: 0 });
  assert.deepEqual(tickets(page.rows), [1]);
  assert.deepEqual(tickets(await api.fetchAllPositionsDataset()), [1]);
});

test('a sparse websocket ticket cannot be promoted by an empty HTTP race', async () => {
  const pending = deferred();
  apiClient.getRaw = () => pending.promise;
  const refresh = api.fetchAllPositionsDataset();
  api.applyPositionsSnapshot([{ ticket: 2, account_login: 10, price_current: 205, profit: 5 }]);
  pending.resolve(response([]));

  assert.deepEqual(await refresh, []);
  assert.deepEqual((await api.getPositionsPage()).rows, []);

  api.applyPositionsSnapshot([{
    ticket: 2, account_login: 10, accountName: 'New owner', username: 'new@example.test',
    symbol: 'XAUUSD', volume: 0.01, price_open: 200,
  }]);
  const [row] = (await api.getPositionsPage()).rows;
  assert.equal(row.position, 2);
  assert.equal(row.priceCurrent, 205);
});

test('an existing HTTP ticket keeps a sparse newer update during reconciliation', async () => {
  apiClient.getRaw = async () => response([position(1, 10, 'EURUSD')]);
  await api.fetchAllPositionsDataset();
  const pending = deferred();
  apiClient.getRaw = () => pending.promise;
  const refresh = api.fetchAllPositionsDataset({ force: true });
  api.applyPositionsSnapshot([{ ticket: 1, profit: 25 }]);
  pending.resolve(response([]));

  const rows = await refresh;
  assert.deepEqual(tickets(rows), [1]);
  assert.equal((await api.getPositionsPage()).rows[0].profit, 25);
});

test('a cold partial live frame still fetches the complete HTTP baseline', async () => {
  let requests = 0;
  apiClient.getRaw = async (endpoint) => {
    assert.equal(endpoint, '/PositionsAll');
    requests += 1;
    return response([position(1, 10, 'EURUSD'), position(2, 10, 'EURUSD'), position(3, 20, 'BTCUSD')]);
  };
  api.applyPositionsSnapshot([{ ticket: 1, account_login: 10, symbol: 'EURUSD', volume: 1, profit: 10 }]);
  assert.equal(api.peekAccountPositions(10), undefined);

  const page = await api.getPositionsPage({ limit: 30, offset: 0 });

  assert.equal(requests, 1);
  assert.deepEqual(tickets(page.rows), [1, 2, 3]);
  assert.deepEqual(tickets(api.peekAccountPositions(10)), [1, 2]);
  assert.deepEqual(tickets(api.peekAccountPositions(20)), [3]);
});

test('an authoritative empty HTTP snapshot clears global and account position caches', async () => {
  apiClient.getRaw = async () => response([position(1, 10, 'EURUSD'), position(2, 20, 'BTCUSD')]);
  await api.fetchAllPositionsDataset();
  assert.deepEqual(tickets(api.peekAccountPositions(10)), [1]);

  // Empty streaming frames have no scope and cannot prove the book is empty.
  api.applyPositionsSnapshot([]);
  assert.deepEqual(tickets((await api.getPositionsPage()).rows), [1, 2]);
  apiClient.getRaw = async () => response([]);
  assert.deepEqual(await api.fetchAllPositionsDataset({ force: true }), []);

  const page = await api.getPositionsPage();
  assert.deepEqual(page.rows, []);
  assert.equal(page.total, 0);
  assert.deepEqual(api.peekAccountPositions(10), []);
  assert.deepEqual(api.peekAccountPositions(20), []);
  assert.equal(api.peekStoredPositionsDataset(), null);
});

test('an authoritative empty book also clears an account loaded before the global baseline', async () => {
  apiClient.get = async () => ({ positions: [position(1, 10, 'EURUSD')] });
  assert.deepEqual(tickets(await api.getAccountPositions(10)), [1]);
  apiClient.getRaw = async () => response([]);
  await api.fetchAllPositionsDataset({ force: true });

  assert.deepEqual(api.peekAccountPositions(10), []);
});

test('an invalidated session response cannot repopulate or replace the current position book', async () => {
  const oldResponse = deferred();
  apiClient.getRaw = () => oldResponse.promise;
  const staleRequest = api.fetchAllPositionsDataset();
  const rejected = assert.rejects(staleRequest, /invalidated/i);

  api.invalidatePositionsCache();
  apiClient.getRaw = async () => response([position(2, 20, 'BTCUSD')]);
  await api.fetchAllPositionsDataset();
  oldResponse.resolve(response([position(1, 10, 'EURUSD')]));
  await rejected;

  assert.deepEqual(tickets((await api.getPositionsPage()).rows), [2]);
  assert.equal(api.peekAccountPositions(10), undefined);
  assert.deepEqual(tickets(api.peekAccountPositions(20)), [2]);
});

test('a newer price frame preserves HTTP changes to stops and volume during a forced refresh', async () => {
  apiClient.getRaw = async () => response([
    position(1, 10, 'EURUSD', { volumeExt: 20_000, priceSl: 90, priceTp: 120 }),
  ]);
  await api.fetchAllPositionsDataset();
  // Seed an explicit lots field as well as volumeExt, as earlier live frames do.
  api.applyPositionsSnapshot([{ ticket: 1, account_login: 10, volume: 2 }]);
  const pending = deferred();
  apiClient.getRaw = () => pending.promise;
  const refresh = api.fetchAllPositionsDataset({ force: true });

  api.applyPositionsSnapshot([{ ticket: 1, price_current: 107, profit: 70 }]);
  pending.resolve(response([
    position(1, 10, 'EURUSD', { volumeExt: 5_000, priceSl: 95, priceTp: 0, priceCurrent: 103, profit: 30 }),
  ]));
  await refresh;

  const [row] = (await api.getPositionsPage()).rows;
  assert.equal(row.priceCurrent, 107);
  assert.equal(row.profit, 70);
  assert.equal(row.volume, 0.5);
  assert.equal(row.priceSl, 95);
  assert.equal(row.priceTp, 0);
  assert.deepEqual(api.peekAccountPositions(10), [row]);
});

test('a cold global frame preserves an independently loaded account book and its volumes', async () => {
  apiClient.get = async () => ({ positions: [
    position(1, 10, 'EURUSD', { volumeExt: 1_000_000, priceSl: 90 }),
    position(2, 10, 'EURUSD', { volumeExt: 100 }),
    position(3, 10, 'XAUUSD', { volumeExt: 50 }),
  ] });
  const accountRows = await api.getAccountPositions(10);
  assert.deepEqual(accountRows.map((row) => row.volume), [100, 0.01, 0.005]);

  api.applyPositionsSnapshot([{ ticket: 1, account_login: 10, symbol: 'EURUSD', price_current: 105, profit: 50 }]);
  const updated = await api.getAccountPositions(10);

  assert.deepEqual(tickets(updated), [1, 2, 3]);
  assert.deepEqual(updated.map((row) => row.volume), [100, 0.01, 0.005]);
  assert.equal(updated.find((row) => Number(row.position) === 1).priceCurrent, 105);
  assert.equal(updated.find((row) => Number(row.position) === 1).priceSl, 90);
  assert.equal(updated.find((row) => Number(row.position) === 2).priceCurrent, 101);
});

test('a sparse live frame preserves newer account HTTP fields than the global baseline', async () => {
  apiClient.getRaw = async () => response([
    position(1, 10, 'EURUSD', { volumeExt: 20_000, priceSl: 90, priceTp: 120 }),
  ]);
  await api.fetchAllPositionsDataset();
  api.invalidateAccountPositionsCache(10);
  apiClient.get = async () => ({ positions: [
    position(1, 10, 'EURUSD', { volumeExt: 5_000, priceSl: 95, priceTp: 0, profit: 15 }),
  ] });
  const [before] = await api.getAccountPositions(10);
  assert.equal(before.volume, 0.5);
  assert.equal(before.priceSl, 95);

  // A sparse frame gets its account from the global row, but must not copy
  // that older row's unchanged fields back into the account's fresh snapshot.
  api.applyPositionsSnapshot([{ ticket: 1, profit: 70, price_current: 107 }]);
  const [after] = api.peekAccountPositions(10);

  assert.equal(after.position, before.position);
  assert.equal(after.volume, 0.5);
  assert.equal(after.priceSl, 95);
  assert.equal(after.priceTp, 0);
  assert.equal(after.profit, 70);
  assert.equal(after.priceCurrent, 107);
});

test('account continuation pages retain every ticket and prices received while a later page loads', async () => {
  const firstPage = Array.from({ length: 30 }, (_, index) => position(index + 1, 10, 'EURUSD', {
    volumeExt: index === 0 ? 1_000_000 : 100,
  }));
  const laterPage = deferred();
  const requestedOffsets = [];
  apiClient.get = async (endpoint) => {
    const offset = Number(new URL(endpoint, 'https://example.test').searchParams.get('offset'));
    requestedOffsets.push(offset);
    if (offset === 0) return { positions: firstPage };
    assert.equal(offset, 30);
    return laterPage.promise;
  };
  const initial = await api.getAccountPositions(10);
  assert.equal(api.hasAccountPositionsContinuation(10), true);
  const publishedPages = [];
  const completion = api.completeAccountPositions(10, initial, { onPage: (rows) => publishedPages.push(rows) });

  api.applyPositionsSnapshot([
    { ticket: 1, account_login: 10, symbol: 'EURUSD', price_current: 107, profit: 70 },
    { ticket: 31, account_login: 10, symbol: 'XAUUSD', price_current: 202, profit: 20 },
  ]);
  laterPage.resolve({ positions: [position(31, 10, 'XAUUSD', { volumeExt: 50, priceCurrent: 201 })] });
  const complete = await completion;

  assert.deepEqual(requestedOffsets, [0, 30]);
  assert.deepEqual(tickets(complete), Array.from({ length: 31 }, (_, index) => index + 1));
  assert.equal(complete.find((row) => Number(row.position) === 1).priceCurrent, 107);
  assert.equal(complete.find((row) => Number(row.position) === 1).volume, 100);
  assert.equal(complete.find((row) => Number(row.position) === 31).priceCurrent, 202);
  assert.equal(complete.find((row) => Number(row.position) === 31).volume, 0.005);
  assert.deepEqual(publishedPages, [complete]);
  assert.deepEqual(api.peekAccountPositions(10), complete);
  assert.equal(api.hasAccountPositionsContinuation(10), false);
});

test('an authoritative empty global book prevents a pending account continuation from restoring closed tickets', async () => {
  const firstPage = Array.from({ length: 30 }, (_, index) => position(index + 1, 10, 'EURUSD'));
  const laterPage = deferred();
  apiClient.get = async (endpoint) => (
    new URL(endpoint, 'https://example.test').searchParams.get('offset') === '0'
      ? { positions: firstPage }
      : laterPage.promise
  );
  const initial = await api.getAccountPositions(10);
  const publishedPages = [];
  const completion = api.completeAccountPositions(10, initial, { onPage: (rows) => publishedPages.push(rows) });

  apiClient.getRaw = async () => response([]);
  await api.fetchAllPositionsDataset({ force: true });
  assert.deepEqual(api.peekAccountPositions(10), []);
  laterPage.resolve({ positions: [position(31, 10, 'EURUSD')] });

  assert.deepEqual(await completion, []);
  assert.deepEqual(publishedPages, []);
  assert.deepEqual(api.peekAccountPositions(10), []);
  assert.deepEqual((await api.getPositionsPage()).rows, []);
  assert.equal(api.hasAccountPositionsContinuation(10), false);
});

test('persisted positions require the same manager, broker, API host, and a recent timestamp', async () => {
  const createStorage = () => {
    const values = new Map();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    };
  };
  const session = createStorage();
  const local = createStorage();
  const previous = {
    window: globalThis.window,
    sessionStorage: globalThis.sessionStorage,
    localStorage: globalThis.localStorage,
    runtimeConfig: globalThis.__RTX_RUNTIME_CONFIG__,
  };
  const cacheKey = 'rtx5_positions_dataset_v3';
  const legacyKey = 'rtx5_positions_dataset_v2';
  const setAuth = (login, brokerId, sessionScope = 'session-one') => session.setItem('auth', JSON.stringify({
    login, broker_id: brokerId, session_scope: sessionScope,
  }));

  try {
    globalThis.window = { sessionStorage: session, localStorage: local };
    globalThis.sessionStorage = session;
    globalThis.localStorage = local;
    globalThis.__RTX_RUNTIME_CONFIG__ = { BROKER_ID: 'broker-one', API_HOST: 'https://api-one.example' };
    setAuth('manager-one', 'broker-one');
    apiClient.getRaw = async () => response([position(1, 10, 'EURUSD')]);
    await api.fetchAllPositionsDataset();
    const saved = JSON.parse(session.getItem(cacheKey));
    assert.equal(typeof saved.scope, 'string');

    const readFromStorage = (payload = saved) => {
      api.invalidatePositionsCache();
      session.setItem(cacheKey, JSON.stringify(payload));
      return api.peekStoredPositionsDataset();
    };
    assert.deepEqual(tickets(readFromStorage()), [1]);

    setAuth('manager-two', 'broker-one');
    assert.equal(readFromStorage(), null);
    setAuth('manager-one', 'broker-two');
    assert.equal(readFromStorage(), null);
    setAuth('manager-one', 'broker-one', 'session-two');
    assert.equal(readFromStorage(), null);
    setAuth('manager-one', 'broker-one');
    globalThis.__RTX_RUNTIME_CONFIG__.API_HOST = 'https://api-two.example';
    assert.equal(readFromStorage(), null);

    globalThis.__RTX_RUNTIME_CONFIG__.API_HOST = 'https://api-one.example';
    assert.equal(readFromStorage({ ...saved, timestamp: Date.now() - 61_000 }), null);
    assert.equal(readFromStorage({ ...saved, timestamp: Date.now() + 61_000 }), null);

    api.invalidatePositionsCache();
    session.setItem(legacyKey, JSON.stringify({ records: [position(2, 10, 'BTCUSD')], timestamp: Date.now() }));
    assert.equal(api.peekStoredPositionsDataset(), null);
    assert.equal(session.getItem(legacyKey), null);
  } finally {
    api.invalidatePositionsCache();
    for (const [key, value] of Object.entries(previous)) {
      const globalKey = key === 'runtimeConfig' ? '__RTX_RUNTIME_CONFIG__' : key;
      if (value === undefined) delete globalThis[globalKey];
      else globalThis[globalKey] = value;
    }
  }
});
