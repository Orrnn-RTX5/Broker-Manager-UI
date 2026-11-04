import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createManagerAccount, deleteManagerAccount, updateManagerAccount } from './managerAccountApi.js';
import { resolveAccountModeRefusal } from '../components/Popups/accountModeRefusals.js';

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

test('integration: createManagerAccount rejects with structured 409 fields and resolveAccountModeRefusal maps texts', async () => {
  // 1. ACCOUNT_MODE_UNSUPPORTED via engine_code with envelope code MT_RET_ERR_DATA (group_contract.go:302-307, engine_register.go:330-337)
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: 'Netting accounts are not supported yet',
    code: 'MT_RET_ERR_DATA',
    engine_code: 'ACCOUNT_MODE_UNSUPPORTED',
    stackTrace: null,
  }), { status: 409 });

  await assert.rejects(
    async () => createManagerAccount({ master_pass: 'pass', Group: 'netting-grp' }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.engine_code, 'ACCOUNT_MODE_UNSUPPORTED');
      assert.equal(err.code, 'MT_RET_ERR_DATA');
      assert.equal(err.message, 'Netting accounts are not supported yet');
      assert.deepEqual(err.body, {
        message: 'Netting accounts are not supported yet',
        code: 'MT_RET_ERR_DATA',
        engine_code: 'ACCOUNT_MODE_UNSUPPORTED',
        stackTrace: null,
      });
      assert.equal(resolveAccountModeRefusal(err), 'Netting is not enabled on this server yet.');
      return true;
    },
  );

  // 2. ACCOUNT_MODE_GROUP_MISMATCH via code/error_code with human error field (group_contract.go:346-364)
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: 'Account mode "netting" does not match group margin mode "hedging"',
    message: 'Account mode "netting" does not match group margin mode "hedging"',
    code: 'ACCOUNT_MODE_GROUP_MISMATCH',
    error_code: 'ACCOUNT_MODE_GROUP_MISMATCH',
  }), { status: 409 });

  await assert.rejects(
    async () => createManagerAccount({ master_pass: 'pass', Group: 'hedging-grp' }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'ACCOUNT_MODE_GROUP_MISMATCH');
      assert.equal(err.error_code, 'ACCOUNT_MODE_GROUP_MISMATCH');
      assert.equal(err.message, 'Account mode "netting" does not match group margin mode "hedging"');
      assert.equal(resolveAccountModeRefusal(err), 'Account mode must match the group (Netting).');
      return true;
    },
  );

  // 3. ENGINE_ACCOUNT_MODE_UNSUPPORTED via engine_code (engine_register.go:102-103 BBK06)
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: 'account mode not supported by engine',
    code: 'MT_RET_ERR_DATA',
    engine_code: 'ENGINE_ACCOUNT_MODE_UNSUPPORTED',
    stackTrace: null,
  }), { status: 409 });

  await assert.rejects(
    async () => createManagerAccount({ master_pass: 'pass', Group: 'netting-grp' }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.engine_code, 'ENGINE_ACCOUNT_MODE_UNSUPPORTED');
      assert.equal(resolveAccountModeRefusal(err), 'Netting is not enabled on this server yet.');
      return true;
    },
  );
});
