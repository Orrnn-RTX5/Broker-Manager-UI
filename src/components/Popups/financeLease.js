/**
 * Cross-tab account lock for manager money operations.
 *
 * The Web Locks API (`navigator.locks`) is the ONLY mutual exclusion (round 5, decision D1).
 * Every mutation of an account's pending state runs inside
 * `navigator.locks.request('rtx-fin:<broker>:<login>', { mode: 'exclusive', ifAvailable: true }, cb)`:
 * - `cb(null)` means another tab (or this tab) holds the lock. The caller gets `reason: 'busy'` and
 *   does nothing else.
 * - When `navigator.locks` is missing, nothing is granted (`reason: 'no-locks'`). The caller fails
 *   closed and shows "This browser cannot guarantee duplicate protection".
 * - When `locks.request` rejects, the caller gets `reason: 'lock-error'` and nothing is sent.
 *
 * There is no storage-lease fallback: localStorage has no compare-and-set, so it cannot provide
 * mutual exclusion.
 *
 * The "is another tab running" state is ADVISORY ONLY. It is derived from `navigator.locks.query()`
 * (held and pending names), refreshed asynchronously, on demand, and on a short interval. Safety never
 * depends on it; the lock above is the guarantee.
 *
 * Tenant-agnostic: no broker, login, or endpoint is hardcoded.
 */

export const FINANCE_LEASE_PREFIX = 'rtx-fin';
export const DEFAULT_FINANCE_LOCK_ADVISORY_INTERVAL_MS = 1_000;

const defaultGetLocks = () => {
  try {
    const candidate = typeof navigator !== 'undefined' ? navigator?.locks : undefined;
    return candidate && typeof candidate.request === 'function' ? candidate : null;
  } catch {
    return null;
  }
};

/**
 * Build the canonical lock name for a broker and account login: `rtx-fin:<broker>:<login>`.
 *
 * @param {{ brokerId?: string|number|null, loginKey?: string|number|null }} identity
 * @returns {string|null}
 */
export const buildFinanceLeaseKey = ({ brokerId, loginKey } = {}) => {
  const broker = brokerId === undefined || brokerId === null ? '' : String(brokerId).trim();
  const login = loginKey === undefined || loginKey === null ? '' : String(loginKey).trim();
  if (broker === '' || login === '') return null;
  return `${FINANCE_LEASE_PREFIX}:${broker}:${login}`;
};

/**
 * Create the lock manager for one tab / store instance.
 *
 * @param {{
 *   getLocks?: () => ({ request: Function, query?: Function }|null),
 *   advisoryIntervalMs?: number,
 * }} [options] `advisoryIntervalMs` <= 0 disables the interval (refresh stays on demand).
 */
export const createFinanceLeaseManager = ({
  getLocks = defaultGetLocks,
  advisoryIntervalMs = DEFAULT_FINANCE_LOCK_ADVISORY_INTERVAL_MS,
} = {}) => {
  const heldInThisTab = new Map(); // lockName -> count of granted, unfinished runWithLease calls
  let advisoryNames = new Set(); // lock names reported held or pending by navigator.locks.query()
  const listeners = new Set();

  const locks = () => {
    try {
      const candidate = getLocks();
      return candidate && typeof candidate.request === 'function' ? candidate : null;
    } catch {
      return null;
    }
  };

  const notifyListeners = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // One failing listener must not stop the others.
      }
    }
  };

  /** Refresh the advisory view. Never used for safety decisions. */
  const refreshAdvisory = async () => {
    const lockManager = locks();
    let next = new Set();
    if (lockManager && typeof lockManager.query === 'function') {
      try {
        const snapshot = await lockManager.query();
        for (const entry of [...(snapshot?.held ?? []), ...(snapshot?.pending ?? [])]) {
          if (typeof entry?.name === 'string') next.add(entry.name);
        }
      } catch {
        next = new Set();
      }
    }
    const changed = next.size !== advisoryNames.size || [...next].some((name) => !advisoryNames.has(name));
    advisoryNames = next;
    if (changed) notifyListeners();
    return [...advisoryNames];
  };

  // L5: no timer at creation. The advisory poll runs only between startPolling() and stopPolling(),
  // which the Balance tab calls on mount and unmount.
  // Reference-counted: each open popup starts and stops its own user; the timer runs while any user is open.
  let timer = null;
  let pollers = 0;
  const startPolling = () => {
    pollers += 1;
    if (timer !== null || !Number.isFinite(advisoryIntervalMs) || advisoryIntervalMs <= 0) return;
    void refreshAdvisory();
    timer = setInterval(() => {
      void refreshAdvisory();
    }, advisoryIntervalMs);
    timer?.unref?.();
  };
  const stopPolling = () => {
    pollers = Math.max(0, pollers - 1);
    if (pollers > 0) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  /** True when `navigator.locks` can be used. */
  const supported = () => locks() !== null;

  /**
   * Advisory only: true when this tab holds the lock, or the lock was reported held or pending
   * by `navigator.locks.query()` at the last refresh.
   */
  const isBusy = ({ brokerId, loginKey } = {}) => {
    const lockName = buildFinanceLeaseKey({ brokerId, loginKey });
    if (!lockName) return false;
    return heldInThisTab.has(lockName) || advisoryNames.has(lockName);
  };

  /**
   * Run `task({ lockName })` while holding `rtx-fin:<broker>:<login>`.
   * Resolves to `{ acquired, reason, lockName, result? }`. `reason` is one of
   * `null` (acquired), `'busy'`, `'no-locks'`, `'lock-error'`, `'invalid-scope'`.
   * Rejects only when the task itself throws after the lock was granted.
   */
  const runWithLease = async ({ brokerId, loginKey } = {}, task) => {
    const lockName = buildFinanceLeaseKey({ brokerId, loginKey });
    if (!lockName) return { acquired: false, reason: 'invalid-scope', lockName: null };
    const lockManager = locks();
    if (!lockManager) return { acquired: false, reason: 'no-locks', lockName };

    let entered = false;
    try {
      const outcome = await lockManager.request(lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) {
          // Not granted: another holder exists. Do nothing else.
          return { acquired: false, reason: 'busy', lockName };
        }
        entered = true;
        heldInThisTab.set(lockName, (heldInThisTab.get(lockName) ?? 0) + 1);
        try {
          const result = await task({ lockName });
          return { acquired: true, reason: null, lockName, result };
        } finally {
          const left = (heldInThisTab.get(lockName) ?? 1) - 1;
          if (left > 0) {
            heldInThisTab.set(lockName, left);
          } else {
            heldInThisTab.delete(lockName);
            // This tab released the lock: drop its name from the advisory view now.
            if (advisoryNames.delete(lockName)) notifyListeners();
          }
        }
      });
      // Re-read the advisory view only after request() settles: the lock is released by then, so
      // query() no longer reports this tab's own lock.
      void refreshAdvisory();
      return outcome;
    } catch (err) {
      void refreshAdvisory();
      if (entered) throw err;
      return { acquired: false, reason: 'lock-error', lockName };
    }
  };

  const onChange = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    buildKey: buildFinanceLeaseKey,
    supported,
    isBusy,
    refreshAdvisory,
    runWithLease,
    onChange,
    startPolling,
    stopPolling,
    dispose: stopPolling,
  };
};
