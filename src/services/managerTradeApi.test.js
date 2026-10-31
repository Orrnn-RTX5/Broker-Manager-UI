import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  closeManagerPosition,
  getManagerOrderStatus,
  normalizePendingOrderType,
  placeManagerOrder,
  placeManagerPendingOrder,
} from './managerTradeApi.js';
import { accountRestrictList, getDealerQueue } from './tradeApi.js';

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

test('retcode MT_RET_ERR_* payloads reject even with success:true and preserve code', async () => {
  for (const payload of [
    { success: true, retcode: 'MT_RET_ERR_PARAMS', message: 'client_order_id is required exactly once for an engine command' },
    { success: true, retcode: 'MT_RET_ERR_TRADE', message: 'Request rejected' },
    { success: true, code: 'MT_RET_ERR_TRADE', message: 'Request rejected' },
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
    await assert.rejects(
      () => placeManagerOrder({ login: 200001, symbol: 'EURUSD', operation: 'buy', lots: 0.1 }),
      (error) => {
        assert.equal(error.message, payload.message);
        assert.equal(error.code, payload.retcode ?? payload.code);
        return true;
      },
      `must reject ${JSON.stringify(payload)}`,
    );
  }
});

test('closeManagerPosition rejects retcode failures and preserves the backend code', async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ success: true, retcode: 'MT_RET_ERR_TRADE', message: 'Request rejected' }),
    { status: 200 },
  );
  await assert.rejects(
    () => closeManagerPosition(19916),
    (error) => {
      assert.equal(error.message, 'Request rejected');
      assert.equal(error.code, 'MT_RET_ERR_TRADE');
      assert.equal(error.status, 200);
      return true;
    },
  );
});

test('manager trade errors render nested error objects without [object Object]', async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } }),
    { status: 200 },
  );
  await assert.rejects(
    () => closeManagerPosition(19916),
    (error) => {
      assert.equal(error.message, 'Invalid price');
      assert.equal(error.code, 'MT_RET_ERR_PARAMS');
      return true;
    },
  );
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } }),
    { status: 500, statusText: 'Server Error' },
  );
  await assert.rejects(
    () => closeManagerPosition(19916),
    (error) => {
      assert.equal(error.message, 'Invalid price');
      assert.equal(error.code, 'MT_RET_ERR_PARAMS');
      assert.equal(error.status, 500);
      return true;
    },
  );
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { code: 'MT_RET_ERR_TRADE' } }),
    { status: 200 },
  );
  await assert.rejects(
    () => closeManagerPosition(19916),
    (error) => {
      assert.equal(error.message, 'Failed to close position');
      assert.equal(error.code, 'MT_RET_ERR_TRADE');
      assert.notEqual(error.message, '[object Object]');
      return true;
    },
  );
});

test('read path throws on application-level failures instead of returning a misleading empty list', async () => {
  for (const payload of [
    { success: false, message: 'Rejected by dealer' },
    { ok: false, message: 'Order reject failed' },
    { success: true, retcode: 'MT_RET_ERR_TRADE', message: 'Request rejected' },
    { success: true, code: 'MT_RET_ERR_TRADE', message: 'Request rejected' },
    { error: 'Market is closed.' },
    { error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } },
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
    await assert.rejects(
      () => getDealerQueue(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.notDeepEqual(error, []);
        return true;
      },
      `getDealerQueue must throw for ${JSON.stringify(payload)}`,
    );
    globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
    await assert.rejects(
      () => accountRestrictList(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.notDeepEqual(error, []);
        return true;
      },
      `accountRestrictList must throw for ${JSON.stringify(payload)}`,
    );
  }
});

test('read path preserves retcode and nested error message+code instead of silent []', async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ success: true, retcode: 'MT_RET_ERR_PARAMS', message: 'client_order_id is required exactly once' }),
    { status: 200 },
  );
  await assert.rejects(
    () => getDealerQueue(),
    (error) => {
      assert.equal(error.message, 'client_order_id is required exactly once');
      assert.equal(error.code, 'MT_RET_ERR_PARAMS');
      return true;
    },
  );
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { message: 'Invalid price', code: 'MT_RET_ERR_PARAMS' } }),
    { status: 200 },
  );
  await assert.rejects(
    () => getDealerQueue(),
    (error) => {
      assert.equal(error.message, 'Invalid price');
      assert.equal(error.code, 'MT_RET_ERR_PARAMS');
      assert.notEqual(error.message, '[object Object]');
      return true;
    },
  );
});

test('read path still returns records for genuine successes', async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ answer: [{ ticket: 101, login: 200001 }] }),
    { status: 200 },
  );
  const queue = await getDealerQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].orderTicket, 101);
});

test('normalizePendingOrderType normalizes supported pending order types and rejects invalid types', () => {
  assert.equal(normalizePendingOrderType('Buy Limit'), 'buy_limit');
  assert.equal(normalizePendingOrderType('sell_limit'), 'sell_limit');
  assert.equal(normalizePendingOrderType('BUY_STOP'), 'buy_stop');
  assert.equal(normalizePendingOrderType('sell-stop'), 'sell_stop');
  assert.equal(normalizePendingOrderType('buy_stop_limit'), 'buy_stop_limit');
  assert.equal(normalizePendingOrderType('sell_stop_limit'), 'sell_stop_limit');
  assert.equal(normalizePendingOrderType('buy'), '');
  assert.equal(normalizePendingOrderType('market'), '');
  assert.equal(normalizePendingOrderType(''), '');
  assert.equal(normalizePendingOrderType(null), '');
});

test('placeManagerPendingOrder falls back to POST /OrderSend when WebSocket is undefined', async () => {
  const originalWebSocket = globalThis.WebSocket;
  delete globalThis.WebSocket;
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ retcode: 'MT_RET_REQUEST_DONE', order: 77701 }), { status: 200 });
    };

    const result = await placeManagerPendingOrder({
      login: 200001,
      symbol: 'eurusd',
      operation: 'Buy Limit',
      lots: 0.25,
      price: 1.0825,
      stoploss: 1.079,
      takeprofit: 1.09,
      comment: 'manager pending test',
    });

    assert.equal(result.order, 77701);
    assert.equal(result.ticket, 77701);
    assert.equal(calls.length, 1);
    const parsedUrl = new URL(calls[0].url);
    assert.match(parsedUrl.pathname, /\/OrderSend$/);
    assert.equal(parsedUrl.search, '');
    assert.equal(calls[0].options.method, 'POST');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.login, 200001);
    assert.equal(body.symbol, 'EURUSD');
    assert.equal(body.operation, 'BUY_LIMIT');
    assert.equal(body.lots, 0.25);
    assert.equal(body.price, 1.0825);
    assert.equal(body.stoploss, 1.079);
    assert.equal(body.takeprofit, 1.09);
    assert.equal(body.comment, 'manager pending test');
  } finally {
    if (originalWebSocket !== undefined) {
      globalThis.WebSocket = originalWebSocket;
    }
  }
});

test('placeManagerPendingOrder validates input parameters before sending requests', async () => {
  await assert.rejects(
    () => placeManagerPendingOrder({ login: 0, symbol: 'EURUSD', operation: 'buy_limit', lots: 0.1, price: 1.08 }),
    /Account login must be a positive integer/,
  );
  await assert.rejects(
    () => placeManagerPendingOrder({ login: 200001, symbol: '   ', operation: 'buy_limit', lots: 0.1, price: 1.08 }),
    /Select a symbol before placing a pending order/,
  );
  await assert.rejects(
    () => placeManagerPendingOrder({ login: 200001, symbol: 'EURUSD', operation: 'buy', lots: 0.1, price: 1.08 }),
    /Select a valid pending order type/,
  );
  await assert.rejects(
    () => placeManagerPendingOrder({ login: 200001, symbol: 'EURUSD', operation: 'buy_limit', lots: 0, price: 1.08 }),
    /Volume must be greater than 0 and no more than 1,000 lots/,
  );
  await assert.rejects(
    () => placeManagerPendingOrder({ login: 200001, symbol: 'EURUSD', operation: 'buy_limit', lots: 0.1, price: 0 }),
    /Trigger price must be greater than 0 for pending orders/,
  );
  await assert.rejects(
    () => placeManagerPendingOrder({ login: 200001, symbol: 'EURUSD', operation: 'buy_stop_limit', lots: 0.1, price: 1.08 }),
    /Stop-limit price must be greater than 0 for stop-limit orders/,
  );
  assert.equal(calls.length, 0);
});
