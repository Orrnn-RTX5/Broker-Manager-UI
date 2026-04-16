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
