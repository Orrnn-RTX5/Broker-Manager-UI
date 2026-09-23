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

test('placeManagerOrder rejects a broker failure even with HTTP 200', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Market is closed' }), { status: 200 });
  await assert.rejects(() => placeManagerOrder({ login: 200001, symbol: 'EURUSD', operation: 'buy', lots: 0.1 }), /Market is closed/);
});

test('an ambiguous placement reconciles the original id without resubmitting', async () => {
  const order = { login: 200001, symbol: 'EURUSD', operation: 'buy', lots: 0.1 };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (options.method === 'POST') throw new TypeError('network interrupted');
    return new Response(JSON.stringify({ status: 'filled', data: { ticket: 42 } }), { status: 200 });
  };
  assert.deepEqual(await placeManagerOrder(order), { ticket: 42 });
  assert.equal(calls.filter(({ options }) => options.method === 'POST').length, 1);
  const id = JSON.parse(calls[0].options.body).client_order_id;
  assert.ok(calls[1].url.endsWith(encodeURIComponent(id)));
});

test('unresolved placement retains its id on errors and subsequent clicks only check status', async () => {
  const order = { login: 200001, symbol: 'EURUSD', operation: 'buy', lots: 0.1 };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return options.method === 'POST'
      ? new Response(JSON.stringify({ code: 'ORDER_STATUS_UNKNOWN' }), { status: 503 })
      : new Response(JSON.stringify({ status: 'accepted' }), { status: 200 });
  };
  let originalId;
  await assert.rejects(() => placeManagerOrder(order), (error) => {
    originalId = error.client_order_id;
    assert.equal(error.account_login, 200001);
    assert.equal(error.statusUnknown, true);
    assert.match(error.message, new RegExp(originalId));
    assert.equal(typeof error.checkStatus, 'function');
    return true;
  });
  await assert.rejects(() => placeManagerOrder(order), (error) => error.client_order_id === originalId);
  assert.equal(calls.filter(({ options }) => options.method === 'POST').length, 1);
  assert.equal(calls.filter(({ options }) => options.method === 'GET').length, 2);
});

test('202 acceptance is not displayed as a fill and recovers through status', async () => {
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return options.method === 'POST'
      ? new Response(JSON.stringify({ status: 'accepted' }), { status: 202 })
      : new Response(JSON.stringify({ status: 'filled', data: { ticket: 99 } }), { status: 200 });
  };
  assert.deepEqual(await placeManagerOrder({ login: 200001, symbol: 'EURUSD', operation: 'buy', lots: 0.1 }), { ticket: 99 });
  assert.equal(calls.length, 2);
});

test('disabled browser storage still prevents resubmission while status is unavailable', async () => {
  globalThis.window.sessionStorage = {
    getItem: (key) => key === 'auth' ? JSON.stringify({ token: 'manager-test-token' }) : null,
    setItem: () => { throw new Error('storage disabled'); },
    removeItem: () => {},
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    throw new TypeError('offline');
  };
  const payload = { login: 200001, symbol: 'EURUSD', operation: 'buy', lots: 0.1 };
  let firstId;
  await assert.rejects(() => placeManagerOrder(payload), (error) => {
    firstId = error.client_order_id;
    return Boolean(firstId);
  });
  await assert.rejects(() => placeManagerOrder(payload), (error) => error.client_order_id === firstId);
  assert.equal(calls.filter(({ options }) => options.method === 'POST').length, 1);
});
