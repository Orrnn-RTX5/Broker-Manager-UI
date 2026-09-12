import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { submitManagerTransaction } from './managerFinanceApi.js';

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
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.window;
});

for (const [type, path] of [
  ['deposit', '/api/v1/manager/transactions/deposit'],
  ['withdraw', '/api/v1/manager/transactions/withdraw'],
  ['credit', '/api/v1/manager/transactions/credit'],
  ['transfer', '/api/v1/manager/transactions/transfer'],
]) {
  test(`submitManagerTransaction posts ${type} to the versioned manager writer`, async () => {
    const payload = type === 'transfer'
      ? { from_login: 200001, to_login: 200002, amount: 10 }
      : { login: 200001, amount: 10 };

    await submitManagerTransaction(type, payload);

    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).pathname, path);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer manager-test-token');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.amount, 10);
    assert.match(body.idempotency_key, /^[0-9a-f-]{36}$/i);
  });
}

test('submitManagerTransaction rejects unknown transaction types before a request is made', async () => {
  await assert.rejects(() => submitManagerTransaction('rebate', {}), /Unsupported manager transaction type/);
  assert.equal(calls.length, 0);
});

for (const failure of [{ success: false, message: 'Deposit rejected' }, { ok: false, error: 'Account is locked' }, { error: 'Deposits are disabled for this account' }]) {
  test(`submitManagerTransaction rejects HTTP 200 with ${JSON.stringify(failure)}`, async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(failure), { status: 200 });
    await assert.rejects(() => submitManagerTransaction('deposit', { login: 200001, amount: 10 }),
      { message: failure.message || failure.error });
  });
}

test('submitManagerTransaction preserves server validation details', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: [{ msg: 'Amount exceeds the permitted limit' }] }), { status: 422 });
  await assert.rejects(() => submitManagerTransaction('deposit', { login: 200001, amount: 10 }),
    { message: 'Amount exceeds the permitted limit' });
});

test('submitManagerTransaction handles an unstructured server error', async () => {
  globalThis.fetch = async () => new Response('Deposit service unavailable', { status: 503 });
  await assert.rejects(() => submitManagerTransaction('deposit', { login: 200001, amount: 10 }),
    { message: 'Deposit service unavailable' });
});
