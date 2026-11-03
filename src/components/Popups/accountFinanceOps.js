/**
 * Pure finance-operation helpers for the account Balance tab (MT5-style).
 *
 * The Balance tab lists the MT5 operations. Each operation plus a direction
 * (`in` from the Deposit (+) button, `out` from the Withdrawal (-) button)
 * maps onto a manager money route. Phase A wires only routes that already
 * exist: Balance (deposit / withdraw), Credit (credit, and credit out with
 * `credit_out: true`) and Transfer. The other operations are listed but
 * disabled until their balance-op route exists.
 *
 * Money stays an exact decimal string: amounts are validated as text and are
 * never converted to a JS Number.
 *
 * Tenant-agnostic: no broker names, logins, currencies, endpoints, or keys
 * here. This module emits no markup or styles.
 */

export const DIRECTION_IN = 'in';
export const DIRECTION_OUT = 'out';

export const MANAGER_UNKNOWN_MONEY_TEXT = '—';

const MAX_COMMENT_LENGTH = 500;
const MAX_AMOUNT_WHOLE = '1000000';

// MT5 order. `enabled` stays false until the operation's route exists.
const OPERATIONS = Object.freeze({
  balance: Object.freeze({ label: 'Balance', enabled: true }),
  credit: Object.freeze({ label: 'Credit', enabled: true }),
  charge: Object.freeze({ label: 'Charge', enabled: false }),
  correction: Object.freeze({ label: 'Correction', enabled: false }),
  bonus: Object.freeze({ label: 'Bonus', enabled: false }),
  commission: Object.freeze({ label: 'Commission', enabled: false }),
  tax: Object.freeze({ label: 'Tax', enabled: false }),
  so_compensation: Object.freeze({ label: 'SO compensation', enabled: false }),
  so_credit_compensation: Object.freeze({ label: 'SO credit compensation', enabled: false }),
  transfer: Object.freeze({ label: 'Transfer', enabled: true }),
});

export const MANAGER_TRANSACTION_TYPES = Object.freeze(Object.keys(OPERATIONS));

export const DEFAULT_MANAGER_TRANSACTION_TYPE = 'balance';

// Existing routes only. Keys are `${type}:${direction}`; transfer has no direction.
const ROUTES = Object.freeze({
  'balance:in': Object.freeze({ endpointKey: 'deposit', extraFields: Object.freeze({}) }),
  'balance:out': Object.freeze({ endpointKey: 'withdraw', extraFields: Object.freeze({}) }),
  'credit:in': Object.freeze({ endpointKey: 'credit', extraFields: Object.freeze({}) }),
  'credit:out': Object.freeze({ endpointKey: 'credit', extraFields: Object.freeze({ credit_out: true }) }),
  'transfer:none': Object.freeze({ endpointKey: 'transfer', extraFields: Object.freeze({}) }),
});

// Copy per route. `prefix` names the operation in failure text.
const COPY = Object.freeze({
  'balance:in': Object.freeze({
    prefix: 'Deposit',
    confirm: (amount, login) => `Deposit ${amount} into account #${login}?`,
    success: (amount, login) => `Deposited ${amount} into account #${login} successfully.`,
  }),
  'balance:out': Object.freeze({
    prefix: 'Withdraw',
    confirm: (amount, login) => `Withdraw ${amount} from account #${login}?`,
    success: (amount, login) => `Withdrew ${amount} from account #${login} successfully.`,
  }),
  'credit:in': Object.freeze({
    prefix: 'Credit',
    confirm: (amount, login) => `Credit ${amount} to account #${login}?`,
    success: (amount, login) => `Credited ${amount} to account #${login} successfully.`,
  }),
  'credit:out': Object.freeze({
    prefix: 'Withdraw credit',
    confirm: (amount, login) => `Withdraw credit ${amount} from account #${login}?`,
    success: (amount, login) => `Credit withdrawn ${amount} from account #${login} successfully.`,
  }),
  'transfer:none': Object.freeze({
    prefix: 'Transfer',
    confirm: (amount, login, destination) => (destination
      ? `Transfer ${amount} from account #${login} to account #${destination}?`
      : `Transfer ${amount} from account #${login}?`),
    success: (amount, login, destination) => (destination
      ? `Transferred ${amount} from account #${login} to account #${destination} successfully.`
      : `Transferred ${amount} from account #${login} successfully.`),
  }),
});

// Comment suggestions shown per operation. The comment stays editable.
const COMMENT_PRESETS = Object.freeze({
  balance: Object.freeze(['Deposit', 'Withdrawal']),
  credit: Object.freeze(['Credit in', 'Credit out']),
  charge: Object.freeze(['Charge']),
  correction: Object.freeze(['Correction']),
  bonus: Object.freeze(['Bonus']),
  commission: Object.freeze(['Commission']),
  tax: Object.freeze(['Tax']),
  so_compensation: Object.freeze(['SO compensation']),
  so_credit_compensation: Object.freeze(['SO credit compensation']),
  transfer: Object.freeze(['Transfer']),
});

// Balance-op directions allowed by contract v4. Phase A keeps every balance-op type
// disabled (no route yet), so these only describe the Phase B mapping.
const BALANCE_OP_DIRECTIONS = Object.freeze({
  charge: Object.freeze([DIRECTION_IN, DIRECTION_OUT]),
  correction: Object.freeze([DIRECTION_IN, DIRECTION_OUT]),
  bonus: Object.freeze([DIRECTION_IN, DIRECTION_OUT]),
  commission: Object.freeze([DIRECTION_IN, DIRECTION_OUT]),
  tax: Object.freeze([DIRECTION_IN, DIRECTION_OUT]),
  so_compensation: Object.freeze([DIRECTION_IN]),
  so_credit_compensation: Object.freeze([DIRECTION_OUT]),
});

/**
 * Directions the balance-op route accepts for an operation (contract v4).
 * Empty for operations that are not balance-op types.
 *
 * @param {string} type Operation.
 * @returns {string[]} Fresh array of 'in' and/or 'out'.
 */
export function getManagerBalanceOpDirections(type) {
  const key = resolveManagerTransactionType(type);
  return [...(BALANCE_OP_DIRECTIONS[key] ?? [])];
}

// ACCOUNT_ENGINE_OWNED is in contract v5 (transfer 409). ACCOUNT_NOT_ENGINE_OWNED is NOT in v5:
// it stays mapped here only as a generic fallback message for transfer. The API layer does not
// mark it as a definite refusal, so it is shown as an unrecognised status with the raw code.
const TRANSFER_ENGINE_OWNED_CODES = Object.freeze(['ACCOUNT_ENGINE_OWNED', 'ACCOUNT_NOT_ENGINE_OWNED']);
const INSUFFICIENT_FUNDS_TEXT = 'Insufficient balance / free margin';
const TRANSFER_UNAVAILABLE_TEXT = 'Transfer not available on this server version';
const PENDING_TEXT = 'Pending: check history, do not repeat. Send the same form again only to retry it.';
const TRANSFER_UNRESOLVED_TEXT = 'Transfer is half applied. Send the same form again to complete it. Do not change the form.';
const TRANSFER_REVERSAL_PENDING_TEXT = 'Transfer is unresolved: the return of the amount is pending. Retry with the same key. Do not change the form.';
// R8 (a): an expired record is retried with the same key (safe under the verified server model), or checked in the history.
export const EXPIRED_PENDING_TEXT = 'Status unknown: retry with the same key (recommended) or check history';
export const IN_FLIGHT_PENDING_TEXT = 'Operation is still in flight. Retry with the same key after a short wait.';
export const OUTCOME_UNKNOWN_PENDING_TEXT = 'Outcome unknown — check history before retrying with the same key.';
export const STORE_UNAVAILABLE_PENDING_TEXT = 'Idempotency store unavailable — check history and retry with the same key.';
export const UNVERIFIED_PENDING_TEXT = 'Idempotency state could not be verified — check history and retry with the same key.';
// M1: KEY_REUSED / MISMATCH. The server holds a different request under this key. No new key is offered.
export const KEY_HOLD_PENDING_TEXT = 'The server rejected this idempotency key because it holds a different request under it. The original outcome is unknown. No new key is offered. Check the account history, then acknowledge the record as checked.';
// One source for every idempotency code list the UI acts on. rtx-s1 verified 2026-11-02 at c0ba73ab.
// - alreadyApplied: the operation is done; the record clears (replay, success).
// - pending: the outcome is still unknown; the key is kept and the same-key retry is allowed.
// - keyHold: the record and the account barrier are KEPT, the code and a specific text are shown, no new key and no
//   same-key retry are offered, and only an explicit, logged acknowledgement unblocks the account. This covers
//   KEY_REQUIRED (not covered by rtx-s1: safe default), KEY_CONFLICT, IDEMPOTENCY_CONFLICT (an earlier operation with
//   this key may have moved money), KEY_REUSED and MISMATCH (the server holds a different request under this key).
// - definite: the server refused the request and nothing was applied; only this request's record clears. KEY_INVALID
//   is definite: the server code is IDEMPOTENCY_KEY_INVALID (short form KEY_INVALID), rejected before any reservation
//   (money_idempotency.go:440-447).
export const IDEMPOTENCY_CODE_CLASSES = Object.freeze({
  alreadyApplied: Object.freeze([
    'IDEMPOTENCY_KEY_ALREADY_APPLIED',
    'KEY_ALREADY_APPLIED',
  ]),
  pending: Object.freeze([
    'IDEMPOTENCY_IN_FLIGHT',
    'IN_FLIGHT',
    'IN_PROGRESS',
    'IDEMPOTENCY_OUTCOME_UNKNOWN',
    'OUTCOME_UNKNOWN',
    'IDEMPOTENCY_STORE_UNAVAILABLE',
    'STORE_UNAVAILABLE',
    'IDEMPOTENCY_UNAVAILABLE',
    'UNAVAILABLE',
    'IDEMPOTENCY_UNVERIFIED',
    'UNVERIFIED',
  ]),
  keyHold: Object.freeze([
    'IDEMPOTENCY_KEY_REUSED',
    'KEY_REUSED',
    'IDEMPOTENCY_MISMATCH',
    'MISMATCH',
    'IDEMPOTENCY_KEY_REQUIRED',
    'KEY_REQUIRED',
    'IDEMPOTENCY_KEY_CONFLICT',
    'KEY_CONFLICT',
    'IDEMPOTENCY_CONFLICT',
  ]),
  definite: Object.freeze([
    'INSUFFICIENT_FUNDS',
    'INSUFFICIENT_MARGIN',
    'ACCOUNT_ENGINE_OWNED',
    'CREDIT_OUT_ENGINE_ONLY',
    'SKIP_MARGIN_NOT_PERMITTED',
    'SKIP_MARGIN_ENGINE_ONLY',
    'INVALID_INPUT',
    'IDEMPOTENCY_KEY_INVALID',
    'KEY_INVALID',
    'TRANSFER_CUSTODY_MISMATCH',
    'CURRENCY_MISMATCH',
    'STOP_OUT_IN_PROGRESS',
    'BALANCE_OP_ENGINE_ONLY',
    'OP_NOT_SUPPORTED',
    'FORBIDDEN',
    'TRANSFER_REVERSED',
  ]),
});

// Round 7: one source for the key-hold set (see IDEMPOTENCY_CODE_CLASSES above).
const KEY_HOLD_CODES = Object.freeze([...IDEMPOTENCY_CODE_CLASSES.keyHold]);
// The key-hold codes that say the server holds a different request under this key (KEY_HOLD_PENDING_TEXT).
const KEY_REUSE_CODES = Object.freeze(['IDEMPOTENCY_KEY_REUSED', 'KEY_REUSED', 'IDEMPOTENCY_MISMATCH', 'MISMATCH']);
// The key-conflict codes: an earlier operation with this key may already have moved money.
const KEY_CONFLICT_CODES = Object.freeze(['IDEMPOTENCY_KEY_CONFLICT', 'KEY_CONFLICT', 'IDEMPOTENCY_CONFLICT']);
// Round 7: the key-rejection text (KEY_REQUIRED). Same key-hold behaviour, with its own specific text.
export const KEY_REJECTED_PENDING_TEXT = 'The server rejected this idempotency key. The outcome of this operation is unknown. No new key and no same-key retry are offered. Check the account history, then acknowledge the record as checked.';
// Round 7: the key-conflict text (IDEMPOTENCY_CONFLICT, KEY_CONFLICT, IDEMPOTENCY_KEY_CONFLICT).
export const KEY_CONFLICT_PENDING_TEXT = 'An earlier operation with this idempotency key may already have moved money. Check the balance history before you acknowledge this record. No new key and no same-key retry are offered.';
// The key-hold text for a code, or null when the code is not a key-hold code.
const keyHoldTextFor = (code) => {
  if (code === null || !KEY_HOLD_CODES.includes(code)) return null;
  if (KEY_REUSE_CODES.includes(code)) return KEY_HOLD_PENDING_TEXT;
  if (KEY_CONFLICT_CODES.includes(code)) return KEY_CONFLICT_PENDING_TEXT;
  return KEY_REJECTED_PENDING_TEXT;
};

/** True for a key-hold code (M1): the record and barrier stay, and no new key or same-key retry is offered. */
export const isKeyHoldCode = (code) => typeof code === 'string' && KEY_HOLD_CODES.includes(code.trim());

/** Display label of an operation (e.g. 'Balance'). Unknown types give ''. */
export const getManagerTransactionLabel = (type) => {
  const normalized = String(type ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(OPERATIONS, normalized) ? OPERATIONS[normalized].label : '';
};
const UNRECOGNISED_STATUS_TEXT = 'Unrecognised status';
const REFUSAL_FALLBACK_TEXT = 'The request was not completed.';

// Shown when the server answers a repeated key from its cache (`X-Idempotency-Status: cached`
// or `KEY_ALREADY_APPLIED` / `IDEMPOTENCY_KEY_ALREADY_APPLIED`).
export const MANAGER_REPLAY_TEXT = 'Already done — balance refreshed';

export const SKIP_MARGIN_REASON_MIN_LENGTH = 10;
export const SKIP_MARGIN_REASON_MAX_LENGTH = 500;

/**
 * Validate the reason required when the margin check is skipped.
 *
 * @param {string} raw Typed reason.
 * @returns {string} The trimmed reason, 10 to 500 characters.
 */
export function normalizeSkipMarginReason(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length < SKIP_MARGIN_REASON_MIN_LENGTH || text.length > SKIP_MARGIN_REASON_MAX_LENGTH) {
    throw new TypeError(`Enter a reason of ${SKIP_MARGIN_REASON_MIN_LENGTH} to ${SKIP_MARGIN_REASON_MAX_LENGTH} characters to skip the margin check.`);
  }
  return text;
}

/**
 * Normalize a selected operation onto its key.
 *
 * Fails closed: anything that is not one of the listed operations (including
 * empty, nullish, or non-string values) throws instead of defaulting.
 *
 * @param {string} type Selected operation.
 * @returns {string} The normalized operation key (e.g. 'balance', 'transfer').
 */
export function resolveManagerTransactionType(type) {
  const normalized = String(type ?? '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(OPERATIONS, normalized)) {
    throw new TypeError(`Unsupported manager transaction type: ${type}`);
  }
  return normalized;
}

/**
 * Check whether a value is a listed operation without throwing.
 *
 * @param {string} type Candidate operation.
 * @returns {boolean} True for every listed operation, enabled or not.
 */
export function isSupportedManagerTransactionType(type) {
  try {
    resolveManagerTransactionType(type);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether an operation has a live route in this build.
 *
 * @param {string} type Candidate operation.
 * @returns {boolean} True only for enabled operations, false otherwise.
 */
export function isManagerTransactionAvailable(type) {
  try {
    return OPERATIONS[resolveManagerTransactionType(type)].enabled === true;
  } catch {
    return false;
  }
}

/**
 * Check whether a value is the transfer operation without throwing.
 *
 * @param {string} type Candidate operation.
 * @returns {boolean} True only for the transfer operation, false otherwise.
 */
export function isTransferType(type) {
  try {
    return resolveManagerTransactionType(type) === 'transfer';
  } catch {
    return false;
  }
}

/**
 * Resolve a transfer destination login.
 *
 * Pure helper for the SecureTransfer contract, which requires from_login AND
 * to_login as positive DIFFERENT integers. Fails closed: blank, non-numeric,
 * zero, negative, non-integer, and equal-to-source values all throw instead
 * of producing a submittable login.
 *
 * @param {string|number} value Candidate destination login.
 * @param {string|number} fromLogin Source account login to differ from.
 * @returns {number} The destination login as a positive safe integer.
 */
export function resolveTransferDestination(value, fromLogin) {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '' || raw === null || raw === undefined) {
    throw new TypeError('Enter a destination login.');
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new TypeError(`Invalid transfer destination login: ${String(value)} must be a positive integer.`);
  }
  if (typeof raw === 'string' && !/^\d+$/.test(raw)) {
    throw new TypeError(`Invalid transfer destination login: ${String(value)} must be a positive integer.`);
  }
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || !Number.isSafeInteger(num)) {
    throw new TypeError(`Transfer destination login must be a positive integer, got ${String(value)}.`);
  }
  if (num === 0) {
    throw new TypeError('Transfer destination login must be a positive integer, got 0.');
  }
  if (num < 0) {
    throw new TypeError(`Transfer destination login must be a positive integer, got ${num}.`);
  }
  const fromRaw = typeof fromLogin === 'string' ? fromLogin.trim() : fromLogin;
  let from = Number.NaN;
  if (typeof fromRaw === 'string' && fromRaw !== '' && /^-?\d+$/.test(fromRaw)) {
    from = Number(fromRaw);
  } else if (typeof fromRaw === 'number') {
    from = fromRaw;
  }
  if (Number.isSafeInteger(from) && from > 0 && num === from) {
    throw new TypeError(`Transfer destination login must be different from the source account #${from}.`);
  }
  return num;
}

/**
 * Selector options for the Balance tab operation control, in MT5 order.
 *
 * @returns {Array<{ value: string, label: string, enabled: boolean }>} Fresh objects per call.
 */
export function getManagerTransactionOptions() {
  return MANAGER_TRANSACTION_TYPES.map((value) => ({
    value,
    label: OPERATIONS[value].label,
    enabled: OPERATIONS[value].enabled,
  }));
}

/**
 * Comment suggestions for an operation. Returns a fresh array per call.
 * Fails closed on unsupported operations.
 *
 * @param {string} type Operation.
 * @returns {string[]} English suggestion strings.
 */
export function getManagerCommentPresets(type) {
  return [...COMMENT_PRESETS[resolveManagerTransactionType(type)]];
}

/**
 * Validate a typed amount and return it as a canonical decimal string.
 *
 * Accepts up to two decimals, a positive value, and at most 1,000,000.
 * `1.5` becomes `"1.50"`. Exponents, signs, grouping, and extra decimals are
 * rejected. No float arithmetic is used.
 *
 * @param {string|number} raw Typed amount.
 * @returns {string|null} Canonical decimal string, or null when invalid.
 */
export function normalizeManagerAmount(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const [, whole, fraction = ''] = match;
  const digits = whole.replace(/^0+(?=\d)/, '');
  if (!/[1-9]/.test(digits + fraction)) return null;
  if (digits.length > MAX_AMOUNT_WHOLE.length) return null;
  if (digits.length === MAX_AMOUNT_WHOLE.length && digits > MAX_AMOUNT_WHOLE) return null;
  if (digits === MAX_AMOUNT_WHOLE && /[1-9]/.test(fraction)) return null;
  return `${digits}.${fraction.padEnd(2, '0')}`;
}

const MONEY_TEXT_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

// Decimal text of a finite JS number, for display only. Uses the shortest round-trip text,
// which is the decimal the server wrote. Values of 1e21 and above print in exponent form
// (for example 1.5e+21); the exponent is expanded digit by digit, so no binary artefact appears.
const decimalTextFromNumber = (value) => {
  const plain = String(value);
  const large = /^(-?)(\d)(?:\.(\d+))?e\+(\d+)$/i.exec(plain);
  if (large) {
    const [, sign, lead, rest = '', power] = large;
    return `${sign}${lead}${rest}${'0'.repeat(Number(power) - rest.length)}`;
  }
  return /e/i.test(plain) ? value.toFixed(2) : plain;
};

// Round a decimal string to two places by string arithmetic. Half away from zero; the caller keeps the sign.
const roundToCents = (whole, fraction) => {
  const kept = `${fraction}00`.slice(0, 2);
  const roundUp = fraction.length > 2 && fraction.charAt(2) >= '5';
  const cents = BigInt(whole) * BigInt(100) + BigInt(kept) + (roundUp ? BigInt(1) : BigInt(0));
  const digits = cents.toString().padStart(3, '0');
  return { whole: digits.slice(0, -2), fraction: digits.slice(-2) };
};

/**
 * Display text for a money value from the API or live metrics.
 *
 * Exact display at two decimals: a decimal string is rounded by string
 * arithmetic (half away from zero), never by float. A JS number is taken as its
 * shortest decimal text and rounded the same way, so 10012.345678901234 shows
 * 10,012.35. Thousands separators, always two decimals, no negative zero.
 * Missing, non-finite or non-decimal values return the unknown marker, never 0.00.
 *
 * @param {string|number|null|undefined} value Money value.
 * @returns {string} Display text such as "9,737.50", or "—" when unknown.
 */
export function formatManagerMoneyText(value) {
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return MANAGER_UNKNOWN_MONEY_TEXT;
    text = decimalTextFromNumber(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return MANAGER_UNKNOWN_MONEY_TEXT;
  }
  const match = MONEY_TEXT_PATTERN.exec(text);
  if (!match) return MANAGER_UNKNOWN_MONEY_TEXT;
  const [, sign, whole, fraction = ''] = match;
  const rounded = roundToCents(whole, fraction);
  const isZero = /^0*$/.test(`${rounded.whole}${rounded.fraction}`);
  const grouped = rounded.whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign && !isZero ? '-' : ''}${grouped}.${rounded.fraction}`;
}

/**
 * Money text for a field that may be absent, such as a response's balance_after.
 * Accepts a finite JS number (existing routes) or a decimal string (new routes).
 * Returns null, not the dash, when the value is not money, so the caller can omit the sentence.
 *
 * @param {string|number|null|undefined} value Money value from a response.
 * @returns {string|null} Display text, or null when the value is not money.
 */
export function formatManagerMoneyIfKnown(value) {
  if (typeof value === 'number' ? !Number.isFinite(value) : typeof value !== 'string') return null;
  const text = formatManagerMoneyText(value);
  return text === MANAGER_UNKNOWN_MONEY_TEXT ? null : text;
}

const resolveRouteKey = (type, direction) => {
  const key = resolveManagerTransactionType(type);
  const definition = OPERATIONS[key];
  if (!definition.enabled) {
    throw new TypeError(`${definition.label} is not available yet.`);
  }
  if (key === 'transfer') {
    if (direction !== undefined && direction !== null) {
      throw new TypeError('Transfer does not take a direction.');
    }
    return `${key}:none`;
  }
  if (direction !== DIRECTION_IN && direction !== DIRECTION_OUT) {
    throw new TypeError(`Unsupported direction for ${definition.label}: ${String(direction)}`);
  }
  return `${key}:${direction}`;
};

const resolvePositiveLogin = (value) => {
  const normalized = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  if (typeof normalized !== 'number' || !Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError('This account has an invalid login ID. Please reopen the account and try again.');
  }
  return normalized;
};

const destinationText = (key, destination) => (
  key === 'transfer' && destination !== null && destination !== undefined && String(destination).trim() !== ''
    ? String(destination).trim()
    : null
);

/**
 * Build the existing-route request for an operation and direction.
 *
 * - balance in  -> deposit, balance out -> withdraw
 * - credit in   -> credit,  credit out  -> credit with `credit_out: true`
 * - transfer    -> transfer (from_login and to_login, no `login`)
 *
 * Fails closed on disabled or unknown operations, on a missing or wrong
 * direction, and on invalid logins, amounts, or comments. The idempotency key
 * is added by the caller.
 *
 * @param {{ type: string, direction?: 'in'|'out'|null, login: number|string,
 *   destination?: string|number, amount: string|number, comment?: string }} input
 * @returns {{ endpointKey: string, payload: object }} Route key and request body.
 */
export function buildManagerTransactionRequest({
  type, direction, login, destination, amount, comment, skipMarginCheck = false, skipMarginReason = '',
} = {}) {
  const routeKey = resolveRouteKey(type, direction);
  const route = ROUTES[routeKey];
  const parsedLogin = resolvePositiveLogin(login);
  // The amount is exact decimal text. A JS number is refused, never converted.
  if (typeof amount !== 'string') {
    throw new TypeError('Amount must be sent as a decimal string, never a JS number.');
  }
  const amountText = normalizeManagerAmount(amount);
  if (amountText === null) {
    throw new TypeError('Amount must be a positive number with up to 2 decimals and cannot exceed 1,000,000.');
  }
  const commentText = String(comment ?? '').trim();
  if (commentText.length > MAX_COMMENT_LENGTH) {
    throw new TypeError(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
  }
  if (route.endpointKey === 'transfer') {
    if (skipMarginCheck !== false) throw new TypeError('The margin check cannot be skipped on a transfer.');
    return {
      endpointKey: 'transfer',
      payload: {
        from_login: parsedLogin,
        to_login: resolveTransferDestination(destination, parsedLogin),
        amount: amountText,
        comment: commentText,
      },
    };
  }
  const payload = { login: parsedLogin, amount: amountText, comment: commentText, ...route.extraFields };
  if (skipMarginCheck === true) {
    // Only Withdrawal (/withdraw) takes the flag. Deposit, credit, credit out and transfer never send it.
    if (routeKey !== 'balance:out') {
      throw new TypeError('The margin check can only be skipped on a withdrawal.');
    }
    payload.skip_margin_check = true;
    payload.skip_margin_reason = normalizeSkipMarginReason(skipMarginReason);
  } else if (skipMarginCheck !== false) {
    throw new TypeError('skipMarginCheck must be true or false.');
  }
  return { endpointKey: route.endpointKey, payload };
}

/**
 * Build the confirmation prompt for an operation and direction.
 * Fails closed on disabled or unknown operations.
 *
 * @param {string} type Operation.
 * @param {string} amountText Pre-formatted "amount currency" text.
 * @param {string|number} login Target account login.
 * @param {string|number} [destination] Transfer destination login (transfer only).
 * @param {'in'|'out'|null} [direction] Button direction; null for transfer.
 * @returns {string} The confirmation prompt.
 */
export function buildManagerTransactionConfirmation(type, amountText, login, destination, direction) {
  const routeKey = resolveRouteKey(type, direction);
  const key = routeKey.split(':')[0];
  return COPY[routeKey].confirm(amountText, login, destinationText(key, destination));
}

/**
 * Build the success message for a completed operation.
 * Fails closed on disabled or unknown operations.
 *
 * @param {string} type Operation.
 * @param {string} amountText Pre-formatted "amount currency" text.
 * @param {string|number} login Target account login.
 * @param {string|number} [destination] Transfer destination login (transfer only).
 * @param {'in'|'out'|null} [direction] Button direction; null for transfer.
 * @returns {string} The success message.
 */
export function buildManagerTransactionSuccessMessage(type, amountText, login, destination, direction) {
  const routeKey = resolveRouteKey(type, direction);
  const key = routeKey.split(':')[0];
  return COPY[routeKey].success(amountText, login, destinationText(key, destination));
}

/**
 * Build the failure prefix for an operation (e.g. 'Withdraw credit for account #123').
 * Fails closed on disabled or unknown operations.
 *
 * @param {string} type Operation.
 * @param {string|number} login Target account login.
 * @param {'in'|'out'|null} [direction] Button direction; null for transfer.
 * @returns {string} The failure prefix.
 */
export function buildManagerTransactionFailurePrefix(type, login, direction) {
  return `${COPY[resolveRouteKey(type, direction)].prefix} for account #${login}`;
}

/**
 * Turn a server refusal into display parts. Keeps the server code and message.
 *
 * @param {{ code?: string|null, message?: string }} failure Refusal from the API.
 * @param {string} type Operation.
 * @returns {{ text: string, detail: string, code: string|null }} Display parts.
 */
export function describeManagerTransactionFailure({ code = null, message = '', body = null, unrecognized = false, httpStatus = null } = {}, type) {
  const key = resolveManagerTransactionType(type);
  const backend = typeof message === 'string' ? message.trim() : '';
  const safeCode = typeof code === 'string' && code.trim() !== '' ? code.trim() : null;
  if (unrecognized === true) {
    const rawStatus = Number.isInteger(httpStatus) ? `HTTP ${httpStatus}` : '';
    return { text: UNRECOGNISED_STATUS_TEXT, detail: [backend, rawStatus].filter(Boolean).join(' '), code: safeCode };
  }
  if (key === 'transfer' && safeCode === 'TRANSFER_REVERSED') {
    const reply = body && typeof body === 'object' ? body : {};
    const legCode = typeof reply.in_leg_code === 'string' ? reply.in_leg_code.trim() : '';
    const reason = (legCode || backend || 'the receiving account refused the transfer').replace(/\.$/, '');
    const fromLogin = reply.from && typeof reply.from === 'object' ? reply.from.login : null;
    const returned = fromLogin !== null && fromLogin !== undefined && String(fromLogin).trim() !== ''
      ? `The amount was returned to #${String(fromLogin).trim()}.`
      : 'The amount was returned to the sending account.';
    return { text: `Transfer refused: ${reason}. ${returned}`, detail: '', code: safeCode };
  }
  if (safeCode === 'INSUFFICIENT_FUNDS') {
    return { text: INSUFFICIENT_FUNDS_TEXT, detail: backend, code: safeCode };
  }
  if (key === 'transfer' && TRANSFER_ENGINE_OWNED_CODES.includes(safeCode)) {
    return { text: TRANSFER_UNAVAILABLE_TEXT, detail: backend, code: safeCode };
  }
  return { text: backend || REFUSAL_FALLBACK_TEXT, detail: '', code: safeCode };
}

/**
 * Turn a pending, expired, or unknown outcome into specific display parts. Never a success,
 * and never "Unrecognised status" for known idempotency codes.
 *
 * @param {string} type Operation.
 * @param {'pending'|'unresolved'|'expired'} status Outcome status.
 * @param {string|null} [code] Server code, if any.
 * @param {string|null} [reversal] Reversal state for unresolved transfers.
 * @returns {{ text: string, detail: string, code: string|null }} Display parts.
 */
export function describeManagerTransactionPending(type, status, code = null, reversal = null) {
  const key = resolveManagerTransactionType(type);
  const safeCode = typeof code === 'string' && code.trim() !== '' ? code.trim() : null;
  const holdText = keyHoldTextFor(safeCode);
  if (status === 'expired') {
    // L3: an expired key-hold record keeps its key-hold text and also says that the status is unknown.
    return { text: holdText ? `${holdText} ${EXPIRED_PENDING_TEXT}` : EXPIRED_PENDING_TEXT, detail: '', code: safeCode };
  }
  if (holdText) {
    return { text: holdText, detail: '', code: safeCode };
  }
  if (key === 'transfer' && (status === 'unresolved' || safeCode === 'TRANSFER_UNRESOLVED')) {
    const text = reversal === 'pending' ? TRANSFER_REVERSAL_PENDING_TEXT : TRANSFER_UNRESOLVED_TEXT;
    return { text, detail: '', code: safeCode };
  }
  if (safeCode === 'IDEMPOTENCY_IN_FLIGHT' || safeCode === 'IN_FLIGHT' || safeCode === 'IN_PROGRESS') {
    return { text: IN_FLIGHT_PENDING_TEXT, detail: '', code: safeCode };
  }
  if (safeCode === 'IDEMPOTENCY_OUTCOME_UNKNOWN' || safeCode === 'OUTCOME_UNKNOWN') {
    return { text: OUTCOME_UNKNOWN_PENDING_TEXT, detail: '', code: safeCode };
  }
  if (
    safeCode === 'IDEMPOTENCY_STORE_UNAVAILABLE'
    || safeCode === 'STORE_UNAVAILABLE'
    || safeCode === 'IDEMPOTENCY_UNAVAILABLE'
    || safeCode === 'UNAVAILABLE'
  ) {
    return { text: STORE_UNAVAILABLE_PENDING_TEXT, detail: '', code: safeCode };
  }
  if (safeCode === 'IDEMPOTENCY_UNVERIFIED' || safeCode === 'UNVERIFIED') {
    return { text: UNVERIFIED_PENDING_TEXT, detail: '', code: safeCode };
  }
  return { text: PENDING_TEXT, detail: '', code: safeCode };
}
