/**
 * Pure finance-operation helpers for the account Balance tab.
 *
 * These helpers own the transaction TYPE selection logic: which types the
 * Balance tab may submit, which type is selected by default, and how a
 * selected type maps onto the already-mapped `submitManagerTransaction(type)`
 * contract (`MANAGER_TRANSACTION_ENDPOINTS` in `managerFinanceApi`).
 *
 * Tenant-agnostic: no broker names, logins, amounts, currencies, endpoints,
 * or keys here. Typography is inherited from callers (universal 11px/400);
 * this module emits no markup or styles.
 */

export const MANAGER_TRANSACTION_TYPES = Object.freeze(['deposit', 'withdraw', 'credit', 'transfer']);

export const DEFAULT_MANAGER_TRANSACTION_TYPE = 'deposit';

const TRANSACTION_ACTION_LABELS = Object.freeze({
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  credit: 'Credit',
  transfer: 'Transfer',
});

const TRANSACTION_PENDING_LABELS = Object.freeze({
  deposit: 'Depositing...',
  withdraw: 'Withdrawing...',
  credit: 'Applying...',
  transfer: 'Transferring...',
});

const TRANSACTION_PENDING_NOUNS = Object.freeze({
  deposit: 'deposit',
  withdraw: 'withdrawal',
  credit: 'credit',
  transfer: 'transfer',
});

/**
 * Normalize a selected transaction type onto its endpoint key.
 *
 * Fails closed: anything that is not one of the supported types (including
 * empty, nullish, or non-string values) throws instead of defaulting, so a
 * bad selection can never be submitted as the wrong transaction kind.
 *
 * @param {string} type Selected transaction type.
 * @returns {string} The normalized endpoint key ('deposit' | 'withdraw' | 'credit' | 'transfer').
 */
export function resolveManagerTransactionType(type) {
  const normalized = String(type ?? '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TRANSACTION_ACTION_LABELS, normalized)) {
    throw new TypeError(`Unsupported manager transaction type: ${type}`);
  }
  return normalized;
}

/**
 * Check whether a value is a supported transaction type without throwing.
 *
 * @param {string} type Candidate transaction type.
 * @returns {boolean} True for the four supported types, false otherwise.
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
 * Check whether a value is the transfer type without throwing.
 *
 * @param {string} type Candidate transaction type.
 * @returns {boolean} True only for the transfer type, false otherwise.
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
    throw new TypeError('Transfer destination login is required.');
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new TypeError(`Invalid transfer destination login: ${String(value)} must be a positive integer.`);
  }
  if (typeof raw === 'string' && !/^\d+$/.test(raw)) {
    if (raw === '') {
      throw new TypeError('Transfer destination login is required.');
    }
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
 * Selector options for the Balance tab TYPE control.
 *
 * @returns {Array<{ value: string, label: string }>} One generic option per supported type.
 */
export function getManagerTransactionOptions() {
  return MANAGER_TRANSACTION_TYPES.map((value) => ({ value, label: TRANSACTION_ACTION_LABELS[value] }));
}

/**
 * Generic action label for a transaction type (e.g. 'Deposit').
 * Fails closed on unsupported types.
 *
 * @param {string} type Transaction type.
 * @returns {string} The action label.
 */
export function getManagerTransactionActionLabel(type) {
  return TRANSACTION_ACTION_LABELS[resolveManagerTransactionType(type)];
}

/**
 * Generic in-progress label for a transaction type (e.g. 'Depositing...').
 * Fails closed on unsupported types.
 *
 * @param {string} type Transaction type.
 * @returns {string} The pending label.
 */
export function getManagerTransactionPendingLabel(type) {
  return TRANSACTION_PENDING_LABELS[resolveManagerTransactionType(type)];
}

/**
 * Generic pending-dialog noun for a transaction type (e.g. 'withdrawal').
 * Fails closed on unsupported types.
 *
 * @param {string} type Transaction type.
 * @returns {string} The pending noun.
 */
export function getManagerTransactionPendingNoun(type) {
  return TRANSACTION_PENDING_NOUNS[resolveManagerTransactionType(type)];
}

/**
 * Build the generic confirmation prompt for a transaction.
 * Fails closed on unsupported types.
 *
 * @param {string} type Transaction type.
 * @param {string} amountText Pre-formatted "amount currency" text.
 * @param {string|number} login Target account login.
 * @param {string|number} [destination] Transfer destination login; named in
 *   the copy for transfer only, ignored for other types.
 * @returns {string} The confirmation prompt.
 */
export function buildManagerTransactionConfirmation(type, amountText, login, destination) {
  const key = resolveManagerTransactionType(type);
  const action = TRANSACTION_ACTION_LABELS[key];
  const direction = key === 'deposit' ? 'into' : key === 'withdraw' || key === 'transfer' ? 'from' : 'to';
  const target = key === 'transfer' && destination !== null && destination !== undefined && String(destination).trim() !== ''
    ? `${login} to account #${String(destination).trim()}`
    : login;
  return `${action} ${amountText} ${direction} account #${target}?`;
}

/**
 * Build the generic success message for a completed transaction.
 * Fails closed on unsupported types.
 *
 * @param {string} type Transaction type.
 * @param {string} amountText Pre-formatted "amount currency" text.
 * @param {string|number} login Target account login.
 * @param {string|number} [destination] Transfer destination login; named in
 *   the copy for transfer only, ignored for other types.
 * @returns {string} The success message.
 */
export function buildManagerTransactionSuccessMessage(type, amountText, login, destination) {
  const key = resolveManagerTransactionType(type);
  if (key === 'deposit') return `Deposited ${amountText} into account #${login} successfully.`;
  if (key === 'withdraw') return `Withdrew ${amountText} from account #${login} successfully.`;
  if (key === 'credit') return `Credited ${amountText} to account #${login} successfully.`;
  if (destination !== null && destination !== undefined && String(destination).trim() !== '') {
    return `Transferred ${amountText} from account #${login} to account #${String(destination).trim()} successfully.`;
  }
  return `Transferred ${amountText} from account #${login} successfully.`;
}

/**
 * Build the generic failure prefix for a rejected transaction.
 * Fails closed on unsupported types.
 *
 * @param {string} type Transaction type.
 * @param {string|number} login Target account login.
 * @returns {string} The failure prefix (e.g. 'Deposit for account #123').
 */
export function buildManagerTransactionFailurePrefix(type, login) {
  const key = resolveManagerTransactionType(type);
  return `${TRANSACTION_ACTION_LABELS[key]} for account #${login}`;
}
