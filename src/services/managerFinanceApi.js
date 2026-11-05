import { fetchManagerApi } from './managerFetch.js';
import { MANAGER_API, buildManagerAccountEndpoint } from '../config/managerApiContract.js';
// The one source of the idempotency code lists lives in accountFinanceOps.js (round 7; no import cycle).
import { BALANCE_OP_ENABLED_TYPES, IDEMPOTENCY_CODE_CLASSES } from '../components/Popups/accountFinanceOps.js';

export const MANAGER_TRANSACTION_ENDPOINTS = Object.freeze({
  deposit: MANAGER_API.transactionDeposit,
  withdraw: MANAGER_API.transactionWithdraw,
  credit: MANAGER_API.transactionCredit,
  transfer: MANAGER_API.transactionTransfer,
  balanceOp: MANAGER_API.transactionBalanceOp,
});

// Exact decimal text, positive, at most two decimals. Money is never a JS Number here.
const DECIMAL_AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

// skip_margin_reason bounds (contract v3, 6.2 and 6.6). Same bounds as normalizeSkipMarginReason in accountFinanceOps.js.
const SKIP_MARGIN_REASON_MIN_LENGTH = 10;
const SKIP_MARGIN_REASON_MAX_LENGTH = 500;

// Statuses the contract defines. Any other `status` value is an unrecognised outcome.
const KNOWN_STATUSES = Object.freeze(['COMPLETED', 'UNRESOLVED', 'PENDING', 'REVERSED']);

// The engine-funding 202 (deposit, withdraw, credit, balance-op) carries the lowercase status "pending"
// (contract v7b 6.6; writeEngineFundingAccepted, engineFundingPendingStatus = "pending"). It is a pending outcome.
const ACCEPTED_202_STATUSES = Object.freeze(['UNRESOLVED', 'PENDING', 'pending']);

// Server idempotency codes that mean the operation is already done (PLAN exact-codes table).
export const ALREADY_APPLIED_IDEMPOTENCY_CODES = new Set(IDEMPOTENCY_CODE_CLASSES.alreadyApplied);

// Server idempotency codes that mean the request is still in flight or its outcome is unknown.
// Keep the key, stay pending, never treat as a definite refusal or unrecognised status.
export const PENDING_IDEMPOTENCY_CODES = new Set(IDEMPOTENCY_CODE_CLASSES.pending);

// Key-hold codes (M1, lead decision, PLAN.md:377; round 7 adds the key-rejection codes): the record and the account
// barrier are KEPT, no new key is offered, and only an explicit, logged manager acknowledgement unblocks the account.
// Never a definite refusal, and never cleared automatically.
export const KEY_HOLD_IDEMPOTENCY_CODES = new Set(IDEMPOTENCY_CODE_CLASSES.keyHold);

// 4xx/409/422 codes the contract and PLAN exact-codes table list as a definite refusal where
// nothing was applied for this request. Clear only THIS request's record, matched by key.
export const DEFINITE_REFUSAL_CODES = new Set(IDEMPOTENCY_CODE_CLASSES.definite);

/**
 * A failure from the manager money API. Keeps the server `code`, the HTTP
 * status and the response body.
 *
 * `definite` is true only when the server refused the request and nothing was
 * applied: a 4xx with a code from DEFINITE_REFUSAL_CODES, or a transfer REVERSED.
 * Anything else leaves the outcome unknown. `unrecognized` is true when the
 * server returned a status or a 4xx this UI does not know; it is a failure,
 * shown with the raw status and code, and its key is kept.
 */
export class ManagerTransactionError extends Error {
  constructor(message, {
    code = null, httpStatus = null, body = null, route = null, definite = false, unrecognized = false,
  } = {}) {
    super(message);
    this.name = 'ManagerTransactionError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.body = body;
    this.route = route;
    this.definite = definite;
    this.unrecognized = unrecognized;
  }
}

const normalizeTransferRoute = (route) => {
  if (!route || typeof route !== 'object') return null;
  const from = route.from === 'engine' || route.from === 'legacy' ? route.from : null;
  const to = route.to === 'engine' || route.to === 'legacy' ? route.to : null;
  if (from === null && to === null) return null;
  return { from, to };
};

const createPreSendTypeError = (message) => {
  const err = new TypeError(message);
  err.definite = true;
  err.preSend = true;
  return err;
};

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

/**
 * True only when the server definitively refused the operation (or a local pre-send TypeError
 * rejected the input before any network call was made): nothing was applied, so the record for
 * THIS request's key may be cleared.
 *
 * @param {unknown} error Error thrown by submitManagerTransaction.
 * @returns {boolean} True for a definite refusal.
 */
export const isDefiniteManagerTransactionRefusal = (error) => (
  (error instanceof ManagerTransactionError && error.definite === true)
  || (error instanceof TypeError && error.preSend === true && error.definite === true)
);

const extractMessage = (result, type) => {
  const detail = result?.message || result?.error || result?.detail;
  const message = typeof detail === 'string' ? detail
    : Array.isArray(detail) ? detail.map((item) => item?.msg).filter(Boolean).join('; ')
    : detail?.message;
  return message || `Manager ${type} transaction failed`;
};

// Replay signal (contract v5, header section): `X-Idempotency-Status: cached` means the server
// returned the first result for this key without a new engine mutation. `new` (or no header)
// means this request was applied now. The body `replayed` field is defined for balance-op only.
const readReplayed = (response, result) => {
  try {
    if (response.headers?.get?.('x-idempotency-status') === 'cached') return true;
  } catch {
    // Ignore header access failure.
  }
  return result?.replayed === true;
};

/**
 * Submit a money operation to the existing manager route.
 *
 * Outcomes:
 * - 2xx, no status or status COMPLETED: `{ status: 'ok' }`. `replayed` is true
 *   when the server answered from its idempotency cache (the operation was
 *   already applied by an earlier request with the same key).
 * - `KEY_ALREADY_APPLIED` (`IDEMPOTENCY_KEY_ALREADY_APPLIED`): `{ status: 'ok', replayed: true }`.
 * - 202: `{ status: 'pending' }`, or `{ status: 'unresolved' }` for a transfer
 *   (TRANSFER_UNRESOLVED). `reversal` is 'none' | 'pending' | null. A 202 is never a success.
 * - Transfer status REVERSED (409): throws a definite refusal with the body
 *   (`in_leg_code`, `from.login`). Nothing net moved.
 * - A definite 4xx/409/422 refusal throws ManagerTransactionError with definite true.
 * - Pending idempotency codes (`IN_FLIGHT`, `OUTCOME_UNKNOWN`, `STORE_UNAVAILABLE`, `UNAVAILABLE`,
 *   `UNVERIFIED`) throw ManagerTransactionError with definite false and unrecognized false.
 * - An unknown status, or a 4xx with a code this UI does not know, throws with
 *   `unrecognized` true, keeping the raw status or code and the HTTP status.
 * - A 5xx, a network failure or a 2xx refusal throws with definite false.
 *
 * @param {string} type Endpoint key: deposit | withdraw | credit | transfer | balanceOp.
 * @param {object} payload Request body. `amount` must be a decimal string.
 * @returns {Promise<{status: string, httpStatus: number, code: string|null,
 *   message: string, body: object|null, idempotencyKey: string,
 *   transferId: number|null, reversal: string|null, replayed: boolean}>}
 */
export const submitManagerTransaction = async (type, payload = {}) => {
  const endpoint = Object.prototype.hasOwnProperty.call(MANAGER_TRANSACTION_ENDPOINTS, type)
    ? MANAGER_TRANSACTION_ENDPOINTS[type]
    : null;
  if (!endpoint) throw createPreSendTypeError(`Unsupported manager transaction type: ${type}`);
  if (typeof payload.amount !== 'string' || !DECIMAL_AMOUNT_PATTERN.test(payload.amount) || !/[1-9]/.test(payload.amount)) {
    throw createPreSendTypeError('Transaction amount must be a positive decimal string.');
  }

  // balance-op (contract v7b 6.6): only the types this release enables, each with direction in or out. Anything else
  // (the SO types, the dividend types, a missing direction) is refused before any request is made.
  if (type === 'balanceOp') {
    if (!BALANCE_OP_ENABLED_TYPES.includes(payload.type)) {
      throw createPreSendTypeError(`Unsupported balance operation type: ${String(payload.type)}`);
    }
    if (payload.direction !== 'in' && payload.direction !== 'out') {
      throw createPreSendTypeError(`Unsupported balance operation direction: ${String(payload.direction)}`);
    }
  }

  const body = { ...payload };
  // The margin-check skip exists on a debit only: withdraw, or a balance-op `out`. Refuse it anywhere else, and
  // refuse a skip without a reason of 10 to 500 characters, before any request is made.
  if (Object.prototype.hasOwnProperty.call(payload, 'skip_margin_check')) {
    const debit = type === 'withdraw' || (type === 'balanceOp' && payload.direction === 'out');
    if (!debit || payload.skip_margin_check !== true) {
      throw createPreSendTypeError(`skip_margin_check is only accepted as true on withdraw or a balance-op out, not ${type}.`);
    }
    const reason = typeof payload.skip_margin_reason === 'string' ? payload.skip_margin_reason.trim() : '';
    if (reason.length < SKIP_MARGIN_REASON_MIN_LENGTH || reason.length > SKIP_MARGIN_REASON_MAX_LENGTH) {
      throw createPreSendTypeError(`skip_margin_reason of ${SKIP_MARGIN_REASON_MIN_LENGTH} to ${SKIP_MARGIN_REASON_MAX_LENGTH} characters is required with skip_margin_check.`);
    }
    body.skip_margin_reason = reason;
  }

  const idempotencyKey = payload.idempotency_key || createTransactionIdempotencyKey();
  const response = await fetchManagerApi(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...body,
      idempotency_key: idempotencyKey,
    }),
  });
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = { message: text };
  }
  const httpStatus = response.status;
  const replayed = readReplayed(response, result);
  const code = typeof result?.code === 'string' ? result.code : null;
  const statusText = typeof result?.status === 'string' ? result.status : null;
  const transferId = Number.isSafeInteger(result?.transfer_id) ? result.transfer_id : null;
  const reversal = typeof result?.reversal === 'string' ? result.reversal : null;
  const route = normalizeTransferRoute(result?.route);
  const message = extractMessage(result, type);
  const unknownStatus = statusText !== null && !KNOWN_STATUSES.includes(statusText);

  if (type === 'transfer' && statusText === 'REVERSED') {
    throw new ManagerTransactionError(message, {
      code: 'TRANSFER_REVERSED',
      httpStatus,
      body: result,
      route,
      definite: true,
    });
  }

  if (code !== null && ALREADY_APPLIED_IDEMPOTENCY_CODES.has(code)) {
    return {
      status: 'ok',
      httpStatus,
      code,
      message: typeof result?.message === 'string' ? result.message : '',
      body: result && typeof result === 'object' ? result : null,
      idempotencyKey,
      transferId,
      reversal: null,
      route,
      replayed: true,
    };
  }

  if (httpStatus === 202) {
    if (statusText !== null && !ACCEPTED_202_STATUSES.includes(statusText)) {
      throw new ManagerTransactionError(typeof result?.error === 'string' ? result.error : `Unrecognised status: ${statusText}`, {
        code: code ?? statusText,
        httpStatus,
        body: result,
        route,
        unrecognized: true,
      });
    }
    return {
      status: type === 'transfer' || code === 'TRANSFER_UNRESOLVED' ? 'unresolved' : 'pending',
      httpStatus,
      code,
      message,
      body: result,
      idempotencyKey,
      transferId,
      reversal,
      route,
      replayed,
    };
  }

  if (!response.ok) {
    if (unknownStatus) {
      throw new ManagerTransactionError(message, { code: code ?? statusText, httpStatus, body: result, unrecognized: true });
    }
    if (code !== null && PENDING_IDEMPOTENCY_CODES.has(code)) {
      throw new ManagerTransactionError(message, { code, httpStatus, body: result, definite: false, unrecognized: false });
    }
    if (code !== null && KEY_HOLD_IDEMPOTENCY_CODES.has(code)) {
      throw new ManagerTransactionError(message, { code, httpStatus, body: result, definite: false, unrecognized: false });
    }
    if (httpStatus >= 400 && httpStatus < 500) {
      if (code !== null && DEFINITE_REFUSAL_CODES.has(code)) {
        throw new ManagerTransactionError(message, { code, httpStatus, body: result, definite: true, unrecognized: false });
      }
      // A 4xx this UI does not recognise: show the raw code and HTTP status, keep the key and the form.
      throw new ManagerTransactionError(message, { code, httpStatus, body: result, unrecognized: true });
    }
    // 5xx and anything else: the outcome may already have been applied.
    throw new ManagerTransactionError(message, { code, httpStatus, body: result, definite: false });
  }

  // Every 200 on these routes carries success: true (contract v5, 6.1-6.5). Any other 2xx body
  // (empty, HTML, or JSON without the flag) is not a confirmed success: the outcome is unknown.
  const explicitFailure = result !== null && typeof result === 'object'
    && (result.success === false || result.ok === false || Boolean(result.error));
  if (explicitFailure) {
    throw new ManagerTransactionError(message, { code, httpStatus, body: result, definite: false });
  }
  if (result === null || typeof result !== 'object' || result.success !== true) {
    throw new ManagerTransactionError(`The server did not confirm the result (HTTP ${httpStatus}). The outcome is unknown.`, {
      code,
      httpStatus,
      body: null,
      definite: false,
    });
  }

  if (statusText !== null && statusText !== 'COMPLETED') {
    throw new ManagerTransactionError(typeof result?.error === 'string' ? result.error : `Unrecognised status: ${statusText}`, {
      code: code ?? statusText,
      httpStatus,
      body: result,
      unrecognized: true,
    });
  }

  return {
    status: 'ok',
    httpStatus,
    code,
    message: typeof result?.message === 'string' ? result.message : '',
    body: result,
    idempotencyKey,
    transferId,
    reversal: null,
    route,
    replayed,
  };
};

/** A failed balance-history read: a non-2xx status, or a body that is not JSON or has no `items` array. */
export class ManagerHistoryError extends Error {
  constructor(message, { httpStatus = null } = {}) {
    super(message);
    this.name = 'ManagerHistoryError';
    this.httpStatus = httpStatus;
  }
}

/**
 * GET /api/v1/manager/accounts/{login}/balance-history (API contract 6.9). R8b: `from` (unix seconds, the window start),
 * `limit` (1 to 500, default 100) and `cursor` (the previous page's next_cursor) are sent when given. Resolves to
 * `{ items, nextCursor }`: the rows as the server sent them (the row shape is checked by the caller) and the next page
 * cursor or null. Throws ManagerHistoryError on a non-2xx status or a bad body; a network failure rejects.
 *
 * @param {number|string} login Account login.
 * R10 (L4): `{ signal }` (third argument, optional) cancels the request; the caller's timeout uses it.
 *
 * @param {number|string} login Account login.
 * @param {{ limit?: number, from?: number, cursor?: string }} [options] Any value out of range is left out, or the default is used.
 * @param {{ signal?: AbortSignal }} [control] Optional abort signal for the request.
 * @returns {Promise<{ items: object[], nextCursor: string|null }>}
 */
export const fetchManagerBalanceHistory = async (login, { limit = 100, from, cursor } = {}, control = {}) => {
  const params = new URLSearchParams();
  params.set('limit', String(Number.isSafeInteger(limit) && limit >= 1 && limit <= 500 ? limit : 100));
  if (Number.isSafeInteger(from) && from >= 0) params.set('from', String(from));
  if (typeof cursor === 'string' && cursor !== '') params.set('cursor', cursor);
  const signal = control?.signal;
  const response = await fetchManagerApi(`${buildManagerAccountEndpoint(login)}/balance-history?${params.toString()}`, {
    method: 'GET',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new ManagerHistoryError(`Balance history request failed (HTTP ${response.status})`, { httpStatus: response.status });
  }
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new ManagerHistoryError('Balance history response is not JSON', { httpStatus: response.status });
  }
  if (body === null || typeof body !== 'object' || !Array.isArray(body.items)) {
    throw new ManagerHistoryError('Balance history response has an unexpected shape', { httpStatus: response.status });
  }
  const nextCursor = typeof body.next_cursor === 'string' && body.next_cursor !== '' ? body.next_cursor : null;
  return { items: body.items, nextCursor };
};

export default { submitManagerTransaction };
