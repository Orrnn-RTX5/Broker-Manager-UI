/**
 * Pure logic behind the account popup's Balance tab. No React here, so the rules are unit-tested.
 *
 * - The unresolved notice is derived from the pending store, never from the form. Editing the
 *   form cannot clear it, and it cannot unblock submit.
 * - Mutual exclusion: ONLY the Web Lock `rtx-fin:<broker>:<login>` (financeLease.js). Every money
 *   mutation runs inside it: prepare + record write + fresh write proof + send + result handling,
 *   acknowledge, expiry persist, forget and retry. When the lock is busy the operation does nothing
 *   else. When `navigator.locks` is missing, money operations are refused with a visible message.
 * - Barrier: scoped per `broker + login` across all managers in this browser. An unresolved record
 *   blocks new money operations for that account until a retry with the same key reaches a definite
 *   result, or a manager acknowledges it (acknowledgement is refused while the account lock is busy).
 * - Fail closed: if storage cannot be read, written, or verified by read-back, or holds a corrupt
 *   blob, money operations are blocked for that account with
 *   "Duplicate-protection unavailable — check history before any new operation".
 * - Expiry: expired records (`expired === true`) become "Status unknown: retry with the same key (recommended) or check
 *   history", and keep blocking until a same-key retry or an acknowledgement settles them. Round 8 (a): a same-key
 *   retry is allowed after expiry and for unknown outcomes; it resends the stored key and body. Round 7 (C4/C5): an observed expiry is saved inside
 *   the locked pass before any retry or send; if it cannot be saved, the operation is refused. A clock that
 *   moved backwards (clock high-water mark, pendingFinanceAttempts.js) expires every unresolved record.
 * - Store operations match records strictly by `idempotency_key`, never by `fingerprint`.
 */

import {
  DIRECTION_IN,
  DIRECTION_OUT,
  EXPIRED_PENDING_TEXT,
  MANAGER_REPLAY_TEXT,
  buildManagerTransactionConfirmation,
  buildManagerTransactionFailurePrefix,
  buildManagerTransactionRequest,
  buildManagerTransactionSuccessMessage,
  describeManagerTransactionFailure,
  describeManagerTransactionPending,
  formatManagerMoneyIfKnown,
  formatManagerMoneyText,
  KEY_HOLD_PENDING_TEXT,
  getManagerTransactionLabel,
  isKeyHoldCode,
  isSupportedManagerTransactionType,
  normalizeManagerAmount,
  normalizeSkipMarginReason,
  resolveManagerTransactionType,
} from './accountFinanceOps.js';
import {
  DEFAULT_BACKEND_IDEMPOTENCY_WINDOW_MS,
  parseFinanceAttemptScope,
  recordVersionOf,
} from './pendingFinanceAttempts.js';
import { joinMoneyAmount } from './accountTransactionCopy.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import { lookupTranslation } from '../../i18n/translatorEngine.js';
import { UI_DICTIONARIES } from '../../i18n/uiDictionary/index.js';
import { fetchManagerBalanceHistory } from '../../services/managerFinanceApi.js';

export const UNRESOLVED_OPERATION_TITLE = 'Unresolved operation on this account';
export const STARTED_BY_MANAGER_PREFIX = 'Started by';
export const SUBMIT_BLOCKED_TEXT = 'Submit is blocked until this operation is resolved. Retry with the same key, or confirm that you checked the account history.';
export const UNRESOLVED_FALLBACK_TEXT = 'Result not confirmed. Check the account history before you retry.';
export const STATUS_UNKNOWN_CHECK_HISTORY_TEXT = EXPIRED_PENDING_TEXT;
export const TRANSACTION_RESET_NOTE = 'The amount, destination and comment have been reset.';
export const DUPLICATE_PROTECTION_OFF_TEXT = 'Duplicate-protection unavailable — check history before any new operation';
export const DUPLICATE_PROTECTION_UNAVAILABLE_TEXT = DUPLICATE_PROTECTION_OFF_TEXT;
export const BROWSER_UNSUPPORTED_TEXT = 'This browser cannot guarantee duplicate protection — use a current browser';
export const UNSUPPORTED_TRANSACTION_TYPE_TEXT = 'Unsupported transaction type selected.';
export const CONFIRMED_AS_CHECKED_TEXT = 'Confirmed as checked on';
export const BALANCE_AFTER_LABEL = 'Balance after';
export const RUNNING_OPERATION_TEXT = 'Waiting for the broker to confirm. Please do not submit it again.';
export const OPERATION_GONE_TEXT = 'This operation is no longer pending.';
export const PERMISSION_DENIED_TEXT = 'Your role does not have permission to manage account funds.';
export const BALANCE_REFRESH_FAILED_NOTE = 'The balance could not be refreshed. Reopen the account to check it; do not repeat the transaction.';
export const DEFAULT_IN_FLIGHT_BACKOFF_MS = 250;
// L1: the transfer went through, but this browser could not clear the record. The record keeps blocking.
export const SUCCESS_RECORD_NOT_CLEARED_TEXT = 'Done, but this browser could not clear its pending record. Check history before a new operation';
// L2: the acknowledgement could not be saved and could not be undone. The disk state is unknown.
export const ACKNOWLEDGE_REVERT_FAILED_TEXT = 'The acknowledgement could not be saved or undone. Reopen the account and check its state before any new operation.';
// H1: the soft guard refused a new operation right after a completion on this account.
export const RECENT_COMPLETION_REFUSED_TEXT = 'A recent operation on this account was just completed. Check the history, then start again if still needed.';
// M1: the key-hold text is the same string as the record text (accountFinanceOps.js).
export const KEY_HOLD_TEXT = KEY_HOLD_PENDING_TEXT;
// R8 (b): the acknowledge check reads the account's latest balance-history rows (API contract 6.9) first.
// R8b: the walk stops at HISTORY_MAX_PAGES pages. R11 (F2): HISTORY_PAGE_LIMIT is the contract maximum page size (API contract
// v6 section 6.9; fetchManagerBalanceHistory sends it as is, it accepts up to 500). Two pages cover 1000 rows in the 24 h
// window. A page above HISTORY_PAGE_LIMIT rows fails closed; a walk still open after HISTORY_MAX_PAGES is truncated.
// Known limit R8b-K1 (updated for the 24 h window): more than 1000 rows in 24 h is refused as history-truncated (retry is the exit).
export const HISTORY_PAGE_LIMIT = 500;
export const HISTORY_MAX_PAGES = 2;
// R10 (H1): the history window is the backend replay window (24 h, the same constant as the expiry), not a 2 h guess. A row
// counts as a possible match when its time is no earlier than the send time minus 24 h (the browser clock can run ahead of
// the server clock). A false warning is acceptable; a missed match is not. Pagination stays bounded (HISTORY_MAX_PAGES x
// HISTORY_PAGE_LIMIT). Residual: a browser clock more than 24 h ahead of the server can miss the applied row (owner-accepted).
export const HISTORY_WINDOW_MS = DEFAULT_BACKEND_IDEMPOTENCY_WINDOW_MS;
// R10 (L4): one history page read has this timeout. The read runs inside the account lock, so a hung read is refused as
// history-unavailable, the record stays pending and the lock is released.
export const HISTORY_READ_TIMEOUT_MS = 10 * 1000;
// R10 (addendum): the acknowledge waits this long after the record's LAST send attempt (the history can lag the charge).
// Same-key retry stays available meanwhile. Residual: a history lag longer than this is owner-accepted (IMPL-R10 known limits).
export const HISTORY_SETTLE_MS = 60 * 1000;
// R11 (F1): the monotonic clock of this tab. performance.now() does not step with the wall clock, so a tab whose clock is
// ahead cannot shorten the settle by reading a later time. Injected by tests only; production call sites pass nothing.
const defaultMonotonicNow = () => performance.now();
export const TOO_SOON_TEXT = 'Wait a moment — history may not show the last attempt yet';
export const HISTORY_UNAVAILABLE_TEXT = 'History unavailable — cannot confirm';
export const HISTORY_LOADING_TEXT = 'Loading the account history…';
export const HISTORY_HEADING_TEXT = 'Latest account history (newest first)';
export const HISTORY_NO_MATCH_TEXT = 'No matching entry in the latest history.';
export const HISTORY_MATCH_WARNING_TEXT = 'This looks already applied';
export const HISTORY_CONFIRM_MATCH_TEXT = 'I understand, start a new operation anyway';
export const HISTORY_CONFIRM_TEXT = 'I checked the history, start a new operation';
export const HISTORY_OPEN_TEXT = 'Check the history before starting a new operation';
export const HISTORY_PENDING_LABEL = 'Pending operation';
// R9: the bounded history read did not cover the whole window (F4). The acknowledge is refused; the same-key retry stays.
export const HISTORY_TRUNCATED_TEXT = 'History too long to verify, cannot confirm';
// R9: the acknowledged record changed after the panel showed it (a retry result, an expiry, another tab's write).
export const RECORD_CHANGED_TEXT = 'This operation changed while you were checking. Check the history again.';
// R9: the browser clock moved backwards, so new operations are held (its own reason, not a storage failure).
export const CLOCK_BEHIND_TEXT = 'The browser clock moved backwards. Check the history before any new operation.';

const IN_FLIGHT_CODES = new Set([
  'IDEMPOTENCY_IN_FLIGHT',
  'IN_FLIGHT',
  'IN_PROGRESS',
]);

const defaultWait = (ms) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  timer?.unref?.();
});

/** Show the margin-skip checkbox only when the permission is explicitly granted and resolved. */
export const canUseSkipMargin = ({ resolved = false, permissions = [] } = {}) => (
  resolved === true
  && Array.isArray(permissions)
  && permissions.includes(PERMISSIONS.MANAGE_FINANCES_SKIP_MARGIN)
);

/**
 * Show the margin-skip checkbox only for a Balance withdrawal (`direction === 'out'`). Deposit
 * (`direction === 'in'`), Credit, and Transfer never show or accept the skip checkbox. The gate is the
 * operation, never the comment text.
 */
export const canShowSkipMargin = ({
  resolved = false,
  permissions = [],
  type = 'balance',
  direction = null,
} = {}) => {
  if (!canUseSkipMargin({ resolved, permissions })) return false;
  const normalizedType = String(type ?? '').trim().toLowerCase();
  if (normalizedType !== 'balance') return false;
  return direction === DIRECTION_OUT;
};

const loginOf = (record) => record?.payload?.login ?? record?.payload?.from_login;

const managerOf = (record) => {
  if (typeof record?.managerName === 'string' && record.managerName.trim() !== '') {
    return record.managerName.trim();
  }
  const { managerLogin } = parseFinanceAttemptScope(record?.scope);
  return managerLogin || null;
};

const unknownOutcomeCode = (err) => {
  if (typeof err?.code === 'string' && err.code.trim() !== '') {
    return err.code.trim();
  }
  if (Number.isInteger(err?.httpStatus)) {
    return `HTTP ${err.httpStatus}`;
  }
  return null;
};

const isInFlightCode = (code) => typeof code === 'string' && IN_FLIGHT_CODES.has(code.trim());

// Display parts of a stored unresolved record. Never throws: an unreadable record still blocks.
const describeStored = (record) => {
  try {
    const effectiveStatus = record?.expired ? 'expired' : record?.status;
    const pending = describeManagerTransactionPending(record.type, effectiveStatus, record.code, record.reversal);
    return {
      lead: buildManagerTransactionFailurePrefix(record.type, loginOf(record), record.direction),
      text: pending.text,
      detail: pending.detail,
      code: pending.code,
    };
  } catch {
    return {
      lead: '',
      text: record?.expired ? STATUS_UNKNOWN_CHECK_HISTORY_TEXT : UNRESOLVED_FALLBACK_TEXT,
      detail: '',
      code: record?.code ?? null,
    };
  }
};

// Resolves the caller's target idempotency key. Matches by key only, never by fingerprint (L2).
const resolveTargetKey = ({ idempotencyKey, key } = {}) => {
  if (typeof idempotencyKey === 'string' && idempotencyKey.trim() !== '') {
    return idempotencyKey.trim();
  }
  if (typeof key === 'string' && key.trim() !== '') {
    return key.trim();
  }
  return '';
};

// Maps a lock refusal to the reason the modal shows. `busy` is the running state.
const lockRefusalReason = (reason) => {
  if (reason === 'busy') return 'running';
  if (reason === 'no-locks') return 'browser-unsupported';
  return 'storage-unavailable';
};

const storageRefusal = (loginKey) => ({
  kind: 'skipped',
  reason: 'storage-unavailable',
  loginKey,
});

// L4: a status write that did not persist is a visible error. The record keeps blocking the account.
const statusNotSavedOutcome = (loginKey, idempotencyKey) => ({
  kind: 'unconfirmed',
  reason: 'storage-unavailable',
  loginKey,
  idempotencyKey,
  feedback: { kind: 'unconfirmed', lead: '', text: DUPLICATE_PROTECTION_OFF_TEXT, detail: '', code: null },
});

// M3: "no such record" is `gone`, but an unreadable or corrupt account blob is `storage-unavailable`.
// Never tell the manager that a pending operation is gone when the store could not be read.
const missingRecordOutcome = (store, scope, loginKey) => (
  store.storageStatus({ scope, loginKey }) === 'durable'
    ? { kind: 'gone', loginKey }
    : storageRefusal(loginKey)
);

/** H1: the most recent definite success on this account inside the window, or null. Read-only. */
export const recentCompletionFor = ({ store, scope = null, loginKey }) => store.recentCompletions({ scope, loginKey })[0] ?? null;

/** The H1 confirm template. Its dictionary key is this exact English text (uiDictionary, 6b). */
export const H1_PROMPT_TEMPLATE = 'A {type} of {amount} was just completed on this account by {manager} at {time}. Start another?';

/**
 * The same lookup the DOM translator uses for a piece of UI text: `lookupTranslation` on the locale's
 * dictionary. Falls back to the text itself (English, or no entry).
 */
export const translateUiText = (text, language = 'en') => {
  if (language === 'en') return text;
  const dictionary = UI_DICTIONARIES[language];
  if (!dictionary || typeof text !== 'string') return text;
  return lookupTranslation(dictionary, text) ?? text;
};

const PROMPT_PLACEHOLDER = /\{(type|amount|manager|time)\}/g;

/**
 * Fill the four placeholders of a (translated) template. A replacer function is used, so `$` in a value
 * (for example in a manager name) stays literal. A placeholder without a value is left as it is.
 */
export const fillPromptTemplate = (template, values) => template.replace(PROMPT_PLACEHOLDER, (match, key) => (
  Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
));

/**
 * H1 confirm text. The template is translated first (`translate`, default: the locale's dictionary for
 * `language`), then {type} (the translated type label, plus the translated direction word), {amount},
 * {manager} and {time} are substituted. The time is UTC, to the second, so it is the same on every browser.
 */
export const buildRecentCompletionPrompt = (entry, { currency = '', language = 'en', translate } = {}) => {
  const tr = typeof translate === 'function' ? translate : (text) => translateUiText(text, language);
  const label = getManagerTransactionLabel(entry.type) || 'Operation';
  const directionWord = entry.direction === 'out' ? 'withdrawal' : (entry.direction === 'in' ? 'deposit' : '');
  const typeText = [tr(label), directionWord ? tr(directionWord) : ''].filter((part) => part !== '').join(' ');
  const amountDisplay = joinMoneyAmount(formatManagerMoneyText(entry.amount), currency);
  const manager = entry.manager || tr('another manager');
  const time = `${new Date(entry.at).toISOString().replace('T', ' ').slice(0, 19)} UTC`;
  return fillPromptTemplate(tr(H1_PROMPT_TEMPLATE), {
    type: typeText,
    amount: amountDisplay,
    manager,
    time,
  });
};

// ---- R8 (b): the acknowledge check against the account's balance history (API contract 6.9) ----

/**
 * UI operation -> balance-history `operation_kind` and `direction`. Key: `${type}:${direction}`; a transfer has no
 * direction and uses `transfer:none`. Transfer shows on the SOURCE account as `transfer_out`. The history comment is
 * never parsed.
 */
export const HISTORY_KIND_MAP = Object.freeze({
  'balance:in': Object.freeze({ operation_kind: 'deposit', direction: 'in' }),
  'balance:out': Object.freeze({ operation_kind: 'withdrawal', direction: 'out' }),
  'credit:in': Object.freeze({ operation_kind: 'credit_in', direction: 'in' }),
  'credit:out': Object.freeze({ operation_kind: 'credit_out', direction: 'out' }),
  'transfer:none': Object.freeze({ operation_kind: 'transfer_out', direction: 'out' }),
  'charge:in': Object.freeze({ operation_kind: 'charge', direction: 'in' }),
  'charge:out': Object.freeze({ operation_kind: 'charge', direction: 'out' }),
  'correction:in': Object.freeze({ operation_kind: 'correction', direction: 'in' }),
  'correction:out': Object.freeze({ operation_kind: 'correction', direction: 'out' }),
  'bonus:in': Object.freeze({ operation_kind: 'bonus', direction: 'in' }),
  'bonus:out': Object.freeze({ operation_kind: 'bonus', direction: 'out' }),
  'commission:in': Object.freeze({ operation_kind: 'commission', direction: 'in' }),
  'commission:out': Object.freeze({ operation_kind: 'commission', direction: 'out' }),
  'tax:in': Object.freeze({ operation_kind: 'tax', direction: 'in' }),
  'tax:out': Object.freeze({ operation_kind: 'tax', direction: 'out' }),
  'so_compensation:in': Object.freeze({ operation_kind: 'so_compensation', direction: 'in' }),
  'so_credit_compensation:out': Object.freeze({ operation_kind: 'so_credit_compensation', direction: 'out' }),
});

/** The history kind and direction for an operation and its button direction, or null when unmapped. */
export const historyKindFor = (type, direction = null) => {
  const normalizedType = String(type ?? '').trim().toLowerCase();
  const key = normalizedType === 'transfer' ? 'transfer:none' : `${normalizedType}:${direction ?? 'none'}`;
  return Object.prototype.hasOwnProperty.call(HISTORY_KIND_MAP, key) ? HISTORY_KIND_MAP[key] : null;
};

const DECIMAL_TEXT_PATTERN = /^(\d+)(?:\.(\d+))?$/;

/**
 * Exact decimal text, normalised for comparison: no leading zeros in the whole part, no trailing zeros in the
 * fraction. "100.00" and "100" give the same text; "100.01" does not. Null for anything that is not an unsigned decimal.
 */
export const normalizeDecimalText = (value) => {
  if (typeof value !== 'string') return null;
  const match = DECIMAL_TEXT_PATTERN.exec(value.trim());
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
};

// One history row, as contract 6.9 describes it. A row of another shape makes the whole check unavailable.
const isHistoryRowShape = (row) => (
  row !== null
  && typeof row === 'object'
  && Number.isSafeInteger(row.id)
  && Number.isSafeInteger(row.time)
  && typeof row.operation_kind === 'string'
  && (row.direction === DIRECTION_IN || row.direction === DIRECTION_OUT)
  && normalizeDecimalText(row.amount) !== null
  && typeof row.comment === 'string'
);

/**
 * True when one history row is the pending operation: same operation_kind and direction (table above), the same exact
 * amount (decimal compare), and a time no earlier than the original send time minus HISTORY_WINDOW_MS (R10 H1).
 * Without a usable send time the row counts as a match (a warning, never a block: fail safe).
 */
export const historyRowMatchesOriginal = (row, original) => {
  if (!isHistoryRowShape(row) || !original) return false;
  const kind = historyKindFor(original.type, original.direction ?? null);
  if (!kind) return false;
  const amount = normalizeDecimalText(original.amount);
  if (amount === null || normalizeDecimalText(row.amount) !== amount) return false;
  if (row.operation_kind !== kind.operation_kind || row.direction !== kind.direction) return false;
  if (!Number.isFinite(original.createdAt)) return true;
  return row.time * 1000 >= original.createdAt - HISTORY_WINDOW_MS;
};

/** True when any loaded history row is the pending operation. */
export const findHistoryMatch = (rows, original) => (
  Array.isArray(rows) && rows.some((row) => historyRowMatchesOriginal(row, original))
);

/**
 * R8b: the start of the history query: the original send time minus the window (HISTORY_WINDOW_MS), in whole seconds,
 * rounded down (never narrower than the match rule). Null when the send time is unknown (no `from` is sent then).
 */
export const historyWindowStartSec = (original) => (
  Number.isFinite(original?.createdAt)
    ? Math.max(0, Math.floor(original.createdAt / 1000) - HISTORY_WINDOW_MS / 1000)
    : null
);

// R10 (L4): one history page read, rejected after `timeoutMs`. The late result is ignored. The AbortController signal is
// passed as the third argument so the production reader can cancel the request. A synchronous throw is a rejection too.
const readHistoryPage = (fetchHistory, login, query, timeoutMs) => new Promise((resolve, reject) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => {
    controller?.abort();
    reject(new Error('Balance history read timed out'));
  }, timeoutMs);
  Promise.resolve()
    .then(() => fetchHistory(login, query, { signal: controller?.signal }))
    .then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
});

/**
 * The acknowledge check (R8b). Loads the account's history from the window start (`from`), HISTORY_PAGE_LIMIT rows
 * per page, newest first. It stops when a row matches, when there is no next cursor, or after HISTORY_MAX_PAGES pages
 * (the first page plus at most two more). `fetchHistory(login, query, { signal })` defaults to the production reader
 * (fetchManagerBalanceHistory); a test may inject a fake, the app never does. Never throws. A failure on any page, a
 * timeout (R10 L4), or a row of another shape is "unavailable" (fail closed). `truncated` is true when the pages ran
 * out with a next cursor and no match.
 */
export const loadAcknowledgeHistory = async ({
  login, original, fetchHistory = fetchManagerBalanceHistory, limit = HISTORY_PAGE_LIMIT, maxPages = HISTORY_MAX_PAGES,
  timeoutMs = HISTORY_READ_TIMEOUT_MS,
}) => {
  const unavailable = { ok: false, text: HISTORY_UNAVAILABLE_TEXT, rows: [], matched: false, truncated: false };
  const from = historyWindowStartSec(original);
  const byId = new Map();
  let cursor = null;
  let pages = 0;
  let matched = false;
  let truncated = false;
  for (;;) {
    const query = { limit };
    if (from !== null) query.from = from;
    if (cursor !== null) query.cursor = cursor;
    let result;
    try {
      result = await readHistoryPage(fetchHistory, login, query, timeoutMs);
    } catch {
      return unavailable;
    }
    const items = result?.items;
    // R9 (F7), R11 (F2): a page above HISTORY_PAGE_LIMIT (500) rows fails closed.
    if (!Array.isArray(items) || items.length > HISTORY_PAGE_LIMIT || !items.every(isHistoryRowShape)) return unavailable;
    for (const row of items) byId.set(row.id, row);
    pages += 1;
    matched = matched || findHistoryMatch(items, original);
    const next = typeof result?.nextCursor === 'string' && result.nextCursor !== '' ? result.nextCursor : null;
    if (matched || next === null) break;
    if (pages >= maxPages) {
      truncated = true;
      break;
    }
    cursor = next;
  }
  // Newest first across the pages (the contract orders time DESC, id DESC; sorted again so the display never relies on it).
  const rows = [...byId.values()].sort((a, b) => (b.time - a.time) || (b.id - a.id));
  return { ok: true, text: '', rows, matched, truncated };
};

/** What the acknowledge dialog shows for a check. The acknowledge button is enabled only after a successful check. */
export const acknowledgeCheckView = (check) => {
  const ok = check?.ok === true;
  const truncated = ok && check.truncated === true;
  const matched = ok && check.matched === true;
  return {
    canAcknowledge: ok && !truncated,
    warning: matched ? HISTORY_MATCH_WARNING_TEXT : null,
    confirmText: matched ? HISTORY_CONFIRM_MATCH_TEXT : HISTORY_CONFIRM_TEXT,
    unavailableText: !ok ? (check?.text || HISTORY_UNAVAILABLE_TEXT) : (truncated ? HISTORY_TRUNCATED_TEXT : null),
    truncated,
  };
};

// R9: the record fields the acknowledge check needs, read from the stored record (inside the lock).
const originalOf = (record) => ({
  type: record.type,
  direction: record.direction ?? null,
  amount: record.payload?.amount ?? null,
  createdAt: record.createdAt,
  manager: managerOf(record),
});

/** UTC, to the second, the same on every browser (as the H1 prompt). */
export const formatHistoryTime = (ms) => `${new Date(ms).toISOString().replace('T', ' ').slice(0, 19)} UTC`;

/** One history row as a single line of plain text (rendered as React text, never as HTML). */
export const describeHistoryRow = (row, currency = '') => (
  `${formatHistoryTime(row.time * 1000)} · ${row.operation_kind} (${row.direction}) · `
  + `${joinMoneyAmount(formatManagerMoneyText(row.amount), currency)} · ${row.comment}`
);

/** Display parts of the pending record, for the acknowledge dialog. Read-only. */
export const describeOriginalOperation = (original, { currency = '', language = 'en' } = {}) => {
  if (!original) return null;
  const tr = (text) => translateUiText(text, language);
  const label = getManagerTransactionLabel(original.type) || 'Operation';
  const directionWord = original.direction === DIRECTION_OUT ? 'withdrawal' : (original.direction === DIRECTION_IN ? 'deposit' : '');
  return {
    typeText: [tr(label), directionWord ? tr(directionWord) : ''].filter((part) => part !== '').join(' '),
    amountText: original.amount ? joinMoneyAmount(formatManagerMoneyText(original.amount), currency) : '—',
    time: Number.isFinite(original.createdAt) ? formatHistoryTime(original.createdAt) : '—',
    manager: original.manager || '—',
  };
};

/**
 * What the Balance tab shows for one account login, derived from the store.
 *
 * Fails closed: `blocked` is true whenever an unresolved record exists on the account barrier OR
 * when `storage !== 'durable'` (storage unreadable, corrupt, missing scope, or no lock support).
 *
 * @returns {{
 *   storage: 'durable'|'memory-only',
 *   browserSupported: boolean,
 *   storageNotice: string|null,
 *   blocked: boolean,
 *   running: boolean,
 *   notice: object|null,
 *   confirmations: Array<{ idempotencyKey: string, at: number, acknowledgedBy: string|null, manager: string|null, lead: string }>
 * }}
 */
export const deriveBalanceFinanceView = ({ store, scope = null, loginKey, canManageFinances = false }) => {
  // R11 (F3), known label lag, no money effect: the expiry shown here uses max(now, mark). A tab whose clock is behind the mark
  // reads an old record as younger than it is, so it can show "pending" where another tab shows "expired". Its new-operation and
  // acknowledge gates still refuse (blocked / clock-behind), so the label is the only effect. Only a real locked write moves the mark.
  const records = store.list({ scope, loginKey });
  const storage = store.storageStatus({ scope, loginKey });
  const storageDurable = storage === 'durable';
  const browserSupported = store.locksSupported() === true;
  const unresolved = records.filter((record) => record.acknowledgedAt === null);
  const acknowledged = records.filter((record) => record.acknowledgedAt !== null);
  const running = store.isLoginRunning({ scope, loginKey });
  const newest = unresolved[0] ?? null;
  const expired = Boolean(newest?.expired);
  // C4: an observed expiry that is not saved yet blocks this account and shows the duplicate-protection notice.
  const expiryUnsaved = store.expiryUnsaved({ scope, loginKey });
  let storageNotice = null;
  if (!browserSupported) storageNotice = BROWSER_UNSUPPORTED_TEXT;
  else if (!storageDurable || expiryUnsaved) storageNotice = DUPLICATE_PROTECTION_OFF_TEXT;
  return {
    storage,
    browserSupported,
    storageNotice,
    expiryUnsaved,
    blocked: unresolved.length > 0 || !storageDurable || expiryUnsaved,
    running,
    notice: newest
      ? {
        title: UNRESOLVED_OPERATION_TITLE,
        manager: managerOf(newest),
        idempotencyKey: newest.payload.idempotency_key,
        recordFingerprint: newest.fingerprint,
        // R9: the record version the acknowledge check is bound to (any write to the record moves it).
        version: recordVersionOf(newest),
        expired,
        ...describeStored(newest),
        // R8 (a): an expired or unknown-outcome record is retried with its stored key and body. A key-hold record (M1) offers
        // no same-key retry and no new key. A running account (this tab or another tab's lock), a non-durable store and an
        // unsaved observed expiry refuse the retry.
        canRetry: Boolean(canManageFinances && !running && storageDurable && !expiryUnsaved && !isKeyHoldCode(newest.code)),
        canConfirm: Boolean(canManageFinances && !running && storageDurable),
        // R8 (b): what the acknowledge check compares the balance history with.
        original: {
          type: newest.type,
          direction: newest.direction ?? null,
          amount: newest.payload?.amount ?? null,
          createdAt: newest.createdAt,
          manager: managerOf(newest),
        },
      }
      : null,
    confirmations: acknowledged.map((record) => ({
      idempotencyKey: record.payload.idempotency_key,
      at: record.acknowledgedAt,
      acknowledgedBy: record.acknowledgedBy ?? null,
      manager: managerOf(record),
      lead: describeStored(record).lead,
    })),
  };
};

/**
 * Why a new money operation may not be submitted now, or null when it may.
 * The form does not enter this decision: an edited form does not bypass the barrier.
 *
 * @returns {'permission'|'browser'|'running'|'blocked'|null}
 */
export const submitBlockReason = ({ canManageFinances, view }) => {
  if (!canManageFinances) return 'permission';
  if (view.browserSupported === false) return 'browser';
  if (view.running) return 'running';
  if (view.blocked || view.storage !== 'durable') return 'blocked';
  return null;
};

const extractBalanceAfterValue = (body) => {
  if (!body || typeof body !== 'object') return undefined;
  if (body.balance_after !== undefined && body.balance_after !== null) return body.balance_after;
  if (body.from && typeof body.from === 'object' && body.from.balance_after !== undefined) {
    return body.from.balance_after;
  }
  return undefined;
};

// Sends the stored record. The caller holds the account lock and passes its `lease` token.
// Nothing is sent unless the fresh checkpoint (write + read-back of this record) succeeds.
const sendHeldRecordWithLease = async ({
  store,
  scope,
  loginKey,
  targetKey,
  lease,
  submit,
  currency = '',
  isRetry = false,
  inFlightBackoffMs = DEFAULT_IN_FLIGHT_BACKOFF_MS,
  wait = defaultWait,
}) => {
  const identity = { scope, loginKey, idempotencyKey: targetKey, lease };
  const before = store.find(identity);
  if (!before) return missingRecordOutcome(store, scope, loginKey);

  if (isRetry && isInFlightCode(before.code)) {
    const backoffMs = Number.isFinite(inFlightBackoffMs) && inFlightBackoffMs >= 0
      ? inFlightBackoffMs
      : DEFAULT_IN_FLIGHT_BACKOFF_MS;
    if (backoffMs > 0) await wait(backoffMs);
  }

  // Fresh proof of storage, inside the lock, immediately before the send.
  // R9: the send attempt is recorded and verified before the send (a record write: the acknowledge check sees it).
  const proof = store.checkpoint({ ...identity, recordAttempt: true });
  if (!proof.ok) {
    return proof.reason === 'gone' ? missingRecordOutcome(store, scope, loginKey) : storageRefusal(loginKey);
  }
  const currentRecord = store.find(identity);
  if (!currentRecord) return missingRecordOutcome(store, scope, loginKey);

  try {
    const outcome = await submit(currentRecord.endpointKey, currentRecord.payload);

    if (outcome.status !== 'ok') {
      // 202 is never a success. The key is kept, with the same-key retry.
      const latest = store.find(identity) ?? currentRecord;
      const expiredNow = Boolean(latest.expired);
      const updated = {
        ...latest,
        status: expiredNow ? 'expired' : outcome.status,
        code: outcome.code ?? null,
        reversal: outcome.reversal ?? null,
        expired: expiredNow,
      };
      if (!store.remember(updated, lease).saved) return statusNotSavedOutcome(loginKey, targetKey);
      const persisted = store.find(identity) ?? updated;
      return {
        kind: 'unresolved',
        loginKey,
        idempotencyKey: targetKey,
        feedback: { kind: 'unconfirmed', ...describeStored(persisted) },
      };
    }

    // A definite final outcome: remove ONLY this request's record, matched by idempotencyKey, and record the
    // completion (H1) in the same locked write. If the removal is not persisted, the record keeps blocking and
    // the outcome is reported as "Done, but ... could not clear its pending record" (L1), never as a clean success.
    const cleared = store.forget({
      ...identity,
      completion: { type: currentRecord.type, direction: currentRecord.direction, amount: currentRecord.payload.amount },
    });
    if (!cleared.saved) {
      return {
        kind: 'unconfirmed',
        reason: 'record-not-cleared',
        loginKey,
        idempotencyKey: targetKey,
        feedback: { kind: 'unconfirmed', lead: '', text: SUCCESS_RECORD_NOT_CLEARED_TEXT, detail: '', code: null },
      };
    }
    const balanceAfterText = formatManagerMoneyIfKnown(extractBalanceAfterValue(outcome.body));
    const balanceAfterSentence = balanceAfterText ? ` ${BALANCE_AFTER_LABEL}: ${balanceAfterText}.` : '';
    if (outcome.replayed) {
      const replayText = `${MANAGER_REPLAY_TEXT}${balanceAfterSentence}`;
      return {
        kind: 'success',
        replayed: true,
        loginKey,
        idempotencyKey: targetKey,
        successText: MANAGER_REPLAY_TEXT,
        balanceAfterText,
        successParts: {
          mainText: MANAGER_REPLAY_TEXT,
          balanceAfterLabel: BALANCE_AFTER_LABEL,
          balanceAfterValue: balanceAfterText,
          serverMessage: '',
        },
        feedback: {
          kind: 'success',
          lead: '',
          text: replayText,
          detail: '',
          code: outcome.code ?? null,
        },
        body: outcome.body ?? null,
      };
    }
    const amountDisplay = joinMoneyAmount(formatManagerMoneyText(currentRecord.payload.amount), currency);
    const successMessage = buildManagerTransactionSuccessMessage(
      currentRecord.type, amountDisplay, loginOf(currentRecord), currentRecord.payload.to_login ?? null, currentRecord.direction,
    );
    const serverMessage = typeof outcome.message === 'string' && outcome.message.trim() !== '' ? outcome.message.trim() : '';
    const successText = `${successMessage}${balanceAfterSentence}${serverMessage ? ` ${serverMessage}` : ''}`;
    return {
      kind: 'success',
      replayed: false,
      loginKey,
      idempotencyKey: targetKey,
      successText,
      balanceAfterText,
      successParts: {
        mainText: successMessage,
        balanceAfterLabel: BALANCE_AFTER_LABEL,
        balanceAfterValue: balanceAfterText,
        serverMessage,
      },
      feedback: {
        kind: 'success',
        lead: '',
        text: successText,
        detail: '',
        code: outcome.code ?? null,
      },
      body: outcome.body ?? null,
    };
  } catch (err) {
    if (err?.definite === true || err?.preSend === true) {
      let described = null;
      try {
        described = describeManagerTransactionFailure(err, currentRecord.type);
      } catch {
        described = null;
      }
      if (described) {
        // Definite server refusal or local pre-send error: clear ONLY this request's key.
        const cleared = store.forget(identity);
        if (!cleared.saved) {
          return {
            kind: 'unconfirmed',
            reason: 'storage-unavailable',
            loginKey,
            idempotencyKey: targetKey,
            feedback: { kind: 'unconfirmed', lead: '', text: DUPLICATE_PROTECTION_OFF_TEXT, detail: '', code: null },
          };
        }
        return {
          kind: 'refused',
          preSend: Boolean(err?.preSend),
          loginKey,
          idempotencyKey: targetKey,
          feedback: {
            kind: 'refused',
            lead: buildManagerTransactionFailurePrefix(currentRecord.type, loginOf(currentRecord), currentRecord.direction),
            text: described.text,
            detail: [described.detail, TRANSACTION_RESET_NOTE].filter(Boolean).join(' '),
            code: described.code,
          },
        };
      }
    }
    if (err?.unrecognized === true) {
      // An unknown status or code: the outcome is not known. Keep the key; show the raw status.
      const latest = store.find(identity) ?? currentRecord;
      const expiredNow = Boolean(latest.expired);
      const updated = {
        ...latest,
        status: expiredNow ? 'expired' : 'pending',
        code: err.code ?? null,
        expired: expiredNow,
      };
      if (!store.remember(updated, lease).saved) return statusNotSavedOutcome(loginKey, targetKey);
      let described = null;
      try {
        described = describeManagerTransactionFailure(err, currentRecord.type);
      } catch {
        described = null;
      }
      return {
        kind: 'unconfirmed',
        loginKey,
        idempotencyKey: targetKey,
        feedback: {
          kind: 'unconfirmed',
          lead: buildManagerTransactionFailurePrefix(currentRecord.type, loginOf(currentRecord), currentRecord.direction),
          ...(described ?? { text: UNRESOLVED_FALLBACK_TEXT, detail: '', code: null }),
        },
      };
    }
    // Unknown outcome: network failure, 5xx, pending idempotency code (IN_FLIGHT, OUTCOME_UNKNOWN,
    // STORE_UNAVAILABLE, UNAVAILABLE, UNVERIFIED), or a 2xx without a confirmed result.
    const code = unknownOutcomeCode(err);
    const latest = store.find(identity) ?? currentRecord;
    const expiredNow = Boolean(latest.expired);
    const updated = {
      ...latest,
      status: expiredNow ? 'expired' : 'pending',
      code,
      expired: expiredNow,
    };
    if (!store.remember(updated, lease).saved) return statusNotSavedOutcome(loginKey, targetKey);
    const persisted = store.find(identity) ?? updated;
    return {
      kind: 'unconfirmed',
      loginKey,
      idempotencyKey: targetKey,
      feedback: { kind: 'unconfirmed', ...describeStored(persisted) },
    };
  }
};

/**
 * Send a stored operation (same body, same key) under the account lock and record the outcome,
 * matched strictly by `idempotencyKey`. Resolves to an outcome object; it never throws.
 *
 * @param {{ submit: Function, currency?: string }} deps submit is submitManagerTransaction in the app.
 */
export const runBalanceOperation = async ({
  store,
  scope = null,
  loginKey,
  idempotencyKey,
  key,
  submit,
  currency = '',
  isRetry = false,
  inFlightBackoffMs = DEFAULT_IN_FLIGHT_BACKOFF_MS,
  wait = defaultWait,
}) => {
  const targetKey = resolveTargetKey({ idempotencyKey, key });
  if (!targetKey) return { kind: 'gone', loginKey };
  const identity = { scope, loginKey, idempotencyKey: targetKey };
  let leased;
  try {
    leased = await store.runWithAccountLease({ scope, loginKey }, async (lease) => {
      // C4 / b4: an observed expiry must be saved before anything else. If it cannot be saved, nothing is sent.
      if (!store.persistExpiry({ scope, loginKey, lease }).saved) return storageRefusal(loginKey);
      const held = store.find({ ...identity, lease });
      if (!held) return missingRecordOutcome(store, scope, loginKey);
      if (held.acknowledgedAt !== null) return { kind: 'gone', loginKey };
      if (isRetry && isKeyHoldCode(held.code)) return { kind: 'skipped', reason: 'key-held', loginKey };
      const runIdentity = { scope: held.scope || scope, loginKey, idempotencyKey: targetKey };
      store.setRunning(runIdentity, true);
      try {
        return await sendHeldRecordWithLease({
          store,
          scope: held.scope || scope,
          loginKey,
          targetKey,
          lease,
          submit,
          currency,
          isRetry,
          inFlightBackoffMs,
          wait,
        });
      } finally {
        store.setRunning(runIdentity, false);
      }
    });
  } catch {
    return storageRefusal(loginKey);
  }
  if (!leased.acquired) {
    const reason = lockRefusalReason(leased.reason);
    if (reason === 'running') return { kind: 'busy', loginKey };
    if (reason === 'browser-unsupported') return { kind: 'skipped', reason, loginKey };
    return storageRefusal(loginKey);
  }
  return leased.result;
};

/**
 * Why a retry may not run now, or null. Read-only pre-check; the account lock inside
 * `runBalanceOperation` re-validates the stored record before any send.
 */
export const retryBlockReason = ({
  store, scope = null, loginKey, idempotencyKey, key, canManageFinances,
}) => {
  if (!canManageFinances) return 'permission';
  if (store.locksSupported() !== true) return 'browser-unsupported';
  const targetKey = resolveTargetKey({ idempotencyKey, key });
  const held = targetKey ? store.find({ scope, loginKey, idempotencyKey: targetKey }) : null;
  if (!held) {
    // M3: an unreadable store is not "gone".
    if (!targetKey) return 'gone';
    return store.storageStatus({ scope, loginKey }) === 'durable' ? 'gone' : 'storage-unavailable';
  }
  if (held.acknowledgedAt !== null) return 'acknowledged';
  if (isKeyHoldCode(held.code)) return 'key-held';
  return null;
};

/**
 * Retry a stored operation with its same key and stored body. Gated by the permission and by the held record
 * (key-hold codes refuse); the account lock decides the rest. Resolves to `{ kind: 'skipped', reason, loginKey }`
 * when refused before the lock. R8 (a): an expired record and an unknown outcome are retried the same way. The
 * server replays or applies once under the same key (rtx-s1 verified Q1).
 */
export const retryBalanceOperation = (args) => {
  const reason = retryBlockReason(args);
  if (reason) return Promise.resolve({ kind: 'skipped', reason, loginKey: args.loginKey });
  return runBalanceOperation({ ...args, isRetry: true });
};

/**
 * Create the record, prove storage with a fresh write + read-back, and send it, all under the
 * account lock `rtx-fin:<broker>:<login>`. Two tabs submitting at once: exactly one send.
 */
export const executeBalanceOperation = async ({
  store,
  scope = null,
  loginKey,
  type,
  direction = null,
  endpointKey,
  payload,
  createKey,
  canManageFinances = false,
  acceptRecentCompletion = false,
  acknowledgedCompletionAt = null,
  submit,
  currency = '',
  inFlightBackoffMs = DEFAULT_IN_FLIGHT_BACKOFF_MS,
  wait = defaultWait,
}) => {
  if (!canManageFinances) return { kind: 'skipped', reason: 'permission', loginKey };
  if (!isSupportedManagerTransactionType(type)) {
    return {
      kind: 'refused',
      preSend: true,
      loginKey,
      idempotencyKey: '',
      feedback: { kind: 'refused', lead: '', text: UNSUPPORTED_TRANSACTION_TYPE_TEXT, detail: TRANSACTION_RESET_NOTE, code: null },
    };
  }
  const typeKey = resolveManagerTransactionType(type);
  let leased;
  try {
    leased = await store.runWithAccountLease({ scope, loginKey }, async (lease) => {
      // H1 soft guard, checked inside the lock right before anything is written (L1). A definite success on this account
      // within the window needs the manager's explicit extra confirm. The confirm covers only the completions the manager
      // saw (entry.at <= acknowledgedCompletionAt). A newer completion refuses again, with no write and no send.
      const seenAt = acceptRecentCompletion && Number.isFinite(acknowledgedCompletionAt) ? acknowledgedCompletionAt : null;
      const unseen = store.recentCompletions({ scope, loginKey }).filter((entry) => seenAt === null || entry.at > seenAt);
      if (unseen.length > 0) return { kind: 'skipped', reason: 'recent-completion', loginKey, completion: unseen[0] };
      const prepared = store.prepare({
        scope, loginKey, lease, type: typeKey, direction, endpointKey, payload, createKey,
      });
      if (prepared.blocked || !prepared.saved || !prepared.record) {
        if (prepared.reason === 'storage-unavailable') return storageRefusal(loginKey);
        if (prepared.reason === 'clock-behind') return { kind: 'skipped', reason: 'clock-behind', loginKey };
        return { kind: 'skipped', reason: 'blocked', loginKey };
      }
      const targetKey = prepared.record.payload.idempotency_key;
      const runIdentity = { scope, loginKey, idempotencyKey: targetKey };
      store.setRunning(runIdentity, true);
      try {
        return await sendHeldRecordWithLease({
          store,
          scope,
          loginKey,
          targetKey,
          lease,
          submit,
          currency,
          isRetry: false,
          inFlightBackoffMs,
          wait,
        });
      } finally {
        store.setRunning(runIdentity, false);
      }
    });
  } catch {
    return storageRefusal(loginKey);
  }
  if (!leased.acquired) {
    const reason = lockRefusalReason(leased.reason);
    return { kind: 'skipped', reason, loginKey };
  }
  return leased.result;
};

// R11 (F1): per tab (one map per store), the monotonic time at which this tab first saw each unresolved record version. One
// entry per idempotency key: a new version (retry, attempt write, expiry save) replaces it, so the wait restarts. In memory only;
// a reload starts the wait again (conservative).
const monotonicFirstSeenByStore = new WeakMap();
const monotonicFirstSeen = (store, idempotencyKey, version, nowMs) => {
  let perKey = monotonicFirstSeenByStore.get(store);
  if (perKey === undefined) {
    perKey = new Map();
    monotonicFirstSeenByStore.set(store, perKey);
  }
  const entry = perKey.get(idempotencyKey);
  if (entry !== undefined && entry.version === version) return entry.at;
  perKey.set(idempotencyKey, { version, at: nowMs });
  return nowMs;
};

/**
 * R9 acknowledge (owner-accepted 2026-11-02, Bidyut: (a)+(b)+(c)), hardened in R9 and R10 and R11. An acknowledgement is bound to ONE
 * unresolved record and to the history THE CONTROLLER reads for that record, inside the account lock. `checkedFor` is
 * `{ idempotencyKey, version }`: the record and version the panel showed. Its key is the only record that can be acknowledged.
 * Refusals, in order:
 * - `none`: no such unresolved record (or no key); a missing or acknowledged record is `none`;
 * - `record-changed`: the record's version is not the one the panel showed (a retry result, an expiry, another tab's write
 *   each move the version, see pendingFinanceAttempts.js);
 * - `clock-behind` (R10 H2): this browser's clock is behind the account mark;
 * - `too-soon` (R10 addendum, R11 F1): less than HISTORY_SETTLE_MS since the record's last send attempt on the browser clock
 *   (history may lag), OR less than HISTORY_SETTLE_MS of THIS tab's monotonic time since it first saw this version. Both must
 *   hold. The monotonic stamp is taken at the first acknowledge of this key and version in this tab (per store, in memory),
 *   so it is never earlier than the tab's first sight of the version. A new version restarts the wait;
 * - `history-unavailable`: no history reader, a failed or timed-out read (R10 L4), a row of another shape, or a page above
 *   HISTORY_PAGE_LIMIT rows (more than 500 rows, R11 F2);
 * - `history-truncated`: the bounded read could not cover the whole window;
 * - `match-not-confirmed`: the history shows the operation already applied and `matchConfirmed` is not true. The modal sends
 *   true only when the panel showed the match warning at the click (for this same checkedFor record).
 * The same-key retry is never refused by these checks. `fetchHistory` defaults to fetchManagerBalanceHistory (R10 L2).
 * `fetchHistory`, `timeoutMs` and `monotonicNow` are injection points for tests only (R11 F4): production passes none.
 */
export const acknowledgeNewOperation = async ({
  store, scope = null, loginKey, canManageFinances, at, checkedFor, matchConfirmed = false,
  fetchHistory = fetchManagerBalanceHistory, timeoutMs = HISTORY_READ_TIMEOUT_MS, monotonicNow = defaultMonotonicNow,
}) => {
  if (!canManageFinances) return { ok: false, reason: 'permission' };
  if (store.locksSupported() !== true) return { ok: false, reason: 'browser-unsupported' };
  if (store.storageStatus({ scope, loginKey }) !== 'durable') return { ok: false, reason: 'storage-unavailable' };
  // R10 (L1): the check names the record it was made for (key and version). The acknowledge can never reach another record.
  const targetKey = resolveTargetKey({ idempotencyKey: checkedFor?.idempotencyKey });
  if (!targetKey) return { ok: false, reason: 'none' };
  if (typeof fetchHistory !== 'function') return { ok: false, reason: 'history-unavailable' };
  let leased;
  try {
    leased = await store.runWithAccountLease({ scope, loginKey }, async (lease) => {
      const held = store.find({ scope, loginKey, idempotencyKey: targetKey, lease });
      if (!held || held.acknowledgedAt !== null) return { ok: false, reason: 'none' };
      if (recordVersionOf(held) !== checkedFor?.version) return { ok: false, reason: 'record-changed' };
      // R11 (F1): this tab's monotonic clock. The first acknowledge of this version stamps it; the wait is measured from there.
      const monoNow = monotonicNow();
      const firstSeenAt = monotonicFirstSeen(store, targetKey, recordVersionOf(held), monoNow);
      // R10 (H2): a browser clock behind the mark does not acknowledge an unresolved record (the expiry it would clear is in doubt).
      const clock = store.clockOf({ scope, loginKey });
      if (clock.stepped) return { ok: false, reason: 'clock-behind' };
      // R10 (addendum): the history can lag the last send attempt. Wait HISTORY_SETTLE_MS after it (max(now, mark) clock).
      const lastAttemptAt = Number.isFinite(held.lastAttemptAt) ? held.lastAttemptAt : held.createdAt;
      if (clock.anchor - lastAttemptAt < HISTORY_SETTLE_MS) return { ok: false, reason: 'too-soon' };
      // R11 (F1): and HISTORY_SETTLE_MS of monotonic time in this tab since it first saw this version (both must hold).
      if (monoNow - firstSeenAt < HISTORY_SETTLE_MS) return { ok: false, reason: 'too-soon' };
      const check = await loadAcknowledgeHistory({ login: loginKey, original: originalOf(held), fetchHistory, timeoutMs });
      if (!check.ok) return { ok: false, reason: 'history-unavailable' };
      if (check.truncated === true) return { ok: false, reason: 'history-truncated' };
      if (check.matched === true && matchConfirmed !== true) return { ok: false, reason: 'match-not-confirmed' };
      return store.acknowledge({ scope, loginKey, idempotencyKey: targetKey, at, lease });
    });
  } catch {
    return { ok: false, reason: 'storage-unavailable' };
  }
  if (!leased.acquired) return { ok: false, reason: lockRefusalReason(leased.reason) };
  const ack = leased.result;
  if (!ack.ok) return { ok: false, reason: ack.reason };
  return { ok: true, acknowledged: ack.acknowledged };
};

/**
 * E5: the locked "persist expiry" pass. The Balance tab calls it when the view observes an expired record,
 * so the expiry is stored and cannot be undone by a later clock change. Never sends. Resolves to `{ saved, changed }`.
 */
export const persistObservedExpiry = async ({ store, scope = null, loginKey }) => {
  let leased;
  try {
    leased = await store.runWithAccountLease({ scope, loginKey }, (lease) => store.persistExpiry({ scope, loginKey, lease }));
  } catch {
    return { saved: false, changed: false };
  }
  if (!leased.acquired) return { saved: false, changed: false, reason: lockRefusalReason(leased.reason) };
  return leased.result;
};

/** A result is applied to the popup only while that popup still shows the login it was sent for. */
export const shouldApplyOutcome = ({ activeLoginKey, outcomeLoginKey }) => (
  String(activeLoginKey) === String(outcomeLoginKey)
);

/**
 * Pure modal pre-confirmation preparation: validates form inputs, checks the barrier, and builds
 * the request and confirmation prompt in the exact required order.
 */
export const prepareBalanceSubmission = ({
  transactionType,
  direction = null,
  canManageFinances = false,
  canSkipMargin = false,
  skipMarginChecked = false,
  skipMarginReason = '',
  depositAmount = '',
  loginId,
  depositDestination = '',
  depositComment = '',
  currencyValue = '',
  financeView,
} = {}) => {
  const resetFailure = (message) => ({
    ok: false,
    resetForm: true,
    openDialog: true,
    feedback: {
      kind: 'refused',
      lead: '',
      text: `${message} ${TRANSACTION_RESET_NOTE}`,
      detail: '',
      code: null,
    },
  });

  let transactionTypeKey;
  try {
    transactionTypeKey = resolveManagerTransactionType(transactionType);
  } catch {
    return resetFailure(UNSUPPORTED_TRANSACTION_TYPE_TEXT);
  }

  if (!canManageFinances) {
    return resetFailure(PERMISSION_DENIED_TEXT);
  }

  const amountText = normalizeManagerAmount(depositAmount);
  if (amountText === null) {
    return resetFailure('Amount must be a positive number with up to 2 decimals and cannot exceed 1,000,000.');
  }

  const parsedLogin = Number(loginId);
  if (!Number.isSafeInteger(parsedLogin) || parsedLogin <= 0) {
    return resetFailure('This account has an invalid login ID. Please reopen the account and try again.');
  }

  // The skip flag is honoured only for a Balance withdrawal. Deposit ignores it.
  const skipForAttempt = Boolean(
    canSkipMargin
    && skipMarginChecked
    && direction === DIRECTION_OUT
    && transactionTypeKey === 'balance',
  );
  if (skipForAttempt) {
    try {
      normalizeSkipMarginReason(skipMarginReason);
    } catch (err) {
      return {
        ok: false,
        resetForm: false,
        openDialog: true,
        feedback: {
          kind: 'validation',
          lead: '',
          text: err?.message || 'Enter a reason to skip the margin check.',
          detail: '',
          code: null,
        },
      };
    }
  }

  let request;
  try {
    request = buildManagerTransactionRequest({
      type: transactionTypeKey,
      direction,
      login: parsedLogin,
      destination: depositDestination,
      amount: amountText,
      comment: depositComment,
      skipMarginCheck: skipForAttempt,
      skipMarginReason,
    });
  } catch (err) {
    return resetFailure(err?.message || 'The operation could not be prepared. Check the form and try again.');
  }

  if (financeView) {
    const blockReason = submitBlockReason({ canManageFinances, view: financeView });
    if (blockReason) {
      let text = SUBMIT_BLOCKED_TEXT;
      if (blockReason === 'browser') text = BROWSER_UNSUPPORTED_TEXT;
      else if (blockReason === 'running') text = RUNNING_OPERATION_TEXT;
      else if (financeView.storage !== 'durable' && !financeView.notice) text = DUPLICATE_PROTECTION_OFF_TEXT;
      return {
        ok: false,
        resetForm: false,
        openDialog: false,
        feedback: {
          kind: 'validation',
          lead: '',
          text,
          detail: '',
          code: null,
        },
      };
    }
  }

  const parsedDestination = request.payload.to_login ?? null;
  const amountDisplay = joinMoneyAmount(formatManagerMoneyText(request.payload.amount), currencyValue);
  const confirmationPrompt = buildManagerTransactionConfirmation(
    transactionTypeKey,
    amountDisplay,
    parsedLogin,
    parsedDestination,
    direction,
  );

  return {
    ok: true,
    transactionTypeKey,
    direction,
    parsedLogin,
    parsedDestination,
    skipForAttempt,
    request,
    amountDisplay,
    confirmationPrompt,
  };
};

/**
 * Pure modal outcome router: converts any controller outcome (`success`, `refused`, `unresolved`,
 * `unconfirmed`, `skipped`, `gone`, `busy`) into the exact state updates for the Balance tab popup,
 * including visible feedback when an action is `skipped`, `gone`, or `busy`.
 */
export const resolveBalanceOutcomeView = (outcome, { activeLoginKey, sentForLogin } = {}) => {
  if (!outcome || !shouldApplyOutcome({ activeLoginKey, outcomeLoginKey: sentForLogin ?? outcome.loginKey })) {
    return { apply: false };
  }
  if (outcome.kind === 'success') {
    return {
      apply: true,
      kind: 'success',
      replayed: Boolean(outcome.replayed),
      resetForm: true,
      resetSkipChecked: true,
      openDialog: true,
      refreshAccount: true,
      depositSuccess: outcome.successParts
        ? { ...outcome.successParts, text: outcome.successText }
        : outcome.successText,
      depositError: null,
    };
  }
  if (outcome.kind === 'refused') {
    return {
      apply: true,
      kind: 'refused',
      replayed: false,
      resetForm: true,
      resetSkipChecked: false,
      openDialog: true,
      refreshAccount: false,
      depositSuccess: null,
      depositError: outcome.feedback,
    };
  }
  if (outcome.kind === 'unresolved' || outcome.kind === 'unconfirmed') {
    return {
      apply: true,
      kind: outcome.kind,
      replayed: false,
      resetForm: false,
      resetSkipChecked: false,
      openDialog: true,
      refreshAccount: false,
      depositSuccess: null,
      depositError: outcome.feedback,
    };
  }
  // Visible feedback for skipped, gone, or busy actions.
  let text = SUBMIT_BLOCKED_TEXT;
  if (outcome.kind === 'busy' || outcome.reason === 'running') {
    text = RUNNING_OPERATION_TEXT;
  } else if (outcome.kind === 'gone' || outcome.reason === 'gone' || outcome.reason === 'acknowledged') {
    text = OPERATION_GONE_TEXT;
  } else if (outcome.reason === 'permission') {
    text = PERMISSION_DENIED_TEXT;
  } else if (outcome.reason === 'expired') {
    text = STATUS_UNKNOWN_CHECK_HISTORY_TEXT;
  } else if (outcome.reason === 'storage-unavailable') {
    text = DUPLICATE_PROTECTION_OFF_TEXT;
  } else if (outcome.reason === 'browser-unsupported') {
    text = BROWSER_UNSUPPORTED_TEXT;
  } else if (outcome.reason === 'recent-completion') {
    text = RECENT_COMPLETION_REFUSED_TEXT;
  } else if (outcome.reason === 'key-held') {
    text = KEY_HOLD_TEXT;
  } else if (outcome.reason === 'clock-behind') {
    text = CLOCK_BEHIND_TEXT;
  }
  return {
    apply: true,
    kind: outcome.kind,
    replayed: false,
    resetForm: false,
    resetSkipChecked: false,
    openDialog: false,
    refreshAccount: false,
    depositSuccess: null,
    depositError: {
      kind: 'validation',
      lead: '',
      text,
      detail: '',
      code: null,
    },
  };
};

/**
 * Pure modal helper to describe why an acknowledgement click was refused (another tab holds the
 * account lock, storage failed, or no unresolved record exists). Returns null when it succeeded.
 */
export const describeAcknowledgeOutcome = (ackResult) => {
  if (!ackResult || ackResult.ok) return null;
  let text = SUBMIT_BLOCKED_TEXT;
  if (ackResult.reason === 'running') {
    text = RUNNING_OPERATION_TEXT;
  } else if (ackResult.reason === 'permission') {
    text = PERMISSION_DENIED_TEXT;
  } else if (ackResult.reason === 'storage-unavailable') {
    text = DUPLICATE_PROTECTION_OFF_TEXT;
  } else if (ackResult.reason === 'browser-unsupported') {
    text = BROWSER_UNSUPPORTED_TEXT;
  } else if (ackResult.reason === 'none') {
    text = OPERATION_GONE_TEXT;
  } else if (ackResult.reason === 'revert-failed') {
    text = ACKNOWLEDGE_REVERT_FAILED_TEXT;
  } else if (ackResult.reason === 'history-unavailable') {
    text = HISTORY_UNAVAILABLE_TEXT;
  } else if (ackResult.reason === 'match-not-confirmed') {
    text = HISTORY_MATCH_WARNING_TEXT;
  } else if (ackResult.reason === 'history-truncated') {
    text = HISTORY_TRUNCATED_TEXT;
  } else if (ackResult.reason === 'record-changed') {
    text = RECORD_CHANGED_TEXT;
  } else if (ackResult.reason === 'too-soon') {
    text = TOO_SOON_TEXT;
  } else if (ackResult.reason === 'clock-behind') {
    text = CLOCK_BEHIND_TEXT;
  }
  return {
    kind: 'validation',
    lead: '',
    text,
    detail: '',
    code: null,
  };
};
