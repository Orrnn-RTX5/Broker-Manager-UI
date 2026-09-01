import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { closeManagerPosition } from './managerTradeApi.js';

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
