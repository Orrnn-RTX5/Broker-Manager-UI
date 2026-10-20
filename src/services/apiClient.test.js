import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import apiClient, { isErrorPayload, isSuccessPayload, throwIfErrorPayload } from './apiClient.js';

// The client boundary must never let an application-level rejection read as
// success: HTTP 200 with { success: false }, { ok: false } or an `error`
// member throws, while every other payload (including grid lists) passes
// through untouched with existing error contracts preserved.

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(String(key)) ? values.get(String(key)) : null),
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
  };
};

const originalConsoleError = console.error;
const originalFetch = globalThis.fetch;

const jsonResponse = (payload, { status = 200, statusText = 'OK' } = {}) => (
  new Response(JSON.stringify(payload), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  })
);

beforeEach(() => {
  console.error = () => {};
  const sessionStorage = createStorage();
  const localStorage = createStorage();
  // Generic authenticated session (tenant-agnostic placeholder values) so
  // request-level tests reach the fetch boundary without refreshing.
  const future = new Date(Date.now() + 3600e3).toISOString();
  sessionStorage.setItem('auth', JSON.stringify({
    token: 'sui-m9-test-token',
    refresh_token: 'sui-m9-test-refresh',
    tokenExpiresAt: future,
  }));
  localStorage.setItem('authToken', 'sui-m9-test-token');
  localStorage.setItem('refreshToken', 'sui-m9-test-refresh');
  localStorage.setItem('tokenExpiresAt', future);
  globalThis.window = {
    sessionStorage,
    localStorage,
    location: { origin: 'http://localhost' },
    dispatchEvent: () => {},
  };
});

afterEach(() => {
  console.error = originalConsoleError;
  if (originalFetch === undefined) delete globalThis.fetch;
  else globalThis.fetch = originalFetch;
  delete globalThis.window;
});

test('production-shaped success payloads classify as success', () => {
  for (const payload of [
    { success: true },
    { success: true, message: 'Position flipped' },
    { success: true, retcode: 'MT_RET_OK' },
    { ok: true },
    { answer: [{ ticket: 101 }] },
    { data: { ticket: 101 } },
    [{ ticket: 101 }, { ticket: 102 }],
    { ticket: 101 },
    {},
    'text body',
    42,
    null,
    undefined,
  ]) {
    assert.equal(isErrorPayload(payload), false, `must not flag ${JSON.stringify(payload)}`);
    assert.equal(isSuccessPayload(payload), true, `must accept ${JSON.stringify(payload)}`);
  }
});

test('production-shaped failure payloads classify as errors', () => {
  for (const payload of [
    { success: false },
    { success: false, message: 'Rejected by dealer' },
    { ok: false },
    { ok: false, message: 'Order reject failed' },
    { error: 'Market is closed.' },
    { error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } },
    { success: true, error: 'Rejected anyway' },
    false,
  ]) {
    assert.equal(isErrorPayload(payload), true, `must flag ${JSON.stringify(payload)}`);
    assert.equal(isSuccessPayload(payload), false, `must reject ${JSON.stringify(payload)}`);
  }
});

test('throwIfErrorPayload passes successes through by reference', () => {
  const payload = { success: true, ticket: 101 };
  assert.equal(throwIfErrorPayload(payload, { status: 200 }), payload);
});

test('throwIfErrorPayload preserves message, status and code on failures', () => {
  for (const [payload, message, code] of [
    [{ success: false, message: 'Rejected by dealer' }, 'Rejected by dealer', undefined],
    [{ ok: false, message: 'Order reject failed' }, 'Order reject failed', undefined],
    [{ error: 'Market is closed.' }, 'Market is closed.', undefined],
    [
      { error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } },
      'Invalid price',
      'MT_RET_ERR_PARAMS',
    ],
    [{ success: false, code: 'MT_RET_ERR_TRADE' }, 'Request failed (HTTP 200)', 'MT_RET_ERR_TRADE'],
    [{ ok: false }, 'Request failed (HTTP 200)', undefined],
  ]) {
    assert.throws(
      () => throwIfErrorPayload(payload, { status: 200, statusText: 'OK' }),
      (err) => {
        assert.equal(err.message, message);
        assert.equal(err.status, 200);
        assert.equal(err.statusText, 'OK');
        assert.equal(err.code, code);
        return true;
      },
      `must throw for ${JSON.stringify(payload)}`,
    );
  }
});

test('handleResponse returns HTTP 200 successes unchanged', async () => {
  const payload = { success: true, ticket: 101 };
  assert.deepEqual(await apiClient.handleResponse(jsonResponse(payload)), payload);
  const rows = [{ ticket: 101 }];
  assert.deepEqual(await apiClient.handleResponse(jsonResponse(rows)), rows);
});

test('handleResponse throws on HTTP 200 application-level failures', async () => {
  for (const [payload, message] of [
    [{ success: false, message: 'Rejected by dealer' }, 'Rejected by dealer'],
    [{ ok: false, message: 'Force close failed' }, 'Force close failed'],
    [{ error: 'Market is closed.' }, 'Market is closed.'],
    [
      { error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } },
      'Invalid price',
    ],
  ]) {
    await assert.rejects(
      apiClient.handleResponse(jsonResponse(payload)),
      (err) => {
        assert.equal(err.message, message);
        assert.equal(err.status, 200);
        return true;
      },
      `must reject ${JSON.stringify(payload)}`,
    );
  }
});

test('handleResponse preserves the existing HTTP error contract', async () => {
  await assert.rejects(
    apiClient.handleResponse(jsonResponse({ error: 'Boom' }, { status: 500, statusText: 'Server Error' })),
    (err) => {
      assert.equal(err.message, 'Boom');
      assert.equal(err.status, 500);
      assert.equal(err.statusText, 'Server Error');
      return true;
    },
  );
  await assert.rejects(
    apiClient.handleResponse(jsonResponse({ success: false, message: 'Bad' }, { status: 400, statusText: 'Bad Request' })),
    (err) => {
      assert.equal(err.message, 'Bad');
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test('request resolves 200 successes and throws 200 application-level failures', async () => {
  globalThis.fetch = async () => jsonResponse({ success: true, ticket: 101 });
  assert.deepEqual(await apiClient.post('/ext-api/PositionFlip?ticket=101', {}), {
    success: true,
    ticket: 101,
  });

  globalThis.fetch = async () => jsonResponse({ success: false, message: 'Rejected by dealer' });
  await assert.rejects(
    apiClient.post('/ext-api/PositionFlip?ticket=101', {}),
    (err) => {
      assert.equal(err.message, 'Rejected by dealer');
      assert.equal(err.status, 200);
      return true;
    },
  );
});

test('request propagates network failures unchanged', async () => {
  const networkError = new TypeError('fetch failed');
  globalThis.fetch = () => Promise.reject(networkError);
  await assert.rejects(
    apiClient.get('/ext-api/DealerQueueList'),
    (err) => {
      assert.equal(err, networkError);
      return true;
    },
  );
});

test('isErrorPayload flags nested error objects but ignores falsy error members', () => {
  for (const payload of [
    { error: { code: 'MT_RET_ERR_TRADE' } },
    { error: {} },
    { error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } },
    { error: { message: 'Invalid price', details: { price: 1.1 } } },
    { success: false, error: null },
  ]) {
    assert.equal(isErrorPayload(payload), true, `must flag ${JSON.stringify(payload)}`);
    assert.equal(isSuccessPayload(payload), false, `must reject ${JSON.stringify(payload)}`);
  }
  for (const payload of [
    { error: null },
    { error: undefined },
    { error: '' },
    { error: 0 },
    { error: false },
    { success: true, detail: 'Dealer detail' },
  ]) {
    assert.equal(isErrorPayload(payload), false, `must not flag ${JSON.stringify(payload)}`);
    assert.equal(isSuccessPayload(payload), true, `must accept ${JSON.stringify(payload)}`);
  }
});

test('explicit failure flags take precedence over success flags', () => {
  for (const payload of [
    { ok: true, success: false },
    { ok: true, success: false, message: 'Rejected by dealer' },
    { ok: false, success: true },
    { ok: false, success: true, message: 'Order reject failed' },
    { ok: true, error: 'Rejected anyway' },
    { success: true, error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } },
    { success: true, ok: true, error: { code: 'MT_RET_ERR_TRADE' } },
  ]) {
    assert.equal(isErrorPayload(payload), true, `must flag ${JSON.stringify(payload)}`);
    assert.equal(isSuccessPayload(payload), false, `must reject ${JSON.stringify(payload)}`);
  }
  assert.equal(isErrorPayload({ ok: true, success: true }), false);
  assert.equal(isSuccessPayload({ ok: true, success: true }), true);
});

test('throwIfErrorPayload resolves detail fallback and preserves the error shape', () => {
  assert.throws(
    () => throwIfErrorPayload({ success: false, detail: 'Dealer detail' }, { status: 200, statusText: 'OK' }),
    (err) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'Dealer detail');
      assert.equal(err.status, 200);
      assert.equal(err.statusText, 'OK');
      assert.equal(err.code, undefined);
      return true;
    },
  );
  assert.throws(
    () => throwIfErrorPayload(
      { success: false, message: 'Dealer message', detail: 'Dealer detail' },
      { status: 200, statusText: 'OK' },
    ),
    (err) => {
      assert.equal(err.message, 'Dealer message');
      assert.equal(err.status, 200);
      assert.equal(err.statusText, 'OK');
      return true;
    },
  );
  assert.throws(
    () => throwIfErrorPayload({ error: { code: 'MT_RET_ERR_PARAMS' } }, { status: 200, statusText: 'OK' }),
    (err) => {
      assert.equal(err.message, 'Request failed (HTTP 200)');
      assert.equal(err.status, 200);
      assert.equal(err.statusText, 'OK');
      assert.equal(err.code, 'MT_RET_ERR_PARAMS');
      return true;
    },
  );
  assert.throws(
    () => throwIfErrorPayload(false, { status: 200, statusText: 'OK' }),
    (err) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'Request failed (HTTP 200)');
      assert.equal(err.status, 200);
      return true;
    },
  );
});

test('throwIfErrorPayload prefers nested error code and defaults the message without a status', () => {
  assert.throws(
    () => throwIfErrorPayload(
      { error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' }, code: 'MT_RET_ERR_TRADE' },
      { status: 200, statusText: 'OK' },
    ),
    (err) => {
      assert.equal(err.message, 'Invalid price');
      assert.equal(err.code, 'MT_RET_ERR_PARAMS');
      assert.equal(err.status, 200);
      assert.equal(err.statusText, 'OK');
      return true;
    },
  );
  assert.throws(
    () => throwIfErrorPayload({ success: false }),
    (err) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'Request failed');
      assert.equal(err.status, undefined);
      assert.equal(err.statusText, undefined);
      assert.equal(err.code, undefined);
      return true;
    },
  );
});

test('handleResponse and request reject mixed success/error signals at 200', async () => {
  await assert.rejects(
    apiClient.handleResponse(jsonResponse({ ok: true, success: false, message: 'Rejected by dealer' })),
    (err) => {
      assert.equal(err.message, 'Rejected by dealer');
      assert.equal(err.status, 200);
      return true;
    },
  );
  await assert.rejects(
    apiClient.handleResponse(jsonResponse({
      success: true,
      error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' },
    })),
    (err) => {
      assert.equal(err.message, 'Invalid price');
      assert.equal(err.code, 'MT_RET_ERR_PARAMS');
      assert.equal(err.status, 200);
      return true;
    },
  );
  globalThis.fetch = async () => jsonResponse({ success: true, error: 'Rejected anyway' });
  await assert.rejects(
    apiClient.post('/ext-api/PositionFlip?ticket=101', {}),
    (err) => {
      assert.equal(err.message, 'Rejected anyway');
      assert.equal(err.status, 200);
      return true;
    },
  );
});
