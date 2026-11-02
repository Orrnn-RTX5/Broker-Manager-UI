import { fetchManagerApi } from './managerFetch.js';
import {
  buildManagerOrderCloseEndpoint,
  buildManagerOrderStatusEndpoint,
  buildPendingOrdersListEndpoint,
  buildPendingOrderTicketEndpoint,
  MANAGER_API,
} from '../config/managerApiContract.js';

const readManagerTradeResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const createClientOrderId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `manager-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const pendingTradesByWindow = new WeakMap();
const pendingTrades = () => {
  const owner = globalThis.window || globalThis;
  if (!pendingTradesByWindow.has(owner)) pendingTradesByWindow.set(owner, new Map());
  return pendingTradesByWindow.get(owner);
};

const isMtRetErrorCode = (value) => typeof value === 'string' && /MT_RET_ERR_/i.test(value);

const getTradeErrorMessage = (result, fallback) => {
  if (typeof result?.message === 'string' && result.message !== '') return result.message;
  if (typeof result?.error?.message === 'string' && result.error.message !== '') return result.error.message;
  if (typeof result?.error === 'string' && result.error !== '') return result.error;
  return fallback;
};

const throwTradeError = (result, response, fallback) => {
  if (
    response.ok
    && result?.success !== false
    && result?.ok !== false
    && !result?.error
    && !isMtRetErrorCode(result?.retcode)
    && !isMtRetErrorCode(result?.code)
  ) return;
  throw Object.assign(
    new Error(getTradeErrorMessage(result, fallback)),
    { status: response.status, code: result?.code || result?.retcode || result?.error?.code }
  );
};

export const placeManagerOrder = async (payload = {}) => {
  // Persist unresolved identities before sending, including across a tab reload.
  // A second click checks the original command; it never submits a new UUID.
  const key = `manager.pendingTrade:${JSON.stringify(Object.entries(payload)
    .filter(([name]) => name !== 'client_order_id').sort(([a], [b]) => a.localeCompare(b)))}`;
  const storage = globalThis.window?.sessionStorage;
  const memory = pendingTrades();
  let pendingId = memory.get(key);
  try { pendingId ||= storage?.getItem(key); } catch { /* storage can be disabled */ }
  const request = {
    ...payload,
    client_order_id: pendingId || payload.client_order_id || createClientOrderId(),
  };
  const identity = { client_order_id: request.client_order_id, account_login: request.login };
  const forget = () => { memory.delete(key); try { storage?.removeItem(key); } catch { /* best effort */ } };
  const unresolved = (cause) => Object.assign(new Error(
    `Order status is unresolved. Account ${request.login}, order ${request.client_order_id}. Check this order's status before placing it again.`,
  ), identity, { code: 'ORDER_STATUS_UNKNOWN', statusUnknown: true, cause,
    checkStatus: () => getManagerOrderStatus(request.login, request.client_order_id) });
  const reconcile = async (cause) => {
    let status;
    try { status = await getManagerOrderStatus(request.login, request.client_order_id); }
    catch (error) {
      if (error.commandStatus === 'rejected' || error.commandStatus === 'expired') {
        forget(); throw Object.assign(error, identity);
      }
      throw unresolved(error);
    }
    if (status?.status === 'filled' || status?.status === 'succeeded') {
      forget(); return status.data ?? status;
    }
    throw unresolved(cause);
  };
  if (pendingId) return reconcile();
  memory.set(key, request.client_order_id);
  try { storage?.setItem(key, request.client_order_id); } catch { /* best effort */ }
  let response;
  let result;
  try {
    response = await fetchManagerApi(MANAGER_API.orders, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    result = await readManagerTradeResponse(response);
  } catch (error) { return reconcile(error); }
  if (response.status === 202 || response.status >= 500 || result?.status === 'accepted'
    || result?.code === 'ORDER_STATUS_UNKNOWN' || result?.error === 'ORDER_STATUS_UNKNOWN') {
    return reconcile(result);
  }
  try { throwTradeError(result, response, 'Failed to place manager order'); }
  catch (error) { forget(); throw Object.assign(error, identity); }
  forget();
  return result;
};

export const getManagerOrderStatus = async (login, clientOrderId) => {
  let result;
  try {
    const response = await fetchManagerApi(buildManagerOrderStatusEndpoint(login, clientOrderId), { method: 'GET' });
    result = await readManagerTradeResponse(response);
    throwTradeError(result, response, 'Failed to read manager order status');
    return result;
  } catch (error) {
    throw Object.assign(error, { client_order_id: clientOrderId, account_login: login, commandStatus: result?.status });
  }
};

/**
 * Close an open position through the versioned manager API.
 *
 * `fetchManagerApi` supplies the authenticated manager Bearer token. This must
 * remain a POST: the legacy mutating GET /OrderClose endpoint is disabled.
 */
export const closeManagerPosition = async (ticket) => {
  const response = await fetchManagerApi(
    buildManagerOrderCloseEndpoint(ticket),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }
  );
  const result = await readManagerTradeResponse(response);

  throwTradeError(result, response, 'Failed to close position');

  return result;
};

export const placePendingOrder = async (payload = {}) => {
  const clientOrderId = payload.client_order_id || createClientOrderId();
  const accountLogin = Number(payload.account_login ?? payload.login);
  const symbol = String(payload.symbol || '').trim();
  const side = String(payload.side || payload.operation || '').toLowerCase();
  const volume = Number(payload.volume ?? payload.lots);
  const type = String(payload.type || '').toLowerCase();
  const price = Number(payload.price);

  const wirePayload = {
    account_login: accountLogin,
    client_order_id: clientOrderId,
    symbol,
    side,
    volume,
    type,
    price,
  };

  if (payload.price_limit !== undefined && payload.price_limit !== null && Number(payload.price_limit) > 0) {
    wirePayload.price_limit = Number(payload.price_limit);
  }
  if (payload.sl !== undefined && payload.sl !== null && Number(payload.sl) > 0) {
    wirePayload.sl = Number(payload.sl);
  } else if (payload.stoploss !== undefined && payload.stoploss !== null && Number(payload.stoploss) > 0) {
    wirePayload.sl = Number(payload.stoploss);
  }
  if (payload.tp !== undefined && payload.tp !== null && Number(payload.tp) > 0) {
    wirePayload.tp = Number(payload.tp);
  } else if (payload.takeprofit !== undefined && payload.takeprofit !== null && Number(payload.takeprofit) > 0) {
    wirePayload.tp = Number(payload.takeprofit);
  }
  if (payload.expiry !== undefined && payload.expiry !== null && Number.isFinite(Number(payload.expiry)) && Number(payload.expiry) > 0) {
    wirePayload.expiry = Math.floor(Number(payload.expiry));
  }
  if (typeof payload.comment === 'string' && payload.comment.trim() !== '') {
    wirePayload.comment = payload.comment.trim();
  }

  const response = await fetchManagerApi(MANAGER_API.pendingOrders, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(wirePayload),
  });
  const result = await readManagerTradeResponse(response);
  throwTradeError(result, response, 'Failed to place pending order');
  return result;
};

export const modifyPendingOrder = async ({ ticket, account_login, login, price, sl, tp, expiry, comment } = {}) => {
  const accountLogin = Number(account_login ?? login);
  const wirePayload = { account_login: accountLogin };
  if (price !== undefined && price !== null && Number(price) > 0) wirePayload.price = Number(price);
  if (sl !== undefined && sl !== null && Number(sl) >= 0) wirePayload.sl = Number(sl);
  if (tp !== undefined && tp !== null && Number(tp) >= 0) wirePayload.tp = Number(tp);
  if (expiry !== undefined && expiry !== null && Number.isFinite(Number(expiry)) && Number(expiry) > 0) {
    wirePayload.expiry = Math.floor(Number(expiry));
  }
  if (typeof comment === 'string') wirePayload.comment = comment.trim();

  const response = await fetchManagerApi(buildPendingOrderTicketEndpoint(ticket), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(wirePayload),
  });
  const result = await readManagerTradeResponse(response);
  throwTradeError(result, response, 'Failed to modify pending order');
  return result;
};

export const cancelPendingOrder = async (ticket, accountLogin) => {
  const idempotencyKey = createClientOrderId();
  const response = await fetchManagerApi(buildPendingOrderTicketEndpoint(ticket, accountLogin), {
    method: 'DELETE',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  });
  const result = await readManagerTradeResponse(response);
  throwTradeError(result, response, 'Failed to cancel pending order');
  return result;
};

export const fetchPendingOrders = async (accountLogin) => {
  const response = await fetchManagerApi(buildPendingOrdersListEndpoint(accountLogin), {
    method: 'GET',
  });
  const result = await readManagerTradeResponse(response);
  throwTradeError(result, response, 'Failed to load pending orders');
  return Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : (Array.isArray(result?.orders) ? result.orders : []));
};

export default {
  closeManagerPosition,
  getManagerOrderStatus,
  placeManagerOrder,
  placePendingOrder,
  modifyPendingOrder,
  cancelPendingOrder,
  fetchPendingOrders,
};
