// Trade API client routes through the /ext-api Vite proxy. apiClient attaches
// Authorization headers; REST token query parameters are intentionally avoided.

import apiClient from './apiClient';
import { fetchManagerApi } from './managerFetch';

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

const getResponseMessage = (data, fallback) =>
  data?.error?.message ||
  data?.error ||
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

  if (!response.ok || data?.code === 'MT_RET_ERR_NOTFOUND') {
    const error = new Error(getResponseMessage(data, `HTTP ${response.status}`));
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }

  return data;
};

export const orderModify = ({ ticket, stoploss, takeprofit }) => {
  const params = new URLSearchParams({ ticket: String(ticket) });
  if (stoploss !== undefined && stoploss !== null) params.set('stoploss', String(stoploss));
  if (takeprofit !== undefined && takeprofit !== null) params.set('takeprofit', String(takeprofit));
  return tradeClient.post(`/OrderModify?${params.toString()}`, {});
};

export const orderDelete = (ticket) =>
  postQuery('/OrderDelete', { ticket });

export const positionPriceChange = (ticket, new_price) =>
  postQuery('/PositionPriceChange', { ticket, new_price });

export const positionVolumeChange = (ticket, new_lots) =>
  postQuery('/PositionVolumeChange', { ticket, new_lots });

export const positionCommentChange = ({ ticket, comment, magic }) => {
  const params = new URLSearchParams({ ticket: String(ticket) });
  if (comment !== undefined) params.set('comment', comment);
  if (magic !== undefined) params.set('magic', String(magic));
  return tradeClient.post(`/PositionCommentChange?${params.toString()}`, {});
};

export const positionForceClose = ({ ticket, price, comment }) => {
  const params = new URLSearchParams({ ticket: String(ticket), price: String(price) });
  if (comment) params.set('comment', comment);
  return tradeClient.get(`/PositionForceClose?${params.toString()}`);
};

export const positionForceCloseAll = ({ login, symbol, comment }) => {
  const params = new URLSearchParams({ login: String(login) });
  if (symbol) params.set('symbol', symbol);
  if (comment) params.set('comment', comment);
  return tradeClient.post(`/PositionForceCloseAll?${params.toString()}`, {});
};

export const positionFlip = (ticket) =>
  postQuery('/PositionFlip', { ticket });

export const dealAdd = (payload) => tradeClient.post('/DealAdd', payload);
export const dealAddBatch = (payload) => tradeClient.post('/DealAddBatch', payload);
export const dealUpdate = (payload) => tradeClient.post('/DealUpdate', payload);
export const dealUpdateBatch = (payload) => tradeClient.post('/DealUpdateBatch', payload);
export const dealPerform = (payload) => tradeClient.post('/DealPerform', payload);

export const positionModifyStops = orderModify;

export const orderPriceChange = (ticket, price) =>
  postQuery('/OrderPriceChange', { ticket, price });

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
