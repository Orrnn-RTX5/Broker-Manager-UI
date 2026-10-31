import { fetchManagerApi } from './managerFetch.js';
import { buildFeedWsUrl } from '../config/endpoints.js';
import {
  buildManagerOrderCloseEndpoint,
  buildManagerOrderStatusEndpoint,
  MANAGER_API,
} from '../config/managerApiContract.js';

const PENDING_ORDER_TYPES = new Set([
  'buy_limit',
  'sell_limit',
  'buy_stop',
  'sell_stop',
  'buy_stop_limit',
  'sell_stop_limit',
]);

export const normalizePendingOrderType = (value = '') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return PENDING_ORDER_TYPES.has(normalized) ? normalized : '';
};

const formatDecimalParam = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const text = String(value).trim();
  if (/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(text)) {
    return text.includes('.') ? text.replace(/\.?0+$/, '') || '0' : text;
  }
  return String(num);
};

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

const buildManagerTradeWsUrl = (ticketResponse) => {
  if (
    ticketResponse?.ws_path !== '/ws/manager-trade'
    || typeof ticketResponse?.ticket !== 'string'
    || !ticketResponse.ticket.trim()
  ) {
    throw new Error('Invalid trade socket authorization.');
  }
  const url = new URL(buildFeedWsUrl());
  url.pathname = ticketResponse.ws_path;
  url.search = '';
  url.hash = '';
  url.username = '';
  url.password = '';
  url.searchParams.set('ticket', ticketResponse.ticket.trim());
  return url.toString();
};

const executeManagerPendingWsCommand = async (accountLogin, action, commandPayload, timeoutMs = 15000) => {
  if (typeof globalThis.WebSocket !== 'function') {
    throw Object.assign(new Error('WebSocket unavailable'), { code: 'WS_UNAVAILABLE' });
  }
  const ticketRes = await fetchManagerApi('/api/v1/manager/trade-ws-ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account_login: Number(accountLogin) }),
  });
  const ticketData = await readManagerTradeResponse(ticketRes);
  if (!ticketRes.ok || !ticketData?.ticket) {
    throw Object.assign(
      new Error(getTradeErrorMessage(ticketData, 'Trade socket authorization unavailable')),
      { status: ticketRes.status, code: ticketData?.code || 'WS_TICKET_UNAVAILABLE' }
    );
  }
  const wsUrl = buildManagerTradeWsUrl(ticketData);
  const clientOrderId = commandPayload.client_order_id || createClientOrderId();
  const requestId = createClientOrderId();

  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer = null;
    const ws = new globalThis.WebSocket(wsUrl);

    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(pollTimer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(val);
    };

    const timer = setTimeout(() => {
      finish(Object.assign(
        new Error(`Pending order command timed out for account ${accountLogin}.`),
        { code: 'ORDER_STATUS_UNKNOWN', statusUnknown: true, client_order_id: clientOrderId, account_login: Number(accountLogin) }
      ));
    }, timeoutMs);

    const scheduleStatusPoll = () => {
      clearTimeout(pollTimer);
      pollTimer = setTimeout(() => {
        if (settled || ws.readyState !== 1) return;
        try {
          ws.send(JSON.stringify({
            action: 'get_order_status',
            request_id: requestId,
            client_order_id: clientOrderId,
            account_login: Number(accountLogin),
          }));
        } catch { /* ignore */ }
      }, 1000);
    };

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({
          action,
          request_id: requestId,
          client_order_id: clientOrderId,
          account_login: Number(accountLogin),
          ...commandPayload,
        }));
      } catch (err) {
        finish(err);
      }
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.client_order_id && msg.client_order_id !== clientOrderId) return;
      if (msg.request_id && msg.request_id !== requestId && msg.client_order_id !== clientOrderId) return;

      const type = String(msg.type || '');
      const status = String(msg.status || '');

      if (
        type === 'pending_order_accepted'
        || type === 'pending_order_cancel_accepted'
        || type === 'pending_order_modify_accepted'
        || status === 'accepted'
        || status === 'processing'
      ) {
        scheduleStatusPoll();
        return;
      }

      if (
        (type === 'pending_order_placed' || type === 'pending_order_cancelled' || type === 'pending_order_modified')
        && (status === 'succeeded' || status === 'filled')
      ) {
        const data = msg.data && typeof msg.data === 'object' ? msg.data : {};
        const ticket = data.ticket_text ?? data.ticket ?? commandPayload.ticket;
        finish(null, {
          ...data,
          ticket,
          order_ticket: ticket,
          order: ticket,
          status: data.status || 'pending',
          retcode: 'MT_RET_REQUEST_DONE',
          client_order_id: clientOrderId,
          account_login: Number(accountLogin),
          ok: true,
          success: true,
        });
        return;
      }

      if (
        type === 'pending_order_rejected'
        || type === 'pending_order_cancel_rejected'
        || type === 'pending_order_modify_rejected'
        || status === 'rejected'
        || status === 'expired'
        || type === 'order_error'
        || type === 'error'
      ) {
        const errMessage = getTradeErrorMessage(msg, 'Pending order command rejected');
        finish(Object.assign(new Error(errMessage), {
          code: msg.error?.code || msg.code || 'PENDING_ORDER_REJECTED',
          client_order_id: clientOrderId,
          account_login: Number(accountLogin),
          commandStatus: status || 'rejected',
        }));
      }
    };

    ws.onerror = () => {
      finish(Object.assign(new Error('Trade socket connection error'), { code: 'WS_CONNECTION_ERROR' }));
    };

    ws.onclose = () => {
      if (!settled) {
        finish(Object.assign(new Error('Trade socket closed before confirmation'), { code: 'WS_CLOSED' }));
      }
    };
  });
};

export const placeManagerPendingOrder = async (payload = {}) => {
  const login = Number(payload.login ?? payload.account_login);
  const symbol = String(payload.symbol || '').trim().toUpperCase();
  const orderType = normalizePendingOrderType(payload.orderType ?? payload.type ?? payload.operation);
  const lots = Number(payload.lots ?? payload.volume);
  const price = Number(payload.price ?? payload.priceTrigger ?? payload.price_trigger);
  const priceLimit = payload.price_limit ?? payload.priceLimit ?? payload.limitPrice;
  const stoploss = Number(payload.stoploss ?? payload.sl ?? 0);
  const takeprofit = Number(payload.takeprofit ?? payload.tp ?? 0);
  const comment = payload.comment ? String(payload.comment).trim() : '';
  const rawExpiry = payload.expiry ?? payload.expiration;
  let expiry;
  if (rawExpiry !== undefined && rawExpiry !== null && rawExpiry !== '') {
    const numExpiry = Number(rawExpiry);
    if (Number.isFinite(numExpiry) && numExpiry > 0) {
      expiry = numExpiry > 1e11 ? Math.floor(numExpiry / 1000) : Math.floor(numExpiry);
    } else {
      const parsedMs = new Date(rawExpiry).getTime();
      if (Number.isFinite(parsedMs) && parsedMs > 0) {
        expiry = Math.floor(parsedMs / 1000);
      }
    }
  }
  const timeInForce = payload.time_in_force ?? payload.timeInForce;

  if (!Number.isSafeInteger(login) || login <= 0) {
    throw new Error('Account login must be a positive integer.');
  }
  if (!symbol) {
    throw new Error('Select a symbol before placing a pending order.');
  }
  if (!orderType) {
    throw new Error('Select a valid pending order type (Buy Limit, Sell Limit, Buy Stop, Sell Stop).');
  }
  if (!Number.isFinite(lots) || lots <= 0 || lots > 1000) {
    throw new Error('Volume must be greater than 0 and no more than 1,000 lots.');
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Trigger price must be greater than 0 for pending orders.');
  }
  if (orderType.endsWith('stop_limit') && (!Number.isFinite(Number(priceLimit)) || Number(priceLimit) <= 0)) {
    throw new Error('Stop-limit price must be greater than 0 for stop-limit orders.');
  }
  if (!Number.isFinite(stoploss) || stoploss < 0 || !Number.isFinite(takeprofit) || takeprofit < 0) {
    throw new Error('Stop loss and take profit must be zero or positive prices.');
  }

  const clientOrderId = payload.client_order_id || createClientOrderId();
  const wsPayload = {
    client_order_id: clientOrderId,
    symbol,
    type: orderType,
    volume: formatDecimalParam(lots),
    price: formatDecimalParam(price),
    ...(Number(priceLimit) > 0 ? { price_limit: formatDecimalParam(priceLimit) } : {}),
    ...(stoploss > 0 ? { sl: formatDecimalParam(stoploss) } : {}),
    ...(takeprofit > 0 ? { tp: formatDecimalParam(takeprofit) } : {}),
    ...(expiry !== undefined && expiry !== '' ? { expiry: expiry === null ? null : Number(expiry) } : {}),
    ...(timeInForce ? { time_in_force: String(timeInForce).toUpperCase() } : {}),
    ...(comment ? { comment } : {}),
  };

  if (typeof globalThis.WebSocket === 'function') {
    try {
      return await executeManagerPendingWsCommand(login, 'place_pending_order', wsPayload);
    } catch (wsErr) {
      if (wsErr?.commandStatus === 'rejected' || wsErr?.commandStatus === 'expired' || wsErr?.statusUnknown) {
        throw wsErr;
      }
    }
  }

  const response = await fetchManagerApi('/OrderSend', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      login,
      symbol,
      operation: orderType.toUpperCase(),
      lots,
      price,
      ...(stoploss > 0 ? { stoploss } : {}),
      ...(takeprofit > 0 ? { takeprofit } : {}),
      ...(comment ? { comment } : {}),
    }),
  });
  const result = await readManagerTradeResponse(response);
  throwTradeError(result, response, 'Failed to place pending order');
  const resolvedTicket = result?.ticket ?? result?.order ?? result?.result?.order ?? result?.answer?.ticket;
  if (resolvedTicket && typeof result === 'object' && result !== null && !result.ticket) {
    return { ...result, ticket: resolvedTicket };
  }
  return result;
};

export const modifyManagerPendingOrder = async (payload = {}) => {
  const ticket = payload.ticket ?? payload.order ?? payload.position;
  const login = Number(payload.login ?? payload.account_login ?? 0);
  const price = payload.price !== undefined && payload.price !== null && Number(payload.price) > 0 ? Number(payload.price) : undefined;
  const stoploss = payload.stoploss ?? payload.sl;
  const takeprofit = payload.takeprofit ?? payload.tp;

  if (!ticket) {
    throw new Error('Pending order ticket is required.');
  }

  if (typeof globalThis.WebSocket === 'function' && Number.isSafeInteger(login) && login > 0) {
    const wsPayload = {
      client_order_id: payload.client_order_id || createClientOrderId(),
      ticket: String(ticket),
      ...(price !== undefined ? { price: formatDecimalParam(price) } : {}),
      ...(stoploss !== undefined && stoploss !== null ? { sl: formatDecimalParam(stoploss) } : {}),
      ...(takeprofit !== undefined && takeprofit !== null ? { tp: formatDecimalParam(takeprofit) } : {}),
    };
    try {
      return await executeManagerPendingWsCommand(login, 'modify_pending_order', wsPayload);
    } catch (wsErr) {
      if (wsErr?.commandStatus === 'rejected' || wsErr?.commandStatus === 'expired' || wsErr?.statusUnknown) {
        throw wsErr;
      }
    }
  }

  const response = await fetchManagerApi('/OrderModify', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ticket: Number(ticket),
      ...(stoploss !== undefined && stoploss !== null ? { stoploss: Number(stoploss) } : {}),
      ...(takeprofit !== undefined && takeprofit !== null ? { takeprofit: Number(takeprofit) } : {}),
    }),
  });
  const result = await readManagerTradeResponse(response);
  throwTradeError(result, response, 'Failed to modify pending order');
  return result;
};

export const cancelManagerPendingOrder = async (payload = {}) => {
  const ticket = typeof payload === 'object' && payload !== null
    ? (payload.ticket ?? payload.order ?? payload.position)
    : payload;
  const login = typeof payload === 'object' && payload !== null
    ? Number(payload.login ?? payload.account_login ?? 0)
    : 0;

  if (!ticket) {
    throw new Error('Pending order ticket is required.');
  }

  if (typeof globalThis.WebSocket === 'function' && Number.isSafeInteger(login) && login > 0) {
    const wsPayload = {
      client_order_id: (typeof payload === 'object' && payload?.client_order_id) || createClientOrderId(),
      ticket: String(ticket),
    };
    try {
      return await executeManagerPendingWsCommand(login, 'cancel_pending_order', wsPayload);
    } catch (wsErr) {
      if (wsErr?.commandStatus === 'rejected' || wsErr?.commandStatus === 'expired' || wsErr?.statusUnknown) {
        throw wsErr;
      }
    }
  }

  const response = await fetchManagerApi('/OrderDelete', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ticket: Number(ticket),
    }),
  });
  const result = await readManagerTradeResponse(response);
  throwTradeError(result, response, 'Failed to cancel pending order');
  return result;
};

export default {
  cancelManagerPendingOrder,
  closeManagerPosition,
  getManagerOrderStatus,
  modifyManagerPendingOrder,
  normalizePendingOrderType,
  placeManagerOrder,
  placeManagerPendingOrder,
};
