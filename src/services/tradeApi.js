// Trade API client routes through the /ext-api Vite proxy. apiClient attaches
// Authorization headers; REST token query parameters are intentionally avoided.

import apiClient from './apiClient.js';
import { fetchManagerApi } from './managerFetch.js';

const TRADE_BASE = '/ext-api';

const tradeClient = {
  get: (path, options) => apiClient.get(`${TRADE_BASE}${path}`, options),
  post: (path, body, options) => apiClient.post(`${TRADE_BASE}${path}`, body, options),
};

const qs = (params) => new URLSearchParams(
  Object.entries(params).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null) acc[key] = String(value);
    return acc;
  }, {})
).toString();

// The broker keeps query parameters for compatibility, but mutation endpoints
// expose POST successors so writes are not performed through cacheable GETs.
const postQuery = (path, params) => tradeClient.post(`${path}?${qs(params)}`, {});

const readJson = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const isMtRetErrorCode = (value) => typeof value === 'string' && /MT_RET_ERR_/i.test(value);

const isManagerFailurePayload = (data) => {
  if (data === false) return true;
  if (!data || typeof data !== 'object') return false;
  if (data.success === false || data.ok === false || Boolean(data.error)) return true;
  return isMtRetErrorCode(data.retcode) || isMtRetErrorCode(data.code);
};

const getResponseMessage = (data, fallback) =>
  data?.error?.message ||
  (typeof data?.error === 'string' ? data.error : undefined) ||
  data?.message ||
  data?.detail ||
  fallback;

const getRecords = (data, key) => {
  if (Array.isArray(data)) return data;
  const records =
    data?.[key] ||
    data?.answer ||
    data?.data ||
    data?.records ||
    data?.items ||
    data?.queue ||
    data?.requests ||
    data?.orders ||
    data?.list ||
    data?.restrictions ||
    [];
  return Array.isArray(records) ? records : [];
};

// DealerQueueList has been returned by broker backends in both flat and nested
// envelopes (for example { answer: [...] } and { answer: { queue: [...] } }).
// Keep this normalizer local to the dealer workflow so a valid nested queue is
// never rendered as a misleading empty state.
const getDealerQueueRecords = (data, depth = 0) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object' || depth > 3) return [];

  const keys = ['answer', 'data', 'queue', 'requests', 'orders', 'items', 'records', 'result', 'list'];
  for (const key of keys) {
    const records = getDealerQueueRecords(data[key], depth + 1);
    if (records.length > 0) return records;
  }

  return [];
};

const asBoolean = (value) => value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toUnixSeconds = (value) => {
  if (value === undefined || value === null || value === '') return 0;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 100000000000 ? Math.floor(value / 1000) : value;
  }

  const raw = String(value).trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return numeric > 100000000000 ? Math.floor(numeric / 1000) : numeric;
  }

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
};

const normalizeOrderSide = (value) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === '0' || raw.includes('buy')) return 'buy';
  if (raw === '1' || raw.includes('sell')) return 'sell';
  return raw;
};

const normalizeRestrictionRow = (row = {}) => ({
  accountLogin: firstDefined(row.accountLogin, row.account_login, row.login, row.Login, row.id, ''),
  noTrading: asBoolean(firstDefined(row.noTrading, row.no_trading, row.noTrade, row.no_trade, false)),
  noDeposit: asBoolean(firstDefined(row.noDeposit, row.no_deposit, false)),
  noWithdraw: asBoolean(firstDefined(row.noWithdraw, row.no_withdraw, row.noWithdrawal, row.no_withdrawal, false)),
  closeOnly: asBoolean(firstDefined(row.closeOnly, row.close_only, false)),
  maxLot: firstDefined(row.maxLot, row.max_lot, row.maxLots, row.max_lots, 0),
  maxTotalLot: firstDefined(row.maxTotalLot, row.max_total_lot, row.maxTotalLots, row.max_total_lots, 0),
  customSpreadMarkup: firstDefined(row.customSpreadMarkup, row.spreadMarkup, row.spread_markup, 0),
  customLeverage: firstDefined(row.customLeverage, row.custom_leverage, row.leverage, 0),
  aBookOverride: asBoolean(firstDefined(row.aBookOverride, row.a_book_override, row.aBook, row.a_book, false)),
  bBookOverride: asBoolean(firstDefined(row.bBookOverride, row.b_book_override, row.bBook, row.b_book, false)),
  executionDelayMs: firstDefined(row.executionDelayMs, row.execution_delay_ms, row.delay, row.delay_ms, 0),
  notes: firstDefined(row.notes, row.comment, row.Comment, ''),
  raw: row,
});

const normalizeDealerQueueRow = (row = {}, index = 0) => ({
  id: firstDefined(row.id, row.ID, row.queueId, row.queue_id, row.requestId, row.request_id, row.ticket, row.Ticket, row.order, row.Order, index + 1),
  orderTicket: firstDefined(row.orderTicket, row.order_ticket, row.order, row.Order, row.ticket, row.Ticket, row.position, row.Position, ''),
  accountLogin: firstDefined(row.accountLogin, row.account_login, row.login, row.Login, row.account, row.Account, ''),
  symbol: firstDefined(row.symbol, row.Symbol, row.instrument, row.Instrument, ''),
  side: normalizeOrderSide(firstDefined(row.side, row.Side, row.action, row.Action, row.type, row.Type, row.cmd, row.Cmd, '')),
  volume: toNumber(firstDefined(row.volume, row.Volume, row.volume_lots, row.lots, row.Lots, 0)),
  requestedPrice: toNumber(firstDefined(
    row.requestedPrice,
    row.requested_price,
    row.reqPrice,
    row.req_price,
    row.price_order,
    row.priceOrder,
    row.price,
    row.Price,
    row.price_open,
    row.priceOpen,
    row.price_requested,
    row.price_request,
    0
  )),
  reason: firstDefined(row.reason, row.Reason, row.requestType, row.request_type, row.type, row.Type, ''),
  queuedAt: toUnixSeconds(firstDefined(
    row.queuedAt,
    row.queued_at,
    row.createdAt,
    row.created_at,
    row.timeCreate,
    row.TimeCreate,
    row.time_msc,
    row.time,
    row.Time,
    0
  )),
  comment: firstDefined(row.comment, row.Comment, row.message, row.Message, row.note, row.notes, ''),
  raw: row,
});

const fetchManagerJson = async (endpoint, options = {}) => {
  const response = await fetchManagerApi(endpoint, {
    method: 'GET',
    ...options,
  });
  const data = await readJson(response);

  // A completed read can still report a rejected action ({ success: false },
  // { ok: false }, an `error` member, or an MT_RET_ERR_* retcode/code).
  // Failing here keeps callers from rendering it as a misleading empty list.
  if (!response.ok || isManagerFailurePayload(data)) {
    const error = new Error(getResponseMessage(data, `HTTP ${response.status}`));
    error.status = response.status;
    error.code = data?.error?.code ?? data?.retcode ?? data?.code;
    throw error;
  }

  return data;
};

export const orderModify = async ({ ticket, login, price, stoploss, takeprofit }) => {
  if ((price !== undefined && price !== null && Number(price) > 0) || (login && Number(login) > 0)) {
    try {
      const { modifyManagerPendingOrder } = await import('./managerTradeApi.js');
      return await modifyManagerPendingOrder({ ticket, login, price, stoploss, takeprofit });
    } catch (err) {
      if (err?.code || err?.status || err?.commandStatus) throw err;
    }
  }
  const modifyParams = new URLSearchParams({ ticket: String(ticket) });
  if (stoploss !== undefined && stoploss !== null) modifyParams.set('stoploss', String(stoploss));
  if (takeprofit !== undefined && takeprofit !== null) modifyParams.set('takeprofit', String(takeprofit));
  return tradeClient.post(`/OrderModify?${modifyParams.toString()}`, {});
  const params = new URLSearchParams({ ticket: String(ticket) });




};

export const orderDelete = (ticket) =>
  postQuery('/OrderDelete', { ticket });

export const positionPriceChange = (ticket, new_price) =>
  postQuery('/PositionPriceChange', { ticket, new_price });

export const positionVolumeChange = (ticket, new_lots) =>
  postQuery('/PositionVolumeChange', { ticket, new_lots });

export const positionCommentChange = ({ ticket, comment, magic }) =>
  tradeClient.post('/PositionCommentChange', { ticket, comment, magic });

// ── Force Close and Force Close All: engine-safe Manager native routes ──
// Single position: POST /api/v1/manager/orders/{ticket}/close, a market close
// through the trading gateway. Close All: POST /api/v1/manager/accounts/{login}/close-all.
// The custom-price force close and the legacy GET /PositionForceClose and POST
// /PositionForceCloseAll are fenced writers for RAM and engine accounts and are
// no longer called.
//
// ROUTE CONSTANTS. The single-close route is isolated here. The backend owner may
// move single close (ENGINE_CLOSE_UNAVAILABLE for engine-routed accounts); changing
// the route should touch only POSITION_CLOSE_ENDPOINT and the code-to-text table.
const POSITION_CLOSE_ENDPOINT = (ticket) => `/api/v1/manager/orders/${encodeURIComponent(ticket)}/close`;
const CLOSE_ALL_ENDPOINT = (login) => `/api/v1/manager/accounts/${encodeURIComponent(login)}/close-all`;

const createCloseClientOrderId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `manager-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// target key ('position:<ticket>' or 'all:<login>') -> { clientOrderId, at }.
// Kept while the outcome is unknown or not final: no answer, a 5xx that is not a
// definitive refusal, a body that could not be read on a 5xx, a 202 (accepted, not
// final), or a 200 without a terminal state. A retry of the same target inside the
// window reuses the id, so the gateway replays the original command instead of
// starting a second close. The window is fixed from the first failure and retries
// never extend it. The 120 s client window is deliberately kept: the backend
// duplicate guard (60 s) is a separate server-side check and is documented in
// IMPL-NOTES.md (M4). Cleared by a terminal 200, a 4xx, or a 5xx the server states
// was not closed.
const unresolvedCloseIds = new Map();
const CLOSE_RETRY_WINDOW_MS = 120000;
const CLOSE_ALL_TERMINAL_STATES = new Set(['completed_empty', 'completed_success', 'completed_mixed']);

const NO_ANSWER_MESSAGE = 'No answer from the server - the close may or may not have happened. Check the positions list, then retry (a retry within 2 minutes is safe).';
const UNCONFIRMED_MESSAGE = 'Trading service did not confirm the close - check the positions list, then retry within 2 minutes (safe).';
const SYMBOL_FILTER_MESSAGE = 'Close All by symbol is not supported. Nothing was closed.';

// Definitive texts, grouped by cause (M2). Each says "Nothing was closed." because the
// close is refused or rolled back before anything is committed. Settlement refusals
// (market, quote, source, risk) are raised inside the settlement transaction and rolled
// back, so no change is committed. Pre-admission refusals never create a command.
const MARKET_REFUSAL_MESSAGE = 'The market is closed or its schedule is unavailable right now. Try again when the session opens. Nothing was closed.';
const QUOTE_REFUSAL_MESSAGE = 'No fresh price for the symbol right now. Try again when prices update. Nothing was closed.';
const SOURCE_MISMATCH_MESSAGE = 'Price source mismatch for the symbol - try again shortly. Nothing was closed.';
const RISK_REFUSAL_MESSAGE = 'Risk data is unavailable right now - retry in a minute. Nothing was closed.';
const BUSY_MESSAGE = 'Another Close All is already running for this account. Nothing new was started - wait, then check the positions list.';
const IDEMPOTENCY_MESSAGE = 'This close matches an earlier request that may already have run - check the positions list before trying again.';

const MARKET_REFUSAL_CODES = new Set(['MARKET_CLOSED', 'MARKET_SCHEDULE_UNAVAILABLE']);
const QUOTE_REFUSAL_CODES = new Set(['STALE_QUOTE', 'NO_FRESH_QUOTE']);

// Pre-admission (or pre-execution) refusals raised by the gateway for a single close.
// Each one is verified in the gateway source; the cause is stated accurately.
const PRE_ADMISSION_CLOSE_REFUSALS = new Map([
  // order_command_close.go decideCloseDispatch (~L185/L202): refused before any command is admitted.
  ['ENGINE_CLOSE_UNAVAILABLE', "This account's positions cannot be closed from the Manager right now (engine close unavailable). Nothing was closed. Ask support."],
  // order_command_close.go decideCloseDispatch: the route could not be resolved before admission.
  ['COMMAND_ROUTING_UNAVAILABLE', 'The close route for this account could not be confirmed right now. Nothing was closed. Try again shortly.'],
  // order_command_close_execute.go ExecuteClaimedClosePosition (:35): returns before any read or write.
  ['INTERNAL_FIX_REQUIRED', 'The private execution service is not available for this close right now. Nothing was closed. Try again shortly.'],
]);

// Manager-side refusals written before anything is sent to the gateway. They carry text only, no code.
const MANAGER_REFUSAL_MESSAGES = new Map([
  ['Account trading scope unavailable', 'Account trading scope is unavailable right now. Nothing was closed.'],
  ['TRADING_GATEWAY_URL is not configured', 'Trading service is not configured. Ask support. Nothing was closed.'],
  ['Invalid trading gateway configuration', 'Trading service is not configured. Ask support. Nothing was closed.'],
  ['Unable to create close identifier', 'The close request could not be prepared. Nothing was closed.'],
  ['Unable to encode close request', 'The close request could not be prepared. Nothing was closed.'],
  ['Unable to construct trading request', 'The close request could not be prepared. Nothing was closed.'],
]);

const UPPER_CODE = /^[A-Z][A-Z0-9_]*$/;

const closeIdFor = (key) => {
  const pending = unresolvedCloseIds.get(key);
  return pending && Date.now() - pending.at < CLOSE_RETRY_WINDOW_MS
    ? pending.clientOrderId
    : createCloseClientOrderId();
};

const rememberUnknownClose = (key, clientOrderId) => {
  const pending = unresolvedCloseIds.get(key);
  // Reusing the pending id keeps its first-seen time, so the window never slides.
  const at = pending && pending.clientOrderId === clientOrderId ? pending.at : Date.now();
  unresolvedCloseIds.set(key, { clientOrderId, at });
};

// Prefers an explicit machine code (data.code, data.retcode, data.error.code, or a
// data.error that is itself an UPPER_SNAKE code) over human text in data.error.
const closeCode = (data) => [data?.code, data?.retcode, data?.error?.code, data?.error]
  .find((value) => typeof value === 'string' && UPPER_CODE.test(value));

const closeServerMessage = (data) => {
  if (typeof data?.message === 'string' && data.message) return data.message;
  if (typeof data?.error === 'string' && data.error) return data.error;
  if (typeof data?.error?.message === 'string' && data.error.message) return data.error.message;
  return '';
};

// Classifies a failed close answer. definitive = the server states nothing was closed.
// clearsId = the pending id is cleared (a settled outcome, whether or not nothing was
// closed). Definitive codes are checked first. A 5xx with no code, an unknown code, or
// ORDER_COMMAND_LEASE_LOST is unconfirmed and keeps the id.
export const classifyCloseRefusal = ({ status, data, ticket, login, closeAll }) => {
  const code = closeCode(data);
  const server = closeServerMessage(data);
  const position = `Position #${ticket}`;
  const definitive = (message) => ({ message, definitive: true, clearsId: true });
  // A settled outcome that is not "nothing was closed": the id is cleared and the text makes no claim.
  const settledUnknown = (message) => ({ message, definitive: false, clearsId: true });

  if (PRE_ADMISSION_CLOSE_REFUSALS.has(code)) return definitive(PRE_ADMISSION_CLOSE_REFUSALS.get(code));
  if (MARKET_REFUSAL_CODES.has(code)) return definitive(MARKET_REFUSAL_MESSAGE);
  if (QUOTE_REFUSAL_CODES.has(code)) return definitive(QUOTE_REFUSAL_MESSAGE);
  if (code === 'SOURCE_MISMATCH') return definitive(SOURCE_MISMATCH_MESSAGE);
  if (code === 'RISK_DATA_UNAVAILABLE') return definitive(RISK_REFUSAL_MESSAGE);
  // Bulk codes can come back on a single close too, so this is not gated on closeAll.
  if (code === 'BULK_CLOSE_ACCOUNT_UNSUPPORTED' || /_(UNQUALIFIED|FIX_REQUIRED)$/.test(code ?? '')) {
    // Each route names itself: "Close All" only for the close-all route.
    return definitive(closeAll
      ? `Close All is not available for this account (${code}). Nothing was closed. Ask support.`
      : `This position cannot be closed from the Manager right now (${code}). Nothing was closed. Ask support.`);
  }
  if (MANAGER_REFUSAL_MESSAGES.has(server)) return definitive(MANAGER_REFUSAL_MESSAGES.get(server));

  if (code === 'BROKER_REQUIRED') return definitive('Session has no broker selected - sign out and sign in again. Nothing was closed.');
  if (status === 401) return definitive('Your session expired. Sign in again. Nothing was closed.');
  if (code === 'INVESTOR_READ_ONLY') return definitive('Investor accounts cannot close positions. Nothing was closed.');
  if (status === 403 || ['FORBIDDEN', 'MT_RET_ERR_PERMISSIONS'].includes(code) || server === 'Account access denied') {
    return definitive('No permission to close positions. Ask an administrator. Nothing was closed.');
  }
  if (closeAll && code === 'BULK_CLOSE_ACCOUNT_BUSY') return definitive(BUSY_MESSAGE);
  if (closeAll && code === 'BULK_CLOSE_TOO_MANY_POSITIONS') {
    return definitive('Too many positions for one Close All. Close them individually or in smaller batches. Nothing was closed.');
  }
  if (code === 'IDEMPOTENCY_CONFLICT') return settledUnknown(IDEMPOTENCY_MESSAGE);
  if (!closeAll && (code === 'POSITION_ALREADY_CLOSED' || code === 'POSITION_STATE_CHANGED'
    || (status < 500 && /not found or not open|already closed|position changed/i.test(server)))) {
    return definitive(`${position} is already closed or changed. Refresh the list.`);
  }
  if (status === 404) {
    return definitive(closeAll
      ? `Account ${login} was not found. Refresh the list. Nothing was closed.`
      : `${position} was not found or is already closed. Refresh the list. Nothing was closed.`);
  }
  if (closeAll && (status === 400 || ['INVALID_INPUT', 'INVALID_CLIENT_ORDER_ID'].includes(code)
    || /Exact account parent request required/.test(server))) {
    return definitive('Close All was rejected as invalid. Refresh and try again. Nothing was closed.');
  }
  // ORDER_COMMAND_LEASE_LOST (order_command_close_execute.go:143-146): the command was admitted and can be re-claimed and run later.
  if (code === 'ORDER_COMMAND_LEASE_LOST') return { message: UNCONFIRMED_MESSAGE, definitive: false, clearsId: false };
  if (status >= 500) return { message: UNCONFIRMED_MESSAGE, definitive: false, clearsId: false };
  return definitive(`${server || 'Request failed'} (HTTP ${status}).`);
};

// reachedServer: the close may have changed state, so the caller refreshes the list.
// Set for every answer and for a network failure, where it may have happened.
const closeFailure = (response, message, data) => Object.assign(
  new Error(message),
  { status: response.status, code: closeCode(data), reachedServer: true, actionable: true },
);

const requireCloseTicket = (ticket) => {
  const ticketId = String(ticket ?? '').trim();
  if (!ticketId) throw new TypeError('Position ticket is required');
  return ticketId;
};

// One close request. The id is settled before the body is parsed, so a body that
// cannot be read still keeps the id on a 5xx, and clears it on a 4xx. Returns the
// status and parsed body for a successful answer; throws a flagged error otherwise.
const sendClose = async ({ key, endpoint, buildBody, details, isTerminal }) => {
  const clientOrderId = closeIdFor(key);
  let response;
  try {
    response = await fetchManagerApi(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildBody(clientOrderId)),
    });
  } catch (error) {
    rememberUnknownClose(key, clientOrderId);
    // A session failure never reached the close, so keep its own message.
    if (/session/i.test(String(error?.message ?? ''))) throw error;
    throw Object.assign(new Error(NO_ANSWER_MESSAGE), { reachedServer: true, actionable: true, cause: error });
  }

  // A 5xx or a 202 keeps the id before the body is read.
  if (response.status >= 500 || response.status === 202) rememberUnknownClose(key, clientOrderId);

  let data;
  try {
    data = await readJson(response);
  } catch (cause) {
    if (response.status >= 400 && response.status < 500) {
      // A 4xx is a definitive refusal even when its body cannot be read.
      unresolvedCloseIds.delete(key);
      throw Object.assign(new Error(`The close was refused (HTTP ${response.status}). Nothing was closed.`), {
        status: response.status, reachedServer: true, actionable: true, cause,
      });
    }
    rememberUnknownClose(key, clientOrderId);
    throw Object.assign(new Error(UNCONFIRMED_MESSAGE), { status: response.status, reachedServer: true, actionable: true, cause });
  }

  const failed = !response.ok || isManagerFailurePayload(data);
  if (failed) {
    const refusal = classifyCloseRefusal({ status: response.status, data, ...details });
    // Clears only a settled outcome from the server (4xx or 5xx); an unconfirmed outcome keeps the id.
    if (response.status >= 400 && refusal.clearsId) unresolvedCloseIds.delete(key);
    else rememberUnknownClose(key, clientOrderId); // an unconfirmed outcome, or a non-final 2xx/3xx failure
    throw closeFailure(response, refusal.message, data);
  }

  if (response.status !== 202) {
    if (isTerminal(data)) unresolvedCloseIds.delete(key); // final answer
    else rememberUnknownClose(key, clientOrderId); // answered but not final
  }
  return { status: response.status, data };
};

// Market close of one position. The gateway close takes no price and no comment,
// so the dealer-menu Force Close is market-only.
export const positionForceClose = async ({ ticket }) => {
  const ticketId = requireCloseTicket(ticket);
  const { status } = await sendClose({
    key: `position:${ticketId}`,
    endpoint: POSITION_CLOSE_ENDPOINT(ticketId),
    buildBody: (clientOrderId) => ({ client_order_id: clientOrderId }),
    details: { ticket: ticketId },
    isTerminal: () => true, // a 200 from the close means filled or succeeded
  });
  // 200 = the command finished. 202 = durably accepted but not final yet.
  if (status === 202) {
    return { success: true, reachedServer: true, message: 'Close accepted - the list will update.' };
  }
  return {
    success: true,
    reachedServer: true,
    message: `Position #${ticketId} closed at the market price.`,
  };
};

// The gateway close-all contract accepts only { client_order_id, account_login,
// scope }. A symbol filter cannot be expressed on it, so it is refused rather
// than widened to every position. A blank or whitespace-only symbol means no
// filter. A comment is not part of the contract and is not sent.
export const positionForceCloseAll = async ({ login, symbol }) => {
  const accountLogin = Number(login);
  if (!Number.isSafeInteger(accountLogin) || accountLogin <= 0) {
    throw new TypeError('Account login is required');
  }
  if (typeof symbol === 'string' && symbol.trim() !== '') {
    throw Object.assign(new Error(SYMBOL_FILTER_MESSAGE), { code: 'SYMBOL_FILTER_UNSUPPORTED', actionable: true });
  }

  const { status, data } = await sendClose({
    key: `all:${accountLogin}`,
    endpoint: CLOSE_ALL_ENDPOINT(accountLogin),
    buildBody: (clientOrderId) => ({ client_order_id: clientOrderId, account_login: accountLogin, scope: 'account' }),
    details: { login: accountLogin, closeAll: true },
    isTerminal: (body) => CLOSE_ALL_TERMINAL_STATES.has(String(body?.state ?? '')),
  });

  // 202 = accepted, still running; the grid refreshes and no polling is added.
  const state = String(data?.state ?? '');
  const count = data?.member_count;
  const requestText = Number.isFinite(count) ? ` (${count} position(s) in the request)` : '';
  if (status === 202) {
    return {
      success: true,
      reachedServer: true,
      message: `Close All accepted for login ${accountLogin}${requestText}. Closing is in progress; the positions list will update.`,
    };
  }
  // Counts are not shown: the server's mixed state comes from a settle-time census
  // that can include positions opened after the request, so a derived count can be wrong.
  if (state === 'completed_mixed') {
    return {
      success: false,
      reachedServer: true,
      message: 'Close All finished but some positions are still open - check the list and run Close All again.',
    };
  }
  if (CLOSE_ALL_TERMINAL_STATES.has(state)) {
    return {
      success: true,
      reachedServer: true,
      message: `Close All finished for login ${accountLogin}${requestText}. Refresh the list; run Close All again for any position opened since.`,
    };
  }
  // An empty or unknown state is not a success: the close is not confirmed.
  return { success: false, reachedServer: true, message: UNCONFIRMED_MESSAGE };
};

export const positionFlip = (ticket) =>
  postQuery('/PositionFlip', { ticket });

export const dealAdd = (payload) => tradeClient.post('/DealAdd', payload);
export const dealAddBatch = (payload) => tradeClient.post('/DealAddBatch', payload);
export const dealUpdate = (payload) => tradeClient.post('/DealUpdate', payload);
export const dealUpdateBatch = (payload) => tradeClient.post('/DealUpdateBatch', payload);
export const dealPerform = (payload) => tradeClient.post('/DealPerform', payload);

export const positionModifyStops = orderModify;


export const orderPriceChange = (ticket, price, login) =>
  orderModify({ ticket, login, price });

export const orderReject = ({ ticket, comment }) => {
  const params = new URLSearchParams({ ticket: String(ticket) });
  if (comment) params.set('comment', comment);
  return tradeClient.post(`/OrderReject?${params.toString()}`, {});
};

export const orderApprove = ({ ticket, comment }) => {
  const params = new URLSearchParams({ ticket: String(ticket) });
  if (comment) params.set('comment', comment);
  return tradeClient.post(`/OrderApprove?${params.toString()}`, {});
};

export const getDealerQueue = async () => {
  // This endpoint authenticates with the Bearer token. `id` is a legacy token
  // query parameter, not a manager-login filter; sending a numeric login there
  // can cause valid queued orders to be omitted by the backend.
  const data = await fetchManagerJson('/DealerQueueList');
  return getDealerQueueRecords(data).map(normalizeDealerQueueRow);
};

export const dealRollback = ({ deal, comment }) => {
  const params = new URLSearchParams({ deal: String(deal) });
  if (comment) params.set('comment', comment);
  return tradeClient.post(`/DealRollback?${params.toString()}`, {});
};

export const accountRestrictGet = (login) =>
  tradeClient.get(`/AccountRestrictGet?${qs({ login })}`);

export const accountRestrictSet = (params) => {
  const query = new URLSearchParams();
  query.set('login', String(params.login));
  const boolFields = ['no_trading', 'no_deposit', 'no_withdraw', 'close_only', 'a_book_override', 'b_book_override'];
  const numFields = ['max_lot', 'max_total_lot', 'spread_markup', 'custom_leverage', 'execution_delay_ms'];
  boolFields.forEach((field) => {
    if (params[field] !== undefined) query.set(field, String(params[field]));
  });
  numFields.forEach((field) => {
    if (params[field] !== undefined) query.set(field, String(params[field]));
  });
  if (params.comment) query.set('comment', params.comment);
  return tradeClient.post(`/AccountRestrictSet?${query.toString()}`, {});
};

export const accountRestrictClear = (login) =>
  postQuery('/AccountRestrictClear', { login });

export const accountRestrictList = async () => {
  const data = await fetchManagerJson('/AccountRestrictList');
  return getRecords(data, 'answer').map(normalizeRestrictionRow);
};

export const accountSpreadSet = ({ login, symbol, markup }) =>
  postQuery('/AccountSpreadSet', { login, symbol, markup });

export const accountExecutionSet = ({ login, mode, delay_ms }) =>
  postQuery('/AccountExecutionSet', { login, mode, delay_ms });

export const accountBookSet = ({ login, book }) =>
  postQuery('/AccountBookSet', { login, book });
