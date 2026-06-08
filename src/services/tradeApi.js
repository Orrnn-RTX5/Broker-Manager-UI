// Trade API client routes through the /ext-api Vite proxy. apiClient attaches
// Authorization headers; REST token query parameters are intentionally avoided.

import apiClient from './apiClient';

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

export const orderModify = ({ ticket, stoploss, takeprofit }) => {
  const params = new URLSearchParams({ ticket: String(ticket) });
  if (stoploss !== undefined && stoploss !== null) params.set('stoploss', String(stoploss));
  if (takeprofit !== undefined && takeprofit !== null) params.set('takeprofit', String(takeprofit));
  return tradeClient.get(`/OrderModify?${params.toString()}`);
};

export const orderDelete = (ticket) =>
  tradeClient.get(`/OrderDelete?${qs({ ticket })}`);

export const positionPriceChange = (ticket, new_price) =>
  tradeClient.get(`/PositionPriceChange?${qs({ ticket, new_price })}`);

export const positionVolumeChange = (ticket, new_lots) =>
  tradeClient.get(`/PositionVolumeChange?${qs({ ticket, new_lots })}`);

export const positionCommentChange = ({ ticket, comment, magic }) => {
  const params = new URLSearchParams({ ticket: String(ticket) });
  if (comment !== undefined) params.set('comment', comment);
  if (magic !== undefined) params.set('magic', String(magic));
  return tradeClient.get(`/PositionCommentChange?${params.toString()}`);
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
  return tradeClient.get(`/PositionForceCloseAll?${params.toString()}`);
};

export const positionFlip = (ticket) =>
  tradeClient.get(`/PositionFlip?${qs({ ticket })}`);

export const dealAdd = (payload) => tradeClient.post('/DealAdd', payload);
export const dealAddBatch = (payload) => tradeClient.post('/DealAddBatch', payload);
export const dealUpdate = (payload) => tradeClient.post('/DealUpdate', payload);
export const dealUpdateBatch = (payload) => tradeClient.post('/DealUpdateBatch', payload);
export const dealPerform = (payload) => tradeClient.post('/DealPerform', payload);

export const positionModifyStops = orderModify;

export const orderPriceChange = (ticket, price) =>
  tradeClient.get(`/OrderPriceChange?${qs({ ticket, price })}`);

export const orderReject = ({ ticket, comment }) => {
  const params = new URLSearchParams({ ticket: String(ticket) });
  if (comment) params.set('comment', comment);
  return tradeClient.get(`/OrderReject?${params.toString()}`);
};

export const orderApprove = ({ ticket, comment }) => {
  const params = new URLSearchParams({ ticket: String(ticket) });
  if (comment) params.set('comment', comment);
  return tradeClient.get(`/OrderApprove?${params.toString()}`);
};

export const getDealerQueue = () =>
  tradeClient.get('/DealerQueueList');

export const dealRollback = ({ deal, comment }) => {
  const params = new URLSearchParams({ deal: String(deal) });
  if (comment) params.set('comment', comment);
  return tradeClient.get(`/DealRollback?${params.toString()}`);
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
  return tradeClient.get(`/AccountRestrictSet?${query.toString()}`);
};

export const accountRestrictClear = (login) =>
  tradeClient.get(`/AccountRestrictClear?${qs({ login })}`);

export const accountRestrictList = () =>
  tradeClient.get('/AccountRestrictList');

export const accountSpreadSet = ({ login, symbol, markup }) =>
  tradeClient.get(`/AccountSpreadSet?${qs({ login, symbol, markup })}`);

export const accountExecutionSet = ({ login, mode, delay_ms }) =>
  tradeClient.get(`/AccountExecutionSet?${qs({ login, mode, delay_ms })}`);

export const accountBookSet = ({ login, book }) =>
  tradeClient.get(`/AccountBookSet?${qs({ login, book })}`);
