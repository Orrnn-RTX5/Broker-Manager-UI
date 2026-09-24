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
    { ticket: 4, account_login: 10, symbol: 'XAUUSD', volume: 2, profit: 30 },
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
