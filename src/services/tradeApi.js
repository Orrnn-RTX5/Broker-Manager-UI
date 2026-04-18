// Trade API client — routes through the /ext-api Vite proxy (port 8091).
// All endpoints send BOTH the Bearer header AND the ?id query param for
// maximum compatibility with the broker backend (see design note).

import apiClient from './apiClient';

const TRADE_BASE = '/ext-api';

/**
 * Trade API client wraps apiClient with /ext-api prefix for trade operations.
 * apiClient handles token attachment and 401 refresh automatically.
 */
const tradeClient = {
  get: (path, options) => apiClient.get(`${TRADE_BASE}${path}`, options),
  post: (path, body, options) => apiClient.post(`${TRADE_BASE}${path}`, body, options),
};

// Unified error extraction is now handled by apiClient, 
// so we can simplify these exports.

// ────────── ORDER ──────────
export const orderModify = ({ ticket, stoploss, takeprofit }) => {
  const qs = new URLSearchParams({ ticket: String(ticket) });
  if (stoploss   !== undefined && stoploss   !== null) qs.set('stoploss', String(stoploss));
  if (takeprofit !== undefined && takeprofit !== null) qs.set('takeprofit', String(takeprofit));
  return tradeClient.get(`/OrderModify?${qs.toString()}`);
};

export const orderDelete = (ticket) =>
  tradeClient.get(`/OrderDelete?ticket=${encodeURIComponent(ticket)}`);

// ────────── POSITION ──────────
export const positionPriceChange = (ticket, new_price) =>
  tradeClient.get(`/PositionPriceChange?ticket=${ticket}&new_price=${new_price}`);

export const positionVolumeChange = (ticket, new_lots) =>
  tradeClient.get(`/PositionVolumeChange?ticket=${ticket}&new_lots=${new_lots}`);

export const positionCommentChange = ({ ticket, comment, magic }) => {
  const qs = new URLSearchParams({ ticket: String(ticket) });
  if (comment !== undefined) qs.set('comment', comment);
  if (magic   !== undefined) qs.set('magic', String(magic));
  return tradeClient.get(`/PositionCommentChange?${qs.toString()}`);
};

export const positionForceClose = ({ ticket, price, comment }) => {
  const qs = new URLSearchParams({ ticket: String(ticket), price: String(price) });
  if (comment) qs.set('comment', comment);
  return tradeClient.get(`/PositionForceClose?${qs.toString()}`);
};

export const positionForceCloseAll = ({ login, symbol, comment }) => {
  const qs = new URLSearchParams({ login: String(login) });
  if (symbol)  qs.set('symbol', symbol);
  if (comment) qs.set('comment', comment);
  return tradeClient.get(`/PositionForceCloseAll?${qs.toString()}`);
};

export const positionFlip = (ticket) =>
  tradeClient.get(`/PositionFlip?ticket=${ticket}`);

// ────────── DEAL ──────────
export const dealAdd       = (payload) => tradeClient.post('/DealAdd', payload);
export const dealAddBatch  = (payload) => tradeClient.post('/DealAddBatch', payload);
export const dealUpdate    = (payload) => tradeClient.post('/DealUpdate', payload);
export const dealUpdateBatch = (payload) => tradeClient.post('/DealUpdateBatch', payload);
export const dealPerform   = (payload) => tradeClient.post('/DealPerform', payload);

export const positionModifyStops = orderModify;

// ────────── ORDER (Dealer) ──────────
export const orderPriceChange = (ticket, price) =>
  tradeClient.get(`/OrderPriceChange?ticket=${ticket}&price=${price}`);

export const orderReject = ({ ticket, comment }) => {
  const qs = new URLSearchParams({ ticket: String(ticket) });
  if (comment) qs.set('comment', comment);
  return tradeClient.get(`/OrderReject?${qs.toString()}`);
};

export const orderApprove = ({ ticket, comment }) => {
  const qs = new URLSearchParams({ ticket: String(ticket) });
  if (comment) qs.set('comment', comment);
  return tradeClient.get(`/OrderApprove?${qs.toString()}`);
};

// ────────── DEALER QUEUE ──────────
export const getDealerQueue = () =>
  tradeClient.get('/DealerQueueList');

// ────────── DEAL (Dealer) ──────────
export const dealRollback = ({ deal, comment }) => {
  const qs = new URLSearchParams({ deal: String(deal) });
  if (comment) qs.set('comment', comment);
  return tradeClient.get(`/DealRollback?${qs.toString()}`);
};

// ────────── ACCOUNT RESTRICTIONS ──────────
export const accountRestrictGet = (login) =>
  tradeClient.get(`/AccountRestrictGet?login=${login}`);

export const accountRestrictSet = (params) => {
  const qs = new URLSearchParams();
  qs.set('login', String(params.login));
  const boolFields = ['no_trading', 'no_deposit', 'no_withdraw', 'close_only', 'a_book_override', 'b_book_override'];
  const numFields = ['max_lot', 'max_total_lot', 'spread_markup', 'custom_leverage', 'execution_delay_ms'];
  boolFields.forEach(f => { if (params[f] !== undefined) qs.set(f, String(params[f])); });
  numFields.forEach(f => { if (params[f] !== undefined) qs.set(f, String(params[f])); });
  if (params.comment) qs.set('comment', params.comment);
  return tradeClient.get(`/AccountRestrictSet?${qs.toString()}`);
};

export const accountRestrictClear = (login) =>
  tradeClient.get(`/AccountRestrictClear?login=${login}`);

export const accountRestrictList = () =>
  tradeClient.get('/AccountRestrictList');

export const accountSpreadSet = ({ login, symbol, markup }) =>
  tradeClient.get(`/AccountSpreadSet?login=${login}&symbol=${symbol}&markup=${markup}`);

export const accountExecutionSet = ({ login, mode, delay_ms }) =>
  tradeClient.get(`/AccountExecutionSet?login=${login}&mode=${mode}&delay_ms=${delay_ms}`);

export const accountBookSet = ({ login, book }) =>
  tradeClient.get(`/AccountBookSet?login=${login}&book=${book}`);
