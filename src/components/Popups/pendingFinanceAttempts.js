/**
 * Pending and unknown-outcome money attempts, scoped by manager, broker and account login.
 *
 * Storage and barrier model (round 5):
 * - One storage blob PER ACCOUNT: `rtx.manager.pendingFinanceAttempts.v2:<broker>:<login>`. Every
 *   write to that blob happens under the account's lock, so writes for different accounts never
 *   overwrite each other (a single shared blob would lose updates between two account locks).
 * - Records carry `scope = "manager:<managerLogin>|broker:<brokerId>"` and `loginKey`.
 * - The account BARRIER is per `broker + login` across all managers in this browser: while a record
 *   on the account is unresolved (no acknowledgement), new money operations for that account are refused.
 * - Store operations match records strictly by `idempotency_key` (`record.payload.idempotency_key`),
 *   NEVER by `fingerprint`.
 * - Mutual exclusion is ONLY the Web Lock `rtx-fin:<broker>:<login>` (see financeLease.js). Every
 *   mutator (`prepare`, `checkpoint`, `remember`, `forget`, `acknowledge`) takes the `lease` token that
 *   `runWithAccountLease` hands to the task, and refuses without it. Each mutator re-reads the blob
 *   inside the lock before deciding.
 * - Fail closed: an unreadable, unwritable, or corrupt blob blocks new money operations for that
 *   account (`storageStatus !== 'durable'`). A corrupt blob is never overwritten.
 * - Expiry: `min(24 h, backendWindow - margin)` (default 23 h). Expired or out-of-window (clock jumped
 *   backwards, or elapsed time at least the TTL) unresolved records become `status: 'expired'`
 *   ("Status unknown — check history"). They keep blocking until acknowledged and are never dropped.
 *   E5 (sticky): the observed expiry is PERSISTED as `expired: true` inside the next locked write
 *   (prepare, checkpoint, remember, forget, acknowledge) or by `persistExpiry`. Nothing clears it.
 * - Retention (L6): acknowledged records are kept for the replay window (default 24 h) and at most
 *   `ACKNOWLEDGED_LOG_LIMIT` of them per account.
 * - Recent completions (H1): a definite success removes its record and, in the same locked write, adds a
 *   bounded completion entry (no credentials) to the account blob. Entries older than
 *   `RECENT_COMPLETION_WINDOW_MS` (60 s) are pruned on every write.
 *
 * Tenant-agnostic: no login, broker or endpoint is hardcoded.
 */

import {
  buildFinanceLeaseKey,
  createFinanceLeaseManager,
} from './financeLease.js';

export const PENDING_FINANCE_ATTEMPTS_STORAGE_KEY = 'rtx.manager.pendingFinanceAttempts.v2';

/**
 * THE client idempotency window (round 7, single config constant). It MUST be at most the backend
 * MANAGER_MONEY_IDEMPOTENCY_TTL_SEC (rtx-s1 default 86400 = 24 h, services/RTX5-Manager-Admin-Backend/manager-backend/handlers/money_redis.go:33).
 * A larger value lets a same-key retry reach the server after the backend has forgotten the key.
 * The client does not read the backend env (known limit, see IMPL-R7.md). Client expiry is
 * min(24 h, window - margin) = 23 h (82,800,000 ms) by default.
 */
export const DEFAULT_BACKEND_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_IDEMPOTENCY_EXPIRY_MARGIN_MS = 60 * 60 * 1000;
export const MAX_FINANCE_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
export const ACKNOWLEDGED_LOG_LIMIT = 20;
// H1: a definite success on an account is "recent" for this long; a new operation then needs an extra confirm.
export const RECENT_COMPLETION_WINDOW_MS = 60 * 1000;
export const RECENT_COMPLETIONS_LIMIT = 10;
// C5: per-account clock high-water mark (blob field clockHighWaterMs, moved forward ONLY by real locked writes: prepare,
// send attempt, result, remember, forget, acknowledge, persisted expiry). A view never moves it (R10 H2).
// A clock earlier than (highWater - this tolerance) has moved backwards ("stepped"): its unresolved records are expired,
// and a new operation is refused only while an unresolved record exists (clock-behind).
export const CLOCK_STEP_TOLERANCE_MS = 5000;
// C4 / b4: an observed expiry is persisted inside the same locked pass; it is retried this many times before it stays unsaved.
export const OBSERVED_EXPIRY_PERSIST_ATTEMPTS = 3;

/**
 * Compute the effective client expiry TTL: `min(24 h, backendWindow - margin)`.
 *
 * @param {{ windowMs?: number, marginMs?: number }} [config]
 * @returns {number}
 */
export const resolveFinanceAttemptTtlMs = ({
  windowMs = DEFAULT_BACKEND_IDEMPOTENCY_WINDOW_MS,
  marginMs = DEFAULT_IDEMPOTENCY_EXPIRY_MARGIN_MS,
} = {}) => {
  const safeWindow = Number.isFinite(windowMs) && windowMs > 0
    ? windowMs
    : DEFAULT_BACKEND_IDEMPOTENCY_WINDOW_MS;
  const safeMargin = Number.isFinite(marginMs) && marginMs >= 0
    ? marginMs
    : DEFAULT_IDEMPOTENCY_EXPIRY_MARGIN_MS;
  const effective = Math.max(0, safeWindow - safeMargin);
  return Math.min(MAX_FINANCE_ATTEMPT_TTL_MS, effective);
};

export const PENDING_FINANCE_ATTEMPT_TTL_MS = resolveFinanceAttemptTtlMs();

const IDEMPOTENCY_KEY_FIELD = 'idempotency_key';
const SEPARATOR = '\u001f';
const STORAGE_VERSION = 2;

const defaultGetStorage = () => (typeof window !== 'undefined' && window ? window.localStorage : null);

// Sorted object keys, so the same operation always produces the same fingerprint.
const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const parts = Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/**
 * Operation fingerprint: type, direction, endpoint and the request body without the idempotency
 * key. Used for display/summary only — never to key, overwrite, or delete stored records.
 *
 * @param {{ type: string, direction?: string|null, endpointKey: string, payload: object }} operation
 * @returns {string} Stable fingerprint text.
 */
export const fingerprintOperation = ({ type, direction = null, endpointKey, payload }) => {
  const body = { ...(payload ?? {}) };
  delete body[IDEMPOTENCY_KEY_FIELD];
  return stableStringify({
    type: String(type ?? ''),
    direction: direction ?? null,
    endpointKey: String(endpointKey ?? ''),
    body,
  });
};

/**
 * The scope of a pending attempt: the manager's login and the broker. Returns null when either is
 * unknown, in which case new money operations fail closed.
 *
 * @param {{ managerLogin?: string|number|null, brokerId?: string|number|null }} identity
 * @returns {string|null}
 */
export const buildFinanceAttemptScope = ({ managerLogin, brokerId } = {}) => {
  const manager = managerLogin === undefined || managerLogin === null ? '' : String(managerLogin).trim();
  const broker = brokerId === undefined || brokerId === null ? '' : String(brokerId).trim();
  if (manager === '' || broker === '') return null;
  return `manager:${manager}|broker:${broker}`;
};

/**
 * Parse a `manager:<managerLogin>|broker:<brokerId>` scope string.
 *
 * @param {string|null|undefined} scope
 * @returns {{ managerLogin: string, brokerId: string }}
 */
export const parseFinanceAttemptScope = (scope) => {
  if (typeof scope !== 'string' || scope.trim() === '') {
    return { managerLogin: '', brokerId: '' };
  }
  const match = /^manager:([^|]+)\|broker:(.+)$/.exec(scope.trim());
  if (!match) {
    return { managerLogin: '', brokerId: '' };
  }
  return {
    managerLogin: match[1].trim(),
    brokerId: match[2].trim(),
  };
};

const isNonEmptyString = (value) => typeof value === 'string' && value !== '';

const isUsableRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && typeof value.scope === 'string'
  && isNonEmptyString(value.loginKey)
  && isNonEmptyString(value.fingerprint)
  && isNonEmptyString(value.type)
  && typeof value.endpointKey === 'string'
  && (value.direction === null || value.direction === 'in' || value.direction === 'out')
  && value.payload !== null
  && typeof value.payload === 'object'
  && isNonEmptyString(value.payload[IDEMPOTENCY_KEY_FIELD])
  && Number.isFinite(value.createdAt)
  && (value.acknowledgedAt === null || Number.isFinite(value.acknowledgedAt))
  // R10: the time of the last send attempt (the clock anchor when it was written). Absent in records written before R10.
  && (value.lastAttemptAt === undefined || value.lastAttemptAt === null || Number.isFinite(value.lastAttemptAt))
);

// H1 completion entry: no credentials, only what the soft guard and its prompt need.
const isUsableCompletion = (value) => (
  value !== null
  && typeof value === 'object'
  && Number.isFinite(value.at)
  && typeof value.type === 'string'
  && (value.direction === null || value.direction === 'in' || value.direction === 'out')
  && typeof value.amount === 'string'
  && typeof value.manager === 'string'
);

const clone = (value) => JSON.parse(JSON.stringify(value));

// R9: the per-record `version` (monotonic, starts at 1). Every commit that changes a record's content moves that record's
// version forward by one; a record whose content is unchanged keeps its version. The content compare ignores `version`.
// The acknowledge check (balanceTabController.js) refuses when the version is not the one the panel showed.
export const recordVersionOf = (record) => (Number.isInteger(record?.version) && record.version >= 0 ? record.version : 0);
// R9: the send-attempt count of a record. It moves (and the version with it) before every send, in the proof write.
export const recordAttemptsOf = (record) => (Number.isInteger(record?.attempts) && record.attempts >= 0 ? record.attempts : 0);
const contentOfRecord = (record) => {
  const { version: _ignored, ...content } = record;
  return JSON.stringify(content);
};
const withRecordVersions = (records, priorRecords) => records.map((record) => {
  const key = idempotencyKeyOfRecord(record);
  const before = priorRecords.find((item) => idempotencyKeyOfRecord(item) === key);
  if (!before) return { ...record, version: 1 };
  if (contentOfRecord(record) === contentOfRecord(before)) return { ...record, version: recordVersionOf(before) };
  return { ...record, version: recordVersionOf(before) + 1 };
});

const scopeOf = (scope) => (typeof scope === 'string' ? scope.trim() : '');

const idempotencyKeyOfRecord = (record) => (
  isNonEmptyString(record?.payload?.[IDEMPOTENCY_KEY_FIELD])
    ? String(record.payload[IDEMPOTENCY_KEY_FIELD])
    : ''
);

const resolveQueryKey = (query) => {
  if (!query || typeof query !== 'object') return '';
  if (isNonEmptyString(query.idempotencyKey)) return query.idempotencyKey;
  if (isNonEmptyString(query.key)) return query.key;
  if (isNonEmptyString(query.payload?.[IDEMPOTENCY_KEY_FIELD])) return query.payload[IDEMPOTENCY_KEY_FIELD];
  return '';
};

// Identity of one account barrier: manager + broker (from scope) + login.
const identityOf = ({ scope, loginKey } = {}) => {
  const normalizedScope = scopeOf(scope);
  const { managerLogin, brokerId } = parseFinanceAttemptScope(normalizedScope);
  const login = loginKey === undefined || loginKey === null ? '' : String(loginKey).trim();
  return {
    scope: normalizedScope,
    managerLogin,
    brokerId,
    loginKey: login,
    valid: managerLogin !== '' && brokerId !== '' && login !== '',
  };
};

const recordBelongsTo = (record, identity) => {
  const parsed = parseFinanceAttemptScope(record.scope);
  return record.loginKey === identity.loginKey && parsed.brokerId === identity.brokerId;
};

/**
 * Create a store. The app uses the shared instance below. Tests create their own instances over a
 * fake storage, fake locks and a fake clock, to simulate a second tab.
 *
 * @param {{
 *   getStorage?: () => (Storage|null),
 *   getLocks?: () => ({ request: Function, query?: Function }|null),
 *   now?: () => number,
 *   ttlMs?: number,
 *   windowMs?: number,
 *   marginMs?: number,
 *   advisoryIntervalMs?: number,
 * }} [options]
 */
export const createPendingFinanceAttemptStore = ({
  getStorage = defaultGetStorage,
  getLocks,
  now = () => Date.now(),
  ttlMs,
  windowMs = DEFAULT_BACKEND_IDEMPOTENCY_WINDOW_MS,
  marginMs = DEFAULT_IDEMPOTENCY_EXPIRY_MARGIN_MS,
  advisoryIntervalMs,
  completionWindowMs = RECENT_COMPLETION_WINDOW_MS,
} = {}) => {
  const effectiveTtlMs = Number.isFinite(ttlMs) && ttlMs > 0
    ? Math.min(MAX_FINANCE_ATTEMPT_TTL_MS, ttlMs)
    : resolveFinanceAttemptTtlMs({ windowMs, marginMs });
  const replayWindowMs = Number.isFinite(windowMs) && windowMs > 0
    ? windowMs
    : DEFAULT_BACKEND_IDEMPOTENCY_WINDOW_MS;
  const recentWindowMs = Number.isFinite(completionWindowMs) && completionWindowMs > 0
    ? completionWindowMs
    : RECENT_COMPLETION_WINDOW_MS;

  const leaseManager = createFinanceLeaseManager({
    ...(getLocks !== undefined ? { getLocks } : {}),
    ...(advisoryIntervalMs !== undefined ? { advisoryIntervalMs } : {}),
  });

  const running = new Set(); // `${brokerId}\u001f${loginKey}\u001f${idempotencyKey}` while in flight in this tab
  const listeners = new Set();

  const storage = () => {
    try {
      return getStorage() ?? null;
    } catch {
      return null;
    }
  };

  const storageKeyOf = ({ brokerId, loginKey }) => `${PENDING_FINANCE_ATTEMPTS_STORAGE_KEY}:${brokerId}:${loginKey}`;

  // G3: true when any account blob in this browser already holds this idempotency key. Enumeration that fails is
  // treated as "held" (fail closed). An unreadable blob of another account is skipped: it blocks its own account only.
  const keyHeldInAnyAccount = (idempotencyKey) => {
    const target = storage();
    if (!target) return true;
    try {
      const count = target.length;
      if (!Number.isInteger(count)) return true;
      for (let index = 0; index < count; index += 1) {
        const name = target.key(index);
        if (typeof name !== 'string' || !name.startsWith(`${PENDING_FINANCE_ATTEMPTS_STORAGE_KEY}:`)) continue;
        const raw = target.getItem(name);
        if (typeof raw !== 'string') continue;
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }
        if (Array.isArray(parsed?.records) && parsed.records.some((record) => idempotencyKeyOfRecord(record) === idempotencyKey)) {
          return true;
        }
      }
      return false;
    } catch {
      return true;
    }
  };

  // Reads one account blob. ok=false when storage is missing or unreadable; corrupt=true when present but unusable.
  // `completions` is optional in the blob (H1); a present but malformed list makes the blob corrupt.
  const readAccount = (identity) => {
    const empty = { ok: false, corrupt: false, records: [], completions: [], clockHighWaterMs: null };
    const target = storage();
    if (!target) return empty;
    let raw;
    try {
      raw = target.getItem(storageKeyOf(identity));
    } catch {
      return empty;
    }
    if (raw === null || raw === undefined || raw === '') return { ...empty, ok: true };
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed === null
        || typeof parsed !== 'object'
        || parsed.v !== STORAGE_VERSION
        || !Array.isArray(parsed.records)
        || !parsed.records.every((record) => isUsableRecord(record) && recordBelongsTo(record, identity))
        || (parsed.completions !== undefined && (!Array.isArray(parsed.completions) || !parsed.completions.every(isUsableCompletion)))
        || (parsed.clockHighWaterMs !== undefined && !Number.isFinite(parsed.clockHighWaterMs))
      ) {
        return { ...empty, corrupt: true };
      }
      return {
        ok: true,
        corrupt: false,
        records: parsed.records,
        completions: Array.isArray(parsed.completions) ? parsed.completions : [],
        clockHighWaterMs: Number.isFinite(parsed.clockHighWaterMs) ? parsed.clockHighWaterMs : null,
      };
    } catch {
      return { ...empty, corrupt: true };
    }
  };

  // In-memory, per tab: keys of unresolved records this tab has observed as expired. They stay expired and blocking
  // in this tab whatever the clock reads later (C4 / b4). A key is broker, login and idempotency key.
  const observedExpiredKeys = new Set();

  // C5 / L2: the completion window, the expiry and the clock stamps use max(now, high-water mark). A backward step cannot
  // move them into the past, and a record created while the clock is behind can only expire EARLIER (R10 H2).
  const anchorOf = (highWaterMs) => (Number.isFinite(highWaterMs) ? Math.max(now(), highWaterMs) : now());

  // Expiry is derived on every read. A record observed expired is persisted by the next locked write (E5).
  // `stepped` is true when the clock moved backwards past the stored high-water mark (C5): unresolved records expire.
  const withExpiry = (record, identity, anchor, stepped) => {
    const elapsed = anchor - record.createdAt;
    const outOfWindow = !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= effectiveTtlMs;
    const unresolved = record.acknowledgedAt === null;
    const observedKey = `${identity.brokerId}${SEPARATOR}${identity.loginKey}${SEPARATOR}${idempotencyKeyOfRecord(record)}`;
    if (unresolved && (outOfWindow || stepped)) observedExpiredKeys.add(observedKey);
    const expired = Boolean(record.expired) || outOfWindow || (unresolved && observedExpiredKeys.has(observedKey));
    return {
      ...record,
      expired,
      status: expired && unresolved ? 'expired' : record.status,
    };
  };

  const readRecords = (identity) => {
    const stored = readAccount(identity);
    const anchor = anchorOf(stored.clockHighWaterMs);
    const stepped = Number.isFinite(stored.clockHighWaterMs) && now() < stored.clockHighWaterMs - CLOCK_STEP_TOLERANCE_MS;
    return {
      ok: stored.ok,
      corrupt: stored.corrupt,
      records: stored.records.map((record) => withExpiry(record, identity, anchor, stepped)),
      raw: stored.records,
      completions: stored.completions,
      clockHighWaterMs: stored.clockHighWaterMs,
      anchor,
      stepped,
    };
  };

  // True when a record is observed expired but the stored copy does not say so yet (E5 persist pending).
  const expiryPending = (stored) => stored.records.some((record, index) => (
    record.expired === true && stored.raw[index]?.expired !== true
  ));

  // Retention: unresolved records are never pruned. Acknowledged ones stay for the replay window, newest first, bounded.
  const pruneForWrite = (records) => {
    const cutoff = now() - replayWindowMs;
    const unresolved = records.filter((record) => record.acknowledgedAt === null);
    const acknowledged = records
      .filter((record) => record.acknowledgedAt !== null && record.acknowledgedAt >= cutoff)
      .sort((a, b) => b.acknowledgedAt - a.acknowledgedAt)
      .slice(0, ACKNOWLEDGED_LOG_LIMIT);
    return [...unresolved, ...acknowledged];
  };

  // H1 retention: completions inside the window only, newest first, bounded.
  const pruneCompletions = (completions, anchorMs) => {
    const cutoff = anchorMs - recentWindowMs;
    return completions
      .filter((entry) => entry.at >= cutoff)
      .sort((a, b) => b.at - a.at)
      .slice(0, RECENT_COMPLETIONS_LIMIT);
  };

  // Writes one account blob and verifies it by read-back, byte for byte. Never overwrites a corrupt blob.
  // The caller must hold the account lock. `completions` defaults to the stored list (read under the same lock).
  const commitAccount = (identity, records, completions) => {
    const target = storage();
    if (!target) return false;
    const prior = readAccount(identity);
    if (!prior.ok || prior.corrupt) return false;
    const next = pruneForWrite(withRecordVersions(records, prior.records));
    const nextCompletions = pruneCompletions(completions ?? prior.completions, anchorOf(prior.clockHighWaterMs));
    // C5: every locked write moves the clock high-water mark forward, never back. Verified by read-back below.
    const nextHighWaterMs = Number.isFinite(prior.clockHighWaterMs) ? Math.max(now(), prior.clockHighWaterMs) : now();
    const expected = next.map((record) => JSON.stringify(record));
    const expectedCompletions = JSON.stringify(nextCompletions);
    const key = storageKeyOf(identity);
    try {
      // The blob is always kept (never removed), so the high-water mark survives an account with no records.
      const blob = { v: STORAGE_VERSION, records: next, clockHighWaterMs: nextHighWaterMs };
      if (nextCompletions.length > 0) blob.completions = nextCompletions;
      target.setItem(key, JSON.stringify(blob));
    } catch {
      return false;
    }
    const readBack = readAccount(identity);
    if (!readBack.ok || readBack.corrupt || readBack.records.length !== expected.length) return false;
    if (readBack.clockHighWaterMs !== nextHighWaterMs) return false;
    if (JSON.stringify(readBack.completions) !== expectedCompletions) return false;
    return readBack.records.every((record, index) => JSON.stringify(record) === expected[index]);
  };

  // Lock token check: a mutator runs only when the task holds this account's lock.
  const isLeaseFor = (lease, identity) => (
    Boolean(identity.valid)
    && typeof lease?.lockName === 'string'
    && lease.lockName === leaseManager.buildKey({ brokerId: identity.brokerId, loginKey: identity.loginKey })
  );

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // One failing listener must not stop the others.
      }
    }
  };

  /** Unresolved and acknowledged records for one account barrier (broker + login), newest first. */
  const list = (identity = {}) => {
    const id = identityOf(identity);
    if (!id.valid) return [];
    const stored = readRecords(id);
    if (!stored.ok || stored.corrupt) return [];
    return [...stored.records]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(clone);
  };

  /**
   * Look up a single stored record by its `idempotencyKey` (`record.payload.idempotency_key`),
   * NEVER by `fingerprint`. Returns null when the account blob is unreadable.
   */
  const find = (query = {}) => {
    const id = identityOf(query);
    const key = resolveQueryKey(query);
    if (!id.valid || key === '') return null;
    const stored = readRecords(id);
    if (!stored.ok || stored.corrupt) return null;
    const record = stored.records.find((item) => idempotencyKeyOfRecord(item) === key);
    return record ? clone(record) : null;
  };

  /** True while any record on this account barrier (broker + login) has no acknowledgement. */
  const hasUnresolved = (identity) => list(identity).some((record) => record.acknowledgedAt === null);

  /**
   * Save or replace a record, matched by its `idempotency_key`, under the account lock.
   * Refuses a record without its key, valid scope, login or fingerprint (throws TypeError), and
   * returns `{ saved: false }` without the lock or on an unreadable blob.
   */
  const remember = (record, lease) => {
    if (!isUsableRecord(record)) {
      throw new TypeError('A pending finance attempt needs its scope, login, fingerprint, endpoint and idempotency key.');
    }
    const id = identityOf({ scope: record.scope, loginKey: record.loginKey });
    if (!isLeaseFor(lease, id)) return { saved: false };
    const stored = readRecords(id);
    if (!stored.ok || stored.corrupt) return { saved: false };
    const key = idempotencyKeyOfRecord(record);
    const existing = stored.records.find((item) => idempotencyKeyOfRecord(item) === key);
    // E5: expiry is sticky. A stored or observed expiry is never cleared by a later write.
    const normalized = { ...clone(record), expired: Boolean(record.expired) || Boolean(existing?.expired) };
    const next = existing
      ? stored.records.map((item) => (idempotencyKeyOfRecord(item) === key ? normalized : item))
      : [...stored.records, normalized];
    const saved = commitAccount(id, next, stored.completions);
    notify();
    return { saved };
  };

  /**
   * Remove a record strictly by its `idempotencyKey`, under the account lock.
   * Returns `{ removed, saved, completionRecorded }`. `saved: false` means the write did not persist and
   * verify, so the record may still block. The caller must treat that as a failure.
   * `completion` (H1, a definite success only: `{ type, direction, amount }`) is written in the same
   * locked write as the removal, so the recent-completion guard cannot miss a success.
   */
  const forget = (query = {}) => {
    const id = identityOf(query);
    const key = resolveQueryKey(query);
    if (!id.valid || key === '' || !isLeaseFor(query.lease, id)) return { removed: false, saved: false, completionRecorded: false };
    const stored = readRecords(id);
    if (!stored.ok || stored.corrupt) return { removed: false, saved: false, completionRecorded: false };
    if (!stored.records.some((item) => idempotencyKeyOfRecord(item) === key)) {
      return { removed: false, saved: true, completionRecorded: false };
    }
    const completions = [...stored.completions];
    const entry = query.completion && typeof query.completion === 'object' ? query.completion : null;
    if (entry) {
      completions.push({
        at: anchorOf(stored.clockHighWaterMs),
        type: String(entry.type ?? ''),
        direction: entry.direction === 'in' || entry.direction === 'out' ? entry.direction : null,
        amount: String(entry.amount ?? ''),
        manager: id.managerLogin,
      });
    }
    const saved = commitAccount(id, stored.records.filter((item) => idempotencyKeyOfRecord(item) !== key), completions);
    notify();
    return { removed: saved, saved, completionRecorded: saved && entry !== null };
  };

  /**
   * E5: persist an observed expiry (`expired: true`) under the account lock. Writes only when a record
   * is observed expired and the stored copy does not say so yet. Returns `{ saved, changed }`.
   */
  const persistExpiry = ({ scope, loginKey, lease } = {}) => {
    const id = identityOf({ scope, loginKey });
    if (!isLeaseFor(lease, id)) return { saved: false, changed: false };
    const stored = readRecords(id);
    if (!stored.ok || stored.corrupt) return { saved: false, changed: false };
    if (!expiryPending(stored)) return { saved: true, changed: false };
    let saved = false;
    for (let attempt = 0; attempt < OBSERVED_EXPIRY_PERSIST_ATTEMPTS && !saved; attempt += 1) {
      saved = commitAccount(id, stored.records, stored.completions);
    }
    if (saved) notify();
    return { saved, changed: saved };
  };

  /** C4: true while an observed expiry on this account is not yet saved. Read-only. */
  const expiryUnsaved = ({ scope, loginKey } = {}) => {
    const id = identityOf({ scope, loginKey });
    if (!id.valid) return false;
    const stored = readRecords(id);
    if (!stored.ok || stored.corrupt) return false;
    return expiryPending(stored);
  };

  /**
   * R10 H2: the clock state of one account, read-only. `anchor` = max(now, high-water mark) is the clock every expiry and
   * stamp uses; `stepped` = the browser clock is behind the mark (new operations that depend on an unresolved record and
   * the acknowledge are refused with clock-behind). No view writes the mark: only real locked writes do.
   */
  const clockOf = ({ scope, loginKey } = {}) => {
    const id = identityOf({ scope, loginKey });
    if (!id.valid) return { now: now(), anchor: now(), stepped: false };
    const stored = readRecords(id);
    return { now: now(), anchor: stored.anchor, stepped: stored.stepped };
  };

  /**
   * H1: the bounded completion entries of the account inside the recent window, newest first. Read-only.
   * Returns [] when the blob is unreadable; `prepare` then fails closed on the same read.
   */
  const recentCompletions = ({ scope, loginKey } = {}) => {
    const id = identityOf({ scope, loginKey });
    if (!id.valid) return [];
    const stored = readAccount(id);
    if (!stored.ok || stored.corrupt) return [];
    // R11 (tester observation, left as is): the cutoff is anchored at max(now, mark). A tab behind the mark keeps the completion
    // inside the window longer, so the H1 prompt stays up. It is a confirm, not a block, and a new operation is never sent without it.
    const cutoff = anchorOf(stored.clockHighWaterMs) - recentWindowMs;
    return stored.completions
      .filter((entry) => entry.at >= cutoff)
      .sort((a, b) => b.at - a.at)
      .map(clone);
  };

  const runningPrefix = ({ scope, loginKey } = {}) => {
    const id = identityOf({ scope, loginKey });
    const partition = id.brokerId !== '' ? `broker:${id.brokerId}` : id.scope;
    return `${partition}${SEPARATOR}${id.loginKey}${SEPARATOR}`;
  };

  const runningId = ({ scope, loginKey, idempotencyKey, key } = {}) => {
    const resolvedKey = isNonEmptyString(idempotencyKey) ? idempotencyKey : (isNonEmptyString(key) ? key : '');
    if (resolvedKey === '') return null;
    return `${runningPrefix({ scope, loginKey })}${resolvedKey}`;
  };

  const setRunning = (identity = {}, on) => {
    const id = runningId(identity);
    if (!id) return;
    if (on) running.add(id);
    else running.delete(id);
    notify();
  };

  const isRunning = (identity = {}) => {
    const id = runningId(identity);
    if (!id) return false;
    return running.has(id);
  };

  const hasLocalLoginRunning = ({ scope, loginKey } = {}) => {
    const prefix = runningPrefix({ scope, loginKey });
    return [...running].some((id) => id.startsWith(prefix));
  };

  /**
   * ADVISORY display state: a request is in flight for this account in this tab, or the account lock
   * is reported held or pending by `navigator.locks.query()`. Safety never depends on this value.
   */
  const isLoginRunning = ({ scope, loginKey } = {}) => {
    if (hasLocalLoginRunning({ scope, loginKey })) return true;
    const id = identityOf({ scope, loginKey });
    if (!id.valid) return false;
    return leaseManager.isBusy({ brokerId: id.brokerId, loginKey: id.loginKey });
  };

  /**
   * Explicit acknowledgement by a manager: "I checked, start a new operation". Runs under the account
   * lock. R9: acknowledges ONLY the unresolved record with this `idempotencyKey`, never another record on the login.
   * Returns `{ ok, reason, acknowledged }`:
   * - `reason: 'none'` when no unresolved record with this key exists (also when no key is given),
   * - `reason: 'storage-unavailable'` when the write did not persist and verify (the records stay pending).
   */
  const acknowledge = ({ scope, loginKey, idempotencyKey, acknowledgedBy = null, at, lease } = {}) => {
    const id = identityOf({ scope, loginKey });
    const refused = (reason) => ({ ok: false, reason, acknowledged: [] });
    if (!isLeaseFor(lease, id)) return refused('storage-unavailable');
    const stored = readRecords(id);
    if (!stored.ok || stored.corrupt) return refused('storage-unavailable');
    const targetKey = isNonEmptyString(idempotencyKey) ? idempotencyKey : '';
    if (targetKey === '') return refused('none');
    // R10: without an explicit time the acknowledgement is stamped with the clock anchor, max(now, mark), like every other stamp.
    const ackAt = Number.isFinite(at) ? at : anchorOf(stored.clockHighWaterMs);
    const by = isNonEmptyString(acknowledgedBy) ? String(acknowledgedBy).trim() : id.managerLogin;
    const acked = [];
    const next = stored.records.map((record) => {
      if (record.acknowledgedAt !== null || idempotencyKeyOfRecord(record) !== targetKey) return record;
      const updated = { ...record, acknowledgedAt: ackAt, acknowledgedBy: by };
      acked.push(updated);
      return updated;
    });
    if (acked.length === 0) return refused('none');
    if (!commitAccount(id, next, stored.completions)) {
      // Put the original records back. L2: if the disk is not verifiably back to the original, it may show the
      // acknowledgement, so the result says so (`revert-failed`) and the caller shows a visible error. Nothing is sent.
      const reverted = commitAccount(id, stored.records, stored.completions);
      const onDisk = readAccount(id);
      const diskIsOriginal = reverted || (onDisk.ok && !onDisk.corrupt && JSON.stringify(onDisk.records) === JSON.stringify(stored.raw));
      return refused(diskIsOriginal ? 'storage-unavailable' : 'revert-failed');
    }
    notify();
    return { ok: true, reason: null, acknowledged: acked.map(clone) };
  };

  /**
   * `'durable'` when the account blob can be read and is not corrupt, lock support is present, and a
   * manager and broker scope is valid; `'memory-only'` otherwise. Read-only. Writability is proven by
   * `prepare` and `checkpoint` (write + read-back), never by a cached flag.
   */
  const storageStatus = ({ scope, loginKey } = {}) => {
    const id = identityOf({ scope, loginKey });
    if (!id.valid || !leaseManager.supported()) return 'memory-only';
    const stored = readAccount(id);
    return stored.ok && !stored.corrupt ? 'durable' : 'memory-only';
  };

  /**
   * Create the record for a new operation, with a new key, and durably save + read-back verify it
   * before any request is sent. Must run inside `runWithAccountLease`, with that lease passed in.
   *
   * Fails closed:
   * - scope, lease or storage missing, unreadable, or corrupt: `{ blocked: true, reason: 'storage-unavailable' }`
   * - another unresolved record on the account barrier: `{ blocked: true, reason: 'blocked' }`
   * - no lease token: `{ blocked: true, reason: 'no-lease' }`
   */
  const prepare = ({ scope, loginKey, lease, type, direction = null, endpointKey, payload, createKey } = {}) => {
    const id = identityOf({ scope, loginKey });
    const blocked = (reason) => ({
      blocked: true,
      reason,
      storageUnavailable: reason === 'storage-unavailable',
      record: null,
      saved: false,
    });
    if (!id.valid || !storage()) return blocked('storage-unavailable');
    if (!isLeaseFor(lease, id)) return blocked('no-lease');
    const current = readRecords(id);
    if (!current.ok || current.corrupt) return blocked('storage-unavailable');
    if (current.records.some((record) => record.acknowledgedAt === null)) {
      // E5 / C4: a newly observed expiry is persisted in this locked write. If it cannot be saved, the operation is refused
      // with the duplicate-protection notice (fail closed).
      if (expiryPending(current) && !commitAccount(id, current.records, current.completions)) return blocked('storage-unavailable');
      // R10 (H2): a clock behind the mark refuses a new operation only while an unresolved record exists (clock-behind).
      return blocked(current.stepped ? 'clock-behind' : 'blocked');
    }

    const idempotencyKey = createKey();
    if (!isNonEmptyString(idempotencyKey)) {
      throw new TypeError('An idempotency key is required to start a money operation.');
    }
    if (current.records.some((record) => idempotencyKeyOfRecord(record) === idempotencyKey)) {
      return blocked('storage-unavailable');
    }
    // G3: a key already held by any other operation or account in this browser is never reused.
    if (keyHeldInAnyAccount(idempotencyKey)) return blocked('storage-unavailable');
    const record = {
      scope: id.scope,
      loginKey: id.loginKey,
      fingerprint: fingerprintOperation({ type, direction, endpointKey, payload }),
      type: String(type),
      direction: direction ?? null,
      endpointKey,
      payload: { ...payload, [IDEMPOTENCY_KEY_FIELD]: idempotencyKey },
      status: 'pending',
      code: null,
      reversal: null,
      createdAt: now(),
      acknowledgedAt: null,
      acknowledgedBy: null,
      expired: false,
      attempts: 0,
      lastAttemptAt: null,
    };
    if (!commitAccount(id, [...current.records, record], current.completions)) return blocked('storage-unavailable');
    notify();
    return {
      blocked: false,
      reason: null,
      storageUnavailable: false,
      record: clone(record),
      saved: true,
    };
  };

  /**
   * Fresh writability proof for one record, run inside the lock immediately before a send: re-reads
   * the blob, writes it back and verifies the read-back. Returns `{ ok, reason }` with reason
   * `'gone'` (no such record) or `'storage-unavailable'`.
   */
  const checkpoint = ({ scope, loginKey, idempotencyKey, lease, recordAttempt = false } = {}) => {
    const id = identityOf({ scope, loginKey });
    if (!isLeaseFor(lease, id) || !storage()) return { ok: false, reason: 'storage-unavailable' };
    const stored = readRecords(id);
    if (!stored.ok || stored.corrupt) return { ok: false, reason: 'storage-unavailable' };
    if (!stored.records.some((record) => idempotencyKeyOfRecord(record) === idempotencyKey)) {
      return { ok: false, reason: 'gone' };
    }
    // R9: with recordAttempt, the send attempt is written and verified here, before the send (one more content change).
    // R10: the attempt time is the clock anchor, max(now, mark), so a skewed-behind browser never stamps an earlier attempt.
    const records = recordAttempt
      ? stored.records.map((record) => (
        idempotencyKeyOfRecord(record) === idempotencyKey
          ? { ...record, attempts: recordAttemptsOf(record) + 1, lastAttemptAt: stored.anchor }
          : record
      ))
      : stored.records;
    return commitAccount(id, records, stored.completions)
      ? { ok: true, reason: null }
      : { ok: false, reason: 'storage-unavailable' };
  };

  /**
   * Run an async task under the account lock `rtx-fin:<broker>:<login>`. The task receives `{ lockName }`
   * and must pass it as `lease` to every mutator. Resolves to `{ acquired, reason, lockName, result? }`.
   */
  const runWithAccountLease = async ({ scope, loginKey } = {}, task) => {
    const id = identityOf({ scope, loginKey });
    if (!id.valid) return { acquired: false, reason: 'invalid-scope', lockName: null };
    return leaseManager.runWithLease({ brokerId: id.brokerId, loginKey: id.loginKey }, task);
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  /** Storage event from another tab: refresh the view and tell the subscribers. */
  const handleStorageEvent = (event) => {
    if (!event) return;
    const isAttemptKey = typeof event.key === 'string' && event.key.startsWith(`${PENDING_FINANCE_ATTEMPTS_STORAGE_KEY}:`);
    const isClearAll = event.key === null || event.key === undefined;
    if (!isAttemptKey && !isClearAll) return;
    // Another tab changed storage: re-read the advisory lock view as well.
    void leaseManager.refreshAdvisory();
    notify();
  };

  leaseManager.onChange(notify);

  return {
    prepare,
    checkpoint,
    find,
    list,
    hasUnresolved,
    remember,
    forget,
    persistExpiry,
    expiryUnsaved,
    clockOf,
    recentCompletions,
    acknowledge,
    setRunning,
    isRunning,
    isLoginRunning,
    runWithAccountLease,
    refreshLockState: () => leaseManager.refreshAdvisory(),
    // L5: the 1 s advisory poll runs only while a Balance tab is mounted (start on mount, stop on unmount).
    startAdvisoryPolling: () => leaseManager.startPolling(),
    stopAdvisoryPolling: () => leaseManager.stopPolling(),
    locksSupported: () => leaseManager.supported(),
    leaseKey: ({ scope, loginKey } = {}) => {
      const id = identityOf({ scope, loginKey });
      return buildFinanceLeaseKey({ brokerId: id.brokerId, loginKey: id.loginKey });
    },
    storageStatus,
    subscribe,
    handleStorageEvent,
  };
};

/** The store shared by the account popups. */
export const pendingFinanceAttempts = createPendingFinanceAttemptStore();

if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => pendingFinanceAttempts.handleStorageEvent(event));
}
