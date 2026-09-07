import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeManagerPosition, getManagerOrderStatus, placeManagerOrder } from './managerTradeApi.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
  };
};

let calls;

beforeEach(() => {
  calls = [];
  const sessionStorage = createStorage();
  const localStorage = createStorage();
  sessionStorage.setItem('auth', JSON.stringify({ token: 'manager-test-token' }));
  localStorage.setItem('authToken', 'manager-test-token');
  globalThis.window = {
    sessionStorage,
    localStorage,
    location: { origin: 'http://localhost:5173' },
    dispatchEvent: () => {},
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ retcode: 'OK', message: 'Position closed' }), { status: 200 });
  };
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.window;
});

test('closeManagerPosition uses the versioned POST contract with JSON and the manager Bearer token', async () => {
  await closeManagerPosition(19916);

  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/manager/orders/19916/close');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, '{}');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer manager-test-token');
  assert.doesNotMatch(calls[0].url, /OrderClose/i);
});

test('placeManagerOrder supplies a unique client order id to the authoritative writer', async () => {
  await placeManagerOrder({ login: 200001, symbol: 'EURUSD', operation: 'buy', lots: 0.1 });

  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/manager/orders');
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.login, 200001);
  assert.equal(body.operation, 'buy');
  assert.equal(body.lots, 0.1);
  assert.equal(typeof body.client_order_id, 'string');
  assert.ok(body.client_order_id.length > 0);
});

test('getManagerOrderStatus encodes the durable command lookup route', async () => {
  await getManagerOrderStatus(200001, 'desktop/123');

  assert.equal(calls.length, 1);
  assert.equal(
    new URL(calls[0].url).pathname,
    '/api/v1/manager/accounts/200001/orders/by-client-id/desktop%2F123',
  );
  assert.equal(calls[0].options.method, 'GET');
});
