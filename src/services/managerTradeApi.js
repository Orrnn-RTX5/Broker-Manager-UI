import { fetchManagerApi } from './managerFetch.js';
import {
  buildManagerOrderCloseEndpoint,
  buildManagerOrderStatusEndpoint,
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

const throwTradeError = (result, response, fallback) => {
  if (response.ok && result?.success !== false && result?.ok !== false && !result?.error) return;
  throw Object.assign(
    new Error(result?.message || result?.error || fallback),
    { status: response.status, code: result?.code }
  );
};

export const placeManagerOrder = async (payload = {}) => {
  const request = {
    ...payload,
    client_order_id: payload.client_order_id || createClientOrderId(),
  };
  const response = await fetchManagerApi(MANAGER_API.orders, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const result = await readManagerTradeResponse(response);
  throwTradeError(result, response, 'Failed to place manager order');
  return result;
};

export const getManagerOrderStatus = async (login, clientOrderId) => {
  const response = await fetchManagerApi(buildManagerOrderStatusEndpoint(login, clientOrderId), { method: 'GET' });
  const result = await readManagerTradeResponse(response);
  throwTradeError(result, response, 'Failed to read manager order status');
  return result;
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

export default { closeManagerPosition, getManagerOrderStatus, placeManagerOrder };
