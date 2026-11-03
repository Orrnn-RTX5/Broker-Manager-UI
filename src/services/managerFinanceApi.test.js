import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchManagerBalanceHistory, ManagerHistoryError } from './managerFinanceApi.js';
import {
  ALREADY_APPLIED_IDEMPOTENCY_CODES,
  DEFINITE_REFUSAL_CODES,
  KEY_HOLD_IDEMPOTENCY_CODES,
  PENDING_IDEMPOTENCY_CODES,
  ManagerTransactionError,
  isDefiniteManagerTransactionRefusal,
  submitManagerTransaction,
} from './managerFinanceApi.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
  };
};

// Fake logins only. Never real owner or QA-pool accounts in test data.
const FAKE_LOGIN = 710001;
const FAKE_DESTINATION = 710002;

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

const respondWith = (status, body) => {
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
};

const bodyOf = (index = 0) => JSON.parse(calls[index].options.body);

for (const [type, path] of [
  ['deposit', '/api/v1/manager/transactions/deposit'],
  ['withdraw', '/api/v1/manager/transactions/withdraw'],
  ['credit', '/api/v1/manager/transactions/credit'],
  ['transfer', '/api/v1/manager/transactions/transfer'],
]) {
  test(`submitManagerTransaction posts ${type} to the versioned manager writer`, async () => {
    const payload = type === 'transfer'
      ? { from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '10.00' }
      : { login: FAKE_LOGIN, amount: '10.00' };

    const outcome = await submitManagerTransaction(type, payload);

    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).pathname, path);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer manager-test-token');
    assert.equal(outcome.status, 'ok');
    assert.match(bodyOf().idempotency_key, /^[0-9a-f-]{36}$/i);
  });
}

test('submitManagerTransaction sends the amount as the exact decimal string, never a number', async () => {
  await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1000.50', comment: 'Client deposit' });
  const body = bodyOf();
  assert.equal(body.amount, '1000.50');
  assert.equal(typeof body.amount, 'string');
  assert.equal(body.login, FAKE_LOGIN);
  assert.equal(body.comment, 'Client deposit');
});

test('submitManagerTransaction forwards credit_out and sends only from_login and to_login on transfer', async () => {
  await submitManagerTransaction('credit', { login: FAKE_LOGIN, amount: '200.00', credit_out: true });
  assert.equal(bodyOf(0).credit_out, true);

  await submitManagerTransaction('transfer', { from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '5.00' });
  const transferBody = bodyOf(1);
  assert.equal(transferBody.from_login, FAKE_LOGIN);
  assert.equal(transferBody.to_login, FAKE_DESTINATION);
  assert.equal('login' in transferBody, false);
});

for (const amount of [10, '', ' ', '1e3', '-1', '0', '0.00', '1.005', '.5', '1,000.00', null, undefined]) {
  test(`submitManagerTransaction refuses a non-decimal amount ${JSON.stringify(amount)} before any request as a preSend TypeError`, async () => {
    const err = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount }).catch((e) => e);
    assert.equal(err instanceof TypeError, true);
    assert.equal(err.preSend, true);
    assert.equal(isDefiniteManagerTransactionRefusal(err), true);
    assert.equal(calls.length, 0);
  });
}

test('submitManagerTransaction rejects unknown transaction types before a request is made as a preSend TypeError', async () => {
  const err1 = await submitManagerTransaction('rebate', {}).catch((e) => e);
  assert.equal(err1 instanceof TypeError, true);
  assert.equal(err1.preSend, true);
  assert.equal(isDefiniteManagerTransactionRefusal(err1), true);
  await assert.rejects(() => submitManagerTransaction('toString', { amount: '1.00' }), /Unsupported manager transaction type/);
  assert.equal(calls.length, 0);
});

for (const failure of [{ success: false, message: 'Deposit rejected' }, { ok: false, error: 'Account is locked' }, { error: 'Deposits are disabled for this account' }]) {
  test(`submitManagerTransaction rejects HTTP 200 with ${JSON.stringify(failure)}`, async () => {
    respondWith(200, failure);
    await assert.rejects(() => submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' }),
      { message: failure.message || failure.error });
  });
}

test('submitManagerTransaction preserves server validation details', async () => {
  respondWith(422, { detail: [{ msg: 'Amount exceeds the permitted limit' }] });
  await assert.rejects(() => submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' }),
    { message: 'Amount exceeds the permitted limit' });
});

test('submitManagerTransaction handles an unstructured server error', async () => {
  respondWith(503, 'Deposit service unavailable');
  await assert.rejects(() => submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' }),
    { message: 'Deposit service unavailable' });
});

test('a refused request keeps the server error code and HTTP status', async () => {
  respondWith(400, { success: false, code: 'INSUFFICIENT_FUNDS', error: 'Not enough balance' });
  await assert.rejects(
    () => submitManagerTransaction('withdraw', { login: FAKE_LOGIN, amount: '999999.00' }),
    (error) => {
      assert.ok(error instanceof ManagerTransactionError);
      assert.equal(error.code, 'INSUFFICIENT_FUNDS');
      assert.equal(error.httpStatus, 400);
      assert.equal(error.message, 'Not enough balance');
      return true;
    },
  );
});

test('a credit_out refusal keeps CREDIT_OUT_ENGINE_ONLY', async () => {
  respondWith(400, { success: false, code: 'CREDIT_OUT_ENGINE_ONLY', error: 'Credit out needs an engine account' });
  await assert.rejects(
    () => submitManagerTransaction('credit', { login: FAKE_LOGIN, amount: '1.00', credit_out: true }),
    { code: 'CREDIT_OUT_ENGINE_ONLY', httpStatus: 400 },
  );
});

test('a 202 on deposit is pending, never a success, even with success true in the body', async () => {
  respondWith(202, { success: true, command_id: 'cmd-1', message: 'accepted' });
  const outcome = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' });
  assert.equal(outcome.status, 'pending');
  assert.notEqual(outcome.status, 'ok');
  assert.equal(outcome.httpStatus, 202);
});

test('a 202 TRANSFER_UNRESOLVED is unresolved, keeps the code and transfer_id, and is not a throw', async () => {
  respondWith(202, {
    success: false,
    code: 'TRANSFER_UNRESOLVED',
    status: 'UNRESOLVED',
    transfer_id: 77,
    out_leg: 'applied',
    in_leg: 'pending',
    retry_with_same_key: true,
    error: 'half applied',
  });
  const outcome = await submitManagerTransaction('transfer', {
    from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '250.00',
  });
  assert.equal(outcome.status, 'unresolved');
  assert.equal(outcome.code, 'TRANSFER_UNRESOLVED');
  assert.equal(outcome.transferId, 77);
  assert.equal(outcome.httpStatus, 202);
});

test('a 200 completed transfer is ok', async () => {
  respondWith(200, { success: true, status: 'COMPLETED', transfer_id: 78, message: 'done' });
  const outcome = await submitManagerTransaction('transfer', {
    from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '1.00',
  });
  assert.equal(outcome.status, 'ok');
  assert.equal(outcome.transferId, 78);
});

test('a retry that passes the same idempotency key reuses it on the wire', async () => {
  const key = 'dep-710001-0001';
  await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00', idempotency_key: key });
  await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00', idempotency_key: key });
  assert.equal(bodyOf(0).idempotency_key, key);
  assert.equal(bodyOf(1).idempotency_key, key);
});

test('without a key, each new operation gets a new key', async () => {
  await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' });
  await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' });
  assert.notEqual(bodyOf(0).idempotency_key, bodyOf(1).idempotency_key);
});

test('the outcome reports the key that was sent so the caller can reuse it', async () => {
  const outcome = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' });
  assert.equal(outcome.idempotencyKey, bodyOf().idempotency_key);
});

test('a definite refusal (4xx other than pending idempotency codes) is classified as a refusal', async () => {
  respondWith(400, { code: 'INSUFFICIENT_FUNDS', error: 'no' });
  const refused = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(isDefiniteManagerTransactionRefusal(refused), true);
});

test('a transfer REVERSED (409) is a definite refusal that keeps its fields, never a success', async () => {
  respondWith(409, {
    success: false,
    code: 'TRANSFER_REVERSED',
    status: 'REVERSED',
    transfer_id: 77,
    out_leg: 'applied',
    in_leg: 'refused',
    in_leg_code: 'ACCOUNT_DISABLED',
    reversal: 'applied',
    from: { login: FAKE_LOGIN, balance_after: '10000.00' },
    error: 'Transfer refused by the receiving account (ACCOUNT_DISABLED).',
  });
  const error = await submitManagerTransaction('transfer', {
    from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '5.00',
  }).catch((e) => e);
  assert.equal(error.code, 'TRANSFER_REVERSED');
  assert.equal(error.httpStatus, 409);
  assert.equal(error.body.in_leg_code, 'ACCOUNT_DISABLED');
  assert.equal(error.body.from.login, FAKE_LOGIN);
  assert.equal(isDefiniteManagerTransactionRefusal(error), true);
});

test('a REVERSED body on a 2xx response is still a refusal, never ok', async () => {
  respondWith(200, { status: 'REVERSED', code: 'TRANSFER_REVERSED', in_leg_code: 'ACCOUNT_DISABLED', error: 'refused' });
  const error = await submitManagerTransaction('transfer', {
    from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '5.00',
  }).catch((e) => e);
  assert.equal(error.code, 'TRANSFER_REVERSED');
  assert.equal(isDefiniteManagerTransactionRefusal(error), true);
});

test('a 202 transfer keeps reversal none or pending and stays unresolved, never ok', async () => {
  for (const reversal of ['none', 'pending']) {
    respondWith(202, {
      success: false, code: 'TRANSFER_UNRESOLVED', status: 'UNRESOLVED', transfer_id: 77,
      out_leg: 'applied', in_leg: 'pending', in_leg_code: null, reversal, retry_with_same_key: true,
    });
    const outcome = await submitManagerTransaction('transfer', {
      from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '250.00', idempotency_key: 'xfer-710001-0001',
    });
    assert.equal(outcome.status, 'unresolved');
    assert.equal(outcome.reversal, reversal);
    assert.equal(outcome.idempotencyKey, 'xfer-710001-0001');
    assert.equal(bodyOf(calls.length - 1).idempotency_key, 'xfer-710001-0001');
  }
});

test('an unrecognised status fails with the raw code, on a 202 and on a 2xx', async () => {
  respondWith(202, { status: 'WEIRD_STATE', code: 'WEIRD_STATE' });
  const pending = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(pending.unrecognized, true);
  assert.equal(pending.code, 'WEIRD_STATE');
  assert.equal(isDefiniteManagerTransactionRefusal(pending), false);

  respondWith(200, { success: true, status: 'PARTIAL' });
  const ok = await submitManagerTransaction('transfer', {
    from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '1.00',
  }).catch((e) => e);
  assert.equal(ok.unrecognized, true);
  assert.equal(ok.code, 'PARTIAL');
});

test('a withdrawal with the margin-check skip sends the flag and reason, and a negative balance_after is kept exact', async () => {
  const reason = 'Owner-approved withdrawal below zero, ticket OPS-124';
  respondWith(200, { success: true, skip_margin_check: true, balance_after: '-500.00' });
  const outcome = await submitManagerTransaction('withdraw', {
    login: FAKE_LOGIN, amount: '1500.00', skip_margin_check: true, skip_margin_reason: reason,
  });
  assert.equal(outcome.status, 'ok');
  assert.equal(outcome.body.balance_after, '-500.00');
  assert.equal(bodyOf().skip_margin_check, true);
  assert.equal(bodyOf().skip_margin_reason, reason);
});

test('the margin-check skip is refused on any route but withdraw, and without a reason', async () => {
  for (const type of ['deposit', 'credit', 'transfer']) {
    const payload = type === 'transfer'
      ? { from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '1.00' }
      : { login: FAKE_LOGIN, amount: '1.00' };
    await assert.rejects(() => submitManagerTransaction(type, { ...payload, skip_margin_check: true, skip_margin_reason: 'Owner-approved reason' }), TypeError);
  }
  await assert.rejects(() => submitManagerTransaction('withdraw', { login: FAKE_LOGIN, amount: '1.00', skip_margin_check: true }), TypeError);
  await assert.rejects(() => submitManagerTransaction('withdraw', {
    login: FAKE_LOGIN, amount: '1.00', skip_margin_check: true, skip_margin_reason: 'short',
  }), TypeError);
  assert.equal(calls.length, 0);
});

test('a skip refusal (403 SKIP_MARGIN_NOT_PERMITTED) keeps its code and is a definite refusal', async () => {
  respondWith(403, { success: false, code: 'SKIP_MARGIN_NOT_PERMITTED', error: 'Skip not permitted' });
  const error = await submitManagerTransaction('withdraw', {
    login: FAKE_LOGIN, amount: '1.00', skip_margin_check: true, skip_margin_reason: 'Owner-approved reason',
  }).catch((e) => e);
  assert.equal(error.code, 'SKIP_MARGIN_NOT_PERMITTED');
  assert.equal(error.httpStatus, 403);
  assert.equal(isDefiniteManagerTransactionRefusal(error), true);
});

test('IN_PROGRESS, 5xx, 202, and network failures are not definite refusals', async () => {
  respondWith(409, { code: 'IN_PROGRESS', error: 'busy' });
  const busy = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(isDefiniteManagerTransactionRefusal(busy), false);

  respondWith(503, { code: 'OWNERSHIP_CHECK_UNAVAILABLE', error: 'down' });
  const unavailable = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(isDefiniteManagerTransactionRefusal(unavailable), false);

  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const network = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(isDefiniteManagerTransactionRefusal(network), false);

  assert.equal(isDefiniteManagerTransactionRefusal(new Error('plain')), false);
});

const respondWithHeaders = (status, body, headers) => {
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
  };
};

test('the skip reason is refused above 500 characters in the API layer, before any request', async () => {
  await assert.rejects(() => submitManagerTransaction('withdraw', {
    login: FAKE_LOGIN, amount: '1.00', skip_margin_check: true, skip_margin_reason: 'a'.repeat(501),
  }), /10 to 500 characters/);
  assert.equal(calls.length, 0);
});

test('the skip reason is trimmed before it is sent, and exactly 500 characters is accepted', async () => {
  const reason = 'b'.repeat(500);
  await submitManagerTransaction('withdraw', {
    login: FAKE_LOGIN, amount: '1.00', skip_margin_check: true, skip_margin_reason: `  ${reason}  `,
  });
  assert.equal(bodyOf().skip_margin_reason, reason);
  assert.equal(bodyOf().skip_margin_reason.length, 500);
});

test('a 4xx with a code the UI does not know is unrecognised, keeps the raw code and status, and is not definite', async () => {
  respondWith(400, { code: 'SOMETHING_NEW', error: 'raw server text' });
  const error = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(error.unrecognized, true);
  assert.equal(error.code, 'SOMETHING_NEW');
  assert.equal(error.httpStatus, 400);
  assert.equal(error.message, 'raw server text');
  assert.equal(isDefiniteManagerTransactionRefusal(error), false);
});

test('a 400 with an unknown status value is unrecognised with the raw status, not a plain refusal', async () => {
  respondWith(400, { status: 'WEIRD_STATE', error: 'odd' });
  const error = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(error.unrecognized, true);
  assert.equal(error.code, 'WEIRD_STATE');
  assert.equal(error.httpStatus, 400);
  assert.equal(isDefiniteManagerTransactionRefusal(error), false);
});

test('a 4xx without a code (validation detail) is not a definite refusal, so the key is kept', async () => {
  respondWith(422, { detail: [{ msg: 'Amount is too precise' }] });
  const error = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(error.message, 'Amount is too precise');
  assert.equal(error.unrecognized, true);
  assert.equal(error.httpStatus, 422);
  assert.equal(isDefiniteManagerTransactionRefusal(error), false);
});

test('H2/M1 exact codes: Done (KEY_ALREADY_APPLIED / IDEMPOTENCY_KEY_ALREADY_APPLIED) returns status ok with replayed: true', async () => {
  for (const code of ['IDEMPOTENCY_KEY_ALREADY_APPLIED', 'KEY_ALREADY_APPLIED']) {
    assert.equal(ALREADY_APPLIED_IDEMPOTENCY_CODES.has(code), true);
    respondWith(409, { success: false, code, message: 'Already applied', balance_after: '1050.00' });
    const outcome = await submitManagerTransaction('deposit', {
      login: FAKE_LOGIN,
      amount: '10.00',
      idempotency_key: `key-done-${code}`,
    });
    assert.equal(outcome.status, 'ok');
    assert.equal(outcome.replayed, true);
    assert.equal(outcome.code, code);
    assert.equal(outcome.idempotencyKey, `key-done-${code}`);
    assert.equal(outcome.body.balance_after, '1050.00');
  }
});

test('H2/M1 exact codes: Keep key, stay pending (IN_FLIGHT, OUTCOME_UNKNOWN, STORE_UNAVAILABLE, UNAVAILABLE, UNVERIFIED)', async () => {
  const pendingCodes = [
    ['IDEMPOTENCY_IN_FLIGHT', 409],
    ['IN_FLIGHT', 409],
    ['IN_PROGRESS', 409],
    ['IDEMPOTENCY_OUTCOME_UNKNOWN', 502],
    ['OUTCOME_UNKNOWN', 502],
    ['IDEMPOTENCY_STORE_UNAVAILABLE', 503],
    ['STORE_UNAVAILABLE', 503],
    ['IDEMPOTENCY_UNAVAILABLE', 503],
    ['UNAVAILABLE', 503],
    ['IDEMPOTENCY_UNVERIFIED', 503],
    ['UNVERIFIED', 503],
  ];
  for (const [code, status] of pendingCodes) {
    assert.equal(PENDING_IDEMPOTENCY_CODES.has(code), true, code);
    respondWith(status, { success: false, code, error: `Server reported ${code}` });
    const error = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
    assert.equal(error instanceof ManagerTransactionError, true, code);
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, status);
    assert.equal(error.definite, false, `${code} must not be definite`);
    assert.equal(error.unrecognized, false, `${code} must not be unrecognized`);
    assert.equal(isDefiniteManagerTransactionRefusal(error), false, code);
  }
});

test('H2/M1 exact codes: Definite refusal (KEY_INVALID, INVALID_INPUT, FORBIDDEN, INSUFFICIENT_MARGIN, ACCOUNT_ENGINE_OWNED); the key-conflict codes are NOT definite (round 7)', async () => {
  const refusalCodes = [
    ['IDEMPOTENCY_KEY_INVALID', 400],
    ['KEY_INVALID', 400],
    ['INVALID_INPUT', 400],
    ['FORBIDDEN', 403],
    ['INSUFFICIENT_MARGIN', 409],
    ['ACCOUNT_ENGINE_OWNED', 409],
  ];
  for (const [code, status] of refusalCodes) {
    assert.equal(DEFINITE_REFUSAL_CODES.has(code), true, code);
    respondWith(status, { success: false, code, error: `Refused: ${code}` });
    const error = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, status);
    assert.equal(error.unrecognized, false, code);
    assert.equal(error.definite, true, code);
    assert.equal(isDefiniteManagerTransactionRefusal(error), true, code);
  }
});

test('M1 + round 7 key-hold codes (KEY_REUSED, MISMATCH, KEY_REQUIRED, KEY_CONFLICT, IDEMPOTENCY_CONFLICT): never a definite refusal, the outcome is unknown and the key is kept', async () => {
  const holdCodes = [
    ['IDEMPOTENCY_KEY_REUSED', 422],
    ['KEY_REUSED', 422],
    ['IDEMPOTENCY_MISMATCH', 409],
    ['MISMATCH', 409],
    ['IDEMPOTENCY_KEY_REQUIRED', 400],
    ['KEY_REQUIRED', 400],
    ['IDEMPOTENCY_KEY_CONFLICT', 409],
    ['KEY_CONFLICT', 409],
    ['IDEMPOTENCY_CONFLICT', 409],
  ];
  for (const [code, status] of holdCodes) {
    assert.equal(KEY_HOLD_IDEMPOTENCY_CODES.has(code), true, code);
    assert.equal(DEFINITE_REFUSAL_CODES.has(code), false, `${code} is not definite`);
    respondWith(status, { success: false, code, error: `Held: ${code}` });
    const error = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, status);
    assert.equal(error.definite, false, code);
    assert.equal(error.unrecognized, false, code);
    assert.equal(isDefiniteManagerTransactionRefusal(error), false, code);
  }
});

test('IN_PROGRESS is an unknown outcome, and a 5xx with an unknown status is unrecognised with its raw status', async () => {
  respondWith(409, { code: 'IN_PROGRESS', error: 'busy' });
  const busy = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(busy.unrecognized, false);
  assert.equal(isDefiniteManagerTransactionRefusal(busy), false);

  respondWith(503, { status: 'WEIRD', code: 'X1', error: 'down' });
  const weird = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(weird.unrecognized, true);
  assert.equal(weird.code, 'X1');
  assert.equal(weird.httpStatus, 503);
  assert.equal(isDefiniteManagerTransactionRefusal(weird), false);

  respondWith(503, { code: 'OWNERSHIP_CHECK_UNAVAILABLE', error: 'down' });
  const plain = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '1.00' }).catch((e) => e);
  assert.equal(plain.unrecognized, false);
  assert.equal(isDefiniteManagerTransactionRefusal(plain), false);
});

test('a 200 answered from the idempotency cache is ok and flagged replayed (X-Idempotency-Status: cached or body.replayed: true)', async () => {
  respondWithHeaders(200, { success: true, balance_after: '1000.00' }, { 'x-idempotency-status': 'cached' });
  const outcome = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00', idempotency_key: 'dep-710001-R1' });
  assert.equal(outcome.status, 'ok');
  assert.equal(outcome.replayed, true);
  assert.equal(outcome.idempotencyKey, 'dep-710001-R1');
  assert.equal(bodyOf().idempotency_key, 'dep-710001-R1');

  respondWith(200, { success: true, replayed: true, balance_after: '1000.00' });
  const bodyReplayed = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00', idempotency_key: 'dep-710001-R2' });
  assert.equal(bodyReplayed.status, 'ok');
  assert.equal(bodyReplayed.replayed, true);
});

test('a new 200 is not flagged replayed, with header new or with no header', async () => {
  respondWithHeaders(200, { success: true }, { 'x-idempotency-status': 'new' });
  assert.equal((await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' })).replayed, false);
  respondWith(200, { success: true });
  assert.equal((await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' })).replayed, false);
});

test('money in a response keeps its JSON type: a number on existing routes, a string on new routes', async () => {
  respondWith(200, { success: true, balance_after: 1234.5 });
  const numeric = await submitManagerTransaction('deposit', { login: FAKE_LOGIN, amount: '10.00' });
  assert.equal(numeric.body.balance_after, 1234.5);

  respondWith(200, { success: true, balance_after: '-500.00' });
  const text = await submitManagerTransaction('withdraw', { login: FAKE_LOGIN, amount: '10.00' });
  assert.equal(text.body.balance_after, '-500.00');
});

test('M1: a 200 with an empty body is an unknown outcome, never ok, and keeps the key', async () => {
  respondWith(200, '');
  const error = await submitManagerTransaction('deposit', {
    login: FAKE_LOGIN, amount: '10.00', idempotency_key: 'dep-710001-0100',
  }).catch((e) => e);
  assert.equal(error instanceof ManagerTransactionError, true);
  assert.equal(error.definite, false);
  assert.equal(error.unrecognized, false);
  assert.equal(error.httpStatus, 200);
  assert.equal(isDefiniteManagerTransactionRefusal(error), false);
  assert.equal(bodyOf(0).idempotency_key, 'dep-710001-0100');
});

test('M1: a 200 HTML page (a proxy or login page) is an unknown outcome, never ok', async () => {
  respondWithHeaders(200, '<!doctype html><html><body>Sign in</body></html>', { 'content-type': 'text/html' });
  const error = await submitManagerTransaction('withdraw', { login: FAKE_LOGIN, amount: '10.00' }).catch((e) => e);
  assert.equal(error instanceof ManagerTransactionError, true);
  assert.equal(error.definite, false);
  assert.equal(error.httpStatus, 200);
  assert.doesNotMatch(error.message, /Sign in/);
});

test('M1: a 200 JSON body without success true is an unknown outcome', async () => {
  respondWith(200, { status: 'COMPLETED', balance_after: '10.00' });
  const error = await submitManagerTransaction('credit', { login: FAKE_LOGIN, amount: '10.00' }).catch((e) => e);
  assert.equal(error instanceof ManagerTransactionError, true);
  assert.equal(error.definite, false);
  assert.equal(error.httpStatus, 200);
});

test('contract v6: transfer COMPLETED, REVERSED, and UNRESOLVED accept optional route {from, to} without requiring it', async () => {
  respondWith(200, {
    success: true,
    status: 'COMPLETED',
    transfer_id: 91,
    balance_after: 9750,
    route: { from: 'engine', to: 'legacy' },
  });
  const completedWithRoute = await submitManagerTransaction('transfer', {
    from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '250.00',
  });
  assert.equal(completedWithRoute.status, 'ok');
  assert.deepEqual(completedWithRoute.route, { from: 'engine', to: 'legacy' });

  respondWith(200, {
    success: true,
    status: 'COMPLETED',
    transfer_id: 92,
    balance_after: 9500,
  });
  const completedWithoutRoute = await submitManagerTransaction('transfer', {
    from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '250.00',
  });
  assert.equal(completedWithoutRoute.status, 'ok');
  assert.equal(completedWithoutRoute.route, null);

  respondWith(202, {
    success: false,
    code: 'TRANSFER_UNRESOLVED',
    status: 'UNRESOLVED',
    transfer_id: 93,
    reversal: 'none',
    route: { from: 'legacy', to: 'engine' },
  });
  const unresolvedWithRoute = await submitManagerTransaction('transfer', {
    from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '250.00',
  });
  assert.equal(unresolvedWithRoute.status, 'unresolved');
  assert.deepEqual(unresolvedWithRoute.route, { from: 'legacy', to: 'engine' });

  respondWith(409, {
    success: false,
    code: 'TRANSFER_REVERSED',
    status: 'REVERSED',
    transfer_id: 94,
    in_leg_code: 'ACCOUNT_DISABLED',
    reversal: 'applied',
    route: { from: 'engine', to: 'legacy' },
    error: 'Transfer refused by the receiving account.',
  });
  const reversedWithRoute = await submitManagerTransaction('transfer', {
    from_login: FAKE_LOGIN, to_login: FAKE_DESTINATION, amount: '250.00',
  }).catch((e) => e);
  assert.equal(reversedWithRoute instanceof ManagerTransactionError, true);
  assert.equal(reversedWithRoute.definite, true);
  assert.deepEqual(reversedWithRoute.route, { from: 'engine', to: 'legacy' });
});



// ---- R8b: the balance-history read (API contract 6.9): from, limit, cursor, next_cursor. Fake fetch only. ----

const HISTORY_ROW = { id: 1, time: 1762000100, operation_kind: 'deposit', direction: 'in', amount: '100', balance_after: '100', comment: 'Client deposit', kind_source: 'projection' };

test('R8b balance history: GET the account route with limit 100 by default, and return the rows and next_cursor', async () => {
  respondWith(200, { login: 710001, broker_id: 'broker-a', items: [HISTORY_ROW], next_cursor: 'MTc2MTk5MDAwMDo5MDEw' });
  const result = await fetchManagerBalanceHistory(FAKE_LOGIN);
  assert.deepEqual(result, { items: [HISTORY_ROW], nextCursor: 'MTc2MTk5MDAwMDo5MDEw' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].url, /\/api\/v1\/manager\/accounts\/710001\/balance-history\?limit=100$/);
});

test('R8b balance history: from, limit and cursor are sent when given; a null next_cursor is null', async () => {
  respondWith(200, { items: [], next_cursor: null });
  const result = await fetchManagerBalanceHistory(FAKE_LOGIN, { limit: 100, from: 1699999700, cursor: 'MTc2' });
  assert.deepEqual(result, { items: [], nextCursor: null });
  assert.match(calls[0].url, /\/balance-history\?limit=100&from=1699999700&cursor=MTc2$/);
});

test('R8b balance history: the limit is 1 to 500, anything else falls back to 100; a bad from is left out', async () => {
  respondWith(200, { items: [] });
  await fetchManagerBalanceHistory(FAKE_LOGIN, { limit: 50 });
  await fetchManagerBalanceHistory(FAKE_LOGIN, { limit: 9999 });
  await fetchManagerBalanceHistory(FAKE_LOGIN, { limit: 0 });
  await fetchManagerBalanceHistory(FAKE_LOGIN, { limit: 2.5 });
  await fetchManagerBalanceHistory(FAKE_LOGIN, { from: -1 });
  await fetchManagerBalanceHistory(FAKE_LOGIN, { from: 1.5 });
  await fetchManagerBalanceHistory(FAKE_LOGIN, { cursor: '' });
  assert.match(calls[0].url, /\?limit=50$/);
  assert.match(calls[1].url, /\?limit=100$/, 'above 500 falls back');
  assert.match(calls[2].url, /\?limit=100$/, 'zero falls back');
  assert.match(calls[3].url, /\?limit=100$/, 'a fraction falls back');
  assert.match(calls[4].url, /\?limit=100$/, 'a negative from is left out');
  assert.match(calls[5].url, /\?limit=100$/, 'a fractional from is left out');
  assert.match(calls[6].url, /\?limit=100$/, 'an empty cursor is left out');
});

test('R10 L4: the caller\'s abort signal reaches the balance-history request; without one the request carries no signal', async () => {
  respondWith(200, { items: [] });
  const controller = new AbortController();
  await fetchManagerBalanceHistory(FAKE_LOGIN, {}, { signal: controller.signal });
  assert.equal(calls[0].options.signal, controller.signal, 'the signal is passed to the request');
  await fetchManagerBalanceHistory(FAKE_LOGIN);
  assert.equal('signal' in calls[1].options, false, 'no signal when none is given');
});

test('R8b balance history: a 404, a 501 or a 5xx is a ManagerHistoryError with the HTTP status', async () => {
  for (const status of [404, 501, 503]) {
    respondWith(status, { success: false, code: 'NOT_FOUND', error: 'missing' });
    await assert.rejects(fetchManagerBalanceHistory(FAKE_LOGIN), (err) => {
      assert.ok(err instanceof ManagerHistoryError, `HTTP ${status}`);
      assert.equal(err.httpStatus, status);
      return true;
    });
  }
});

test('R8b balance history: a network failure rejects, and a bad body is a ManagerHistoryError', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(fetchManagerBalanceHistory(FAKE_LOGIN), TypeError);

  for (const body of ['<html>login</html>', '', 'null', '{}', '{"items":{}}', '{"items":"nope"}', '[]']) {
    respondWith(200, body);
    await assert.rejects(fetchManagerBalanceHistory(FAKE_LOGIN), (err) => {
      assert.ok(err instanceof ManagerHistoryError, `body ${JSON.stringify(body)}`);
      return true;
    });
  }
});

test('R8b balance history: an invalid login is refused before any request', async () => {
  await assert.rejects(fetchManagerBalanceHistory(''), TypeError);
  assert.equal(calls.length, 0);
});
