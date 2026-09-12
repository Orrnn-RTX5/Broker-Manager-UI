import { fetchManagerApi } from './managerFetch.js';
import { MANAGER_API } from '../config/managerApiContract.js';

export const MANAGER_TRANSACTION_ENDPOINTS = Object.freeze({
  deposit: MANAGER_API.transactionDeposit,
  withdraw: MANAGER_API.transactionWithdraw,
  credit: MANAGER_API.transactionCredit,
  transfer: MANAGER_API.transactionTransfer,
});

export const createTransactionIdempotencyKey = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const submitManagerTransaction = async (type, payload = {}) => {
  const endpoint = MANAGER_TRANSACTION_ENDPOINTS[type];
  if (!endpoint) throw new TypeError(`Unsupported manager transaction type: ${type}`);

  const response = await fetchManagerApi(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
    ...payload,
    idempotency_key: payload.idempotency_key || createTransactionIdempotencyKey(),
    }),
  });
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = { message: text };
  }

  if (!response.ok || result?.success === false || result?.ok === false || result?.error) {
    const detail = result?.message || result?.error || result?.detail;
    const message = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? detail.map((item) => item?.msg).filter(Boolean).join('; ')
      : detail?.message;
    throw new Error(message || `Manager ${type} transaction failed`);
  }
  return result;
};

export default { submitManagerTransaction };
