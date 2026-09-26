import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { changeManagerPassword, checkManagerPassword } from './managerPasswordApi.js';

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
    return new Response('ok', { status: 200 });
  };
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.window;
});

test('password requests send login as a JSON integer', async () => {
  await changeManagerPassword({
    login: '200001',
    type: 'USER_PASS_MAIN',
    password: 'new-secret',
  });
  await checkManagerPassword({
    login: 200001,
    type: 'USER_PASS_INVESTOR',
    password: 'read-only',
  });

  assert.match(calls[0].url, /\/UserPasswordChange$/);
  assert.match(calls[1].url, /\/UserPasswordCheck$/);
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].options.body, /"login":200001,/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    login: 200001,
    type: 'USER_PASS_MAIN',
    password: 'new-secret',
  });
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    login: 200001,
    type: 'USER_PASS_INVESTOR',
    password: 'read-only',
  });
});

test('password requests reject a non-integer login before calling the API', async () => {
  await assert.rejects(
    () => changeManagerPassword({ login: '200001abc', type: 'USER_PASS_MAIN', password: 'new-secret' }),
    /positive integer/,
  );
  await assert.rejects(
    () => checkManagerPassword({ login: '0', type: 'USER_PASS_API', password: 'new-secret' }),
    /positive integer/,
  );
  assert.equal(calls.length, 0);
});
