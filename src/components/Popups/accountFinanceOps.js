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
 * @returns {string} The confirmation prompt.
 */
export function buildManagerTransactionConfirmation(type, amountText, login) {
  const key = resolveManagerTransactionType(type);
  const action = TRANSACTION_ACTION_LABELS[key];
  const direction = key === 'deposit' ? 'into' : key === 'withdraw' || key === 'transfer' ? 'from' : 'to';
  return `${action} ${amountText} ${direction} account #${login}?`;
}

/**
 * Build the generic success message for a completed transaction.
 * Fails closed on unsupported types.
 *
 * @param {string} type Transaction type.
 * @param {string} amountText Pre-formatted "amount currency" text.
 * @param {string|number} login Target account login.
 * @returns {string} The success message.
 */
export function buildManagerTransactionSuccessMessage(type, amountText, login) {
  const key = resolveManagerTransactionType(type);
  if (key === 'deposit') return `Deposited ${amountText} into account #${login} successfully.`;
  if (key === 'withdraw') return `Withdrew ${amountText} from account #${login} successfully.`;
  if (key === 'credit') return `Credited ${amountText} to account #${login} successfully.`;
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
