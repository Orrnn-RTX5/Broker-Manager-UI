import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ACKNOWLEDGE_REVERT_FAILED_TEXT,
  BALANCE_AFTER_LABEL,
  BROWSER_UNSUPPORTED_TEXT,
  DUPLICATE_PROTECTION_OFF_TEXT,
  KEY_HOLD_TEXT,
  OPERATION_GONE_TEXT,
  PERMISSION_DENIED_TEXT,
  RECENT_COMPLETION_REFUSED_TEXT,
  RUNNING_OPERATION_TEXT,
  STATUS_UNKNOWN_CHECK_HISTORY_TEXT,
  SUBMIT_BLOCKED_TEXT,
  SUCCESS_RECORD_NOT_CLEARED_TEXT,
  UNRESOLVED_OPERATION_TITLE,
  UNSUPPORTED_TRANSACTION_TYPE_TEXT,
  acknowledgeNewOperation,
  buildRecentCompletionPrompt,
  canShowSkipMargin,
  canUseSkipMargin,
  deriveBalanceFinanceView,
  describeAcknowledgeOutcome,
  describeHistoryRow,
  describeOriginalOperation,
  acknowledgeCheckView,
  historyWindowStartSec,
  HISTORY_MAX_PAGES,
  HISTORY_PAGE_LIMIT,
  HISTORY_READ_TIMEOUT_MS,
  HISTORY_SETTLE_MS,
  HISTORY_WINDOW_MS,
  TOO_SOON_TEXT,
  HISTORY_TRUNCATED_TEXT,
  RECORD_CHANGED_TEXT,
  CLOCK_BEHIND_TEXT,
  HISTORY_CONFIRM_MATCH_TEXT,
  HISTORY_CONFIRM_TEXT,
  HISTORY_HEADING_TEXT,
  HISTORY_KIND_MAP,
  HISTORY_LOADING_TEXT,
  HISTORY_MATCH_WARNING_TEXT,
  HISTORY_NO_MATCH_TEXT,
  HISTORY_OPEN_TEXT,
  HISTORY_PENDING_LABEL,
  HISTORY_UNAVAILABLE_TEXT,
  historyKindFor,
  historyRowMatchesOriginal,
  loadAcknowledgeHistory,
  normalizeDecimalText,
  H1_PROMPT_TEMPLATE,
  executeBalanceOperation,
  HISTORY_KIND_LABELS,
  historyKindLabel,
  historyRowParts,
  loadRecentBalanceHistory,
  recentHistoryFor,
  recentHistoryLoadingState,
  recentHistoryTrigger,
  RECENT_HISTORY_LIMIT,
  RECENT_HISTORY_UNAVAILABLE_TEXT,
  fillPromptTemplate,
  persistObservedExpiry,
  prepareBalanceSubmission,
  recentCompletionFor,
  translateUiText,
  resolveBalanceOutcomeView,
  retryBalanceOperation,
  runBalanceOperation,
  shouldApplyOutcome,
  submitBlockReason,
} from './balanceTabController.js';
import { buildFinanceLeaseKey } from './financeLease.js';
import {
  buildFinanceAttemptScope,
  createPendingFinanceAttemptStore,
  PENDING_FINANCE_ATTEMPT_TTL_MS,
  PENDING_FINANCE_ATTEMPTS_STORAGE_KEY,
} from './pendingFinanceAttempts.js';
import {
  IN_FLIGHT_PENDING_TEXT,
  KEY_CONFLICT_PENDING_TEXT,
  KEY_REJECTED_PENDING_TEXT,
  MANAGER_REPLAY_TEXT,
  buildManagerTransactionRequest,
  OUTCOME_UNKNOWN_PENDING_TEXT,
  STORE_UNAVAILABLE_PENDING_TEXT,
  UNVERIFIED_PENDING_TEXT,
} from './accountFinanceOps.js';
import { submitManagerTransaction } from '../../services/managerFinanceApi.js';
import { UI_DICTIONARIES } from '../../i18n/uiDictionary/index.js';
import { PERMISSIONS } from '../../utils/permissions.js';

// Fake logins and brokers only. Never real owner or QA-pool accounts.
const LOGIN = 710001;
const OTHER_LOGIN = 710002;
const SCOPE = buildFinanceAttemptScope({ managerLogin: 'mgr-a', brokerId: 'broker-a' });
const OTHER_MANAGER_SCOPE = buildFinanceAttemptScope({ managerLogin: 'mgr-b', brokerId: 'broker-a' });
const OTHER_BROKER_SCOPE = buildFinanceAttemptScope({ managerLogin: 'mgr-a', brokerId: 'broker-b' });

const createFakeStorage = () => {
  const values = new Map();
  const storage = {
    values,
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    failGet: false,
    failSet: false,
    getItem: (key) => {
      if (storage.failGet) throw new Error('SecurityError');
      return values.has(key) ? values.get(key) : null;
    },
    setItem: (key, value) => {
      if (storage.failSet) throw new Error('QuotaExceededError');
      values.set(key, String(value));
    },
    removeItem: (key) => {
      if (storage.failSet) throw new Error('QuotaExceededError');
      values.delete(key);
    },
    // The blob of one account (storage is per broker + login).
    raw: (login = LOGIN, broker = 'broker-a') => values.get(`${PENDING_FINANCE_ATTEMPTS_STORAGE_KEY}:${broker}:${login}`) ?? null,
  };
  return storage;
};

// navigator.locks fake with ifAvailable semantics (callback(null) when held) and query().
const createFakeWebLocks = () => {
  const held = new Set();
  const calls = [];
  return {
    held,
    calls,
    async request(name, optionsOrCallback, maybeCallback) {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      const options = typeof optionsOrCallback === 'object' && optionsOrCallback ? optionsOrCallback : {};
      calls.push({ name, options });
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        throw new Error(`Lock ${name} already held`);
      }
      held.add(name);
      try {
        return await callback({ name, mode: options.mode || 'exclusive' });
      } finally {
        held.delete(name);
      }
    },
    async query() {
      return { held: [...held].map((name) => ({ name, mode: 'exclusive' })), pending: [] };
    },
  };
};

const createClock = () => {
  const clock = {
    t: 1_700_000_000_000,
    now: () => clock.t,
    advance: (ms) => { clock.t += ms; },
    set: (v) => { clock.t = v; },
  };
  return clock;
};

let keyCounter = 0;
const createKey = () => {
  keyCounter += 1;
  return `ctl-key-${String(keyCounter).padStart(4, '0')}`;
};

const depositPayload = (overrides = {}) => ({ login: LOGIN, amount: '100.00', comment: 'Client deposit', ...overrides });
// R9: the acknowledge names the record by its key and the version the panel showed; the controller reads the history itself.
// EMPTY_HISTORY is a loaded history with no rows (no match). MATCH_HISTORY holds the applied deposit of the default payload.
const EMPTY_HISTORY = async () => ({ items: [], nextCursor: null });
const MATCH_ROW = Object.freeze({
  id: 99, time: 1_700_000_001, operation_kind: 'deposit', direction: 'in', amount: '100', balance_after: '100', comment: 'Client deposit',
});
const MATCH_HISTORY = async () => ({ items: [MATCH_ROW], nextCursor: null });
// The acknowledge as the modal makes it: the record's key and the version of that record (the first unresolved one unless a key is given).
// R10: by default the helper lets HISTORY_SETTLE_MS pass first (the too-soon gate is tested on its own with settled: false).
// R11: each store has its own monotonic clock (monoClock.now), injected into the acknowledge. With `settled`, a primer call runs
// first on a monotonic clock frozen at 0: it stamps the version if it is new and can never pass the settle (elapsed <= 0), so it
// never acknowledges. Then both clocks move HISTORY_SETTLE_MS on and the real call runs.
const ackNew = async ({
  store, scope = SCOPE, loginKey = LOGIN, canManageFinances = true, at, fetchHistory = EMPTY_HISTORY, matchConfirmed = false,
  idempotencyKey, expectedVersion, settled = true,
} = {}) => {
  const records = store.list({ scope, loginKey });
  const key = idempotencyKey ?? records.find((record) => record.acknowledgedAt === null)?.payload?.idempotency_key ?? '';
  const target = records.find((record) => record.payload?.idempotency_key === key) ?? null;
  const checkedFor = { idempotencyKey: key, version: expectedVersion ?? (target?.version ?? 0) };
  const call = (monotonicNow, reader) => acknowledgeNewOperation({
    store,
    scope,
    loginKey,
    canManageFinances,
    at,
    checkedFor,
    matchConfirmed,
    fetchHistory: reader,
    monotonicNow,
  });
  if (settled && store.testClock) {
    const primed = await call(() => 0, EMPTY_HISTORY);
    assert.notEqual(primed.ok, true, 'the primer stamps the version and never acknowledges');
    store.testClock.advance(HISTORY_SETTLE_MS + 1000);
    store.monoClock.advance(HISTORY_SETTLE_MS + 1000);
  }
  return call(store.monoClock.now, fetchHistory);
};

// R11: stamps a version in this store without acknowledging it (the same primer as ackNew: monotonic clock frozen at 0).
const primeAck = (store, checkedFor, loginKey = LOGIN) => acknowledgeNewOperation({
  store, scope: SCOPE, loginKey, canManageFinances: true, checkedFor, fetchHistory: EMPTY_HISTORY, monotonicNow: () => 0,
}).then((result) => {
  assert.notEqual(result.ok, true, 'the primer never acknowledges');
  return result;
});

// Creates a stored record the way the app does: inside the account lock, through prepare().
const startDeposit = async (store, options = {}) => {
  const scope = options.scope ?? SCOPE;
  const loginKey = options.loginKey ?? LOGIN;
  const leased = await store.runWithAccountLease({ scope, loginKey }, (lease) => store.prepare({
    scope,
    loginKey,
    lease,
    type: 'balance',
    direction: 'in',
    endpointKey: 'deposit',
    payload: options.payload ?? depositPayload(),
    createKey: options.createKey ?? createKey,
  }));
  if (!leased.acquired) return { ok: false, blocked: true, reason: 'busy', record: null, saved: false };
  const prepared = leased.result;
  return {
    ok: !prepared.blocked && prepared.saved,
    blocked: prepared.blocked,
    reason: prepared.reason,
    record: prepared.record,
    saved: prepared.saved,
  };
};

// Each store gets its own lock manager unless the test passes `locks` (shared between tabs) or `getLocks`.
// testClock: the fake clock of this store, so the acknowledge helper can let the history settle (R10 addendum).
// R11: monoClock is this tab's monotonic clock (the acknowledge's monotonicNow). It starts at 0 and moves only by advance().
const createMonoClock = () => {
  const mono = { t: 0, now: () => mono.t, advance: (ms) => { mono.t += ms; } };
  return mono;
};
const makeStore = (storage, clock, extra = {}) => {
  const { locks = createFakeWebLocks(), ...rest } = extra;
  return Object.assign(createPendingFinanceAttemptStore({
    getStorage: () => storage,
    getLocks: () => locks,
    now: clock.now,
    advisoryIntervalMs: 0,
    ...rest,
  }), { testClock: clock, monoClock: createMonoClock() });
};

// A submit fake that answers with the given outcome or throws the given error, and records each call.
const scriptedSubmit = (...steps) => {
  const calls = [];
  const submit = async (endpointKey, payload) => {
    calls.push({ endpointKey, payload: { ...payload } });
    const step = steps.shift();
    if (step instanceof Error) throw step;
    return step;
  };
  return { submit, calls };
};

const okOutcome = (overrides = {}) => ({
  status: 'ok', httpStatus: 200, code: null, message: '', body: { balance_after: 1234.5 }, replayed: false, ...overrides,
});

const definiteRefusal = (code = 'INSUFFICIENT_FUNDS', message = 'Insufficient balance') => Object.assign(new Error(message), {
  name: 'ManagerTransactionError', code, httpStatus: 400, definite: true, unrecognized: false,
});

const unknownOutcome = (overrides = {}) => Object.assign(new Error('The server did not confirm the result (HTTP 200). The outcome is unknown.'), {
  name: 'ManagerTransactionError', code: null, httpStatus: 200, definite: false, unrecognized: false, ...overrides,
});

const networkFailure = () => Object.assign(new Error('Failed to fetch'), { definite: false, unrecognized: false, httpStatus: null, code: null });

test('canUseSkipMargin and canShowSkipMargin: explicit grant required, shown only on balance withdraw', () => {
  const key = PERMISSIONS.MANAGE_FINANCES_SKIP_MARGIN;
  assert.equal(canUseSkipMargin({ resolved: true, permissions: [key] }), true);
  assert.equal(canUseSkipMargin({ resolved: false, permissions: [key] }), false, 'not while loading');
  assert.equal(canUseSkipMargin({ resolved: true, permissions: ['*'] }), false, 'the admin wildcard is not an explicit grant');
  assert.equal(canUseSkipMargin({ resolved: true, permissions: [PERMISSIONS.MANAGE_FINANCES] }), false);
  assert.equal(canUseSkipMargin({ resolved: true, permissions: undefined }), false);

  assert.equal(canShowSkipMargin({ resolved: true, permissions: [key], type: 'balance', direction: 'out' }), true);
  assert.equal(canShowSkipMargin({ resolved: true, permissions: [key], type: 'balance', direction: null }), false, 'withdraw only: no direction is not a withdrawal');
  assert.equal(canShowSkipMargin({ resolved: true, permissions: [key], type: 'balance', direction: 'in' }), false, 'hidden on deposit');
  assert.equal(canShowSkipMargin({ resolved: true, permissions: [key], type: 'credit', direction: 'out' }), false, 'hidden on credit');
  assert.equal(canShowSkipMargin({ resolved: true, permissions: [key], type: 'transfer', direction: null }), false, 'hidden on transfer');
});

test('close and reopen: the unresolved notice is derived from the store, and the retry reuses the same key', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const started = await startDeposit(store);
  const first = scriptedSubmit(unknownOutcome());
  await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: first.submit,
  });

  const reopened = makeStore(storage, clock);
  const view = deriveBalanceFinanceView({ store: reopened, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.blocked, true);
  assert.equal(view.notice.title, UNRESOLVED_OPERATION_TITLE);
  assert.equal(view.notice.manager, 'mgr-a');
  assert.equal(view.notice.canRetry, true);
  assert.equal(view.notice.lead, 'Deposit for account #710001');

  const retry = scriptedSubmit(okOutcome());
  const outcome = await retryBalanceOperation({
    store: reopened, scope: SCOPE, loginKey: LOGIN, idempotencyKey: view.notice.idempotencyKey,
    submit: retry.submit, canManageFinances: true,
  });
  assert.equal(outcome.kind, 'success');
  assert.equal(retry.calls[0].payload.idempotency_key, first.calls[0].payload.idempotency_key, 'the retry re-sends the same key');
  assert.deepEqual(retry.calls[0].payload, first.calls[0].payload, 'and the same body');
});

test('barrier: an unknown outcome blocks new money operations for the account, and a same-key definite result unblocks it', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const started = await startDeposit(store);
  await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: scriptedSubmit(networkFailure()).submit,
  });

  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(submitBlockReason({ canManageFinances: true, view }), 'blocked');
  const refusedNew = await startDeposit(store, { payload: depositPayload({ amount: '5.00' }) });
  assert.equal(refusedNew.ok, false);
  assert.equal(refusedNew.reason, 'blocked');

  const retry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key,
    submit: scriptedSubmit(okOutcome()).submit, canManageFinances: true,
  });
  assert.equal(retry.kind, 'success');
  const after = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(after.blocked, false);
  assert.equal(after.notice, null);
  assert.equal(submitBlockReason({ canManageFinances: true, view: after }), null);
});

test('barrier: a retry that reaches a definite refusal also unblocks the account', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const started = await startDeposit(store);
  await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: scriptedSubmit(unknownOutcome()).submit,
  });
  const retry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key,
    submit: scriptedSubmit(definiteRefusal()).submit, canManageFinances: true,
  });
  assert.equal(retry.kind, 'refused');
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).blocked, false);
});

test('barrier: the manager confirmation unblocks, is kept with its timestamp and unique idempotencyKey, and a new operation gets a new key', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const started = await startDeposit(store);
  await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: scriptedSubmit(unknownOutcome()).submit,
  });

  const refused = await ackNew({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: false, at: clock.now() });
  assert.deepEqual(refused, { ok: false, reason: 'permission' });

  clock.advance(10_000);
  const confirmedAt = clock.now();
  const confirmed = await ackNew({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true, at: confirmedAt });
  assert.equal(confirmed.ok, true);
  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.blocked, false);
  assert.equal(view.notice, null);
  assert.equal(view.confirmations.length, 1);
  assert.equal(view.confirmations[0].at, confirmedAt);
  assert.equal(view.confirmations[0].idempotencyKey, started.record.payload.idempotency_key);

  const again = await startDeposit(store);
  assert.equal(again.ok, true);
  assert.notEqual(again.record.payload.idempotency_key, started.record.payload.idempotency_key);

  assert.deepEqual(await ackNew({ store, scope: SCOPE, loginKey: OTHER_LOGIN, canManageFinances: true, at: confirmedAt }), { ok: false, reason: 'none' });
});

test('a form edit cannot clear the notice or bypass the barrier: the view has no form input, and the block holds', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const started = await startDeposit(store);
  await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: scriptedSubmit(unknownOutcome()).submit,
  });
  const before = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  const edits = [{ amount: '1.00' }, { comment: 'changed' }, { amount: '999.00' }];
  for (const _edit of edits) {
    const after = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
    assert.deepEqual(after, before);
    assert.equal(submitBlockReason({ canManageFinances: true, view: after }), 'blocked');
  }
  const changed = await startDeposit(store, { payload: depositPayload({ amount: '999.00', comment: 'changed' }) });
  assert.equal(changed.ok, false, 'a changed operation is still refused');
  assert.equal(changed.reason, 'blocked');
  assert.equal(typeof SUBMIT_BLOCKED_TEXT, 'string');
});

test('retry checks canManageFinances: without the permission nothing is sent', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const started = await startDeposit(store);
  await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: scriptedSubmit(unknownOutcome()).submit,
  });
  const sender = scriptedSubmit(okOutcome());
  const outcome = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key,
    submit: sender.submit, canManageFinances: false,
  });
  assert.deepEqual(outcome, { kind: 'skipped', reason: 'permission', loginKey: LOGIN });
  assert.equal(sender.calls.length, 0);
});

test('a second popup cannot re-send the key while the first request is in flight', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const started = await startDeposit(store);
  let release;
  const firstCalls = [];
  const slow = async (endpointKey, payload) => {
    firstCalls.push(payload);
    await new Promise((resolve) => { release = resolve; });
    return { status: 'pending', httpStatus: 202, code: null, message: '', body: null, replayed: false, reversal: null };
  };
  const inFlight = runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: slow,
  });
  assert.equal(store.isLoginRunning({ scope: SCOPE, loginKey: LOGIN }), true);

  const second = scriptedSubmit(okOutcome());
  const blockedRetry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key,
    submit: second.submit, canManageFinances: true,
  });
  assert.deepEqual(blockedRetry, { kind: 'busy', loginKey: LOGIN }, 'the account lock is busy, so nothing is sent');
  assert.equal(second.calls.length, 0);
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).running, true);
  release();
  await inFlight;
  assert.equal(firstCalls.length, 1);
});

test('H1 expiry (no silent drop): after 23 hours, the record becomes "Status unknown: retry with the same key (recommended) or check history", keeps blocking until settled, and a same-key retry sends the same key and body (R8 a)', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const started = await startDeposit(store, { createKey: () => 'key-h1-exp' });
  assert.equal(started.ok, true);
  const first = scriptedSubmit(unknownOutcome());
  await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'key-h1-exp', submit: first.submit,
  });

  // Advance to effective expiry (23 h).
  clock.advance(PENDING_FINANCE_ATTEMPT_TTL_MS);
  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.blocked, true, 'expired record must keep blocking');
  assert.ok(view.notice, 'notice remains visible');
  assert.equal(view.notice.expired, true);
  assert.equal(view.notice.text, STATUS_UNKNOWN_CHECK_HISTORY_TEXT);
  // C4: the observed expiry is saved first (the Balance tab does this on every store change); then the same-key retry is on.
  assert.equal(view.expiryUnsaved, true, 'the observed expiry is not saved yet, so the retry is off until it is');
  assert.equal(view.notice.canRetry, false);
  assert.equal((await persistObservedExpiry({ store, scope: SCOPE, loginKey: LOGIN })).saved, true);
  const saved = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(saved.notice.canRetry, true, 'R8 (a): once saved, an expired record is retried with its same key');
  assert.equal(saved.notice.canConfirm, true, 'manager can still explicitly acknowledge');
  assert.equal((await startDeposit(store)).ok, false, 'new operations remain blocked');

  const retryAttempt = scriptedSubmit(okOutcome());
  const sameKeyRetry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'key-h1-exp', submit: retryAttempt.submit, canManageFinances: true,
  });
  assert.equal(sameKeyRetry.kind, 'success', 'R8 (a): the same-key retry after expiry is sent and settles');
  assert.equal(retryAttempt.calls.length, 1, 'exactly one send');
  assert.equal(retryAttempt.calls[0].payload.idempotency_key, 'key-h1-exp', 'the same key');
  assert.deepEqual(retryAttempt.calls[0].payload, first.calls[0].payload, 'and the same stored body');
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).blocked, false, 'the definite result lifts the barrier');

  // Probe P3: record expires while its unknown-outcome request is in flight.
  const storageInFlight = createFakeStorage();
  const clockInFlight = createClock();
  const storeInFlight = makeStore(storageInFlight, clockInFlight);
  await startDeposit(storeInFlight, { createKey: () => 'key-h1-inflight' });
  const inFlightOut = await runBalanceOperation({
    store: storeInFlight,
    scope: SCOPE,
    loginKey: LOGIN,
    idempotencyKey: 'key-h1-inflight',
    submit: async () => {
      clockInFlight.advance(24 * 60 * 60 * 1000);
      throw unknownOutcome({ httpStatus: 504 });
    },
  });
  assert.equal(inFlightOut.kind, 'unconfirmed');
  assert.equal(inFlightOut.feedback.text, STATUS_UNKNOWN_CHECK_HISTORY_TEXT);
  const afterInFlightView = deriveBalanceFinanceView({
    store: storeInFlight, scope: SCOPE, loginKey: LOGIN, canManageFinances: true,
  });
  assert.equal(afterInFlightView.blocked, true);
  assert.equal(afterInFlightView.notice.text, STATUS_UNKNOWN_CHECK_HISTORY_TEXT);
});

test('H2/M1 exact idempotency codes end-to-end through submitManagerTransaction + runBalanceOperation / retryBalanceOperation', async () => {
  const sessionStorage = createFakeStorage();
  const localStorage = createFakeStorage();
  sessionStorage.setItem('auth', JSON.stringify({ token: 'test-token' }));
  localStorage.setItem('authToken', 'test-token');
  globalThis.window = {
    sessionStorage,
    localStorage,
    location: { origin: 'http://localhost:5173' },
    dispatchEvent: () => {},
  };

  try {
    const reply = (status, body, headers = {}) => {
      globalThis.fetch = async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
    };

    // 1. Done codes: KEY_ALREADY_APPLIED, IDEMPOTENCY_KEY_ALREADY_APPLIED, and 200 cached replay
    for (const code of ['IDEMPOTENCY_KEY_ALREADY_APPLIED', 'KEY_ALREADY_APPLIED']) {
      const st = createFakeStorage();
      const clk = createClock();
      const store = makeStore(st, clk);
      const started = await startDeposit(store, { createKey: () => `done-${code}` });
      reply(409, { success: false, code, message: 'Already applied', balance_after: '900.00' });
      const out = await runBalanceOperation({
        store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: submitManagerTransaction,
      });
      assert.equal(out.kind, 'success', code);
      assert.equal(out.replayed, true, code);
      assert.equal(out.successText, 'Already done — balance refreshed', code);
      assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), false, `${code} clears the record`);
    }

    {
      const st = createFakeStorage();
      const clk = createClock();
      const store = makeStore(st, clk);
      const started = await startDeposit(store, { createKey: () => 'done-cached-200' });
      reply(200, { success: true, balance_after: 90 }, { 'x-idempotency-status': 'cached' });
      const out = await runBalanceOperation({
        store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: submitManagerTransaction,
      });
      assert.equal(out.kind, 'success');
      assert.equal(out.replayed, true);
      assert.equal(out.successText, 'Already done — balance refreshed');
      assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), false);
    }

    // 2. Keep key, stay pending codes: IN_FLIGHT, OUTCOME_UNKNOWN, STORE_UNAVAILABLE, UNAVAILABLE, UNVERIFIED
    const pendingCases = [
      ['IDEMPOTENCY_IN_FLIGHT', 409, IN_FLIGHT_PENDING_TEXT],
      ['IN_FLIGHT', 409, IN_FLIGHT_PENDING_TEXT],
      ['IN_PROGRESS', 409, IN_FLIGHT_PENDING_TEXT],
      ['IDEMPOTENCY_OUTCOME_UNKNOWN', 502, OUTCOME_UNKNOWN_PENDING_TEXT],
      ['OUTCOME_UNKNOWN', 502, OUTCOME_UNKNOWN_PENDING_TEXT],
      ['IDEMPOTENCY_STORE_UNAVAILABLE', 503, STORE_UNAVAILABLE_PENDING_TEXT],
      ['STORE_UNAVAILABLE', 503, STORE_UNAVAILABLE_PENDING_TEXT],
      ['IDEMPOTENCY_UNAVAILABLE', 503, STORE_UNAVAILABLE_PENDING_TEXT],
      ['UNAVAILABLE', 503, STORE_UNAVAILABLE_PENDING_TEXT],
      ['IDEMPOTENCY_UNVERIFIED', 503, UNVERIFIED_PENDING_TEXT],
      ['UNVERIFIED', 503, UNVERIFIED_PENDING_TEXT],
    ];
    for (const [code, status, expectedText] of pendingCases) {
      const st = createFakeStorage();
      const clk = createClock();
      const store = makeStore(st, clk);
      const key = `pend-${code}`;
      await startDeposit(store, { createKey: () => key });
      reply(status, { success: false, code, error: 'pending state' });
      const out = await runBalanceOperation({
        store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: submitManagerTransaction,
      });
      assert.equal(out.kind, 'unconfirmed', code);
      assert.equal(out.feedback.text, expectedText, code);
      assert.notEqual(out.feedback.text, 'Unrecognised status', code);
      assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), true, `${code} keeps barrier`);
      assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: key })?.payload.idempotency_key, key);
    }

    // Test IN_FLIGHT retry backoff with same key
    {
      const st = createFakeStorage();
      const clk = createClock();
      const store = makeStore(st, clk);
      await startDeposit(store, { createKey: () => 'key-inflight-backoff' });
      reply(409, { success: false, code: 'IDEMPOTENCY_IN_FLIGHT', error: 'still running' });
      await runBalanceOperation({
        store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'key-inflight-backoff', submit: submitManagerTransaction,
      });
      let waitedMs = 0;
      reply(200, { success: true, status: 'COMPLETED', balance_after: '500.00' });
      const retried = await retryBalanceOperation({
        store,
        scope: SCOPE,
        loginKey: LOGIN,
        idempotencyKey: 'key-inflight-backoff',
        submit: submitManagerTransaction,
        canManageFinances: true,
        inFlightBackoffMs: 400,
        wait: async (ms) => { waitedMs = ms; },
      });
      assert.equal(waitedMs, 400, 'IN_FLIGHT retry waits the configured backoff before sending');
      assert.equal(retried.kind, 'success');
      assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), false);
    }

    // 3. Definite refusal codes: KEY_INVALID (rejected before any reservation). The key-conflict and key-required
    // codes are key-hold now (step 4), never definite.
    const definiteCodes = [
      ['INSUFFICIENT_FUNDS', 400],
      ['INVALID_INPUT', 400],
      ['IDEMPOTENCY_KEY_INVALID', 400],
      ['KEY_INVALID', 400],
    ];
    for (const [code, status] of definiteCodes) {
      const st = createFakeStorage();
      const clk = createClock();
      const store = makeStore(st, clk);
      const key = `refuse-${code}`;
      await startDeposit(store, { createKey: () => key });
      reply(status, { success: false, code, error: `Refused with ${code}` });
      const out = await runBalanceOperation({
        store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: submitManagerTransaction,
      });
      assert.equal(out.kind, 'refused', code);
      assert.equal(out.feedback.code, code, `${code} shown on feedback`);
      assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: key }), null, `${code} clears THIS request record`);
      assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), false, code);
    }

    // 4. M1 key-hold codes: KEY_REUSED / MISMATCH KEEP the record and the barrier. No same-key retry, no new key,
    // and a new operation is refused without a send, until an explicit acknowledgement.
    for (const [code, status] of [
      ['IDEMPOTENCY_KEY_REUSED', 422], ['KEY_REUSED', 422], ['IDEMPOTENCY_MISMATCH', 409], ['MISMATCH', 409],
      ['IDEMPOTENCY_KEY_REQUIRED', 400], ['KEY_REQUIRED', 400],
      ['IDEMPOTENCY_KEY_CONFLICT', 409], ['KEY_CONFLICT', 409], ['IDEMPOTENCY_CONFLICT', 409],
    ]) {
      const st = createFakeStorage();
      const clk = createClock();
      const store = makeStore(st, clk);
      const key = `hold-${code}`;
      await startDeposit(store, { createKey: () => key });
      reply(status, { success: false, code, error: `Held with ${code}` });
      const out = await runBalanceOperation({
        store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: submitManagerTransaction,
      });
      assert.equal(out.kind, 'unconfirmed', code);
      assert.equal(out.feedback.code, code, `${code} shown on feedback`);
      const specificText = /REUSED|MISMATCH/.test(code) ? KEY_HOLD_TEXT : (/CONFLICT/.test(code) ? KEY_CONFLICT_PENDING_TEXT : KEY_REJECTED_PENDING_TEXT);
      assert.equal(out.feedback.text, specificText, `${code} shows the specific text`);
      assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: key })?.payload.idempotency_key, key, `${code} keeps THIS record`);
      assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), true, `${code} keeps the barrier`);
      const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
      assert.equal(view.blocked, true, code);
      assert.equal(view.notice.canRetry, false, `${code}: no same-key retry offered`);
      const retry = await retryBalanceOperation({
        store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: submitManagerTransaction, canManageFinances: true,
      });
      assert.equal(retry.kind, 'skipped', code);
      assert.equal(retry.reason, 'key-held', code);
      let sent = 0;
      globalThis.fetch = async () => { sent += 1; return new Response(JSON.stringify({ success: true }), { status: 200 }); };
      const fresh = await withdrawOp(ctlMain, store, `fresh-${code}`, async () => { sent += 1; return okOutcome(); });
      assert.equal(fresh.kind, 'skipped', `${code}: a new operation is refused while the record is held`);
      assert.equal(fresh.reason, 'blocked', code);
      assert.equal(sent, 0, `${code}: no send for the new operation`);
      // Only the explicit acknowledgement unblocks the account.
      const ack = await ackNew({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
      assert.equal(ack.ok, true, code);
      assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), false, code);
      assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedBy, 'mgr-a', `${code}: the acknowledgement is logged`);
    }
  } finally {
    delete globalThis.fetch;
    delete globalThis.window;
  }
});

test('LOW-b: a pre-send TypeError clears the record and does not block the account', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const started = await startDeposit(store, { createKey: () => 'key-presend-typeerror' });
  const out = await runBalanceOperation({
    store,
    scope: SCOPE,
    loginKey: LOGIN,
    idempotencyKey: started.record.payload.idempotency_key,
    submit: () => submitManagerTransaction('deposit', { login: LOGIN, amount: 100 }),
  });
  assert.equal(out.kind, 'refused');
  assert.equal(out.preSend, true);
  assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), false, 'pre-send TypeError must not leave the account blocked');
});

test('M5 & LOW-d/e: modal glue helpers (prepareBalanceSubmission, resolveBalanceOutcomeView, describeAcknowledgeOutcome)', () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const cleanView = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });

  // 1. Valid withdraw with skip margin check
  const prepared = prepareBalanceSubmission({
    transactionType: 'balance',
    direction: 'out',
    canManageFinances: true,
    canSkipMargin: true,
    skipMarginChecked: true,
    skipMarginReason: 'Approved emergency margin override',
    depositAmount: '250.5',
    loginId: LOGIN,
    depositComment: 'Override payout',
    currencyValue: 'USD',
    financeView: cleanView,
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.request.endpointKey, 'withdraw');
  assert.equal(prepared.request.payload.amount, '250.50');
  assert.equal(prepared.request.payload.skip_margin_check, true);
  assert.equal(prepared.confirmationPrompt, 'Withdraw 250.50 USD from account #710001?');

  // 2. Skip margin check is ignored on deposit (direction === 'in') even if skipMarginChecked was true
  const preparedDeposit = prepareBalanceSubmission({
    transactionType: 'balance',
    direction: 'in',
    canManageFinances: true,
    canSkipMargin: true,
    skipMarginChecked: true,
    skipMarginReason: 'short',
    depositAmount: '100',
    loginId: LOGIN,
    currencyValue: 'USD',
    financeView: cleanView,
  });
  assert.equal(preparedDeposit.ok, true);
  assert.equal(preparedDeposit.skipForAttempt, false);
  assert.equal('skip_margin_check' in preparedDeposit.request.payload, false);

  // 3. Invalid skip reason on withdraw keeps form (resetForm: false)
  const badSkip = prepareBalanceSubmission({
    transactionType: 'balance',
    direction: 'out',
    canManageFinances: true,
    canSkipMargin: true,
    skipMarginChecked: true,
    skipMarginReason: 'too short',
    depositAmount: '100',
    loginId: LOGIN,
    currencyValue: 'USD',
    financeView: cleanView,
  });
  assert.equal(badSkip.ok, false);
  assert.equal(badSkip.resetForm, false);
  assert.equal(badSkip.openDialog, true);

  // 4. resolveBalanceOutcomeView routes outcomes and provides visible feedback for skipped, gone, and busy (LOW-e)
  assert.deepEqual(
    resolveBalanceOutcomeView({ kind: 'success', loginKey: LOGIN }, { activeLoginKey: OTHER_LOGIN, sentForLogin: LOGIN }),
    { apply: false },
  );

  const successRoute = resolveBalanceOutcomeView({
    kind: 'success',
    replayed: false,
    loginKey: LOGIN,
    successText: 'Deposited 100.00 USD into account #710001 successfully. Balance after: 1,234.50.',
    successParts: {
      mainText: 'Deposited 100.00 USD into account #710001 successfully.',
      balanceAfterLabel: BALANCE_AFTER_LABEL,
      balanceAfterValue: '1,234.50',
      serverMessage: '',
    },
  }, { activeLoginKey: LOGIN, sentForLogin: LOGIN });
  assert.equal(successRoute.apply, true);
  assert.equal(successRoute.refreshAccount, true);
  assert.equal(successRoute.depositSuccess.balanceAfterLabel, 'Balance after');
  assert.equal(successRoute.depositSuccess.balanceAfterValue, '1,234.50');

  assert.equal(
    resolveBalanceOutcomeView({ kind: 'busy', loginKey: LOGIN }, { activeLoginKey: LOGIN }).depositError.text,
    RUNNING_OPERATION_TEXT,
  );
  assert.equal(
    resolveBalanceOutcomeView({ kind: 'gone', loginKey: LOGIN }, { activeLoginKey: LOGIN }).depositError.text,
    OPERATION_GONE_TEXT,
  );
  assert.equal(
    resolveBalanceOutcomeView({ kind: 'skipped', reason: 'permission', loginKey: LOGIN }, { activeLoginKey: LOGIN }).depositError.text,
    PERMISSION_DENIED_TEXT,
  );
  assert.equal(
    resolveBalanceOutcomeView({ kind: 'skipped', reason: 'expired', loginKey: LOGIN }, { activeLoginKey: LOGIN }).depositError.text,
    STATUS_UNKNOWN_CHECK_HISTORY_TEXT,
  );
  assert.equal(
    resolveBalanceOutcomeView({ kind: 'skipped', reason: 'storage-unavailable', loginKey: LOGIN }, { activeLoginKey: LOGIN }).depositError.text,
    DUPLICATE_PROTECTION_OFF_TEXT,
  );

  assert.equal(describeAcknowledgeOutcome({ ok: true }), null);
  assert.equal(describeAcknowledgeOutcome({ ok: false, reason: 'running' }).text, RUNNING_OPERATION_TEXT);
  assert.equal(describeAcknowledgeOutcome({ ok: false, reason: 'permission' }).text, PERMISSION_DENIED_TEXT);
});

test('login switch mid-flight: the result is bound to its login, and login B shows no notice from login A', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const started = await startDeposit(store);
  let release;
  const slow = async () => {
    await new Promise((resolve) => { release = resolve; });
    throw unknownOutcome({ httpStatus: 503, code: null });
  };
  const inFlight = runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: slow,
  });

  const viewB = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: OTHER_LOGIN, canManageFinances: true });
  assert.equal(viewB.notice, null);
  assert.equal(viewB.running, false);
  assert.equal(viewB.blocked, false);
  assert.equal(shouldApplyOutcome({ activeLoginKey: OTHER_LOGIN, outcomeLoginKey: LOGIN }), false);

  release();
  const outcome = await inFlight;
  assert.equal(outcome.loginKey, LOGIN);
  assert.equal(shouldApplyOutcome({ activeLoginKey: OTHER_LOGIN, outcomeLoginKey: outcome.loginKey }), false, 'A result never lands in B');
  assert.equal(shouldApplyOutcome({ activeLoginKey: LOGIN, outcomeLoginKey: outcome.loginKey }), true);
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).blocked, true, 'A keeps its notice');
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: OTHER_LOGIN, canManageFinances: true }).notice, null);
});

test('an empty or HTML 200 (unknown outcome) keeps the key and blocks the account, never a success', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const started = await startDeposit(store);
  const outcome = await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: scriptedSubmit(unknownOutcome()).submit,
  });
  assert.equal(outcome.kind, 'unconfirmed');
  assert.equal(outcome.feedback.code, 'HTTP 200');
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice.code, 'HTTP 200');
});

test('a definite refusal clears the key, and the next identical operation gets a new key', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const first = await startDeposit(store);
  const outcome = await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: first.record.payload.idempotency_key, submit: scriptedSubmit(definiteRefusal()).submit,
  });
  assert.equal(outcome.kind, 'refused');
  assert.equal(outcome.feedback.code, 'INSUFFICIENT_FUNDS');
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).blocked, false);
  const second = await startDeposit(store);
  assert.notEqual(second.record.payload.idempotency_key, first.record.payload.idempotency_key);
});

test('a success is applied once, the record is removed, and a replay is shown as already done, not a fresh success', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const started = await startDeposit(store);
  const ok = await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, currency: 'USD',
    submit: scriptedSubmit(okOutcome()).submit,
  });
  assert.equal(ok.kind, 'success');
  assert.equal(ok.replayed, false);
  assert.match(ok.successText, /Balance after: 1,234\.50\./);
  assert.match(ok.successText, /100\.00 USD/);
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key }), null);

  const again = await startDeposit(store);
  const replay = await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: again.record.payload.idempotency_key,
    submit: scriptedSubmit(okOutcome({ replayed: true })).submit,
  });
  assert.equal(replay.kind, 'success');
  assert.equal(replay.replayed, true);
  assert.equal(replay.successText, MANAGER_REPLAY_TEXT);
});

test('an operation with no manager identity fails closed (blocked: true, memory-only)', () => {
  const store = makeStore(createFakeStorage(), createClock());
  const view = deriveBalanceFinanceView({ store, scope: null, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.storage, 'memory-only');
  assert.equal(view.blocked, true);
  assert.equal(view.storageNotice, DUPLICATE_PROTECTION_OFF_TEXT);
});

test('a retry of a record that has disappeared is skipped, not sent', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const sender = scriptedSubmit(okOutcome());
  const outcome = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'missing-key', submit: sender.submit, canManageFinances: true,
  });
  assert.deepEqual(outcome, { kind: 'skipped', reason: 'gone', loginKey: LOGIN });
  assert.equal(sender.calls.length, 0);
});

// ---- Round 5 tests: two module instances, one shared navigator.locks fake ----

// ==========================================================================
// Round 6 (rtx-s3 implementer). E5 sticky expiry, M3 storage read failure, L2 revert, H1 recent-completion guard, L4 locales.
// ==========================================================================

test('E5 sticky expiry (R8 a): once observed expired (23 h + 1 s) it is persisted; a clock step back to 20 h keeps status unknown, and each same-key retry sends the same key', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const t0 = clock.t;
  await withdrawOp(ctlMain, store, 'E5-K', async () => { throw transientFailure(); });
  clock.set(t0 + (23 * 3600_000) + 1000);
  const sends = [];
  const seen = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'E5-K', canManageFinances: true, wait: async () => {},
    submit: async (endpointKey, payload) => { sends.push(payload.idempotency_key); throw transientFailure(); },
  });
  assert.equal(seen.kind, 'unconfirmed', 'the expired record is retried with its same key');
  assert.equal(JSON.parse(storage.raw()).records[0].expired, true, 'the observed expiry is persisted in the locked write');
  clock.set(t0 + (20 * 3600_000));
  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.notice.expired, true, 'status stays unknown after the clock steps back');
  assert.equal(view.notice.text, STATUS_UNKNOWN_CHECK_HISTORY_TEXT);
  const back = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'E5-K', canManageFinances: true, wait: async () => {},
    submit: async (endpointKey, payload) => { sends.push(payload.idempotency_key); throw transientFailure(); },
  });
  assert.equal(back.kind, 'unconfirmed');
  assert.deepEqual(sends, ['E5-K', 'E5-K'], 'both sends use the same key, never a new one');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedAt, null, 'still blocking until settled');
});

test('E5 persist pass: persistObservedExpiry stores the expiry once, never sends, and the flag survives a clock step back', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const t0 = clock.t;
  await withdrawOp(ctlMain, store, 'E5P-K', async () => { throw transientFailure(); });
  clock.set(t0 + (23 * 3600_000) + 1000);
  const first = await persistObservedExpiry({ store, scope: SCOPE, loginKey: LOGIN });
  assert.deepEqual({ saved: first.saved, changed: first.changed }, { saved: true, changed: true });
  const second = await persistObservedExpiry({ store, scope: SCOPE, loginKey: LOGIN });
  assert.deepEqual({ saved: second.saved, changed: second.changed }, { saved: true, changed: false }, 'nothing to write the second time');
  clock.set(t0);
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'E5P-K' }).expired, true, 'sticky at a clock before createdAt');
});

test('M3 a storage read failure during a retry is storage-unavailable with the duplicate-protection text, never "no longer pending"', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  await withdrawOp(ctlMain, store, 'M3-K', async () => { throw transientFailure(); });
  const sends = [];
  storage.failGet = true;
  const preCheck = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'M3-K', canManageFinances: true, wait: async () => {},
    submit: async () => { sends.push('pre'); return okOutcome(); },
  });
  const inLock = await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'M3-K', isRetry: true, wait: async () => {},
    submit: async () => { sends.push('lock'); return okOutcome(); },
  });
  storage.failGet = false;
  assert.equal(preCheck.reason, 'storage-unavailable');
  assert.equal(inLock.kind, 'skipped');
  assert.equal(inLock.reason, 'storage-unavailable');
  assert.deepEqual(sends, [], 'zero sends');
  for (const outcome of [preCheck, inLock]) {
    const view = resolveBalanceOutcomeView(outcome, { activeLoginKey: LOGIN });
    assert.equal(view.depositError.text, DUPLICATE_PROTECTION_OFF_TEXT);
    assert.notEqual(view.depositError.text, OPERATION_GONE_TEXT);
  }
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 1, 'the record is still there and still blocking');
});

test('M3 a record that is really absent (storage readable) is still "gone"', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const out = await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'never-there', submit: async () => okOutcome(),
  });
  assert.equal(out.kind, 'gone');
  assert.equal(resolveBalanceOutcomeView(out, { activeLoginKey: LOGIN }).depositError.text, OPERATION_GONE_TEXT);
});

test('L2 a failed acknowledge whose revert cannot be verified shows a visible revert error, not a clean storage refusal', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  await withdrawOp(ctlMain, store, 'L2-K', async () => { throw transientFailure(); });
  // The first write lands as garbage (read-back fails), and every later write fails (the revert cannot be done).
  let writes = 0;
  const realSet = storage.setItem;
  storage.setItem = (key) => {
    writes += 1;
    if (writes === 1) { storage.values.set(key, '{"v":2,"records":['); return; }
    throw new Error('QuotaExceededError');
  };
  const ack = await ackNew({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  storage.setItem = realSet;
  assert.deepEqual(ack, { ok: false, reason: 'revert-failed' });
  assert.equal(describeAcknowledgeOutcome(ack).text, ACKNOWLEDGE_REVERT_FAILED_TEXT);
});

test('H1 recent completion: a definite success is recorded in the same write, guards the next operation, and is pruned after 60 s', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const sends = [];
  const done = await withdrawOp(ctlMain, store, 'H1-K1', async () => { sends.push('K1'); return okOutcome(); });
  assert.equal(done.kind, 'success');
  const entry = recentCompletionFor({ store, scope: SCOPE, loginKey: LOGIN });
  assert.ok(entry, 'the completion is recorded');
  assert.deepEqual(
    { type: entry.type, direction: entry.direction, amount: entry.amount, manager: entry.manager, at: entry.at },
    { type: 'balance', direction: 'out', amount: '10.00', manager: 'mgr-a', at: clock.t },
  );
  const blob = storage.raw();
  assert.equal(/token|password|secret|authorization/i.test(blob), false, 'the completion stores no credentials');
  const prompt = buildRecentCompletionPrompt(entry, { currency: 'USD' });
  assert.match(prompt, /^A Balance withdrawal of .+ was just completed on this account by mgr-a at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\. Start another\?$/);

  const guarded = await withdrawOp(ctlMain, store, 'H1-K2', async () => { sends.push('K2'); return okOutcome(); });
  assert.equal(guarded.kind, 'skipped');
  assert.equal(guarded.reason, 'recent-completion', 'a new operation within 60 s needs the extra confirm');
  assert.deepEqual(sends, ['K1'], 'the guarded operation sends nothing');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 0, 'and writes no record');

  const accepted = await ctlMain.executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: OUT, endpointKey: 'withdraw', payload: withdrawPayload(),
    createKey: () => 'H1-K2', canManageFinances: true, acceptRecentCompletion: true,
    acknowledgedCompletionAt: recentCompletionFor({ store, scope: SCOPE, loginKey: LOGIN }).at,
    submit: async () => { sends.push('K2'); return okOutcome(); }, wait: async () => {},
  });
  assert.equal(accepted.kind, 'success');
  assert.deepEqual(sends, ['K1', 'K2']);

  clock.advance(61_000);
  assert.equal(recentCompletionFor({ store, scope: SCOPE, loginKey: LOGIN }), null, 'pruned after 60 s');
});

test('H1 recent completion is bounded: at most 10 entries are stored', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  for (let i = 0; i < 12; i += 1) {
    const out = await ctlMain.executeBalanceOperation({
      store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: OUT, endpointKey: 'withdraw', payload: withdrawPayload(),
      createKey: () => `H1-B-${i}`, canManageFinances: true, acceptRecentCompletion: true, acknowledgedCompletionAt: clock.t,
      submit: async () => okOutcome(), wait: async () => {},
    });
    assert.equal(out.kind, 'success');
  }
  const stored = JSON.parse(storage.raw()).completions;
  assert.ok(stored.length >= 1 && stored.length <= 10, `bounded, got ${stored.length}`);
});

test('H1 a failed removal after a success records no completion, and the record keeps blocking', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  const out = await withdrawOp(ctlMain, store, 'H1-F', async () => {
    storage.failSet = true;
    return okOutcome();
  });
  storage.failSet = false;
  assert.equal(out.kind, 'unconfirmed');
  assert.equal(out.feedback.text, SUCCESS_RECORD_NOT_CLEARED_TEXT);
  assert.equal(recentCompletionFor({ store, scope: SCOPE, loginKey: LOGIN }), null, 'no completion without a persisted removal');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 1, 'still blocking');
});

// Round 6c: the H1 prompt is translated first (template key, then {type} and direction word), then all four placeholders are filled.
test('H1 prompt (6c): the template is translated first, then every placeholder is substituted (fake translate fn)', () => {
  const entry = { type: 'balance', direction: 'out', amount: '10.00', manager: 'mgr-a', at: Date.parse('2026-11-02T10:00:00Z') };
  const fake = new Map([
    [H1_PROMPT_TEMPLATE, 'XX {manager} / {time} / {amount} / {type} ?'],
    ['Balance', 'BAL'],
    ['withdrawal', 'WD'],
  ]);
  const seen = [];
  const translate = (text) => { seen.push(text); return fake.get(text) ?? text; };
  const out = buildRecentCompletionPrompt(entry, { currency: 'USD', translate });
  assert.ok(seen.includes(H1_PROMPT_TEMPLATE), 'the template key goes through the translator');
  assert.ok(seen.includes('Balance') && seen.includes('withdrawal'), 'the type label and the direction word go through the translator');
  assert.equal(/\{(type|amount|manager|time)\}/.test(out), false, `no placeholder is left: ${out}`);
  assert.ok(out.startsWith('XX mgr-a / 2026-11-02 10:00:00 UTC / 10.00'), out);
  assert.ok(out.endsWith(' / BAL WD ?'), out);
  assert.equal(fillPromptTemplate('{type} and {type} {unknown}', { type: 'X' }), 'X and X {unknown}', 'a placeholder without a value is kept, every known one is replaced');
});

test('H1 prompt (6c): a $ in a manager name stays literal (replacer function, not a replacement pattern)', () => {
  const entry = { type: 'balance', direction: 'out', amount: '10.00', manager: 'mgr$&$1$$x', at: Date.parse('2026-11-02T10:00:00Z') };
  const out = buildRecentCompletionPrompt(entry, { currency: 'USD', language: 'en' });
  assert.ok(out.includes(' by mgr$&$1$$x at '), out);
});

test('H1 prompt (6c): English is unchanged, and each of the 8 locales renders its own translated template with every placeholder filled', () => {
  const entry = { type: 'balance', direction: 'out', amount: '10.00', manager: 'mgr-a', at: Date.parse('2026-11-02T10:00:00Z') };
  const english = buildRecentCompletionPrompt(entry, { currency: 'USD', language: 'en' });
  assert.match(english, /^A Balance withdrawal of .+ was just completed on this account by mgr-a at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\. Start another\?$/);
  assert.equal(translateUiText(H1_PROMPT_TEMPLATE, 'en'), H1_PROMPT_TEMPLATE);
  for (const language of ['de', 'es', 'fr', 'hi', 'ja', 'ru', 'tr', 'zh']) {
    assert.equal(translateUiText(H1_PROMPT_TEMPLATE, language), UI_DICTIONARIES[language][H1_PROMPT_TEMPLATE], `${language}: template translated`);
    const out = buildRecentCompletionPrompt(entry, { currency: 'USD', language });
    assert.notEqual(out, english, `${language} is not English`);
    assert.equal(/\{(type|amount|manager|time)\}/.test(out), false, `${language}: no placeholder left: ${out}`);
    assert.ok(out.includes('mgr-a') && out.includes('10.00') && out.includes('2026-11-02 10:00:00 UTC'), `${language}: values present: ${out}`);
  }
});

// L4 + round 6b: every balance string added in rounds 5-6 has a non-empty translation in each of the 8 locales,
// keyed by the exact English constant the code shows, and the H1 prompt keeps its placeholders.
test('L4/6b the balance strings (unsupported type, key-hold, record-not-cleared, revert, recent completion, H1 prompt) are in all 8 locale dictionaries', async () => {
  const dictDir = path.join(REPO_POPUPS_DIR, '..', '..', 'i18n', 'uiDictionary');
  const files = ['deSupplement.js', 'esSupplement.js', 'fr.js', 'hiSupplement.js', 'jaSupplement.js', 'ruSupplement.js', 'trSupplement.js', 'zh.js'];
  const H1_PROMPT_KEY = 'A {type} of {amount} was just completed on this account by {manager} at {time}. Start another?';
  const keys = [
    UNSUPPORTED_TRANSACTION_TYPE_TEXT,
    KEY_HOLD_TEXT,
    SUCCESS_RECORD_NOT_CLEARED_TEXT,
    ACKNOWLEDGE_REVERT_FAILED_TEXT,
    RECENT_COMPLETION_REFUSED_TEXT,
    H1_PROMPT_KEY,
  ];
  for (const file of files) {
    const dict = (await import(pathToFileURL(path.join(dictDir, file)).href)).default;
    for (const key of keys) {
      assert.equal(typeof dict[key], 'string', `${file}: missing "${key}"`);
      assert.notEqual(dict[key].trim(), '', `${file}: empty "${key}"`);
    }
    for (const placeholder of ['{type}', '{amount}', '{manager}', '{time}']) {
      assert.ok(dict[H1_PROMPT_KEY].includes(placeholder), `${file}: prompt keeps ${placeholder}`);
    }
  }
});

const REPO_POPUPS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_UTILS_DIR = path.join(REPO_POPUPS_DIR, '..', '..', 'utils');
const TAB_FILES = ['financeLease.js', 'pendingFinanceAttempts.js', 'balanceTabController.js', 'accountFinanceOps.js', 'accountTransactionCopy.js'];
const tempRoots = [];
after(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
});

const ctlMain = { executeBalanceOperation, retryBalanceOperation, acknowledgeNewOperation };
const IN = 'in';
const OUT = 'out';

// Each call copies the current repo modules into its own temp tree, so the module graph is a separate instance.
const loadTabInstance = async (name) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `rtx-fin-tab-${name}-`));
  tempRoots.push(root);
  const popups = path.join(root, 'components', 'Popups');
  fs.mkdirSync(popups, { recursive: true });
  fs.mkdirSync(path.join(root, 'utils'), { recursive: true });
  for (const file of TAB_FILES) fs.copyFileSync(path.join(REPO_POPUPS_DIR, file), path.join(popups, file));
  fs.copyFileSync(path.join(REPO_UTILS_DIR, 'permissions.js'), path.join(root, 'utils', 'permissions.js'));
  // The controller imports the UI dictionaries and the translator (6c), so the tab copy carries the i18n tree.
  fs.cpSync(path.join(REPO_POPUPS_DIR, '..', '..', 'i18n'), path.join(root, 'i18n'), { recursive: true });
  // R10: the controller imports the production history reader. Each tab copy gets a stub: these tests always pass their own reader.
  fs.mkdirSync(path.join(root, 'services'), { recursive: true });
  fs.writeFileSync(path.join(root, 'services', 'managerFinanceApi.js'),
    "export const fetchManagerBalanceHistory = async () => { throw new Error('tab copy has no production reader'); };\n");
  return {
    ctl: await import(pathToFileURL(path.join(popups, 'balanceTabController.js')).href),
    pfa: await import(pathToFileURL(path.join(popups, 'pendingFinanceAttempts.js')).href),
  };
};

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const withdrawPayload = (overrides = {}) => ({ login: LOGIN, amount: '10.00', comment: 'probe', ...overrides });

const withdrawOp = (ctl, store, key, submit) => ctl.executeBalanceOperation({
  store,
  scope: SCOPE,
  loginKey: LOGIN,
  type: 'balance',
  direction: OUT,
  endpointKey: 'withdraw',
  payload: withdrawPayload(),
  createKey: () => key,
  canManageFinances: true,
  submit,
  wait: async () => {},
});

const transientFailure = () => Object.assign(new Error('bad gateway'), { httpStatus: 502, definite: false, unrecognized: false, code: null });

test('F1 / PROBE-A two tabs (two module instances, one shared navigator.locks): while tab A holds the account lock in a pending send, tab B acknowledge and tab B new withdrawal are refused and exactly one send happens', async () => {
  const tabA = await loadTabInstance('A');
  const tabB = await loadTabInstance('B');
  const storage = createFakeStorage();
  const clock = createClock();
  const locks = createFakeWebLocks();
  const A = tabA.pfa.createPendingFinanceAttemptStore({ getStorage: () => storage, getLocks: () => locks, now: clock.now, advisoryIntervalMs: 0 });
  const B = tabB.pfa.createPendingFinanceAttemptStore({ getStorage: () => storage, getLocks: () => locks, now: clock.now, advisoryIntervalMs: 0 });
  const sends = [];

  await withdrawOp(tabA.ctl, A, 'K1', async () => { sends.push('K1 502'); throw transientFailure(); });

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const retryA = tabA.ctl.retryBalanceOperation({
    store: A, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', canManageFinances: true, wait: async () => {},
    submit: async () => { sends.push('K1 retry'); await gate; return okOutcome(); },
  });
  for (let i = 0; i < 200 && !sends.includes('K1 retry'); i += 1) await settle();
  assert.deepEqual(sends, ['K1 502', 'K1 retry'], 'tab A is in its pending send');
  assert.equal(locks.held.has(`rtx-fin:broker-a:${LOGIN}`), true, 'tab A holds the account lock');

  const ackB = await tabB.ctl.acknowledgeNewOperation({ store: B, scope: SCOPE, loginKey: LOGIN, canManageFinances: true, checkedFor: { idempotencyKey: 'K1', version: 2 }, fetchHistory: EMPTY_HISTORY });
  assert.deepEqual(ackB, { ok: false, reason: 'running' }, 'tab B acknowledge is refused while A holds the lock');
  const newB = await withdrawOp(tabB.ctl, B, 'K2', async () => { sends.push('K2'); return okOutcome(); });
  assert.equal(newB.kind, 'skipped');
  assert.equal(newB.reason, 'running', 'tab B new withdrawal is refused');
  await B.refreshLockState();
  assert.equal(B.isLoginRunning({ scope: SCOPE, loginKey: LOGIN }), true, 'advisory state shows the other tab running');
  assert.deepEqual(sends, ['K1 502', 'K1 retry'], 'exactly one send while A holds the lock');

  release();
  const outA = await retryA;
  assert.equal(outA.kind, 'success');
  assert.equal(locks.held.size, 0, 'the lock is released after A settles');
  await B.refreshLockState();
  assert.equal(B.isLoginRunning({ scope: SCOPE, loginKey: LOGIN }), false, 'advisory state clears after release');
  // K1 is definitely applied now. H1: tab B's next withdrawal right after the completion is held by the soft guard.
  const guardedB = await tabB.ctl.executeBalanceOperation({
    store: B, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: OUT, endpointKey: 'withdraw', payload: withdrawPayload(),
    createKey: () => 'K3', canManageFinances: true, submit: async () => { sends.push('K3'); return okOutcome(); },
  });
  assert.equal(guardedB.kind, 'skipped');
  assert.equal(guardedB.reason, 'recent-completion', 'a new operation within 60 s of a completion needs the extra confirm');
  assert.deepEqual(sends, ['K1 502', 'K1 retry'], 'the guarded operation sends nothing');
  // After the manager confirms the extra prompt, it is a separate operation with its own key.
  const afterB = await tabB.ctl.executeBalanceOperation({
    store: B, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: OUT, endpointKey: 'withdraw', payload: withdrawPayload(),
    createKey: () => 'K3', canManageFinances: true, acceptRecentCompletion: true,
    acknowledgedCompletionAt: recentCompletionFor({ store: B, scope: SCOPE, loginKey: LOGIN }).at,
    submit: async () => { sends.push('K3'); return okOutcome(); },
  });
  assert.equal(afterB.kind, 'success');
  assert.deepEqual(sends, ['K1 502', 'K1 retry', 'K3']);
});

test('F2 no navigator.locks: no send happens, the account is blocked, and the browser message shows', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock, { getLocks: () => null });
  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.browserSupported, false);
  assert.equal(view.blocked, true);
  assert.equal(view.storageNotice, BROWSER_UNSUPPORTED_TEXT);
  assert.equal(submitBlockReason({ canManageFinances: true, view }), 'browser');

  const sender = scriptedSubmit(okOutcome());
  const out = await withdrawOp(ctlMain, store, 'K-nolock', sender.submit);
  assert.equal(out.kind, 'skipped');
  assert.equal(out.reason, 'browser-unsupported');
  assert.equal(sender.calls.length, 0, 'nothing is sent');
  assert.equal(storage.raw(), null, 'nothing is written');
  assert.equal(resolveBalanceOutcomeView(out, { activeLoginKey: String(LOGIN), sentForLogin: LOGIN }).depositError.text, BROWSER_UNSUPPORTED_TEXT);
  const ack = await ackNew({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.deepEqual(ack, { ok: false, reason: 'browser-unsupported' });
});

test('F3 / PROBE-D skip flag: only a Balance withdrawal carries skip_margin_check; a deposit with the flag ticked sends no flag, and the payload builder refuses the flag on deposit', () => {
  const base = {
    transactionType: 'balance',
    canManageFinances: true,
    canSkipMargin: true,
    skipMarginChecked: true,
    skipMarginReason: 'Client agreed in writing',
    depositAmount: '10.00',
    loginId: LOGIN,
    depositComment: 'deposit',
    currencyValue: 'USD',
    financeView: null,
  };
  const deposit = prepareBalanceSubmission({ ...base, direction: IN });
  assert.equal(deposit.ok, true);
  assert.equal(deposit.skipForAttempt, false);
  assert.equal(Object.hasOwn(deposit.request.payload, 'skip_margin_check'), false, 'deposit never carries the flag');

  const withdrawal = prepareBalanceSubmission({ ...base, direction: OUT, depositComment: 'deposit' });
  assert.equal(withdrawal.ok, true);
  assert.equal(withdrawal.skipForAttempt, true);
  assert.equal(withdrawal.request.payload.skip_margin_check, true, 'withdrawal carries the flag even when the comment says deposit');

  const unticked = prepareBalanceSubmission({ ...base, skipMarginChecked: false, direction: OUT });
  assert.equal(Object.hasOwn(unticked.request.payload, 'skip_margin_check'), false);

  const granted = { resolved: true, permissions: [PERMISSIONS.MANAGE_FINANCES_SKIP_MARGIN] };
  assert.equal(canShowSkipMargin({ ...granted, type: 'balance', direction: IN }), false);
  assert.equal(canShowSkipMargin({ ...granted, type: 'balance', direction: OUT }), true);

  assert.throws(() => buildManagerTransactionRequest({
    type: 'balance', direction: IN, login: LOGIN, amount: '10.00', comment: 'deposit',
    skipMarginCheck: true, skipMarginReason: 'Client agreed in writing',
  }), /only be skipped on a withdrawal/);
});

test('F4 interleaving: tab B acknowledge runs inside tab A write window (A records a new pending result for K1), is refused, and K1 survives with the new status', async () => {
  const tabA = await loadTabInstance('F4A');
  const tabB = await loadTabInstance('F4B');
  const storage = createFakeStorage();
  const clock = createClock();
  const locks = createFakeWebLocks();
  const A = tabA.pfa.createPendingFinanceAttemptStore({ getStorage: () => storage, getLocks: () => locks, now: clock.now, advisoryIntervalMs: 0 });
  const B = tabB.pfa.createPendingFinanceAttemptStore({ getStorage: () => storage, getLocks: () => locks, now: clock.now, advisoryIntervalMs: 0 });
  await withdrawOp(tabA.ctl, A, 'K1', async () => { throw transientFailure(); });

  let bResult = null;
  let armed = true;
  const realSetItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (armed && String(value).includes('"code":"IN_FLIGHT"')) {
      armed = false;
      bResult = tabB.ctl.acknowledgeNewOperation({ store: B, scope: SCOPE, loginKey: LOGIN, canManageFinances: true, checkedFor: { idempotencyKey: 'K1', version: 2 }, fetchHistory: EMPTY_HISTORY });
    }
    realSetItem(key, value);
  };
  const out = await tabA.ctl.retryBalanceOperation({
    store: A, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'K1', canManageFinances: true, wait: async () => {},
    submit: async () => ({ status: 'pending', httpStatus: 202, code: 'IN_FLIGHT', message: '', body: null, replayed: false, reversal: null }),
  });
  storage.setItem = realSetItem;
  assert.equal(armed, false, 'the hook ran inside the tab A write window');
  assert.equal(out.kind, 'unresolved');
  assert.deepEqual(await bResult, { ok: false, reason: 'running' }, 'tab B acknowledge inside the write window is refused');
  const kept = JSON.parse(storage.raw()).records;
  assert.deepEqual(kept.map((r) => r.payload.idempotency_key), ['K1']);
  assert.equal(kept[0].code, 'IN_FLIGHT', 'the new status was written');
  assert.equal(kept[0].acknowledgedAt, null, 'K1 is still unresolved');
});

test('F5 fresh checkpoint: storage that becomes unwritable after the record is saved blocks the send', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  let writes = 0;
  const realSetItem = storage.setItem;
  storage.setItem = (key, value) => {
    writes += 1;
    if (writes >= 2) throw new Error('QuotaExceededError');
    realSetItem(key, value);
  };
  const sender = scriptedSubmit(okOutcome());
  const out = await withdrawOp(ctlMain, store, 'K-cp', sender.submit);
  storage.setItem = realSetItem;
  assert.equal(out.kind, 'skipped');
  assert.equal(out.reason, 'storage-unavailable');
  assert.equal(sender.calls.length, 0, 'no send without a fresh write proof');
});

test('F5 a failed acknowledge persist shows an error and keeps the record pending', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  const started = await startDeposit(store);
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: scriptedSubmit(unknownOutcome()).submit });
  storage.failSet = true;
  const ack = await ackNew({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  storage.failSet = false;
  assert.deepEqual(ack, { ok: false, reason: 'storage-unavailable' });
  assert.equal(describeAcknowledgeOutcome(ack).text, DUPLICATE_PROTECTION_OFF_TEXT);
  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.blocked, true, 'still blocked');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedAt, null, 'still pending');
});

test('F5 a failed forget persist after a definite success never reports a clean success', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  const started = await startDeposit(store);
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: scriptedSubmit(unknownOutcome()).submit });
  const sends = [];
  const out = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, canManageFinances: true,
    submit: async () => {
      sends.push('retry');
      storage.failSet = true;
      return okOutcome();
    },
  });
  storage.failSet = false;
  assert.deepEqual(sends, ['retry']);
  assert.equal(out.kind, 'unconfirmed', 'not reported as success');
  // L1: the transfer went through; the text says so and keeps the record blocking.
  assert.equal(out.feedback.text, SUCCESS_RECORD_NOT_CLEARED_TEXT);
  assert.equal(out.reason, 'record-not-cleared');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 1, 'the record still blocks');
});

test('F5 fail closed: a corrupt account blob blocks the send and is never overwritten', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  storage.values.set(`${PENDING_FINANCE_ATTEMPTS_STORAGE_KEY}:broker-a:${LOGIN}`, '{corrupt');
  const sender = scriptedSubmit(okOutcome());
  const out = await withdrawOp(ctlMain, store, 'K-corrupt', sender.submit);
  assert.equal(out.reason, 'storage-unavailable');
  assert.equal(sender.calls.length, 0);
  assert.equal(storage.raw(), '{corrupt', 'corrupt blob is byte-identical');
});

test('O1 an unsupported operation type is a refused outcome, not a rejection, and it blocks nothing', async () => {
  const storage = createFakeStorage();
  const store = makeStore(storage, createClock());
  const sender = scriptedSubmit(okOutcome());
  const bogus = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'bogus', direction: OUT, endpointKey: 'withdraw',
    payload: withdrawPayload(), createKey: () => 'K-bogus', canManageFinances: true, submit: sender.submit,
  });
  assert.equal(bogus.kind, 'refused');
  assert.equal(bogus.preSend, true);
  assert.equal(bogus.feedback.text, 'Unsupported transaction type selected.');
  assert.equal(sender.calls.length, 0, 'nothing sent for the unsupported type');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 0, 'nothing stored, nothing blocked');
  const next = await withdrawOp(ctlMain, store, 'K-after-bogus', sender.submit);
  assert.equal(next.kind, 'success', 'the account is not blocked afterwards');
});

test('L2 retry matches by idempotency key only: a fingerprint alone finds nothing and sends nothing', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const started = await startDeposit(store);
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: started.record.payload.idempotency_key, submit: scriptedSubmit(unknownOutcome()).submit });
  const sender = scriptedSubmit(okOutcome());
  const out = await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, fingerprint: started.record.fingerprint, submit: sender.submit,
  });
  assert.deepEqual(out, { kind: 'gone', loginKey: LOGIN });
  assert.equal(sender.calls.length, 0);
});

test('D3 advisory lock state never decides safety: with the lock held and query() reporting nothing, the operation is still refused', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const locks = createFakeWebLocks();
  locks.query = async () => ({ held: [], pending: [] });
  const B = makeStore(storage, clock, { locks });
  locks.held.add(`rtx-fin:broker-a:${LOGIN}`);
  const sender = scriptedSubmit(okOutcome());
  const out = await withdrawOp(ctlMain, B, 'K-adv', sender.submit);
  assert.equal(out.reason, 'running', 'the lock refuses although the advisory view is idle');
  assert.equal(sender.calls.length, 0);
  assert.equal(B.isLoginRunning({ scope: SCOPE, loginKey: LOGIN }), false, 'advisory view says idle');
  locks.held.delete(`rtx-fin:broker-a:${LOGIN}`);
});

test('D3 advisory lock state follows navigator.locks.query() and clears on release', async () => {
  const locks = createFakeWebLocks();
  const store = makeStore(createFakeStorage(), createClock(), { locks });
  locks.held.add(`rtx-fin:broker-a:${LOGIN}`);
  await store.refreshLockState();
  assert.equal(store.isLoginRunning({ scope: SCOPE, loginKey: LOGIN }), true);
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).running, true);
  locks.held.delete(`rtx-fin:broker-a:${LOGIN}`);
  await store.refreshLockState();
  assert.equal(store.isLoginRunning({ scope: SCOPE, loginKey: LOGIN }), false);
});


// =====================================================================================
// Round 7 (C4 / b4, C5, L1, L4, key codes, G3). Fake storage, fake locks and fake clock only.
// =====================================================================================

const R7_HOUR = 3600e3;

// Makes the next `count` writes to storage throw. Returns a handle to read or reset the number left.
const failNextSets = (storage, count) => {
  const realSet = storage.setItem;
  let remaining = count;
  storage.setItem = (key, value) => {
    if (remaining > 0) {
      remaining -= 1;
      throw new Error('QuotaExceededError');
    }
    return realSet(key, value);
  };
  return {
    left: () => remaining,
    set: (value) => { remaining = value; },
  };
};

test('R7 b4 (R8 a): an observed expiry whose save fails once is saved by the bounded retry inside the lock, and a same-key retry from another tab sends the same key', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const locks = createFakeWebLocks();
  const tabA = makeStore(storage, clock, { locks });
  const tabB = makeStore(storage, clock, { locks });
  const started = await startDeposit(tabA, { createKey: () => 'R7-B4' });
  assert.equal(started.ok, true);
  clock.t += PENDING_FINANCE_ATTEMPT_TTL_MS + 1000;
  const view = deriveBalanceFinanceView({ store: tabA, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.notice.expired, true, 'observed expired in tab A');
  assert.equal(view.expiryUnsaved, true, 'the expiry is not saved yet');
  const sets = failNextSets(storage, 1);
  const persisted = await persistObservedExpiry({ store: tabA, scope: SCOPE, loginKey: LOGIN });
  assert.equal(persisted.saved, true, 'the second attempt inside the same lock saved it');
  assert.equal(sets.left(), 0, 'the first write did fail');
  assert.equal(JSON.parse(storage.raw()).records[0].expired, true, 'the flag is on disk');
  clock.t -= 3 * R7_HOUR; // the local clock now says 20 h
  const sender = scriptedSubmit(okOutcome());
  const retry = await retryBalanceOperation({
    store: tabB, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R7-B4', submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(retry.kind, 'success', 'R8 (a): the saved expiry does not block the same-key retry');
  assert.equal(sender.calls.length, 1, 'b4: one send');
  assert.equal(sender.calls[0].payload.idempotency_key, 'R7-B4', 'b4: the same key');
});

test('R7 C4: an observed expiry that cannot be saved refuses the same-key retry and every new operation in this tab, and sends nothing', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await startDeposit(store, { createKey: () => 'R7-C4' });
  clock.t += PENDING_FINANCE_ATTEMPT_TTL_MS + 1000;
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice.expired, true);
  const sets = failNextSets(storage, 100);
  clock.t -= 3 * R7_HOUR;
  const sender = scriptedSubmit(okOutcome(), okOutcome());
  const retry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R7-C4', submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(retry.kind, 'skipped');
  assert.equal(retry.reason, 'storage-unavailable', 'the unsaved expiry refuses the retry');
  const fresh = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => 'R7-C4-NEW', canManageFinances: true, submit: sender.submit, wait: async () => {},
  });
  assert.equal(fresh.kind, 'skipped');
  assert.equal(fresh.reason, 'storage-unavailable', 'a new operation is refused too');
  assert.equal(sender.calls.length, 0, 'nothing is sent');
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).storageNotice, DUPLICATE_PROTECTION_OFF_TEXT);
  sets.set(0);
  const after = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R7-C4', submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(after.kind, 'success', 'R8 (a): once the write works, the expiry is saved and the same-key retry is sent');
  assert.equal(sender.calls.length, 1);
  assert.equal(sender.calls[0].payload.idempotency_key, 'R7-C4', 'the same key');
});

test('R7 C5 (R8 a, R10 H2): a real locked write at 5 h (a same-key retry), then the clock steps back 3 h: the record is expired, a same-key retry is sent with the same key, and the expiry stays sticky', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const t0 = clock.t;
  await startDeposit(store, { createKey: () => 'R7-C5' });
  clock.t = t0 + 5 * R7_HOUR;
  // R10 (H2): the account mark moves only on a real locked write. A view refresh no longer writes it, so this is a send attempt.
  const sender = scriptedSubmit(unknownOutcome(), unknownOutcome());
  const first = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R7-C5', submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(first.kind, 'unconfirmed', 'the 5 h retry is a real locked write');
  clock.t = t0 + 2 * R7_HOUR;
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice.expired, true);
  const retry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R7-C5', submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(retry.kind, 'unconfirmed', 'R8 (a): the same-key retry is allowed after expiry');
  assert.equal(sender.calls.length, 2, 'C5: two sends, both retries of the same record');
  assert.deepEqual(sender.calls.map((call) => call.payload.idempotency_key), ['R7-C5', 'R7-C5'], 'with the same key');
  clock.t = t0 + 5 * R7_HOUR;
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].expired, true, 'the expiry is sticky after the clock recovers');
});

test('R7 C5 (R10 H2): a clock behind the mark refuses a new operation only while an unresolved record exists', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const t0 = clock.t;
  // A completed deposit at 5 h is a real locked write: the account mark is 5 h and no record is left.
  clock.t = t0 + 5 * R7_HOUR;
  const done = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => 'R10-DONE', canManageFinances: true, submit: scriptedSubmit(okOutcome()).submit, wait: async () => {},
  });
  assert.equal(done.kind, 'success');
  // The browser clock is now 3 h behind the mark, with no unresolved record: a new operation is allowed (R10 H2).
  clock.t = t0 + 2 * R7_HOUR;
  const freeSender = scriptedSubmit(okOutcome());
  const free = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => 'R10-FREE', canManageFinances: true, acceptRecentCompletion: true, acknowledgedCompletionAt: t0 + 5 * R7_HOUR, submit: freeSender.submit, wait: async () => {},
  });
  assert.equal(free.kind, 'success', 'no unresolved record: allowed despite now < mark');
  assert.equal(freeSender.calls.length, 1);
  // With an unresolved record the same clock is refused with its own reason, and nothing is sent.
  const unknown = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => 'R10-UNK', canManageFinances: true, acceptRecentCompletion: true, acknowledgedCompletionAt: t0 + 5 * R7_HOUR, submit: scriptedSubmit(unknownOutcome()).submit, wait: async () => {},
  });
  assert.equal(unknown.kind, 'unconfirmed');
  const sender = scriptedSubmit(okOutcome());
  const fresh = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => 'R7-C5-NEW', canManageFinances: true, acceptRecentCompletion: true, acknowledgedCompletionAt: t0 + 5 * R7_HOUR, submit: sender.submit, wait: async () => {},
  });
  assert.equal(fresh.kind, 'skipped');
  assert.equal(fresh.reason, 'clock-behind', 'R9/R10: the clock-behind refusal has its own reason');
  assert.equal(sender.calls.length, 0, 'nothing is sent');
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R7-C5-NEW' }), null, 'no record is written');
});

test('R7 L1: the extra confirm is checked again inside the lock; a completion newer than the one the manager saw refuses with no write and no send', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const sends = [];
  const first = await withdrawOp(ctlMain, store, 'R7-L1-K1', async () => { sends.push('K1'); return okOutcome(); });
  assert.equal(first.kind, 'success');
  const seen = recentCompletionFor({ store, scope: SCOPE, loginKey: LOGIN }).at;
  clock.t += 10_000;
  const second = await ctlMain.executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: OUT, endpointKey: 'withdraw', payload: withdrawPayload(),
    createKey: () => 'R7-L1-K2', canManageFinances: true, acceptRecentCompletion: true, acknowledgedCompletionAt: seen,
    submit: async () => { sends.push('K2'); return okOutcome(); }, wait: async () => {},
  });
  assert.equal(second.kind, 'success', 'the manager saw the first completion, so the second is accepted');
  clock.t += 5_000;
  const third = await ctlMain.executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: OUT, endpointKey: 'withdraw', payload: withdrawPayload(),
    createKey: () => 'R7-L1-K3', canManageFinances: true, acceptRecentCompletion: true, acknowledgedCompletionAt: seen,
    submit: async () => { sends.push('K3'); return okOutcome(); }, wait: async () => {},
  });
  assert.equal(third.kind, 'skipped');
  assert.equal(third.reason, 'recent-completion');
  assert.equal(third.completion.at, seen + 10_000, 'the refusal names the newer completion');
  assert.deepEqual(sends, ['K1', 'K2'], 'the refused operation is not sent');
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R7-L1-K3' }), null, 'no record is written');
});

test('R7 L4: a status write that cannot be saved after an unknown outcome is a visible error, and the record keeps blocking', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await startDeposit(store, { createKey: () => 'R7-L4' });
  const submit = async () => {
    storage.failSet = true;
    throw unknownOutcome();
  };
  const out = await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R7-L4', submit, wait: async () => {},
  });
  storage.failSet = false;
  assert.equal(out.kind, 'unconfirmed');
  assert.equal(out.feedback.text, DUPLICATE_PROTECTION_OFF_TEXT, 'a visible error, not a silent unknown');
  assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), true, 'the record keeps blocking');
});

test('R7 key-hold codes: the specific text per code, and only the explicit acknowledgement unblocks', async () => {
  const cases = [
    ['KEY_REQUIRED', 400, KEY_REJECTED_PENDING_TEXT],
    ['KEY_CONFLICT', 409, KEY_CONFLICT_PENDING_TEXT],
    ['IDEMPOTENCY_CONFLICT', 409, KEY_CONFLICT_PENDING_TEXT],
  ];
  for (const [code, status, text] of cases) {
    const storage = createFakeStorage();
    const clock = createClock();
    const store = makeStore(storage, clock);
    await startDeposit(store, { createKey: () => `R7-${code}` });
    const out = await runBalanceOperation({
      store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: `R7-${code}`, wait: async () => {},
      submit: async () => { throw Object.assign(new Error(code), { name: 'ManagerTransactionError', code, httpStatus: status, definite: false, unrecognized: false }); },
    });
    assert.equal(out.kind, 'unconfirmed', code);
    assert.equal(out.feedback.text, text, code);
    assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), true, `${code} keeps the barrier`);
    const retry = await retryBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: `R7-${code}`, submit: async () => okOutcome(), canManageFinances: true, wait: async () => {} });
    assert.equal(retry.reason, 'key-held', `${code}: no same-key retry`);
    const ack = await ackNew({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
    assert.equal(ack.ok, true, code);
    assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), false, code);
  }
});

test('R7 KEY_INVALID is definite: it clears only its own record and shows the code', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await startDeposit(store, { createKey: () => 'R7-KI' });
  const out = await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R7-KI', wait: async () => {},
    submit: async () => { throw Object.assign(new Error('bad key'), { name: 'ManagerTransactionError', code: 'KEY_INVALID', httpStatus: 400, definite: true, unrecognized: false }); },
  });
  assert.equal(out.kind, 'refused');
  assert.equal(out.feedback.code, 'KEY_INVALID');
  assert.equal(store.hasUnresolved({ scope: SCOPE, loginKey: LOGIN }), false, 'its record is cleared');
});

test('R7 G3: a new operation never reuses an idempotency key held by another operation or account in this browser', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const first = await startDeposit(store, { createKey: () => 'R7-G3' });
  assert.equal(first.ok, true);
  const other = await startDeposit(store, { loginKey: OTHER_LOGIN, createKey: () => 'R7-G3' });
  assert.equal(other.ok, false, 'the same key on another account is refused');
  assert.equal(other.reason, 'storage-unavailable');
  assert.equal(store.find({ scope: SCOPE, loginKey: OTHER_LOGIN, idempotencyKey: 'R7-G3' }), null, 'nothing is written for the other account');
  const fresh = await startDeposit(store, { loginKey: OTHER_LOGIN, createKey: () => 'R7-G3-FRESH' });
  assert.equal(fresh.ok, true, 'a new key on the other account works');
});

test('R7 the key-hold and key-rejection texts are in all 8 locale dictionaries', async () => {
  const dictDir = path.join(REPO_POPUPS_DIR, '..', '..', 'i18n', 'uiDictionary');
  const files = ['deSupplement.js', 'esSupplement.js', 'fr.js', 'hiSupplement.js', 'jaSupplement.js', 'ruSupplement.js', 'trSupplement.js', 'zh.js'];
  for (const file of files) {
    const dict = (await import(pathToFileURL(path.join(dictDir, file)).href)).default;
    for (const key of [KEY_REJECTED_PENDING_TEXT, KEY_CONFLICT_PENDING_TEXT]) {
      assert.equal(typeof dict[key], 'string', `${file}: ${key.slice(0, 40)}`);
      assert.notEqual(dict[key].trim(), '', file);
      assert.notEqual(dict[key], key, `${file} is translated`);
    }
  }
});

// ==========================================================================
// Round 8 (rtx-s3 implementer): (a) same-key retry after expiry and for unknown outcomes; (b) the acknowledge
// check against the balance history: kind mapping, exact amount match, clock tolerance, unavailable history.
// Fake logins and brokers only.
// ==========================================================================

test('R8 (a): a same-key retry of an expired record resends the stored body under the same key, and a key-hold code is still refused after expiry', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const started = await startDeposit(store, { createKey: () => 'R8-A-EXP' });
  assert.equal(started.ok, true);
  const first = scriptedSubmit(unknownOutcome());
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-A-EXP', submit: first.submit });
  clock.advance(PENDING_FINANCE_ATTEMPT_TTL_MS + 1000);
  const second = scriptedSubmit(unknownOutcome());
  const retry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-A-EXP', submit: second.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(retry.kind, 'unconfirmed');
  assert.equal(second.calls.length, 1);
  assert.deepEqual(second.calls[0].payload, first.calls[0].payload, 'the same key and the same body');

  // A key-hold code (the server holds a different request under this key) is never retried, expired or not.
  const storeHold = makeStore(createFakeStorage(), clock);
  await startDeposit(storeHold, { createKey: () => 'R8-A-HOLD' });
  await runBalanceOperation({
    store: storeHold, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-A-HOLD',
    submit: scriptedSubmit(unknownOutcome({ code: 'IDEMPOTENCY_KEY_REUSED', httpStatus: 409 })).submit,
  });
  clock.advance(PENDING_FINANCE_ATTEMPT_TTL_MS + 1000);
  const holdView = deriveBalanceFinanceView({ store: storeHold, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(holdView.notice.expired, true);
  assert.equal(holdView.notice.canRetry, false, 'key-hold: no same-key retry, expired or not');
  const holdSender = scriptedSubmit(okOutcome());
  assert.equal((await retryBalanceOperation({
    store: storeHold, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-A-HOLD', submit: holdSender.submit, canManageFinances: true,
  })).reason, 'key-held');
  assert.equal(holdSender.calls.length, 0);
});

test('R8 (a): a persistent write failure (saved=false) on an expired record: no new-key send, and no same-key send until the expiry is saved', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const t0 = clock.t;
  await withdrawOp(ctlMain, store, 'R8-P-K', async () => { throw transientFailure(); });
  clock.set(t0 + PENDING_FINANCE_ATTEMPT_TTL_MS + 1000);
  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.expiryUnsaved, true, 'precondition: observed expiry, not saved');
  assert.equal(view.notice.canRetry, false, 'an unsaved expiry refuses the same-key retry');
  const sets = failNextSets(storage, 1000);
  const sender = scriptedSubmit(okOutcome(), okOutcome(), okOutcome());
  const persisted = await persistObservedExpiry({ store, scope: SCOPE, loginKey: LOGIN });
  assert.equal(persisted.saved, false, 'every write fails: saved=false');
  const sameKey = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-P-K', submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(sameKey.kind, 'skipped');
  assert.equal(sameKey.reason, 'storage-unavailable');
  const fresh = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: OUT, endpointKey: 'withdraw', payload: withdrawPayload(),
    createKey: () => 'R8-P-NEW', canManageFinances: true, submit: sender.submit, wait: async () => {},
  });
  assert.equal(fresh.kind, 'skipped', 'no new-key operation while the expiry is unsaved');
  assert.equal(sender.calls.length, 0, 'nothing is sent with any key');
  sets.set(0);
  const after = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-P-K', submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(after.kind, 'success');
  assert.equal(sender.calls.length, 1);
  assert.equal(sender.calls[0].payload.idempotency_key, 'R8-P-K', 'the first send after recovery is the same key');
});

test('R8 (a): another tab holding the account lock refuses the same-key retry view (canRetry false), and a retry sends nothing', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const locks = createFakeWebLocks();
  const tabA = makeStore(storage, clock, { locks });
  const tabB = makeStore(storage, clock, { locks });
  await startDeposit(tabA, { createKey: () => 'R8-LOCK' });
  await runBalanceOperation({
    store: tabA, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-LOCK', submit: scriptedSubmit(unknownOutcome()).submit,
  });
  clock.advance(PENDING_FINANCE_ATTEMPT_TTL_MS + 1000);
  locks.held.add(buildFinanceLeaseKey({ brokerId: 'broker-a', loginKey: LOGIN }));
  const view = deriveBalanceFinanceView({ store: tabB, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.notice.canRetry, false, 'the lock of another tab refuses the retry');
  const sender = scriptedSubmit(okOutcome());
  const refused = await retryBalanceOperation({
    store: tabB, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-LOCK', submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(refused.kind, 'busy');
  assert.equal(sender.calls.length, 0);
});

test('R8 (b) kind mapping: every entry of the table maps to the balance-history operation_kind and direction', () => {
  const expected = {
    'balance:in': ['deposit', 'in'],
    'balance:out': ['withdrawal', 'out'],
    'credit:in': ['credit_in', 'in'],
    'credit:out': ['credit_out', 'out'],
    'transfer:none': ['transfer_out', 'out'],
    'charge:in': ['charge', 'in'],
    'charge:out': ['charge', 'out'],
    'correction:in': ['correction', 'in'],
    'correction:out': ['correction', 'out'],
    'bonus:in': ['bonus', 'in'],
    'bonus:out': ['bonus', 'out'],
    'commission:in': ['commission', 'in'],
    'commission:out': ['commission', 'out'],
    'tax:in': ['tax', 'in'],
    'tax:out': ['tax', 'out'],
    'so_compensation:in': ['so_compensation', 'in'],
    'so_credit_compensation:out': ['so_credit_compensation', 'out'],
  };
  assert.deepEqual(Object.keys(HISTORY_KIND_MAP).sort(), Object.keys(expected).sort(), 'no entry is missing or extra');
  for (const [key, [kind, direction]] of Object.entries(expected)) {
    const [type, dir] = key.split(':');
    assert.deepEqual(historyKindFor(type, dir === 'none' ? null : dir), { operation_kind: kind, direction }, key);
  }
  assert.deepEqual(historyKindFor('transfer', 'out'), { operation_kind: 'transfer_out', direction: 'out' }, 'a transfer ignores any direction');
  assert.equal(historyKindFor('balance', null), null, 'a balance with no direction is unmapped');
  assert.equal(historyKindFor('unknown', 'in'), null);
});

test('R8 (b) exact amounts: "100.00" and "100" match after normalisation; "100.01" does not; no floats', () => {
  assert.equal(normalizeDecimalText('100.00'), '100');
  assert.equal(normalizeDecimalText('100'), '100');
  assert.equal(normalizeDecimalText('100.10'), '100.1');
  assert.equal(normalizeDecimalText('000.50'), '0.5');
  assert.equal(normalizeDecimalText('0'), '0');
  assert.equal(normalizeDecimalText('0.00'), '0');
  assert.notEqual(normalizeDecimalText('100.01'), normalizeDecimalText('100'));
  for (const bad of ['', ' ', '-1', '+1', '1e3', '1,000', 'abc', '1.2.3', '.5', null, 100]) {
    assert.equal(normalizeDecimalText(bad), null, `not a decimal: ${String(bad)}`);
  }
  const createdAt = 1_700_000_000_000;
  const original = { type: 'balance', direction: 'in', amount: '100.00', createdAt };
  const row = (overrides = {}) => ({
    id: 1, time: Math.floor(createdAt / 1000) + 1, operation_kind: 'deposit', direction: 'in', amount: '100', balance_after: '100', comment: 'x', ...overrides,
  });
  assert.equal(historyRowMatchesOriginal(row({ amount: '100' }), original), true, '"100" matches "100.00"');
  assert.equal(historyRowMatchesOriginal(row({ amount: '100.00' }), original), true);
  assert.equal(historyRowMatchesOriginal(row({ amount: '100.01' }), original), false, '"100.01" does not match');
  assert.equal(historyRowMatchesOriginal(row({ amount: '99.999' }), original), false);
  assert.equal(historyRowMatchesOriginal(row({ operation_kind: 'withdrawal', direction: 'out' }), original), false, 'same amount, other kind');
  assert.equal(historyRowMatchesOriginal(row({ direction: 'out' }), original), false, 'same kind text, other direction');
});

test('R10 (H1) window boundary: a row counts when its time is at least the send time minus the 24 h backend window', () => {
  assert.equal(HISTORY_WINDOW_MS, 24 * 60 * 60 * 1000);
  const createdAt = 1_700_000_000_000;
  const original = { type: 'balance', direction: 'out', amount: '50.00', createdAt };
  const row = (time) => ({
    id: 7, time, operation_kind: 'withdrawal', direction: 'out', amount: '50', balance_after: '0', comment: '',
  });
  const floorSec = createdAt / 1000 - 86400;
  assert.equal(historyRowMatchesOriginal(row(floorSec), original), true, 'exactly send minus 24 h: match');
  assert.equal(historyRowMatchesOriginal(row(floorSec - 1), original), false, 'one second earlier: no match');
  assert.equal(historyRowMatchesOriginal(row(createdAt / 1000), original), true, 'at the send time: match');
  assert.equal(historyRowMatchesOriginal(row(createdAt / 1000 + 3600), original), true, 'later: match');
  assert.equal(historyRowMatchesOriginal(row(floorSec - 1), { ...original, createdAt: undefined }), true, 'no usable send time: a warning, never a block');
});

test('R8 (b) acknowledge check: history ok + match gives the red warning and enables the acknowledge; ok + no match gives no warning', async () => {
  const createdAt = 1_700_000_000_000;
  const original = { type: 'balance', direction: 'in', amount: '100.00', createdAt, manager: 'mgr-a' };
  const matchRow = { id: 11, time: createdAt / 1000 + 2, operation_kind: 'deposit', direction: 'in', amount: '100', balance_after: '600', comment: 'Client deposit' };
  const otherRow = { id: 10, time: createdAt / 1000 - 9000, operation_kind: 'deposit', direction: 'in', amount: '5', balance_after: '500', comment: 'older' };

  const matched = await loadAcknowledgeHistory({
    login: LOGIN, original, fetchHistory: async (login, options) => {
      assert.equal(login, LOGIN);
      assert.equal(options.limit, HISTORY_PAGE_LIMIT, 'a page of HISTORY_PAGE_LIMIT rows (R11 F2)');
      assert.equal(options.from, Math.floor(createdAt / 1000) - HISTORY_WINDOW_MS / 1000, 'from = send time floor minus the 24 h window (R10)');
      assert.equal(options.cursor, undefined, 'the first page has no cursor');
      return { items: [otherRow, matchRow] };
    },
  });
  assert.equal(matched.ok, true);
  assert.equal(matched.matched, true);
  assert.deepEqual(matched.rows.map((row) => row.id), [11, 10], 'newest first');
  const warnView = acknowledgeCheckView(matched);
  assert.equal(warnView.warning, HISTORY_MATCH_WARNING_TEXT);
  assert.equal(warnView.canAcknowledge, true, 'the acknowledge stays possible after an explicit click');
  assert.equal(warnView.confirmText, HISTORY_CONFIRM_MATCH_TEXT, 'the explicit extra step is labelled');

  const clear = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory: async () => ({ items: [otherRow] }) });
  assert.equal(clear.ok, true);
  assert.equal(clear.matched, false);
  const clearView = acknowledgeCheckView(clear);
  assert.equal(clearView.warning, null, 'no warning');
  assert.equal(clearView.canAcknowledge, true);
  assert.equal(clearView.confirmText, HISTORY_CONFIRM_TEXT);

  const empty = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory: async () => ({ items: [] }) });
  assert.equal(empty.ok, true, 'an empty history is a valid answer');
  assert.equal(empty.matched, false);
});

test('R8 (b) history unavailable (404, 501, network, bad shape): "History unavailable — cannot confirm", acknowledge disabled, same-key retry still available', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await startDeposit(store, { createKey: () => 'R8-UNAV' });
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-UNAV', submit: scriptedSubmit(unknownOutcome()).submit });
  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  const original = view.notice.original;
  assert.equal(original.type, 'balance');
  assert.equal(original.direction, 'in');
  assert.equal(original.amount, '100.00');

  const failures = {
    '404': async () => { throw Object.assign(new Error('Balance history request failed (HTTP 404)'), { httpStatus: 404 }); },
    '501': async () => { throw Object.assign(new Error('Balance history request failed (HTTP 501)'), { httpStatus: 501 }); },
    'network': async () => { throw new TypeError('Failed to fetch'); },
    'bad shape (no items)': async () => ({ login: LOGIN }),
    'bad shape (items not an array)': async () => ({ items: 'nope' }),
    'bad shape (row without comment)': async () => ({ items: [{ id: 1, time: 1, operation_kind: 'deposit', direction: 'in', amount: '100' }] }),
    'bad shape (amount not decimal)': async () => ({ items: [{ id: 1, time: 1, operation_kind: 'deposit', direction: 'in', amount: '1e3', comment: '' }] }),
    'bad shape (direction unknown)': async () => ({ items: [{ id: 1, time: 1, operation_kind: 'deposit', direction: 'sideways', amount: '100', comment: '' }] }),
    'bad shape (row is null)': async () => ({ items: [null] }),
  };
  for (const [name, fetchHistory] of Object.entries(failures)) {
    const check = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory });
    assert.equal(check.ok, false, name);
    assert.equal(check.text, HISTORY_UNAVAILABLE_TEXT, name);
    assert.equal(check.text, 'History unavailable — cannot confirm', name);
    const shown = acknowledgeCheckView(check);
    assert.equal(shown.canAcknowledge, false, `${name}: acknowledge disabled`);
    assert.equal(shown.unavailableText, HISTORY_UNAVAILABLE_TEXT, name);
    assert.equal(shown.warning, null, name);
  }
  // The same-key retry does not depend on the history check.
  const retryView = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(retryView.notice.canRetry, true, 'the same-key retry stays available');
  const sender = scriptedSubmit(okOutcome());
  const retried = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R8-UNAV', submit: sender.submit, canManageFinances: true,
  });
  assert.equal(retried.kind, 'success');
  assert.equal(sender.calls[0].payload.idempotency_key, 'R8-UNAV');
});

test('R8 (b) the history text is plain text: a hostile comment and manager name stay literal', () => {
  const hostile = { id: 3, time: 1_700_000_000, operation_kind: 'deposit', direction: 'in', amount: '1', balance_after: '1', comment: '<img src=x onerror=alert(1)> {amount} $& $1' };
  const line = describeHistoryRow(hostile, '');
  assert.ok(line.includes('<img src=x onerror=alert(1)> {amount} $& $1'), 'the comment is kept as typed');
  assert.ok(line.includes(' · Deposit · +1.00 · '), line);
  const original = describeOriginalOperation({ type: 'balance', direction: 'out', amount: '2.50', createdAt: 1_700_000_000_000, manager: '<b>mgr</b>' });
  assert.equal(original.manager, '<b>mgr</b>');
  assert.equal(original.time, '2023-11-14 22:13:20 UTC');
  assert.equal(original.amountText.includes('2.50'), true);
});

test('R8 (b) the history route: the kind comes from the table, never from the comment', () => {
  const row = { id: 4, time: 1_700_000_000, operation_kind: 'bonus', direction: 'in', amount: '5', balance_after: '5', comment: 'Withdrawal deposit' };
  const original = { type: 'balance', direction: 'out', amount: '5', createdAt: 1_700_000_000_000 };
  assert.equal(historyRowMatchesOriginal(row, original), false, 'a comment that says withdrawal does not make a withdrawal');
});

test('R8 strings: the new acknowledge-check strings and the new expiry text are in all 8 locale dictionaries', async () => {
  const dictDir = path.join(REPO_POPUPS_DIR, '..', '..', 'i18n', 'uiDictionary');
  const files = ['deSupplement.js', 'esSupplement.js', 'fr.js', 'hiSupplement.js', 'jaSupplement.js', 'ruSupplement.js', 'trSupplement.js', 'zh.js'];
  const keys = [
    HISTORY_UNAVAILABLE_TEXT,
    HISTORY_LOADING_TEXT,
    HISTORY_HEADING_TEXT,
    HISTORY_NO_MATCH_TEXT,
    HISTORY_MATCH_WARNING_TEXT,
    HISTORY_CONFIRM_MATCH_TEXT,
    HISTORY_OPEN_TEXT,
    HISTORY_PENDING_LABEL,
    STATUS_UNKNOWN_CHECK_HISTORY_TEXT,
    HISTORY_TRUNCATED_TEXT,
    RECORD_CHANGED_TEXT,
    CLOCK_BEHIND_TEXT,
  ];
  for (const file of files) {
    const dict = (await import(pathToFileURL(path.join(dictDir, file)).href)).default;
    for (const key of keys) {
      assert.equal(typeof dict[key], 'string', `${file}: missing "${key}"`);
      assert.notEqual(dict[key].trim(), '', `${file}: empty "${key}"`);
      assert.notEqual(dict[key], key, `${file}: "${key}" is translated`);
    }
    assert.equal(typeof dict['I checked the history, start a new operation'], 'string', `${file}: the confirm text is in the dictionary`);
  }
});

// ==========================================================================
// Round 9 (rtx-s3 implementer): the acknowledge is bound to ONE record (its key and the version the panel showed) and to the
// history the controller reads for that record inside the account lock. Truncated and oversized pages fail closed. The window
// tolerates 2 h of browser-clock skew. The same-key retry is never refused by the acknowledge checks.
// ==========================================================================

// A pending (unknown-outcome) record, created and left unresolved. Returns the store, its clock and its storage.
const pendingForAck = async (key) => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await startDeposit(store, { createKey: () => key });
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: scriptedSubmit(unknownOutcome()).submit });
  return { store, storage, clock };
};

// The server model of the history read (contract 6.9): rows at or after `from`, newest first, `limit`, cursor = offset.
const serverHistory = (rows) => async (login, query = {}) => {
  const visible = rows
    .filter((row) => query.from === undefined || row.time >= query.from)
    .sort((a, b) => (b.time - a.time) || (b.id - a.id));
  const limit = query.limit ?? 100;
  const offset = query.cursor ? Number(query.cursor) : 0;
  return {
    items: visible.slice(offset, offset + limit),
    nextCursor: offset + limit < visible.length ? String(offset + limit) : null,
  };
};

// Pages from a script: each call returns the next page; records each query.
const pagedHistory = (pages) => {
  const queries = [];
  let index = 0;
  return {
    queries,
    fetchHistory: async (login, query) => {
      queries.push({ ...query });
      const page = pages[Math.min(index, pages.length - 1)];
      index += 1;
      return page;
    },
  };
};

const pageRow = (id, time, extra = {}) => ({
  id, time, operation_kind: 'withdrawal', direction: 'out', amount: '20', balance_after: '70', comment: `p${id}`, ...extra,
});

// A send that the server applies and whose reply is lost (the operation is charged, the client sees an unknown outcome).
const appliedReplyLost = (state) => async (endpointKey, body) => {
  state.applied += 1;
  state.keys.push(body.idempotency_key);
  throw unknownOutcome();
};
// A send that the server never applies (the client sees an unknown outcome, no charge).
const notApplied = (state) => async (endpointKey, body) => {
  state.keys.push(body.idempotency_key);
  throw unknownOutcome();
};
// The history of the account on the server: the applied deposit (MATCH_ROW) only after a charge.
const liveHistory = (state) => async () => ({ items: state.applied > 0 ? [MATCH_ROW] : [], nextCursor: null });

test('R9 gate: no history reader, a failed read, or a bad page is refused history-unavailable, and writes nothing', async () => {
  const { store, storage, clock } = await pendingForAck('R9-NOREADER');
  const before = storage.raw();
  // The old caller-built check shape is not an input any more: without a reader the controller refuses.
  const oldShape = await acknowledgeNewOperation({
    store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true, at: clock.now(), idempotencyKey: 'R9-NOREADER', expectedVersion: 3, historyCheck: { status: 'loaded', match: false, matchConfirmed: false },
  });
  // R10: no checkedFor names the record, so the call acknowledges nothing.
  assert.deepEqual(oldShape, { ok: false, reason: 'none' });
  assert.deepEqual(await ackNew({ store, at: clock.now(), fetchHistory: null }), { ok: false, reason: 'history-unavailable' });
  const failing = [
    async () => { throw Object.assign(new Error('Balance history request failed (HTTP 404)'), { httpStatus: 404 }); },
    async () => { throw new TypeError('Failed to fetch'); },
    async () => ({ login: LOGIN }),
    async () => ({ items: [null], nextCursor: null }),
  ];
  for (const fetchHistory of failing) {
    assert.deepEqual(await ackNew({ store, at: clock.now(), fetchHistory }), { ok: false, reason: 'history-unavailable' });
  }
  assert.equal(storage.raw(), before, 'a refusal writes nothing');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedAt, null, 'the record stays pending');
  assert.equal((await ackNew({ store, at: clock.now() })).ok, true, 'with a readable history the acknowledgement goes through');
});

test('R9 gate: a page above HISTORY_PAGE_LIMIT rows fails closed (F7); exactly HISTORY_PAGE_LIMIT rows is accepted', async () => {
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt: 1_700_000_000_000 };
  const rows = (count) => Array.from({ length: count }, (_, index) => pageRow(index + 1, 1_700_000_010 - index));
  const over = await loadAcknowledgeHistory({
    login: LOGIN, original, fetchHistory: async () => ({ items: rows(HISTORY_PAGE_LIMIT + 1), nextCursor: null }),
  });
  assert.equal(over.ok, false, '101 rows on one page');
  assert.equal(over.text, HISTORY_UNAVAILABLE_TEXT);
  const exact = await loadAcknowledgeHistory({
    login: LOGIN, original, fetchHistory: async () => ({ items: rows(HISTORY_PAGE_LIMIT), nextCursor: null }),
  });
  assert.equal(exact.ok, true, '500 rows on one page (R11 F2)');
  assert.equal(HISTORY_PAGE_LIMIT, 500);
});

test('R9 gate: a match is found by the controller itself; without matchConfirmed it is refused (match-not-confirmed), and writes nothing', async () => {
  const { store, storage, clock } = await pendingForAck('R9-MATCH');
  const before = storage.raw();
  assert.deepEqual(
    await ackNew({ store, at: clock.now(), fetchHistory: MATCH_HISTORY }),
    { ok: false, reason: 'match-not-confirmed' },
  );
  assert.equal(storage.raw(), before, 'nothing is written');
  const confirmed = await ackNew({ store, at: clock.now(), fetchHistory: MATCH_HISTORY, matchConfirmed: true });
  assert.equal(confirmed.ok, true, 'the explicit confirmation goes through');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedBy, 'mgr-a', 'and is logged');
});

test('R9 gate: a key-hold record needs the same check (no bypass through the key-hold path)', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await startDeposit(store, { createKey: () => 'R9-HOLD' });
  await runBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R9-HOLD',
    submit: scriptedSubmit(unknownOutcome({ code: 'IDEMPOTENCY_KEY_REUSED', httpStatus: 409 })).submit,
  });
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice.code, 'IDEMPOTENCY_KEY_REUSED');
  assert.deepEqual(await ackNew({ store, at: clock.now(), fetchHistory: null }), { ok: false, reason: 'history-unavailable' });
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedAt, null, 'still pending');
  assert.equal((await ackNew({ store, at: clock.now() })).ok, true);
});

test('R9 gate: permission is still checked first, before the reader and the lock', async () => {
  const { store, clock } = await pendingForAck('R9-ORDER');
  assert.deepEqual(await ackNew({ store, canManageFinances: false, at: clock.now(), fetchHistory: null }), { ok: false, reason: 'permission' });
});

test('R9 P10 (one tab): check, same-key retry that is applied with its reply lost, then the confirm with the stale check: refused (record-changed), no new key', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const key = 'R9-P10';
  const state = { applied: 0, keys: [] };
  await startDeposit(store, { createKey: () => key });
  // The first send does not reach the server (no charge); the record is unknown.
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: notApplied(state) });
  // The manager opens the panel: no match, and the panel shows the record at its current version.
  const notice = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice;
  const shown = await loadAcknowledgeHistory({ login: LOGIN, original: notice.original, fetchHistory: liveHistory(state) });
  assert.equal(shown.matched, false, 'the panel shows no match before the retry');
  // Same panel: the same-key retry is applied by the server, and the reply is lost.
  const retry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: appliedReplyLost(state), canManageFinances: true, wait: async () => {},
  });
  assert.equal(retry.kind, 'unconfirmed');
  assert.equal(state.applied, 1, 'the operation was applied once');
  assert.deepEqual(state.keys, [key, key], 'both sends carry the same key');
  // The confirm with the stale check: refused, nothing is acknowledged, no new key is sent.
  const ack = await ackNew({
    store, at: clock.now(), fetchHistory: liveHistory(state), matchConfirmed: false, idempotencyKey: key, expectedVersion: notice.version,
  });
  assert.deepEqual(ack, { ok: false, reason: 'record-changed' });
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedAt, null, 'the record stays pending');
  let newKeySends = 0;
  const next = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: 'in', endpointKey: 'deposit', payload: depositPayload(),
    createKey, canManageFinances: true, submit: async () => { newKeySends += 1; return okOutcome(); }, wait: async () => {},
  });
  assert.equal(next.kind, 'skipped');
  assert.equal(next.reason, 'blocked', 'the barrier holds');
  assert.equal(newKeySends, 0, 'no second charge with a new key');
});

test('R9 P3 (two tabs): tab A holds a no-match check; tab B\'s same-key retry is applied and loses its reply; tab A\'s confirm is refused (record-changed), no new key', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const locks = createFakeWebLocks();
  const A = makeStore(storage, clock, { locks });
  const B = makeStore(storage, clock, { locks });
  const key = 'R9-P3';
  const state = { applied: 0, keys: [] };
  await startDeposit(A, { createKey: () => key });
  await runBalanceOperation({ store: A, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: notApplied(state) });
  // Tab A opens the panel: no match, at the record's current version.
  const notice = deriveBalanceFinanceView({ store: A, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice;
  const shown = await loadAcknowledgeHistory({ login: LOGIN, original: notice.original, fetchHistory: liveHistory(state) });
  assert.equal(shown.matched, false);
  // Tab B: the same-key retry is applied by the server, and the reply is lost.
  await retryBalanceOperation({
    store: B, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: appliedReplyLost(state), canManageFinances: true, wait: async () => {},
  });
  assert.equal(state.applied, 1);
  // Tab A confirms with its stale check: refused, and the record is not acknowledged.
  const ack = await ackNew({
    store: A, at: clock.now(), fetchHistory: liveHistory(state), idempotencyKey: key, expectedVersion: notice.version,
  });
  assert.deepEqual(ack, { ok: false, reason: 'record-changed' });
  assert.equal(B.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedAt, null);
  // A fresh check at the click would have shown the applied operation.
  const fresh = await loadAcknowledgeHistory({ login: LOGIN, original: notice.original, fetchHistory: liveHistory(state) });
  assert.equal(fresh.matched, true, 'a fresh check shows the match');
  let newKeySends = 0;
  const next = await executeBalanceOperation({
    store: B, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: 'in', endpointKey: 'deposit', payload: depositPayload(),
    createKey, canManageFinances: true, submit: async () => { newKeySends += 1; return okOutcome(); }, wait: async () => {},
  });
  assert.equal(next.reason, 'blocked');
  assert.equal(newKeySends, 0);
});

test('R9 stale check (tester case): a check for X never acknowledges a different record Y; Y keeps the barrier and no new key is sent', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const locks = createFakeWebLocks();
  const A = makeStore(storage, clock, { locks });
  const B = makeStore(storage, clock, { locks });
  const state = { applied: 0, keys: [] };
  await startDeposit(A, { createKey: () => 'R9-X' });
  await runBalanceOperation({ store: A, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R9-X', submit: notApplied(state) });
  const versionX = deriveBalanceFinanceView({ store: A, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice.version;
  // Tab B acknowledges X with its own check; then starts Y, which stays unknown.
  const ackB = await ackNew({ store: B, at: clock.now(), idempotencyKey: 'R9-X', expectedVersion: versionX });
  assert.equal(ackB.ok, true);
  const startedY = await startDeposit(B, { createKey: () => 'R9-Y', payload: depositPayload({ amount: '25.00' }) });
  assert.equal(startedY.ok, true, 'Y starts after X is acknowledged');
  await runBalanceOperation({ store: B, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R9-Y', submit: notApplied(state) });
  // Tab A confirms with its stale check for X: refused, nothing about Y changes.
  const staleA = await ackNew({ store: A, at: clock.now(), idempotencyKey: 'R9-X', expectedVersion: versionX });
  assert.deepEqual(staleA, { ok: false, reason: 'none' }, 'X is no longer pending, so the stale check cannot acknowledge anything');
  const yRecord = B.list({ scope: SCOPE, loginKey: LOGIN }).find((record) => record.payload.idempotency_key === 'R9-Y');
  assert.equal(yRecord.acknowledgedAt, null, 'Y stays unresolved');
  let newKeySends = 0;
  const z = await executeBalanceOperation({
    store: B, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: 'in', endpointKey: 'deposit', payload: depositPayload({ amount: '25.00' }),
    createKey, canManageFinances: true, submit: async () => { newKeySends += 1; return okOutcome(); }, wait: async () => {},
  });
  assert.equal(z.kind, 'skipped');
  assert.equal(z.reason, 'blocked', 'a new operation with a new key is refused while Y is unresolved');
  assert.equal(newKeySends, 0);
});

test('R9 several unresolved records: acknowledging one never lifts the barrier; the other needs its own checked acknowledge', async () => {
  const { store, clock } = await pendingForAck('R9-TWO-X');
  const x = store.list({ scope: SCOPE, loginKey: LOGIN })[0];
  clock.advance(1000);
  const yRecord = {
    ...x,
    payload: { ...x.payload, idempotency_key: 'R9-TWO-Y' },
    fingerprint: `${x.fingerprint}-y`,
    createdAt: clock.now(),
  };
  const saved = await store.runWithAccountLease({ scope: SCOPE, loginKey: LOGIN }, (lease) => store.remember(yRecord, lease));
  assert.equal(saved.result.saved, true, 'a second unresolved record is stored (legacy or manual state)');
  const ackX = await ackNew({ store, at: clock.now(), idempotencyKey: 'R9-TWO-X', expectedVersion: x.version });
  assert.equal(ackX.ok, true);
  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.blocked, true, 'Y still blocks the account');
  assert.equal(view.notice.idempotencyKey, 'R9-TWO-Y');
  assert.deepEqual(
    await ackNew({ store, at: clock.now(), idempotencyKey: 'R9-TWO-Y', expectedVersion: 1, fetchHistory: null }),
    { ok: false, reason: 'history-unavailable' },
    'Y needs its own check',
  );
  const ackY = await ackNew({ store, at: clock.now(), idempotencyKey: 'R9-TWO-Y', expectedVersion: 1 });
  assert.equal(ackY.ok, true);
  assert.equal(deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).blocked, false);
});

test('R9 record-changed (expiry): an observed expiry moves the version, so a check made before it is refused', async () => {
  const { store, clock } = await pendingForAck('R9-EXP');
  const before = store.list({ scope: SCOPE, loginKey: LOGIN })[0].version;
  assert.equal(before, 3, 'prepare is version 1, the proof write of the send is 2, the unknown result is 3');
  clock.advance(PENDING_FINANCE_ATTEMPT_TTL_MS + 1000);
  const saved = await persistObservedExpiry({ store, scope: SCOPE, loginKey: LOGIN });
  assert.equal(saved.saved, true);
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].version, before + 1, 'the saved expiry is a record write');
  assert.deepEqual(await ackNew({ store, at: clock.now(), expectedVersion: before }), { ok: false, reason: 'record-changed' });
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].acknowledgedAt, null);
});

test('R9 record version: starts at 1, moves by one on each content change, not on a proof write; the acknowledge is a write too', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await startDeposit(store, { createKey: () => 'R9-VER' });
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R9-VER' }).version, 1);
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R9-VER', submit: scriptedSubmit(unknownOutcome()).submit });
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].version, 3, 'the send attempt (proof write) and the unknown result are record writes');
  const proof = await store.runWithAccountLease({ scope: SCOPE, loginKey: LOGIN }, (lease) => store.checkpoint({
    scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R9-VER', lease,
  }));
  assert.equal(proof.result.ok, true);
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].version, 3, 'a proof write without a content change keeps the version');
  assert.equal((await ackNew({ store, at: clock.now(), idempotencyKey: 'R9-VER', expectedVersion: 3 })).ok, true);
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN })[0].version, 4, 'the acknowledgement moves the version');
});

test('R9 truncated (F4): a truncated history refuses the acknowledge (history-truncated), the panel says so, and the same-key retry stays', async () => {
  const { store, storage, clock } = await pendingForAck('R9-TRUNC');
  const unrelated = (page, base) => ({ items: [pageRow(base, 1_700_000_100 - page)], nextCursor: `c${page}` });
  const pages = [unrelated(1, 10), unrelated(2, 20), unrelated(3, 30), { items: [pageRow(40, 1_700_000_000)], nextCursor: null }];
  const before = storage.raw();
  const ack = await ackNew({ store, at: clock.now(), fetchHistory: pagedHistory(pages).fetchHistory });
  assert.deepEqual(ack, { ok: false, reason: 'history-truncated' });
  assert.equal(storage.raw(), before, 'nothing is written');
  const view = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  const check = await loadAcknowledgeHistory({
    login: LOGIN, original: view.notice.original, fetchHistory: pagedHistory(pages).fetchHistory,
  });
  assert.equal(check.ok, true);
  assert.equal(check.truncated, true);
  assert.equal(check.matched, false);
  const shown = acknowledgeCheckView(check);
  assert.equal(shown.canAcknowledge, false, 'the confirm is disabled');
  assert.equal(shown.unavailableText, HISTORY_TRUNCATED_TEXT);
  assert.equal(shown.warning, null);
  assert.equal(describeAcknowledgeOutcome(ack).text, HISTORY_TRUNCATED_TEXT);
  assert.equal(view.notice.canRetry, true, 'the same-key retry stays available');
});

test('R9 clock skew (F2): a browser clock 600 s or 3600 s ahead, or 600 s behind, still finds the applied charge', async () => {
  for (const skewSec of [600, 3600, -600]) {
    const storage = createFakeStorage();
    const clock = createClock();
    const store = makeStore(storage, clock);
    const serverNow = clock.now();
    clock.set(serverNow + skewSec * 1000);
    const key = `R9-SKEW-${skewSec}`;
    await startDeposit(store, { createKey: () => key });
    await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: scriptedSubmit(unknownOutcome()).submit });
    // The server applied the deposit at its own time; the history row carries the server time.
    const rows = [{ id: 5, time: Math.floor(serverNow / 1000), operation_kind: 'deposit', direction: 'in', amount: '100', balance_after: '100', comment: '' }];
    const notice = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice;
    const check = await loadAcknowledgeHistory({ login: LOGIN, original: notice.original, fetchHistory: serverHistory(rows) });
    assert.equal(check.matched, true, `skew ${skewSec} s: the applied charge is found`);
    assert.equal(acknowledgeCheckView(check).warning, HISTORY_MATCH_WARNING_TEXT, `skew ${skewSec} s: the warning is shown`);
    assert.deepEqual(
      await ackNew({ store, at: clock.now(), fetchHistory: serverHistory(rows) }),
      { ok: false, reason: 'match-not-confirmed' },
      `skew ${skewSec} s: refused without the explicit confirmation`,
    );
    assert.equal((await ackNew({ store, at: clock.now(), fetchHistory: serverHistory(rows), matchConfirmed: true })).ok, true);
  }
});

test('R9 clock-behind (R10 H2): a clock that moved backwards holds a new operation only while a record is unresolved, with its own reason', async () => {
  const { store, clock } = await pendingForAck('R9-CB');
  clock.advance(-60_000);
  let sent = 0;
  const out = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: 'in', endpointKey: 'deposit', payload: depositPayload(),
    createKey, canManageFinances: true, submit: async () => { sent += 1; return okOutcome(); }, wait: async () => {},
  });
  assert.equal(out.kind, 'skipped');
  assert.equal(out.reason, 'clock-behind');
  assert.equal(sent, 0, 'nothing is sent');
  assert.equal(resolveBalanceOutcomeView(out, { activeLoginKey: String(LOGIN), sentForLogin: LOGIN }).depositError.text, CLOCK_BEHIND_TEXT);
});

test('R9 texts: the refusals of the acknowledge have their own text; the expiry text says recommended, never safe', () => {
  assert.equal(describeAcknowledgeOutcome({ ok: false, reason: 'record-changed' }).text, RECORD_CHANGED_TEXT);
  assert.equal(describeAcknowledgeOutcome({ ok: false, reason: 'history-truncated' }).text, HISTORY_TRUNCATED_TEXT);
  assert.equal(describeAcknowledgeOutcome({ ok: false, reason: 'history-unavailable' }).text, HISTORY_UNAVAILABLE_TEXT);
  assert.equal(describeAcknowledgeOutcome({ ok: false, reason: 'match-not-confirmed' }).text, HISTORY_MATCH_WARNING_TEXT);
  assert.equal(STATUS_UNKNOWN_CHECK_HISTORY_TEXT, 'Status unknown: retry with the same key (recommended) or check history');
  assert.equal(STATUS_UNKNOWN_CHECK_HISTORY_TEXT.includes('(safe)'), false);
});

test('R10 window: the window is the 24 h backend window (a config constant); from = send time floor minus it; no send time, no from', () => {
  assert.equal(HISTORY_WINDOW_MS, 24 * 60 * 60 * 1000);
  const createdAt = 1_700_000_000_123;
  assert.equal(historyWindowStartSec({ createdAt }), 1_700_000_000 - 86400);
  assert.equal(historyWindowStartSec({ createdAt: 100_000 }), 0, 'clamped at zero');
  assert.equal(historyWindowStartSec({ createdAt: undefined }), null);
  assert.equal(HISTORY_PAGE_LIMIT, 500);
  assert.equal(HISTORY_MAX_PAGES, 2);
});

test('R9 pagination: no match and a next cursor on every page: exactly 2 pages (R11 F2), cursors passed on, rows merged newest first, truncated', async () => {
  const createdAt = 1_700_000_000_000;
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt };
  const pager = pagedHistory([
    { items: [pageRow(3, 1_700_000_010)], nextCursor: 'c1' },
    { items: [pageRow(2, 1_700_000_005)], nextCursor: 'c2' },
    { items: [pageRow(1, 1_700_000_001)], nextCursor: 'c3' },
    { items: [pageRow(0, 1_700_000_000)], nextCursor: null },
  ]);
  const check = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory: pager.fetchHistory });
  assert.equal(pager.queries.length, 2, 'the first page plus one more (HISTORY_MAX_PAGES = 2)');
  assert.equal(pager.queries[0].cursor, undefined);
  assert.equal(pager.queries[1].cursor, 'c1');
  for (const query of pager.queries) {
    assert.equal(query.limit, HISTORY_PAGE_LIMIT);
    assert.equal(query.from, 1_700_000_000 - 86400);
  }
  assert.equal(check.ok, true);
  assert.equal(check.matched, false);
  assert.equal(check.truncated, true, 'the walk ran out with a next cursor');
  assert.deepEqual(check.rows.map((row) => row.id), [3, 2], 'the rows found, newest first');
});

// R11 (F2): 600 rows in the window are covered by two pages (500 + 100) with no truncation; 1001 rows are truncated.
test('R11 F2: 600 rows in the 24 h window are covered without truncation (500 + 100), and a match on row 600 is found', async () => {
  const createdAt = 1_700_000_000_000;
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt };
  const rowsFrom = (start, count) => Array.from({ length: count }, (_, i) => pageRow(start + i, 1_700_000_000 - i));
  const pager = pagedHistory([
    { items: rowsFrom(1, 500), nextCursor: 'p2' },
    { items: rowsFrom(501, 99).concat([pageRow(600, 1_699_990_000, { amount: '10' })]), nextCursor: null },
  ]);
  const check = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory: pager.fetchHistory });
  assert.equal(pager.queries.length, 2);
  assert.equal(check.ok, true);
  assert.equal(check.truncated, false, '600 rows fit the two pages');
  assert.equal(check.matched, true, 'the matching row on page 2 is found');
  assert.equal(check.rows.length, 600);
  const noMatch = await loadAcknowledgeHistory({
    login: LOGIN,
    original,
    fetchHistory: pagedHistory([
      { items: rowsFrom(1, 500), nextCursor: 'p2' },
      { items: rowsFrom(501, 100), nextCursor: null },
    ]).fetchHistory,
  });
  assert.equal(noMatch.truncated, false, '600 rows, no match: not truncated, the acknowledge is possible');
  assert.equal(acknowledgeCheckView(noMatch).canAcknowledge, true);
});

test('R11 F2: 1001 rows in the 24 h window are truncated (the two pages end with a next cursor): the acknowledge is refused', async () => {
  const createdAt = 1_700_000_000_000;
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt };
  const rowsFrom = (start, count) => Array.from({ length: count }, (_, i) => pageRow(start + i, 1_700_000_000 - i));
  const pager = pagedHistory([
    { items: rowsFrom(1, 500), nextCursor: 'p2' },
    { items: rowsFrom(501, 500), nextCursor: 'p3' },
    { items: rowsFrom(1001, 1), nextCursor: null },
  ]);
  const check = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory: pager.fetchHistory });
  assert.equal(pager.queries.length, 2, 'a third page is never requested');
  assert.equal(check.truncated, true);
  assert.equal(acknowledgeCheckView(check).canAcknowledge, false);
  assert.equal(acknowledgeCheckView(check).unavailableText, HISTORY_TRUNCATED_TEXT);
});

test('R11 F2: a page of 501 rows fails closed (more than HISTORY_PAGE_LIMIT = 500)', async () => {
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt: 1_700_000_000_000 };
  const big = Array.from({ length: HISTORY_PAGE_LIMIT + 1 }, (_, i) => pageRow(i + 1, 1_700_000_010 - i));
  const check = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory: async () => ({ items: big, nextCursor: null }) });
  assert.equal(check.ok, false);
  assert.equal(check.text, HISTORY_UNAVAILABLE_TEXT);
});

test('R9 pagination: a match on page 2 stops the walk (2 queries) and the match is reported', async () => {
  const createdAt = 1_700_000_000_000;
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt };
  const pager = pagedHistory([
    { items: [pageRow(5, 1_700_000_100)], nextCursor: 'p2' },
    { items: [pageRow(4, 1_700_000_050, { amount: '10' })], nextCursor: 'p3' },
    { items: [pageRow(3, 1_700_000_010)], nextCursor: null },
  ]);
  const check = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory: pager.fetchHistory });
  assert.equal(pager.queries.length, 2);
  assert.equal(check.matched, true);
  assert.equal(check.truncated, false);
});

test('R9 pagination: no next cursor on the first page means one query', async () => {
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt: 1_700_000_000_000 };
  const pager = pagedHistory([{ items: [pageRow(1, 1_700_000_010)], nextCursor: null }]);
  const check = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory: pager.fetchHistory });
  assert.equal(pager.queries.length, 1);
  assert.equal(check.truncated, false);
});

test('R9 pagination: a match on the second page (the last allowed, R11 F2) is found; a third page is never requested', async () => {
  const createdAt = 1_700_000_000_000;
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt };
  const pager = pagedHistory([
    { items: [pageRow(9, 1_700_000_100)], nextCursor: 'a' },
    { items: [pageRow(8, 1_700_000_010, { amount: '10' })], nextCursor: 'b' },
    { items: [pageRow(7, 1_700_000_005)], nextCursor: null },
  ]);
  const check = await loadAcknowledgeHistory({ login: LOGIN, original, fetchHistory: pager.fetchHistory });
  assert.equal(pager.queries.length, 2, 'a third page is never requested');
  assert.equal(check.matched, true);
});

test('R9 pagination: a failing later page makes the whole check unavailable (fail closed)', async () => {
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt: 1_700_000_000_000 };
  let calls = 0;
  const check = await loadAcknowledgeHistory({
    login: LOGIN,
    original,
    fetchHistory: async () => {
      calls += 1;
      if (calls === 1) return { items: [pageRow(1, 1_700_000_010)], nextCursor: 'x' };
      throw Object.assign(new Error('Balance history request failed (HTTP 502)'), { httpStatus: 502 });
    },
  });
  assert.equal(check.ok, false);
  assert.equal(check.text, 'History unavailable — cannot confirm');
  assert.equal(acknowledgeCheckView(check).canAcknowledge, false);
});

test('R9 pagination: the loader requests at most the page budget even when the server keeps returning cursors', async () => {
  const original = { type: 'balance', direction: 'out', amount: '10.00', createdAt: 1_700_000_000_000 };
  let calls = 0;
  const check = await loadAcknowledgeHistory({
    login: LOGIN,
    original,
    fetchHistory: async () => {
      calls += 1;
      return { items: [pageRow(calls, 1_700_000_010 - calls)], nextCursor: `loop-${calls}` };
    },
  });
  assert.equal(calls, HISTORY_MAX_PAGES);
  assert.equal(check.ok, true);
  assert.equal(check.truncated, true);
});

// ---- R10: history window (H1), clock scope (H2), named early-expiry test, L1-L4, too-soon addendum, i18n. ----
// Fake storage, fake locks and fake clocks only. Each tab has its own clock; the storage and the locks are shared.
// =====================================================================================

const R10_HOUR = 3600e3;
const R10_BASE = 1_700_000_000_000;

test('R10-EARLY-EXPIRY-NO-NEW-KEY: a record created on a correct clock, evaluated in a +2 h tab, expires early; a new key is refused in both tabs and the same-key retry is allowed; only after a checked acknowledge does a new key go out', async () => {
  const storage = createFakeStorage();
  const locks = createFakeWebLocks();
  const correct = createClock();
  correct.t = R10_BASE;
  const fast = createClock();
  fast.t = R10_BASE + 2 * R10_HOUR;
  const C = makeStore(storage, correct, { locks });
  const F = makeStore(storage, fast, { locks });
  const KEY = 'R10-EE';
  // The correct-clock tab creates the record; its send is unknown, so the record stays unresolved.
  const created = await executeBalanceOperation({
    store: C, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => KEY, canManageFinances: true, submit: scriptedSubmit(unknownOutcome()).submit, wait: async () => {},
  });
  assert.equal(created.kind, 'unconfirmed');
  // Real time moves to 22 h. The fast tab reads 24 h, observes the record expired (24 h >= 23 h) and saves that by a locked write.
  correct.t = R10_BASE + 22 * R10_HOUR;
  fast.t = R10_BASE + 24 * R10_HOUR;
  assert.equal(deriveBalanceFinanceView({ store: F, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice.expired, true, 'the fast tab sees it expired early');
  assert.deepEqual(await persistObservedExpiry({ store: F, scope: SCOPE, loginKey: LOGIN }), { saved: true, changed: true }, 'the expiry is saved by a locked write (the mark moves to 24 h)');
  assert.equal(deriveBalanceFinanceView({ store: C, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice.expired, true, 'the correct tab (behind the mark) also sees status unknown');
  let newKeySends = 0;
  const newKeyOp = (store) => executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => 'R10-EE-NEW', canManageFinances: true, submit: async () => { newKeySends += 1; return okOutcome(); }, wait: async () => {},
  });
  const fastNew = await newKeyOp(F);
  assert.equal(fastNew.kind, 'skipped');
  assert.equal(fastNew.reason, 'blocked', 'fast tab: the unresolved record blocks a new key');
  const correctNew = await newKeyOp(C);
  assert.equal(correctNew.kind, 'skipped');
  assert.equal(correctNew.reason, 'clock-behind', 'correct tab: refused with its own clock-behind reason');
  assert.equal(newKeySends, 0, 'no new key is sent from either tab');
  // The same-key retry is allowed (R8 a). It is an attempt, so the record's last attempt moves to the mark.
  const sender = scriptedSubmit(unknownOutcome());
  const retry = await retryBalanceOperation({
    store: C, scope: SCOPE, loginKey: LOGIN, idempotencyKey: KEY, submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(retry.kind, 'unconfirmed', 'the same-key retry is sent');
  assert.deepEqual(sender.calls.map((call) => call.payload.idempotency_key), [KEY], 'with the same key');
  const notice = deriveBalanceFinanceView({ store: F, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice;
  const checkedFor = { idempotencyKey: KEY, version: notice.version };
  // Checked acknowledge: refused in the behind tab (clock-behind), and too soon in the fast tab right after the attempt.
  assert.deepEqual(
    await acknowledgeNewOperation({ store: C, scope: SCOPE, loginKey: LOGIN, canManageFinances: true, at: fast.t, checkedFor, fetchHistory: EMPTY_HISTORY, monotonicNow: C.monoClock.now }),
    { ok: false, reason: 'clock-behind' },
  );
  assert.deepEqual(
    await acknowledgeNewOperation({ store: F, scope: SCOPE, loginKey: LOGIN, canManageFinances: true, at: fast.t, checkedFor, fetchHistory: EMPTY_HISTORY, monotonicNow: F.monoClock.now }),
    { ok: false, reason: 'too-soon' },
  );
  assert.equal(newKeySends, 0, 'still no new key');
  // Real time passes the settle window (wall clocks and this tab's monotonic clock). The fast tab is past the mark and acknowledges with its own check.
  correct.t += HISTORY_SETTLE_MS + 1000;
  fast.t += HISTORY_SETTLE_MS + 1000;
  F.monoClock.advance(HISTORY_SETTLE_MS + 1000);
  const ack = await acknowledgeNewOperation({ store: F, scope: SCOPE, loginKey: LOGIN, canManageFinances: true, at: fast.t, checkedFor, fetchHistory: EMPTY_HISTORY, monotonicNow: F.monoClock.now });
  assert.equal(ack.ok, true, 'the checked acknowledge is accepted');
  const after = await newKeyOp(F);
  assert.equal(after.kind, 'success', 'only now does a new key go out');
  assert.equal(newKeySends, 1, 'exactly one new-key send, after the checked acknowledge');
});

test('R10 H2: a +2 h tab writes the mark by a real locked write; a correct-clock tab with no unresolved record starts a new operation, and with one it is refused clock-behind', async () => {
  const storage = createFakeStorage();
  const locks = createFakeWebLocks();
  const correct = createClock();
  correct.t = R10_BASE;
  const fast = createClock();
  fast.t = R10_BASE + 2 * R10_HOUR;
  const C = makeStore(storage, correct, { locks });
  const F = makeStore(storage, fast, { locks });
  const seen = { acceptRecentCompletion: true, acknowledgedCompletionAt: R10_BASE + 2 * R10_HOUR };
  const op = (store, key, submit) => executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => key, canManageFinances: true, submit, wait: async () => {}, ...seen,
  });
  assert.equal((await op(F, 'R10-H2-F', scriptedSubmit(okOutcome()).submit)).kind, 'success', 'the fast tab completes an operation (a real write: the mark is 2 h)');
  assert.equal((await op(C, 'R10-H2-C', scriptedSubmit(okOutcome()).submit)).kind, 'success', 'the correct tab, behind the mark, starts a new operation with no unresolved record');
  assert.equal((await op(C, 'R10-H2-U', scriptedSubmit(unknownOutcome()).submit)).kind, 'unconfirmed');
  const sender = scriptedSubmit(okOutcome());
  const refusedC = await op(C, 'R10-H2-N', sender.submit);
  assert.equal(refusedC.reason, 'clock-behind', 'with an unresolved record the behind tab is refused clock-behind');
  assert.equal(sender.calls.length, 0, 'nothing is sent');
  const refusedF = await op(F, 'R10-H2-M', scriptedSubmit(okOutcome()).submit);
  assert.equal(refusedF.reason, 'blocked', 'the fast tab (not behind) is refused blocked, not clock-behind');
  const view = deriveBalanceFinanceView({ store: C, scope: SCOPE, loginKey: LOGIN, canManageFinances: true });
  assert.equal(view.notice.idempotencyKey, 'R10-H2-U');
});

test('R10 H2: a record created while the clock is behind expires early and never later than the clock of its own tab says', async () => {
  const storage = createFakeStorage();
  const locks = createFakeWebLocks();
  const behind = createClock();
  behind.t = R10_BASE + 2 * R10_HOUR;
  const fast = createClock();
  fast.t = R10_BASE + 5 * R10_HOUR;
  const B = makeStore(storage, behind, { locks });
  const A = makeStore(storage, fast, { locks });
  const done = await executeBalanceOperation({
    store: A, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => 'R10-SWEEP-A', canManageFinances: true, submit: scriptedSubmit(okOutcome()).submit, wait: async () => {},
  });
  assert.equal(done.kind, 'success', 'the mark is 5 h');
  const created = await executeBalanceOperation({
    store: B, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
    createKey: () => 'R10-SWEEP-B', canManageFinances: true, submit: scriptedSubmit(unknownOutcome()).submit, wait: async () => {},
    acceptRecentCompletion: true, acknowledgedCompletionAt: R10_BASE + 5 * R10_HOUR,
  });
  assert.equal(created.kind, 'unconfirmed', 'created while behind the mark');
  const createdAt = R10_BASE + 2 * R10_HOUR;
  const expiredAt = (t) => {
    behind.t = t;
    return deriveBalanceFinanceView({ store: B, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice.expired === true;
  };
  assert.equal(expiredAt(createdAt), true, 'created behind the mark: expired at once (status unknown, blocking)');
  for (let t = createdAt; t <= createdAt + 28 * R10_HOUR; t += R10_HOUR) {
    const naive = t - createdAt >= PENDING_FINANCE_ATTEMPT_TTL_MS;
    if (naive) assert.equal(expiredAt(t), true, `at +${(t - createdAt) / R10_HOUR} h the store is never later than the naive clock`);
  }
});

test('R10 H1: a browser clock 2 h, 3 h or 12 h ahead of the server still finds the applied charge (24 h window)', async () => {
  for (const skewHours of [2, 3, 12]) {
    const storage = createFakeStorage();
    const clock = createClock();
    const serverNow = clock.now();
    clock.set(serverNow + skewHours * R10_HOUR);
    const store = makeStore(storage, clock);
    const key = `R10-H1-${skewHours}`;
    await startDeposit(store, { createKey: () => key });
    await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: scriptedSubmit(unknownOutcome()).submit });
    const rows = [{ id: 5, time: Math.floor(serverNow / 1000), operation_kind: 'deposit', direction: 'in', amount: '100', balance_after: '100', comment: '' }];
    const notice = deriveBalanceFinanceView({ store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice;
    const check = await loadAcknowledgeHistory({ login: LOGIN, original: notice.original, fetchHistory: serverHistory(rows) });
    assert.equal(check.matched, true, `skew ${skewHours} h: the applied charge is found`);
    assert.deepEqual(
      await ackNew({ store, at: clock.now(), fetchHistory: serverHistory(rows) }),
      { ok: false, reason: 'match-not-confirmed' },
      `skew ${skewHours} h: refused without the explicit confirmation`,
    );
    assert.equal((await ackNew({ store, at: clock.now(), fetchHistory: serverHistory(rows), matchConfirmed: true })).ok, true, `skew ${skewHours} h: confirmed`);
  }
});

test('R10 H1 (R11 F2: 2 pages): a busy account whose applied row lies beyond the 2 bounded pages is truncated: the acknowledge is refused and the same-key retry stays', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  const key = 'R10-BUSY';
  await startDeposit(store, { createKey: () => key });
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: scriptedSubmit(unknownOutcome()).submit });
  const t = Math.floor(clock.now() / 1000);
  const pager = pagedHistory([
    { items: [pageRow(31, t + 300, { amount: '7' })], nextCursor: 'p1' },
    { items: [pageRow(21, t + 200, { amount: '8' })], nextCursor: 'p2' },
    { items: [pageRow(11, t + 100, { amount: '9' })], nextCursor: 'p3' },
    { items: [{ id: 1, time: t, operation_kind: 'deposit', direction: 'in', amount: '100', balance_after: '100', comment: '' }], nextCursor: null },
  ]);
  assert.deepEqual(await ackNew({ store, at: clock.now(), fetchHistory: pager.fetchHistory }), { ok: false, reason: 'history-truncated' });
  assert.equal(pager.queries.length, 2, 'two pages at most; the applied row on page 4 is never read');
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: key }).acknowledgedAt, null, 'the record stays pending');
  const retry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: key, submit: scriptedSubmit(okOutcome()).submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(retry.kind, 'success', 'the same-key retry stays available');
});

test("R10 L1: a check names one record; X's confirmation never acknowledges Y, even when both versions are equal", async () => {
  const { store, clock } = await pendingForAck('R10-L1-X');
  const x = store.list({ scope: SCOPE, loginKey: LOGIN })[0];
  clock.advance(1000);
  const yRecord = {
    ...x, payload: { ...x.payload, idempotency_key: 'R10-L1-Y' }, fingerprint: `${x.fingerprint}-y`, createdAt: clock.now(),
  };
  // Y is stored by remember(); two content changes take it to the same version as X (a new key starts at 1).
  const writeY = async (patch) => {
    const base = store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R10-L1-Y' }) ?? yRecord;
    return (await store.runWithAccountLease({ scope: SCOPE, loginKey: LOGIN }, (lease) => store.remember({ ...base, ...patch }, lease))).result.saved;
  };
  assert.equal(await writeY({}), true, 'Y is stored');
  assert.equal(await writeY({ code: 'R10-A' }), true);
  assert.equal(await writeY({ code: 'R10-B' }), true);
  const y = store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R10-L1-Y' });
  assert.equal(y.version, x.version, 'the two versions are equal');
  clock.advance(HISTORY_SETTLE_MS + 1000);
  const checkedX = { idempotencyKey: 'R10-L1-X', version: x.version };
  await primeAck(store, checkedX);
  store.monoClock.advance(HISTORY_SETTLE_MS + 1000);
  const ackX = await acknowledgeNewOperation({
    store, scope: SCOPE, loginKey: LOGIN, canManageFinances: true, at: clock.now(),
    checkedFor: checkedX, matchConfirmed: true, fetchHistory: MATCH_HISTORY, monotonicNow: store.monoClock.now,
  });
  assert.equal(ackX.ok, true, 'X is confirmed with its own check');
  assert.equal(store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R10-L1-Y' }).acknowledgedAt, null, 'Y is not confirmed by X');
  assert.deepEqual(
    await ackNew({ store, at: clock.now(), idempotencyKey: 'R10-L1-Y', expectedVersion: y.version, fetchHistory: MATCH_HISTORY }),
    { ok: false, reason: 'match-not-confirmed' },
    'Y needs its own confirmation',
  );
  assert.equal((await ackNew({ store, at: clock.now(), idempotencyKey: 'R10-L1-Y', expectedVersion: y.version, fetchHistory: MATCH_HISTORY, matchConfirmed: true })).ok, true);
});

test('R10 L4: a hung history read times out as history-unavailable; the record stays pending; the account lock is released; the request is aborted', async () => {
  assert.equal(HISTORY_READ_TIMEOUT_MS, 10 * 1000, 'the read timeout is 10 s');
  const storage = createFakeStorage();
  const clock = createClock();
  const locks = createFakeWebLocks();
  const A = makeStore(storage, clock, { locks });
  const B = makeStore(storage, clock, { locks });
  await startDeposit(A, { createKey: () => 'R10-L4' });
  await runBalanceOperation({ store: A, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R10-L4', submit: scriptedSubmit(unknownOutcome()).submit });
  clock.advance(HISTORY_SETTLE_MS + 1000);
  const version = deriveBalanceFinanceView({ store: A, scope: SCOPE, loginKey: LOGIN, canManageFinances: true }).notice.version;
  await primeAck(A, { idempotencyKey: 'R10-L4', version });
  A.monoClock.advance(HISTORY_SETTLE_MS + 1000);
  let signal = null;
  const hanging = (login, query, control) => {
    signal = control?.signal ?? null;
    return new Promise(() => {});
  };
  const ack = await acknowledgeNewOperation({
    store: A, scope: SCOPE, loginKey: LOGIN, canManageFinances: true, at: clock.now(),
    checkedFor: { idempotencyKey: 'R10-L4', version }, fetchHistory: hanging, timeoutMs: 20, monotonicNow: A.monoClock.now,
  });
  assert.deepEqual(ack, { ok: false, reason: 'history-unavailable' });
  assert.equal(signal?.aborted, true, 'the request is aborted when the read times out');
  assert.equal(A.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R10-L4' }).acknowledgedAt, null, 'the record stays pending');
  assert.equal(locks.held.has(`rtx-fin:broker-a:${LOGIN}`), false, 'the account lock is released');
  const again = await B.runWithAccountLease({ scope: SCOPE, loginKey: LOGIN }, async () => 'free');
  assert.equal(again.acquired, true, 'another tab can take the lock at once');
  const hangingPage = await loadAcknowledgeHistory({
    login: LOGIN, original: { type: 'balance', direction: 'in', amount: '1', createdAt: clock.now() }, fetchHistory: () => new Promise(() => {}), timeoutMs: 20,
  });
  assert.equal(hangingPage.ok, false, 'a hung page is unavailable');
});

test('R10 addendum: an acknowledge within HISTORY_SETTLE_MS of the last send attempt is too-soon; the same-key retry is not refused; the window restarts at each attempt', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await startDeposit(store, { createKey: () => 'R10-SOON' });
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R10-SOON', submit: scriptedSubmit(unknownOutcome()).submit });
  assert.equal(HISTORY_SETTLE_MS, 60 * 1000, 'the settle window is 60 s');
  // R11: both clocks move together here (the wall clock and this tab's monotonic clock).
  clock.advance(30_000);
  store.monoClock.advance(30_000);
  assert.deepEqual(await ackNew({ store, at: clock.now(), settled: false }), { ok: false, reason: 'too-soon' });
  assert.equal(describeAcknowledgeOutcome({ ok: false, reason: 'too-soon' }).text, TOO_SOON_TEXT);
  const retry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R10-SOON', submit: scriptedSubmit(unknownOutcome()).submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(retry.kind, 'unconfirmed', 'the same-key retry is not refused by the settle window');
  clock.advance(59_000);
  store.monoClock.advance(59_000);
  assert.deepEqual(await ackNew({ store, at: clock.now(), settled: false }), { ok: false, reason: 'too-soon' }, 'the window restarted at the retry');
  // R11 (F1): 61 s after the retry on the wall clock, but only 2 s of monotonic time since this tab first saw the new version: still too-soon.
  clock.advance(2_000);
  store.monoClock.advance(2_000);
  assert.deepEqual(await ackNew({ store, at: clock.now(), settled: false }), { ok: false, reason: 'too-soon' }, 'the monotonic wait runs from this tab first seeing the new version');
  clock.advance(59_000);
  store.monoClock.advance(59_000);
  assert.equal((await ackNew({ store, at: clock.now(), settled: false })).ok, true, 'after the settle window the checked acknowledge is allowed');
});

// ---- R11 (F1): the monotonic settle. Two tabs share storage and locks; the second tab's wall clock is skewed ahead. ----
const skewedPair = (skewMs) => {
  const storage = createFakeStorage();
  const locks = createFakeWebLocks();
  const correct = createClock();
  const skewed = createClock();
  skewed.set(correct.now() + skewMs);
  return { C: makeStore(storage, correct, { locks }), F: makeStore(storage, skewed, { locks }), correct, skewed };
};
// Moves both wall clocks and both monotonic clocks by the same amount (real time passes for both tabs).
const advanceBoth = (pair, ms) => {
  pair.correct.advance(ms);
  pair.skewed.advance(ms);
  pair.C.monoClock.advance(ms);
  pair.F.monoClock.advance(ms);
};
const SKEW_KEY = 'R11-SKEW';
const skewedNewKeyOp = (store, sendCounter) => executeBalanceOperation({
  store, scope: SCOPE, loginKey: LOGIN, type: 'balance', direction: IN, endpointKey: 'deposit', payload: depositPayload(),
  createKey: () => `${SKEW_KEY}-NEW`, canManageFinances: true, submit: async () => { sendCounter.sent += 1; return okOutcome(); }, wait: async () => {},
});

test('R11-FORWARD-SKEW-SETTLE (F1, reviewer X1 and X1b): a tab whose clock is 2 h or 90 s ahead acknowledges a fresh unknown outcome only after 60 s of its own monotonic time; no new key is sent before', async () => {
  for (const skewMs of [2 * 60 * 60 * 1000, 90 * 1000]) {
    const pair = skewedPair(skewMs);
    await startDeposit(pair.C, { createKey: () => SKEW_KEY });
    await runBalanceOperation({ store: pair.C, scope: SCOPE, loginKey: LOGIN, idempotencyKey: SKEW_KEY, submit: scriptedSubmit(unknownOutcome()).submit });
    advanceBoth(pair, 1000);
    const record = pair.F.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: SKEW_KEY });
    const persisted = pair.F.clockOf({ scope: SCOPE, loginKey: LOGIN });
    assert.ok(persisted.anchor - record.lastAttemptAt >= HISTORY_SETTLE_MS, `skew ${skewMs} ms: the persisted check alone would pass (the bypass)`);
    const sent = { sent: 0 };
    assert.deepEqual(await ackNew({ store: pair.F, settled: false, at: pair.skewed.now(), fetchHistory: EMPTY_HISTORY }), { ok: false, reason: 'too-soon' }, `skew ${skewMs} ms: refused 1 s after the attempt`);
    assert.equal((await skewedNewKeyOp(pair.F, sent)).reason, 'blocked', 'the new key is refused while the record is unresolved');
    assert.equal(sent.sent, 0, 'zero sends');
    advanceBoth(pair, 59_000);
    assert.deepEqual(await ackNew({ store: pair.F, settled: false, at: pair.skewed.now(), fetchHistory: EMPTY_HISTORY }), { ok: false, reason: 'too-soon' }, 'refused: 60 s of wall clock but 59 s of monotonic time');
    advanceBoth(pair, 1000);
    assert.equal((await ackNew({ store: pair.F, settled: false, at: pair.skewed.now(), fetchHistory: EMPTY_HISTORY })).ok, true, 'after 60 s of monotonic time: acknowledged');
    assert.equal((await skewedNewKeyOp(pair.F, sent)).kind, 'success', 'only then does a new key go out');
    assert.equal(sent.sent, 1, 'exactly one new-key send');
  }
});

test('R11 F1: with a match in the history after the monotonic wait, the match warning appears and the acknowledge is refused until confirmed', async () => {
  const pair = skewedPair(2 * 60 * 60 * 1000);
  await startDeposit(pair.C, { createKey: () => SKEW_KEY });
  await runBalanceOperation({ store: pair.C, scope: SCOPE, loginKey: LOGIN, idempotencyKey: SKEW_KEY, submit: scriptedSubmit(unknownOutcome()).submit });
  advanceBoth(pair, 1000);
  assert.deepEqual(await ackNew({ store: pair.F, settled: false, at: pair.skewed.now(), fetchHistory: MATCH_HISTORY }), { ok: false, reason: 'too-soon' });
  advanceBoth(pair, HISTORY_SETTLE_MS);
  const check = await loadAcknowledgeHistory({
    login: LOGIN,
    original: { type: 'balance', direction: 'in', amount: '100.00', createdAt: pair.F.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: SKEW_KEY }).createdAt, manager: 'mgr-a' },
    fetchHistory: MATCH_HISTORY,
  });
  assert.equal(acknowledgeCheckView(check).warning, HISTORY_MATCH_WARNING_TEXT, 'the match warning appears');
  assert.deepEqual(await ackNew({ store: pair.F, settled: false, at: pair.skewed.now(), fetchHistory: MATCH_HISTORY }), { ok: false, reason: 'match-not-confirmed' });
  assert.equal((await ackNew({ store: pair.F, settled: false, at: pair.skewed.now(), fetchHistory: MATCH_HISTORY, matchConfirmed: true })).ok, true, 'confirmed: acknowledged');
});

test('R11 F1: a version change restarts the monotonic wait (a same-key retry moves the version; the wait runs from this tab first seeing the new version)', async () => {
  const storage = createFakeStorage();
  const clock = createClock();
  const store = makeStore(storage, clock);
  await startDeposit(store, { createKey: () => 'R11-RESTART' });
  await runBalanceOperation({ store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R11-RESTART', submit: scriptedSubmit(unknownOutcome()).submit });
  const v1 = store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R11-RESTART' }).version;
  assert.deepEqual(await ackNew({ store, settled: false, at: clock.now(), fetchHistory: EMPTY_HISTORY }), { ok: false, reason: 'too-soon' }, 'v1 is first seen at monotonic 0: refused');
  clock.advance(HISTORY_SETTLE_MS + 1000);
  store.monoClock.advance(HISTORY_SETTLE_MS + 1000);
  const retry = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R11-RESTART', submit: scriptedSubmit(unknownOutcome()).submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(retry.kind, 'unconfirmed', 'the same-key retry is sent');
  const v2 = store.find({ scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'R11-RESTART' }).version;
  assert.ok(v2 > v1, 'the retry moved the version');
  clock.advance(HISTORY_SETTLE_MS + 1000);
  store.monoClock.advance(1000);
  assert.deepEqual(
    await ackNew({ store, settled: false, at: clock.now(), fetchHistory: EMPTY_HISTORY }),
    { ok: false, reason: 'too-soon' },
    'the wall clock is past the settle, but v2 was first seen 1 s ago on this tab',
  );
  store.monoClock.advance(HISTORY_SETTLE_MS - 1000);
  assert.deepEqual(await ackNew({ store, settled: false, at: clock.now(), fetchHistory: EMPTY_HISTORY }), { ok: false, reason: 'too-soon' }, '59 s of monotonic time since v2: still refused');
  store.monoClock.advance(1000);
  assert.equal((await ackNew({ store, settled: false, at: clock.now(), fetchHistory: EMPTY_HISTORY })).ok, true, '60 s since v2 was first seen: acknowledged');
});

test('R11 F4: production call sites pass no fetchHistory, timeoutMs or monotonicNow (test-only injection points); the controller reads performance.now for the monotonic clock', () => {
  for (const name of ['AccountDetailsModal.jsx', 'accountFinanceOps.js']) {
    const source = fs.readFileSync(path.join(REPO_POPUPS_DIR, name), 'utf8');
    for (const token of ['fetchHistory', 'timeoutMs', 'monotonicNow']) {
      assert.equal(source.includes(token), false, `${name} does not pass ${token}`);
    }
  }
  const controller = fs.readFileSync(path.join(REPO_POPUPS_DIR, 'balanceTabController.js'), 'utf8');
  assert.equal(controller.includes('const defaultMonotonicNow = () => performance.now();'), true, 'the default monotonic clock is performance.now');
});

test('R10 L2: the modal passes no history reader; the controller defaults to the production reader', () => {
  const modal = fs.readFileSync(path.join(REPO_POPUPS_DIR, 'AccountDetailsModal.jsx'), 'utf8');
  assert.equal(modal.includes('fetchHistory'), false, 'no fetchHistory argument in the modal');
  assert.equal(modal.includes('fetchManagerBalanceHistory'), false, 'the modal does not import the reader');
  const controller = fs.readFileSync(path.join(REPO_POPUPS_DIR, 'balanceTabController.js'), 'utf8');
  assert.equal(controller.includes('fetchHistory = fetchManagerBalanceHistory,'), true, 'the acknowledge defaults to the production reader');
  assert.equal(controller.includes('fetchHistory = fetchManagerBalanceHistory, limit'), true, 'the loader defaults to the production reader');
});

test('R10 L3: the acknowledge result is shown only for the login it was sent for', () => {
  const modal = fs.readFileSync(path.join(REPO_POPUPS_DIR, 'AccountDetailsModal.jsx'), 'utf8');
  const start = modal.indexOf('const confirmNewOperation = async () => {');
  const end = modal.indexOf('const handleTransaction = async', start);
  assert.ok(start > 0 && end > start, 'confirmNewOperation is found');
  const body = modal.slice(start, end);
  const taken = body.indexOf('const clickLoginKey = financeLoginKey');
  const sent = body.indexOf('await acknowledgeNewOperation');
  const guard = body.indexOf('shouldApplyOutcome({ activeLoginKey: activeLoginRef.current, outcomeLoginKey: clickLoginKey })');
  const shown = body.indexOf('setDepositError(errorFeedback)');
  assert.ok(taken > 0 && taken < sent, 'the login is taken at the click, before the call');
  assert.ok(guard > sent && guard < shown, 'the login guard sits between the call and the error');
});

test('R10 H2 modal: the popup no longer refreshes the clock mark (no view writes the mark)', () => {
  const modal = fs.readFileSync(path.join(REPO_POPUPS_DIR, 'AccountDetailsModal.jsx'), 'utf8');
  assert.equal(modal.includes('refreshBalanceClockMark'), false);
  assert.equal(modal.includes('CLOCK_MARK_REFRESH_INTERVAL_MS'), false);
});

test('R10 texts: the too-soon text exists in all 8 locale dictionaries', async () => {
  const dictionaries = ['deSupplement', 'esSupplement', 'fr', 'hiSupplement', 'jaSupplement', 'ruSupplement', 'trSupplement', 'zh'];
  for (const name of dictionaries) {
    const mod = await import(pathToFileURL(path.join(REPO_POPUPS_DIR, '..', '..', 'i18n', 'uiDictionary', `${name}.js`)).href);
    assert.equal(
      typeof mod.default['Wait a moment — history may not show the last attempt yet'], 'string',
      `${name} has the too-soon text`,
    );
  }
});

// ---- Phase B (balance-op types, history labels, recent history). Fake stores and fake history readers only. ----

const PHASE_B_TYPES = ['charge', 'correction', 'bonus', 'commission', 'tax'];

test('Phase B: the skip box shows for a Phase B withdrawal with the grant, never for a deposit, Credit, Transfer or an SO type', () => {
  const key = PERMISSIONS.MANAGE_FINANCES_SKIP_MARGIN;
  for (const type of PHASE_B_TYPES) {
    assert.equal(canShowSkipMargin({ resolved: true, permissions: [key], type, direction: 'out' }), true, type);
    assert.equal(canShowSkipMargin({ resolved: true, permissions: [key], type, direction: 'in' }), false, type);
    assert.equal(canShowSkipMargin({ resolved: true, permissions: [PERMISSIONS.MANAGE_FINANCES], type, direction: 'out' }), false, `${type} without the grant`);
    assert.equal(canShowSkipMargin({ resolved: false, permissions: [key], type, direction: 'out' }), false, `${type} while loading`);
  }
  for (const type of ['so_compensation', 'so_credit_compensation']) {
    assert.equal(canShowSkipMargin({ resolved: true, permissions: [key], type, direction: 'out' }), false, type);
  }
});

test('Phase B: prepareBalanceSubmission builds the balance-op request; the skip is honoured on out only', () => {
  const base = {
    canManageFinances: true, canSkipMargin: true, skipMarginChecked: true, skipMarginReason: 'Owner-approved correction, ticket 1',
    depositAmount: '25', loginId: LOGIN, depositComment: '[bonus] spoof', currencyValue: 'USD',
  };
  const out = prepareBalanceSubmission({ ...base, transactionType: 'correction', direction: OUT });
  assert.equal(out.ok, true);
  assert.equal(out.skipForAttempt, true);
  assert.equal(out.request.endpointKey, 'balanceOp');
  assert.deepEqual(out.request.payload, {
    login: LOGIN, amount: '25.00', comment: '[bonus] spoof', type: 'correction', direction: 'out',
    skip_margin_check: true, skip_margin_reason: 'Owner-approved correction, ticket 1',
  });
  assert.equal(out.confirmationPrompt, `Correction withdrawal 25.00 USD from account #${LOGIN}?`);
  const deposit = prepareBalanceSubmission({ ...base, transactionType: 'correction', direction: 'in' });
  assert.equal(deposit.ok, true);
  assert.equal(deposit.skipForAttempt, false, 'a deposit ignores a checked skip box');
  assert.deepEqual(deposit.request.payload, { login: LOGIN, amount: '25.00', comment: '[bonus] spoof', type: 'correction', direction: 'in' });
  const noGrant = prepareBalanceSubmission({ ...base, canSkipMargin: false, transactionType: 'tax', direction: OUT });
  assert.equal(noGrant.skipForAttempt, false);
  assert.equal('skip_margin_check' in noGrant.request.payload, false);
  const so = prepareBalanceSubmission({ ...base, transactionType: 'so_credit_compensation', direction: OUT });
  assert.equal(so.ok, false, 'an SO type is refused before any request exists');
  assert.match(so.feedback.text, /not available yet/);
});

test('Phase B: each enabled type and direction runs through the stored-operation path to balance-op, with the type in the success text', async () => {
  for (const type of PHASE_B_TYPES) {
    for (const direction of ['in', OUT]) {
      const store = makeStore(createFakeStorage(), createClock());
      const sender = scriptedSubmit(okOutcome({ body: { balance_after: 1010, type, direction } }));
      const prepared = prepareBalanceSubmission({
        transactionType: type, direction, canManageFinances: true, depositAmount: '10', loginId: LOGIN, currencyValue: 'USD',
      });
      assert.equal(prepared.ok, true, `${type}:${direction}`);
      const outcome = await executeBalanceOperation({
        store, scope: SCOPE, loginKey: LOGIN, type, direction, endpointKey: prepared.request.endpointKey,
        payload: prepared.request.payload, createKey: () => `PB-${type}-${direction}-key`, canManageFinances: true,
        submit: sender.submit, currency: 'USD', wait: async () => {},
      });
      assert.equal(outcome.kind, 'success', `${type}:${direction}`);
      assert.equal(sender.calls.length, 1);
      assert.equal(sender.calls[0].endpointKey, 'balanceOp');
      assert.equal(sender.calls[0].payload.type, type);
      assert.equal(sender.calls[0].payload.direction, direction);
      assert.equal(sender.calls[0].payload.idempotency_key, `PB-${type}-${direction}-key`);
      const label = HISTORY_KIND_LABELS[type];
      assert.ok(outcome.successText.startsWith(`${label} ${direction === OUT ? 'withdrawal' : 'deposit'} of 10.00 USD`), outcome.successText);
    }
  }
});

test('Phase B: a balance-op 202 pending keeps the record and the same key is resent on retry', async () => {
  const store = makeStore(createFakeStorage(), createClock());
  const pendingOutcome = { status: 'pending', httpStatus: 202, code: null, message: '', body: { status: 'pending' }, replayed: false, reversal: null };
  const sender = scriptedSubmit(pendingOutcome, okOutcome());
  const prepared = prepareBalanceSubmission({ transactionType: 'bonus', direction: 'in', canManageFinances: true, depositAmount: '5', loginId: LOGIN });
  const first = await executeBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, type: 'bonus', direction: 'in', endpointKey: 'balanceOp', payload: prepared.request.payload,
    createKey: () => 'PB-202-key', canManageFinances: true, submit: sender.submit, wait: async () => {},
  });
  assert.notEqual(first.kind, 'success');
  assert.equal(store.list({ scope: SCOPE, loginKey: LOGIN }).length, 1, 'the pending record is kept');
  const retried = await retryBalanceOperation({
    store, scope: SCOPE, loginKey: LOGIN, idempotencyKey: 'PB-202-key', submit: sender.submit, canManageFinances: true, wait: async () => {},
  });
  assert.equal(retried.kind, 'success');
  assert.deepEqual(sender.calls.map((call) => [call.endpointKey, call.payload.idempotency_key]), [['balanceOp', 'PB-202-key'], ['balanceOp', 'PB-202-key']]);
});

test('Phase B: history labels come from operation_kind only; a spoofed "[bonus]" comment on a deposit stays a Deposit', () => {
  const spoof = { id: 7, time: 1_700_000_000, operation_kind: 'deposit', direction: 'in', amount: '50', balance_after: '50', comment: '[bonus] Q4 promotion', kind_source: 'projection' };
  assert.equal(historyKindLabel(spoof), 'Deposit');
  const parts = historyRowParts(spoof, 'USD');
  assert.deepEqual(parts, { time: '2023-11-14 22:13:20 UTC', label: 'Deposit', amountText: '+50.00 USD', comment: '[bonus] Q4 promotion' });
  const bonusOut = { ...spoof, id: 8, operation_kind: 'bonus', direction: 'out', comment: 'Deposit' };
  assert.equal(historyRowParts(bonusOut, 'USD').label, 'Bonus');
  assert.equal(historyRowParts(bonusOut, 'USD').amountText, '-50.00 USD');
  const expected = {
    deposit: 'Deposit', withdrawal: 'Withdrawal', credit_in: 'Credit in', credit_out: 'Credit out', nbp_reset: 'Negative balance reset',
    charge: 'Charge', correction: 'Correction', bonus: 'Bonus', commission: 'Commission', tax: 'Tax',
    so_compensation: 'SO compensation', so_credit_compensation: 'SO credit compensation',
    transfer_in: 'Transfer in', transfer_out: 'Transfer out', unknown: 'Unknown operation',
  };
  for (const [kind, label] of Object.entries(expected)) assert.equal(historyKindLabel({ ...spoof, operation_kind: kind }), label, kind);
  for (const kind of ['bonus_in', 'BONUS', '', 'constructor', '__proto__']) {
    assert.equal(historyKindLabel({ ...spoof, operation_kind: kind }), 'Unknown operation', `${kind} is never shown raw`);
  }
});

test('Phase B: loadRecentBalanceHistory reads one page of RECENT_HISTORY_LIMIT rows, newest first', async () => {
  const seen = [];
  const rows = [
    { id: 1, time: 100, operation_kind: 'deposit', direction: 'in', amount: '10', balance_after: '10', comment: '' },
    { id: 3, time: 300, operation_kind: 'tax', direction: 'out', amount: '1', balance_after: '9', comment: 'Tax' },
    { id: 2, time: 300, operation_kind: 'bonus', direction: 'in', amount: '2', balance_after: '11', comment: '' },
  ];
  const result = await loadRecentBalanceHistory({
    login: String(LOGIN),
    fetchHistory: async (login, query) => { seen.push({ login, query }); return { items: rows, nextCursor: 'more' }; },
  });
  assert.deepEqual(seen, [{ login: String(LOGIN), query: { limit: RECENT_HISTORY_LIMIT } }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows.map((row) => row.id), [3, 2, 1]);
});

test('Phase B: loadRecentBalanceHistory fails closed on an error, a bad row or a timeout (never a partial list)', async () => {
  const good = { id: 1, time: 100, operation_kind: 'deposit', direction: 'in', amount: '10', balance_after: '10', comment: '' };
  const cases = [
    async () => { throw new Error('HTTP 503'); },
    async () => ({ items: [good, { ...good, id: 2, amount: 10 }] }),
    async () => ({ items: [good, { ...good, id: 3, direction: 'sideways' }] }),
    async () => ({ items: 'nope' }),
    async () => null,
  ];
  for (const fetchHistory of cases) {
    const result = await loadRecentBalanceHistory({ login: '1', fetchHistory });
    assert.deepEqual(result, { ok: false, text: RECENT_HISTORY_UNAVAILABLE_TEXT, rows: [] });
  }
  const slow = await loadRecentBalanceHistory({ login: '1', timeoutMs: 5, fetchHistory: () => new Promise(() => {}) });
  assert.equal(slow.ok, false);
});

test('Phase B: the Balance tab renders the recent history from historyRowParts, as text, under the form', () => {
  const modal = fs.readFileSync(path.join(REPO_POPUPS_DIR, 'AccountDetailsModal.jsx'), 'utf8');
  assert.match(modal, /loadRecentBalanceHistory\(\{ login: financeLoginKey \}\)/);
  assert.match(modal, /const parts = historyRowParts\(row, currencyValue\);/);
  assert.match(modal, /<span className="font-semibold">\{parts\.label\}<\/span>/);
  assert.doesNotMatch(modal, /dangerouslySetInnerHTML=\{\{ __html: parts/);
  assert.doesNotMatch(modal, /operation_kind\}/, 'the raw operation_kind is never rendered');
});

test('Phase B: every new Balance-tab string has a translation in all 8 locales', () => {
  const strings = [
    'Recent operations', 'No operations in the account history yet.', 'Account history unavailable',
    'This operation is available only for engine-owned accounts.',
    'This operation has no funding mapping on the server. Nothing was booked.',
    ...Object.values(HISTORY_KIND_LABELS),
  ];
  const languages = Object.keys(UI_DICTIONARIES).filter((language) => language !== 'en');
  assert.deepEqual([...languages].sort(), ['de', 'es', 'fr', 'hi', 'ja', 'ru', 'tr', 'zh']);
  for (const language of languages) {
    for (const text of strings) {
      const translated = UI_DICTIONARIES[language][text];
      // The same word is a valid translation (French "Correction"); a missing entry is not.
      assert.equal(typeof translated === 'string' && translated.trim() !== '', true, `${language}: ${text}`);
    }
  }
});

test('Phase B live: the history list reloads when the live balance or credit changes, not on an equity tick', () => {
  assert.equal(recentHistoryTrigger(null), '');
  assert.equal(recentHistoryTrigger(undefined), '');
  const base = { login: 710001, balance: 1000, credit: 50, equity: 1012.5, free_margin: 990 };
  assert.equal(recentHistoryTrigger(base), '1000|50');
  assert.equal(recentHistoryTrigger({ ...base, equity: 1013, free_margin: 991 }), '1000|50', 'a P/L tick keeps the key');
  assert.notEqual(recentHistoryTrigger({ ...base, balance: 1100 }), '1000|50', 'a deposit elsewhere changes the key');
  assert.notEqual(recentHistoryTrigger({ ...base, credit: 0 }), '1000|50', 'a credit change elsewhere changes the key');
  assert.equal(recentHistoryTrigger({ row: { balance: '9737.5', credit: '0' } }), '9737.5|0', 'a wrapped live row is read too');
  assert.equal(recentHistoryTrigger({ balance: null, credit: undefined }), '|');
  const modal = fs.readFileSync(path.join(REPO_POPUPS_DIR, 'AccountDetailsModal.jsx'), 'utf8');
  assert.match(modal, /const recentHistoryLedgerKey = recentHistoryTrigger\(liveMetrics\);/);
  assert.match(modal, /\}, \[activeTab, financeLoginKey, depositSuccess, depositError, recentHistoryLedgerKey\]\);/);
  assert.ok(modal.indexOf('const liveMetrics = useLiveAccountMetrics(loginId);') < modal.indexOf('const recentHistoryLedgerKey'), 'the key is read after the live hook');
});

test('Phase B: history rows of one account never show under another account (login change while loading)', () => {
  const rowsA = [{ id: 1, time: 100, operation_kind: 'deposit', direction: 'in', amount: '10', balance_after: '10', comment: '' }];
  const loadedA = { login: '710001', loading: false, ok: true, rows: rowsA, text: '' };
  assert.deepEqual(recentHistoryLoadingState(loadedA, '710001'), { login: '710001', loading: true, ok: true, rows: rowsA, text: '' },
    'a reload of the same account keeps its rows on screen');
  assert.deepEqual(recentHistoryLoadingState(loadedA, '710002'), { login: '710002', loading: true, ok: false, rows: [], text: '' },
    'another account starts empty');
  assert.deepEqual(recentHistoryLoadingState(null, '710002'), { login: '710002', loading: true, ok: false, rows: [], text: '' });
  assert.deepEqual(recentHistoryLoadingState({ ...loadedA, ok: false, rows: [] }, '710001').rows, []);
  assert.equal(recentHistoryFor(loadedA, '710002'), null, 'a late state of another login is not rendered');
  assert.equal(recentHistoryFor(loadedA, '710001'), loadedA);
  assert.equal(recentHistoryFor(null, '710001'), null);
  const modal = fs.readFileSync(path.join(REPO_POPUPS_DIR, 'AccountDetailsModal.jsx'), 'utf8');
  assert.match(modal, /setRecentHistory\(\(prev\) => recentHistoryLoadingState\(prev, financeLoginKey\)\);/);
  assert.match(modal, /setRecentHistory\(\{ login: financeLoginKey, loading: false, \.\.\.result \}\);/);
  assert.match(modal, /const recentHistory = recentHistoryFor\(recentHistoryState, financeLoginKey\);/);
});
