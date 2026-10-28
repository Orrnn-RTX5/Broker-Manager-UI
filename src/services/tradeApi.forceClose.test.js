import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCloseRefusal, positionForceClose, positionForceCloseAll } from './tradeApi.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
  };
};

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

// A response whose body cannot be read: the status arrived, the body stream fails.
const unreadableBody = (status) => new Response(new ReadableStream({
  start(controller) { controller.error(new TypeError('body stream failed')); },
}), { status });

const GATEWAY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/;

// Exact user-facing texts. A text change is then a deliberate edit here.
const TEXT = {
  noAnswer: 'No answer from the server - the close may or may not have happened. Check the positions list, then retry (a retry within 2 minutes is safe).',
  unconfirmed: 'Trading service did not confirm the close - check the positions list, then retry within 2 minutes (safe).',
  market: 'The market is closed or its schedule is unavailable right now. Try again when the session opens. Nothing was closed.',
  quote: 'No fresh price for the symbol right now. Try again when prices update. Nothing was closed.',
  source: 'Price source mismatch for the symbol - try again shortly. Nothing was closed.',
  risk: 'Risk data is unavailable right now - retry in a minute. Nothing was closed.',
  engineClose: "This account's positions cannot be closed from the Manager right now (engine close unavailable). Nothing was closed. Ask support.",
  routing: 'The close route for this account could not be confirmed right now. Nothing was closed. Try again shortly.',
  fixRequired: 'The private execution service is not available for this close right now. Nothing was closed. Try again shortly.',
  scope: 'Account trading scope is unavailable right now. Nothing was closed.',
  config: 'Trading service is not configured. Ask support. Nothing was closed.',
  prepare: 'The close request could not be prepared. Nothing was closed.',
  permission: 'No permission to close positions. Ask an administrator. Nothing was closed.',
  broker: 'Session has no broker selected - sign out and sign in again. Nothing was closed.',
  session: 'Your session expired. Sign in again. Nothing was closed.',
  investor: 'Investor accounts cannot close positions. Nothing was closed.',
  invalid: 'Close All was rejected as invalid. Refresh and try again. Nothing was closed.',
  busy: 'Another Close All is already running for this account. Nothing new was started - wait, then check the positions list.',
  tooMany: 'Too many positions for one Close All. Close them individually or in smaller batches. Nothing was closed.',
  idempotency: 'This close matches an earlier request that may already have run - check the positions list before trying again.',
  unsupported: (code) => `Close All is not available for this account (${code}). Nothing was closed. Ask support.`,
  singleUnsupported: (code) => `This position cannot be closed from the Manager right now (${code}). Nothing was closed. Ask support.`,
  alreadyClosed: (ticket) => `Position #${ticket} is already closed or changed. Refresh the list.`,
  positionNotFound: (ticket) => `Position #${ticket} was not found or is already closed. Refresh the list. Nothing was closed.`,
  accountNotFound: (login) => `Account ${login} was not found. Refresh the list. Nothing was closed.`,
  mixed: 'Close All finished but some positions are still open - check the list and run Close All again.',
  finished: (login, count) => `Close All finished for login ${login} (${count} position(s) in the request). Refresh the list; run Close All again for any position opened since.`,
};

let calls;
let responder;
let realNow;

beforeEach(() => {
  calls = [];
  responder = () => json(200, { parent_id: 'p-0', state: 'completed_success', member_count: 0 });
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
    return responder(calls.length);
  };
  realNow = Date.now;
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.window;
  Date.now = realNow;
});

const lastBody = () => JSON.parse(calls.at(-1).options.body);
const clientIdOf = (index) => JSON.parse(calls[index].options.body).client_order_id;

// Puts Date.now on a controllable clock anchored at real time, so token checks still work.
const useClock = () => {
  const base = realNow();
  let offset = 0;
  Date.now = () => base + offset;
  return (ms) => { offset = ms; };
};

// ── Single position: market close through the gateway ──

test('positionForceClose posts a market close to the native order-close route with only a client_order_id', async () => {
  const result = await positionForceClose({ ticket: 19916 });

  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/manager/orders/19916/close');
  assert.equal(url.search, '');
  assert.equal(url.pathname.startsWith('/manager'), false);
  assert.doesNotMatch(url.pathname, /positions|force-close|PositionForceClose/i);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer manager-test-token');
  const body = lastBody();
  assert.deepEqual(Object.keys(body), ['client_order_id']);
  assert.match(body.client_order_id, GATEWAY_ID_PATTERN);
  assert.deepEqual(result, { success: true, reachedServer: true, message: 'Position #19916 closed at the market price.' });
});

test('positionForceClose URL-encodes the ticket and refuses a missing ticket before any request', async () => {
  await positionForceClose({ ticket: 'a/b' });
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/manager/orders/a%2Fb/close');

  await assert.rejects(() => positionForceClose({ ticket: '' }), /Position ticket is required/);
  assert.equal(calls.length, 1);
});

test('positionForceClose 202 is accepted, not final, and refreshes the list', async () => {
  responder = () => json(202, { status: 'accepted' });
  const result = await positionForceClose({ ticket: 77 });
  assert.equal(result.success, true);
  assert.equal(result.reachedServer, true);
  assert.equal(result.message, 'Close accepted - the list will update.');
});

test('positionForceClose network failure gives the no-answer message and still flags a refresh', async () => {
  responder = () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(
    () => positionForceClose({ ticket: 88 }),
    (error) => {
      assert.equal(error.message, TEXT.noAnswer);
      assert.equal(error.reachedServer, true);
      assert.ok(error.cause instanceof TypeError);
      assert.equal(error.actionable, true);
      return true;
    },
  );
});

test('positionForceClose keeps a session failure message as it is and does not claim a server answer', async () => {
  responder = () => { throw new Error('Session expired. Please log in again.'); };
  await assert.rejects(
    () => positionForceClose({ ticket: 89 }),
    (error) => {
      assert.equal(error.message, 'Session expired. Please log in again.');
      assert.equal(error.reachedServer, undefined);
      return true;
    },
  );
});

test('positionForceClose maps each refusal to its exact actionable message and flags a refresh', async () => {
  const ticket = 19916;
  const cases = [
    [403, { code: 'MT_RET_ERR_PERMISSIONS', message: 'no rights' }, TEXT.permission, 'MT_RET_ERR_PERMISSIONS'],
    [403, { error: 'BROKER_REQUIRED', message: 'no broker' }, TEXT.broker, 'BROKER_REQUIRED'],
    [403, { error: 'INVESTOR_READ_ONLY', message: 'investor' }, TEXT.investor, 'INVESTOR_READ_ONLY'],
    [404, { message: 'Position not found', code: 'MT_RET_ERR_NOTFOUND' }, TEXT.positionNotFound(ticket), 'MT_RET_ERR_NOTFOUND'],
    [409, { error: 'POSITION_ALREADY_CLOSED', message: 'closed' }, TEXT.alreadyClosed(ticket), 'POSITION_ALREADY_CLOSED'],
    [409, { code: 'ACCOUNT_ENGINE_OWNED', message: 'engine owned' }, 'engine owned (HTTP 409).', 'ACCOUNT_ENGINE_OWNED'],
    // Definitive market, quote and source refusals (M2: each has its own text).
    [409, { error: 'MARKET_CLOSED', message: 'closed' }, TEXT.market, 'MARKET_CLOSED'],
    [503, { error: 'MARKET_CLOSED', message: 'closed' }, TEXT.market, 'MARKET_CLOSED'],
    [503, { error: 'MARKET_SCHEDULE_UNAVAILABLE', message: 'schedule' }, TEXT.market, 'MARKET_SCHEDULE_UNAVAILABLE'],
    [503, { error: 'STALE_QUOTE', message: 'stale' }, TEXT.quote, 'STALE_QUOTE'],
    [503, { error: 'NO_FRESH_QUOTE', message: 'none' }, TEXT.quote, 'NO_FRESH_QUOTE'],
    [503, { error: 'SOURCE_MISMATCH', message: 'mismatch' }, TEXT.source, 'SOURCE_MISMATCH'],
    [503, { error: 'RISK_DATA_UNAVAILABLE', message: 'risk' }, TEXT.risk, 'RISK_DATA_UNAVAILABLE'],
    // Definitive pre-admission refusals (H1, M7).
    [503, { error: 'ENGINE_CLOSE_UNAVAILABLE', message: 'engine' }, TEXT.engineClose, 'ENGINE_CLOSE_UNAVAILABLE'],
    [503, { error: 'COMMAND_ROUTING_UNAVAILABLE', message: 'route' }, TEXT.routing, 'COMMAND_ROUTING_UNAVAILABLE'],
    [503, { error: 'INTERNAL_FIX_REQUIRED', message: 'fix' }, TEXT.fixRequired, 'INTERNAL_FIX_REQUIRED'],
    // Manager text-only refusals, written before any gateway call.
    [503, { success: false, error: 'Account trading scope unavailable' }, TEXT.scope, undefined],
    [503, { success: false, error: 'TRADING_GATEWAY_URL is not configured' }, TEXT.config, undefined],
    [500, { success: false, error: 'Unable to encode close request' }, TEXT.prepare, undefined],
    // Unknown outcome: no code, or a code that is not a listed definitive refusal.
    [503, { error: 'ORDER_STATUS_UNKNOWN', message: 'unknown' }, TEXT.unconfirmed, 'ORDER_STATUS_UNKNOWN'],
    [503, { error: 'ENGINE_UNAVAILABLE', message: 'down' }, TEXT.unconfirmed, 'ENGINE_UNAVAILABLE'],
    [503, { error: 'DATABASE_UNAVAILABLE', message: 'db' }, TEXT.unconfirmed, 'DATABASE_UNAVAILABLE'],
    [503, { error: 'ORDER_WATCHER_LIMIT', message: 'busy' }, TEXT.unconfirmed, 'ORDER_WATCHER_LIMIT'],
    [503, { message: 'down' }, TEXT.unconfirmed, undefined],
    [500, { code: 'MT_RET_ERR_TRADE', message: 'position changed or was already closed' }, TEXT.unconfirmed, 'MT_RET_ERR_TRADE'],
    [504, { message: 'gateway timeout' }, TEXT.unconfirmed, undefined],
  ];
  for (const [status, body, expected, code] of cases) {
    responder = () => json(status, body);
    await assert.rejects(
      () => positionForceClose({ ticket }),
      (error) => {
        assert.equal(error.message, expected);
        assert.equal(error.status, status);
        assert.equal(error.code, code);
        assert.equal(error.reachedServer, true);
        return true;
      },
    );
  }
});

test('positionForceClose maps a 401 to the session text and flags a refresh', async () => {
  // The 401 branch in production sits behind sendWithSessionRefresh, which this test cannot reproduce; the
  // text is therefore asserted on the classifier directly.
  const refusal = classifyCloseRefusal({ status: 401, data: { message: 'unauthorized' }, ticket: 19917 });
  assert.equal(refusal.message, TEXT.session);
  assert.equal(refusal.definitive, true);
});

test('positionForceClose rejects an HTTP 200 broker failure with the server message and status', async () => {
  responder = () => json(200, { success: false, message: 'Market is closed for this symbol' });
  await assert.rejects(
    () => positionForceClose({ ticket: 7 }),
    /Market is closed for this symbol \(HTTP 200\)\./,
  );
});

test('positionForceClose: a 500 keeps the id, so the retry replays it', async () => {
  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceClose({ ticket: 41001 }), { message: TEXT.unconfirmed });
  const firstId = clientIdOf(0);
  await assert.rejects(() => positionForceClose({ ticket: 41001 }), { message: TEXT.unconfirmed });
  assert.equal(clientIdOf(1), firstId);
});

test('positionForceClose: a 4xx clears the pending id, so the next action starts fresh', async () => {
  for (const [index, status] of [[0, 400], [1, 404], [2, 409]]) {
    const ticket = 41020 + index;
    responder = () => json(500, { message: 'boom' });
    await assert.rejects(() => positionForceClose({ ticket }));
    const firstId = clientIdOf(calls.length - 1);

    responder = () => json(status, { message: 'refused' });
    await assert.rejects(() => positionForceClose({ ticket }));
    assert.equal(clientIdOf(calls.length - 1), firstId);

    responder = () => json(200, { status: 'filled' });
    await positionForceClose({ ticket });
    assert.notEqual(clientIdOf(calls.length - 1), firstId);
  }
});

test('positionForceClose (F1): a 4xx whose body cannot be read still clears the id', async () => {
  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceClose({ ticket: 41040 }));
  const firstId = clientIdOf(0);

  responder = () => unreadableBody(409);
  await assert.rejects(
    () => positionForceClose({ ticket: 41040 }),
    (error) => {
      assert.equal(error.message, 'The close was refused (HTTP 409). Nothing was closed.');
      assert.equal(error.reachedServer, true);
      return true;
    },
  );
  assert.equal(clientIdOf(1), firstId);

  responder = () => json(200, { status: 'filled' });
  await positionForceClose({ ticket: 41040 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('positionForceClose: a definitive 503 (STALE_QUOTE) clears the id, so the next action starts fresh', async () => {
  responder = () => json(503, { error: 'STALE_QUOTE', message: 'stale' });
  await assert.rejects(() => positionForceClose({ ticket: 41030 }), { message: TEXT.quote });
  const firstId = clientIdOf(0);

  responder = () => json(200, { status: 'filled' });
  await positionForceClose({ ticket: 41030 });
  assert.notEqual(clientIdOf(1), firstId);
  assert.match(clientIdOf(1), GATEWAY_ID_PATTERN);
});

test('positionForceClose (H1, M7): pre-admission refusals ENGINE_CLOSE_UNAVAILABLE, COMMAND_ROUTING_UNAVAILABLE and INTERNAL_FIX_REQUIRED clear the id', async () => {
  for (const [index, code, expected] of [
    [0, 'ENGINE_CLOSE_UNAVAILABLE', TEXT.engineClose],
    [1, 'COMMAND_ROUTING_UNAVAILABLE', TEXT.routing],
    [2, 'INTERNAL_FIX_REQUIRED', TEXT.fixRequired],
  ]) {
    const ticket = 41050 + index;
    responder = () => json(503, { error: code, message: 'refused' });
    await assert.rejects(() => positionForceClose({ ticket }), { message: expected });
    const firstId = clientIdOf(calls.length - 1);

    responder = () => json(200, { status: 'filled' });
    await positionForceClose({ ticket });
    assert.notEqual(clientIdOf(calls.length - 1), firstId);
  }
});

test('positionForceClose: a single-close 503 without a code keeps the id', async () => {
  responder = () => json(503, { message: 'down' });
  await assert.rejects(() => positionForceClose({ ticket: 41031 }), { message: TEXT.unconfirmed });
  const firstId = clientIdOf(0);

  responder = () => json(503, { message: 'down again' });
  await assert.rejects(() => positionForceClose({ ticket: 41031 }), { message: TEXT.unconfirmed });
  assert.equal(clientIdOf(1), firstId);
});

test('positionForceClose: a 202 keeps the id, so a second click replays it instead of closing again', async () => {
  responder = () => json(202, { status: 'accepted' });
  await positionForceClose({ ticket: 41003 });
  const firstId = clientIdOf(0);

  responder = () => json(200, { status: 'filled' });
  await positionForceClose({ ticket: 41003 });
  assert.equal(clientIdOf(1), firstId);
});

test('positionForceClose: the retry window is fixed from the first failure and does not slide', async () => {
  const setOffset = useClock();
  responder = () => json(500, { message: 'boom' });

  setOffset(0);
  await assert.rejects(() => positionForceClose({ ticket: 41004 }));
  const firstId = clientIdOf(0);

  setOffset(100000); // t0 + 100 s: still inside the window, reuses the id
  await assert.rejects(() => positionForceClose({ ticket: 41004 }));
  assert.equal(clientIdOf(1), firstId);

  setOffset(130000); // t0 + 130 s: past the window measured from t0, so a fresh id
  responder = () => json(200, { status: 'filled' });
  await positionForceClose({ ticket: 41004 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('positionForceClose: reuses the id up to t0+119999 and issues a new one at t0+120000', async () => {
  const setOffset = useClock();
  responder = () => json(500, { message: 'boom' });

  setOffset(0);
  await assert.rejects(() => positionForceClose({ ticket: 41005 }));
  const firstId = clientIdOf(0);

  setOffset(119999);
  await assert.rejects(() => positionForceClose({ ticket: 41005 }));
  assert.equal(clientIdOf(1), firstId);

  setOffset(120000);
  responder = () => json(200, { status: 'filled' });
  await positionForceClose({ ticket: 41005 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('positionForceClose: a 5xx body that cannot be read still keeps the id and gives the unconfirmed message', async () => {
  responder = () => unreadableBody(500);
  await assert.rejects(
    () => positionForceClose({ ticket: 41006 }),
    (error) => {
      assert.equal(error.message, TEXT.unconfirmed);
      assert.equal(error.reachedServer, true);
      return true;
    },
  );
  const firstId = clientIdOf(0);

  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceClose({ ticket: 41006 }));
  assert.equal(clientIdOf(1), firstId);
});

test('positionForceClose: a network failure keeps the id, so a retry within the window is safe', async () => {
  responder = () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => positionForceClose({ ticket: 41007 }), { message: TEXT.noAnswer });
  const firstId = clientIdOf(0);

  responder = () => json(200, { status: 'filled' });
  await positionForceClose({ ticket: 41007 });
  assert.equal(clientIdOf(1), firstId);
});

// ── Force Close All: account close-all contract ──

test('positionForceCloseAll posts the account-scoped close-all contract with a stable client_order_id', async () => {
  responder = () => json(200, { parent_id: 'p-1', state: 'completed_success', member_count: 2 });

  await positionForceCloseAll({ login: 200001, symbol: '' });

  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/manager/accounts/200001/close-all');
  assert.equal(url.pathname.startsWith('/manager'), false);
  assert.doesNotMatch(url.pathname, /PositionForceCloseAll/i);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer manager-test-token');
  const body = lastBody();
  assert.deepEqual(Object.keys(body).sort(), ['account_login', 'client_order_id', 'scope']);
  assert.equal(body.account_login, 200001);
  assert.equal(body.scope, 'account');
  assert.match(body.client_order_id, GATEWAY_ID_PATTERN);
});

test('positionForceCloseAll (L4, M5): a finished close gives the plain request-size wording, with no raw state name', async () => {
  responder = () => json(200, { parent_id: 'p-1', state: 'completed_success', member_count: 2 });
  const result = await positionForceCloseAll({ login: 200003 });
  assert.equal(result.success, true);
  assert.equal(result.reachedServer, true);
  assert.equal(result.message, TEXT.finished(200003, 2));
  assert.doesNotMatch(result.message, /completed_|original request/);
});

test('positionForceCloseAll: completed_empty is a terminal success that clears the id', async () => {
  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceCloseAll({ login: 200040 }));
  const firstId = clientIdOf(0);

  responder = () => json(200, { parent_id: 'p-40', state: 'completed_empty', member_count: 0 });
  const result = await positionForceCloseAll({ login: 200040 });
  assert.equal(clientIdOf(1), firstId); // this call used the pending id
  assert.equal(result.success, true);
  assert.equal(result.reachedServer, true);
  assert.equal(result.message, TEXT.finished(200040, 0));
  assert.doesNotMatch(result.message, /completed_/);

  // Terminal, so the next Close All starts with a fresh id.
  responder = () => json(200, { parent_id: 'p-41', state: 'completed_empty', member_count: 0 });
  await positionForceCloseAll({ login: 200040 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('positionForceCloseAll 202 is accepted, not an error, and flags a refresh', async () => {
  responder = () => json(202, { parent_id: 'p-2', state: 'waiting', member_count: 3 });
  const result = await positionForceCloseAll({ login: 200004 });
  assert.equal(result.success, true);
  assert.equal(result.reachedServer, true);
  assert.equal(
    result.message,
    'Close All accepted for login 200004 (3 position(s) in the request). Closing is in progress; the positions list will update.',
  );
});

test('positionForceCloseAll: a 202 keeps the id, so the next call replays the same parent', async () => {
  responder = () => json(202, { parent_id: 'p-20', state: 'waiting', member_count: 2 });
  await positionForceCloseAll({ login: 200021 });
  const firstId = clientIdOf(0);

  responder = () => json(200, { parent_id: 'p-20', state: 'completed_success', member_count: 2 });
  await positionForceCloseAll({ login: 200021 });
  assert.equal(clientIdOf(1), firstId);
});

test('positionForceCloseAll (M3, M5): a mixed finish says some positions are still open, with no derived counts', async () => {
  responder = () => json(200, {
    parent_id: 'p-6',
    state: 'completed_mixed',
    member_count: 15,
    result: { state: 'completed_mixed', members: 15, closed: 1, closed_elsewhere: 2, failed: 3, not_attempted: 4, pending: 5 },
  });
  const result = await positionForceCloseAll({ login: 200006 });
  assert.equal(result.success, false);
  assert.equal(result.reachedServer, true);
  assert.equal(result.message, TEXT.mixed);
  assert.doesNotMatch(result.message, /\d/);
});

test('positionForceCloseAll (M3): a mixed finish without a result payload gives the same message', async () => {
  responder = () => json(200, { parent_id: 'p-7', state: 'completed_mixed', member_count: 2 });
  const result = await positionForceCloseAll({ login: 200007 });
  assert.equal(result.success, false);
  assert.equal(result.reachedServer, true);
  assert.equal(result.message, TEXT.mixed);
});

test('positionForceCloseAll: an empty or unknown state is not a success, shows the unconfirmed text, and keeps the id', async () => {
  for (const body of [{ parent_id: 'p-8', member_count: 2 }, { parent_id: 'p-9', state: 'completed_failed', member_count: 2 }]) {
    responder = () => json(200, body);
    const result = await positionForceCloseAll({ login: 200008 });
    assert.equal(result.success, false);
    assert.equal(result.reachedServer, true);
    assert.equal(result.message, TEXT.unconfirmed);
  }
  // The unknown answers kept the id, so the next call reuses it.
  responder = () => json(200, { parent_id: 'p-10', state: 'completed_success', member_count: 0 });
  await positionForceCloseAll({ login: 200008 });
  assert.equal(clientIdOf(2), clientIdOf(0));
});

test('positionForceCloseAll refuses a symbol filter with the no-field message', async () => {
  await assert.rejects(
    () => positionForceCloseAll({ login: 200001, symbol: 'EURUSD' }),
    (error) => {
      assert.equal(error.code, 'SYMBOL_FILTER_UNSUPPORTED');
      assert.equal(error.message, 'Close All by symbol is not supported. Nothing was closed.');
      return true;
    },
  );
  assert.equal(calls.length, 0);
});

test('positionForceCloseAll treats a whitespace-only symbol as no filter and sends the account-scoped close', async () => {
  responder = () => json(200, { parent_id: 'p-50', state: 'completed_empty', member_count: 0 });
  const result = await positionForceCloseAll({ login: 200050, symbol: '   ' });
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(lastBody()).sort(), ['account_login', 'client_order_id', 'scope']);
  assert.equal(lastBody().scope, 'account');
  assert.equal(result.success, true);
});

test('positionForceCloseAll rejects an invalid login before any request', async () => {
  await assert.rejects(() => positionForceCloseAll({ login: 'abc' }), /Account login is required/);
  await assert.rejects(() => positionForceCloseAll({ login: 0 }), /Account login is required/);
  assert.equal(calls.length, 0);
});

test('positionForceCloseAll maps each close-all refusal to its exact actionable message and flags a refresh', async () => {
  const cases = [
    [409, { error: 'BULK_CLOSE_ACCOUNT_BUSY', message: 'busy' }, TEXT.busy],
    [409, { error: 'BULK_CLOSE_TOO_MANY_POSITIONS', message: 'too many' }, TEXT.tooMany],
    [409, { error: 'MARKET_CLOSED', message: 'closed' }, TEXT.market],
    [409, { error: 'IDEMPOTENCY_CONFLICT', message: 'conflict' }, TEXT.idempotency],
    [403, { success: false, error: 'Account access denied' }, TEXT.permission],
    [403, { error: 'BROKER_REQUIRED', message: 'no broker' }, TEXT.broker],
    [403, { error: 'INVESTOR_READ_ONLY', message: 'investor' }, TEXT.investor],
    [404, { error: 'NOT_FOUND', message: 'Account not found' }, TEXT.accountNotFound(200010)],
    [409, { error: 'BULK_CLOSE_ACCOUNT_UNSUPPORTED', message: 'no engine route' }, TEXT.unsupported('BULK_CLOSE_ACCOUNT_UNSUPPORTED')],
    [400, { error: 'INVALID_INPUT', message: 'bad' }, TEXT.invalid],
    // Definitive 503 refusals.
    [503, { error: 'BULK_CLOSE_ACCOUNT_UNSUPPORTED', message: 'unsupported' }, TEXT.unsupported('BULK_CLOSE_ACCOUNT_UNSUPPORTED')],
    [503, { error: 'BULK_CLOSE_INGRESS_UNQUALIFIED', message: 'unqualified' }, TEXT.unsupported('BULK_CLOSE_INGRESS_UNQUALIFIED')],
    [503, { error: 'BULK_CLOSE_PRIVATE_FIX_REQUIRED', message: 'fix' }, TEXT.unsupported('BULK_CLOSE_PRIVATE_FIX_REQUIRED')],
    [503, { error: 'STALE_QUOTE', message: 'stale' }, TEXT.quote],
    [503, { error: 'SOURCE_MISMATCH', message: 'mismatch' }, TEXT.source],
    [503, { error: 'RISK_DATA_UNAVAILABLE', message: 'risk' }, TEXT.risk],
    [503, { error: 'ENGINE_CLOSE_UNAVAILABLE', message: 'engine' }, TEXT.engineClose],
    [503, { success: false, error: 'Account trading scope unavailable' }, TEXT.scope],
    [500, { success: false, error: 'Unable to encode close request' }, TEXT.prepare],
    // Unknown outcome.
    [503, { error: 'ORDER_STATUS_UNKNOWN', message: 'unknown', client_order_id: 'x' }, TEXT.unconfirmed],
    [503, { error: 'ENGINE_UNAVAILABLE', message: 'down' }, TEXT.unconfirmed],
    [500, { message: 'boom' }, TEXT.unconfirmed],
    [504, { message: 'timeout' }, TEXT.unconfirmed],
    // Not a definitive code and not a 5xx: the server text and the status, with no "Nothing was closed" claim.
    [409, { code: 'ACCOUNT_ENGINE_OWNED', message: 'engine' }, 'engine (HTTP 409).'],
    [418, { error: 'TEAPOT', message: 'short and stout' }, 'short and stout (HTTP 418).'],
  ];
  for (const [status, body, expected] of cases) {
    calls = [];
    responder = () => json(status, body);
    await assert.rejects(
      () => positionForceCloseAll({ login: 200010 }),
      (error) => {
        assert.equal(error.message, expected);
        assert.equal(error.status, status);
        assert.equal(error.reachedServer, true);
        return true;
      },
    );
  }
});

test('positionForceCloseAll: a definitive 503 clears the id, so the next action starts fresh', async () => {
  responder = () => json(503, { error: 'BULK_CLOSE_INGRESS_UNQUALIFIED', message: 'unqualified' });
  await assert.rejects(() => positionForceCloseAll({ login: 200060 }));
  const firstId = clientIdOf(0);

  responder = () => json(200, { parent_id: 'p-60', state: 'completed_success', member_count: 0 });
  await positionForceCloseAll({ login: 200060 });
  assert.notEqual(clientIdOf(1), firstId);
});

test('positionForceCloseAll: a 500 with an unreadable body still keeps the id', async () => {
  responder = () => unreadableBody(500);
  await assert.rejects(
    () => positionForceCloseAll({ login: 200061 }),
    (error) => {
      assert.equal(error.message, TEXT.unconfirmed);
      assert.equal(error.reachedServer, true);
      return true;
    },
  );
  const firstId = clientIdOf(0);

  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceCloseAll({ login: 200061 }));
  assert.equal(clientIdOf(1), firstId);
});

test('positionForceCloseAll: a 400 and a 404 each clear the pending id, not only a 409', async () => {
  for (const [index, status, body] of [
    [0, 400, { error: 'INVALID_INPUT', message: 'bad' }],
    [1, 404, { error: 'NOT_FOUND', message: 'Account not found' }],
  ]) {
    const login = 200070 + index;
    responder = () => json(500, { message: 'boom' });
    await assert.rejects(() => positionForceCloseAll({ login }));
    const firstId = clientIdOf(calls.length - 1);

    responder = () => json(status, body);
    await assert.rejects(() => positionForceCloseAll({ login }));

    responder = () => json(200, { parent_id: 'p-70', state: 'completed_success', member_count: 0 });
    await positionForceCloseAll({ login });
    assert.notEqual(clientIdOf(calls.length - 1), firstId);
  }
});

test('positionForceCloseAll: a 4xx clears the pending id', async () => {
  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceCloseAll({ login: 200030 }));
  const firstId = clientIdOf(0);

  responder = () => json(409, { error: 'BULK_CLOSE_ACCOUNT_BUSY', message: 'busy' });
  await assert.rejects(() => positionForceCloseAll({ login: 200030 }));
  assert.equal(clientIdOf(1), firstId);

  responder = () => json(200, { parent_id: 'p-30', state: 'completed_success', member_count: 0 });
  await positionForceCloseAll({ login: 200030 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('positionForceCloseAll: the retry window is fixed from the first failure and does not slide', async () => {
  const setOffset = useClock();
  responder = () => { throw new TypeError('Failed to fetch'); };

  setOffset(0);
  await assert.rejects(() => positionForceCloseAll({ login: 200031 }), { message: TEXT.noAnswer });
  const firstId = clientIdOf(0);

  setOffset(100000);
  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceCloseAll({ login: 200031 }));
  assert.equal(clientIdOf(1), firstId);

  setOffset(130000);
  responder = () => json(200, { parent_id: 'p-31', state: 'completed_success', member_count: 0 });
  await positionForceCloseAll({ login: 200031 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('positionForceCloseAll: the window boundary is t0+119999 reuses, t0+120000 is a new id', async () => {
  const setOffset = useClock();
  responder = () => json(500, { message: 'boom' });

  setOffset(0);
  await assert.rejects(() => positionForceCloseAll({ login: 200032 }));
  const firstId = clientIdOf(0);

  setOffset(119999);
  await assert.rejects(() => positionForceCloseAll({ login: 200032 }));
  assert.equal(clientIdOf(1), firstId);

  setOffset(120000);
  responder = () => json(200, { parent_id: 'p-32', state: 'completed_success', member_count: 0 });
  await positionForceCloseAll({ login: 200032 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('positionForceCloseAll reuses the client_order_id only after an unknown outcome, and only inside the retry window', async () => {
  const login = 200020;
  responder = () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => positionForceCloseAll({ login }), { message: TEXT.noAnswer });
  const firstId = clientIdOf(0);

  responder = () => json(503, { error: 'ORDER_STATUS_UNKNOWN', message: 'unknown' });
  await assert.rejects(() => positionForceCloseAll({ login }), { message: TEXT.unconfirmed });
  assert.equal(clientIdOf(1), firstId);

  responder = () => json(200, { parent_id: 'p-9', state: 'completed_success', member_count: 0 });
  await positionForceCloseAll({ login });
  assert.equal(clientIdOf(2), firstId);

  responder = () => json(200, { parent_id: 'p-10', state: 'completed_success', member_count: 0 });
  await positionForceCloseAll({ login });
  assert.notEqual(clientIdOf(3), firstId);
  assert.match(clientIdOf(3), GATEWAY_ID_PATTERN);
});

// ── Classification details (F2, M1, M2) ──

test('closeCode (F2): an explicit data.code wins over a human-text data.error string', () => {
  const refusal = classifyCloseRefusal({
    status: 503,
    data: { error: 'Price moved while the close was processed', code: 'STALE_QUOTE' },
    ticket: 1,
  });
  assert.equal(refusal.message, TEXT.quote);
  assert.equal(refusal.definitive, true);
});

test('closeCode (F2): a human-text data.error alone is not a code, so a 503 stays unconfirmed', () => {
  const refusal = classifyCloseRefusal({ status: 503, data: { error: 'Market is closed for this symbol' }, ticket: 1 });
  assert.equal(refusal.message, TEXT.unconfirmed);
  assert.equal(refusal.definitive, false);
});

test('M1: IDEMPOTENCY_CONFLICT and every 404 text end with "Nothing was closed."', () => {
  // IDEMPOTENCY_CONFLICT is not a "nothing was closed" refusal: an earlier request may have run.
  assert.doesNotMatch(classifyCloseRefusal({ status: 409, data: { error: 'IDEMPOTENCY_CONFLICT' }, ticket: 1 }).message, /Nothing was closed/);
  assert.match(classifyCloseRefusal({ status: 404, data: { message: 'x' }, ticket: 1 }).message, /Nothing was closed\.$/);
  assert.match(classifyCloseRefusal({ status: 404, data: { message: 'x' }, login: 9, closeAll: true }).message, /Nothing was closed\.$/);
});

test('M1: the generic fallback does not claim that nothing was closed', () => {
  const refusal = classifyCloseRefusal({ status: 409, data: { message: 'Order command rejected' }, ticket: 1 });
  assert.equal(refusal.message, 'Order command rejected (HTTP 409).');
  assert.doesNotMatch(refusal.message, /Nothing was closed/);
});

test('M2: market, quote and source refusals each have their own text', () => {
  assert.equal(classifyCloseRefusal({ status: 409, data: { error: 'MARKET_SCHEDULE_UNAVAILABLE' }, ticket: 1 }).message, TEXT.market);
  assert.equal(classifyCloseRefusal({ status: 503, data: { error: 'NO_FRESH_QUOTE' }, ticket: 1 }).message, TEXT.quote);
  assert.equal(classifyCloseRefusal({ status: 503, data: { error: 'SOURCE_MISMATCH' }, ticket: 1 }).message, TEXT.source);
  assert.notEqual(TEXT.market, TEXT.quote);
  assert.notEqual(TEXT.quote, TEXT.source);
});

test('M1: BUSY on close-all carries the exact instruction and the nothing-started wording', () => {
  assert.equal(
    classifyCloseRefusal({ status: 409, data: { error: 'BULK_CLOSE_ACCOUNT_BUSY' }, closeAll: true, login: 1 }).message,
    'Another Close All is already running for this account. Nothing new was started - wait, then check the positions list.',
  );
});

// ── Round 6: IDEMPOTENCY_CONFLICT, ORDER_COMMAND_LEASE_LOST, coded unknowns, mixed, pre-admission bulk codes ──

test('IDEMPOTENCY_CONFLICT (H1): the text says an earlier request may already have run, makes no "nothing was closed" claim, and clears the id', async () => {
  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceCloseAll({ login: 200090 }));
  const firstId = clientIdOf(0);

  responder = () => json(409, { error: 'IDEMPOTENCY_CONFLICT', message: 'Original bulk request payload differs' });
  await assert.rejects(
    () => positionForceCloseAll({ login: 200090 }),
    (error) => {
      assert.equal(error.message, TEXT.idempotency);
      assert.doesNotMatch(error.message, /Nothing was closed/);
      assert.equal(error.code, 'IDEMPOTENCY_CONFLICT');
      assert.equal(error.reachedServer, true);
      return true;
    },
  );
  assert.equal(clientIdOf(1), firstId); // the failing request still used the pending id

  // Cleared: the next click is a new request with a new id.
  responder = () => json(200, { parent_id: 'p-90', state: 'completed_success', member_count: 0 });
  await positionForceCloseAll({ login: 200090 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('ORDER_COMMAND_LEASE_LOST (M1): single close keeps the id and gives the unconfirmed text', async () => {
  responder = () => json(409, { error: 'ORDER_COMMAND_LEASE_LOST', message: 'Close execution lease or deadline expired' });
  await assert.rejects(
    () => positionForceClose({ ticket: 41090 }),
    (error) => {
      assert.equal(error.message, TEXT.unconfirmed);
      assert.equal(error.code, 'ORDER_COMMAND_LEASE_LOST');
      assert.equal(error.status, 409);
      assert.equal(error.reachedServer, true);
      return true;
    },
  );
  const firstId = clientIdOf(0);

  responder = () => json(200, { status: 'filled' });
  await positionForceClose({ ticket: 41090 });
  assert.equal(clientIdOf(1), firstId);
});

test('ORDER_COMMAND_LEASE_LOST (M1): close-all keeps the id and gives the unconfirmed text', async () => {
  responder = () => json(409, { error: 'ORDER_COMMAND_LEASE_LOST', message: 'lease' });
  await assert.rejects(() => positionForceCloseAll({ login: 200091 }), { message: TEXT.unconfirmed });
  const firstId = clientIdOf(0);

  responder = () => json(200, { parent_id: 'p-91', state: 'completed_success', member_count: 0 });
  await positionForceCloseAll({ login: 200091 });
  assert.equal(clientIdOf(1), firstId);
});

test('completed_mixed clears the close-all id, so the next run is a new request (tester gap)', async () => {
  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceCloseAll({ login: 200092 }));
  const firstId = clientIdOf(0);

  responder = () => json(200, { parent_id: 'p-92', state: 'completed_mixed', member_count: 3 });
  const mixed = await positionForceCloseAll({ login: 200092 });
  assert.equal(mixed.message, TEXT.mixed);
  assert.equal(clientIdOf(1), firstId);

  responder = () => json(200, { parent_id: 'p-93', state: 'completed_success', member_count: 1 });
  await positionForceCloseAll({ login: 200092 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('coded unknown 503s keep the id, single close and close-all alike (tester gap)', async () => {
  const unknownCodes = ['ORDER_STATUS_UNKNOWN', 'ENGINE_UNAVAILABLE', 'DATABASE_UNAVAILABLE', 'ORDER_WATCHER_LIMIT', 'ORDER_WATCHER_UNAVAILABLE', 'SOMETHING_NEW'];
  for (const [index, code] of unknownCodes.entries()) {
    responder = () => json(503, { error: code, message: 'unknown outcome' });
    await assert.rejects(
      () => positionForceClose({ ticket: 41100 + index }),
      { message: TEXT.unconfirmed },
    );
    const singleId = clientIdOf(calls.length - 1);
    responder = () => json(200, { status: 'filled' });
    await positionForceClose({ ticket: 41100 + index });
    assert.equal(clientIdOf(calls.length - 1), singleId, `single close: ${code} must keep the id`);

    responder = () => json(503, { error: code, message: 'unknown outcome' });
    await assert.rejects(
      () => positionForceCloseAll({ login: 200110 + index }),
      { message: TEXT.unconfirmed },
    );
    const allId = clientIdOf(calls.length - 1);
    responder = () => json(200, { parent_id: 'p-x', state: 'completed_success', member_count: 0 });
    await positionForceCloseAll({ login: 200110 + index });
    assert.equal(clientIdOf(calls.length - 1), allId, `close-all: ${code} must keep the id`);
  }
});

test('BULK_CLOSE_ACCOUNT_UNSUPPORTED on a single close: the position text (never "Close All"), id cleared', async () => {
  responder = () => json(500, { message: 'boom' });
  await assert.rejects(() => positionForceClose({ ticket: 41120 }));
  const firstId = clientIdOf(0);

  responder = () => json(503, { error: 'BULK_CLOSE_ACCOUNT_UNSUPPORTED', message: 'unsupported' });
  await assert.rejects(
    () => positionForceClose({ ticket: 41120 }),
    (error) => {
      assert.equal(error.message, TEXT.singleUnsupported('BULK_CLOSE_ACCOUNT_UNSUPPORTED'));
      assert.doesNotMatch(error.message, /Close All/);
      return true;
    },
  );

  responder = () => json(200, { status: 'filled' });
  await positionForceClose({ ticket: 41120 });
  assert.notEqual(clientIdOf(2), firstId);
});

test('bulk-code refusals name their own route: Close All text for close-all only, position text for single close', () => {
  for (const code of ['BULK_CLOSE_ACCOUNT_UNSUPPORTED', 'BULK_CLOSE_INGRESS_UNQUALIFIED', 'BULK_CLOSE_PRIVATE_FIX_REQUIRED']) {
    // Route 1: close-all keeps the Close All wording.
    const all = classifyCloseRefusal({ status: 503, data: { error: code }, closeAll: true, login: 1 });
    assert.equal(all.message, TEXT.unsupported(code));
    assert.equal(all.definitive, true);
    // Route 2: single close never says Close All.
    const single = classifyCloseRefusal({ status: 503, data: { error: code }, ticket: 7 });
    assert.equal(single.message, TEXT.singleUnsupported(code));
    assert.doesNotMatch(single.message, /Close All/);
    assert.equal(single.definitive, true);
    assert.equal(single.clearsId, true);
  }
});

test('actionable errors carry the flag so the hook can skip the "Error: " prefix; a session error does not', async () => {
  responder = () => json(500, { message: 'boom' });
  await assert.rejects(
    () => positionForceClose({ ticket: 41130 }),
    (error) => { assert.equal(error.actionable, true); return true; },
  );
  responder = () => { throw new Error('Session expired. Please log in again.'); };
  await assert.rejects(
    () => positionForceClose({ ticket: 41131 }),
    (error) => { assert.equal(error.actionable, undefined); return true; },
  );
  await assert.rejects(
    () => positionForceCloseAll({ login: 200130, symbol: 'EURUSD' }),
    (error) => { assert.equal(error.actionable, true); return true; },
  );
});
