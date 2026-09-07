import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createManagerAccount, deleteManagerAccount, updateManagerAccount } from './managerAccountApi.js';

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
    return new Response(JSON.stringify({ login: 200001, success: true }), { status: 200 });
  };
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.window;
});

test('createManagerAccount posts JSON to the versioned collection', async () => {
  await createManagerAccount({ master_pass: 'not-a-real-password', Group: 'demo' });

  assert.equal(new URL(calls[0].url).pathname, '/api/v1/manager/accounts');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { master_pass: 'not-a-real-password', Group: 'demo' });
});

test('updateManagerAccount patches the scoped account with an encoded path', async () => {
  await updateManagerAccount('200/001', { Leverage: 100 });

  assert.equal(new URL(calls[0].url).pathname, '/api/v1/manager/accounts/200%2F001');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].options.body), { Leverage: 100 });
});

test('deleteManagerAccount deletes the scoped account without a body', async () => {
  await deleteManagerAccount(200001);

  assert.equal(new URL(calls[0].url).pathname, '/api/v1/manager/accounts/200001');
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(calls[0].options.body, undefined);
});
