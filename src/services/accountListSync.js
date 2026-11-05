import apiClient from './apiClient';
import { buildAccountUpdatesWsUrl } from '../config/endpoints';
import { PositionSyncClient } from './positionSyncCore';

// The accounts grid learns about accounts it does not show yet (a new account, for example a demo opened from the
// terminal, or a login that just came into scope) from the broker-wide account invalidations on /OnAccountUpdate
// (state_changed, entity "accounts"). Money moves are not handled here: the live metrics overlay
// (useLiveAccountRows) already updates the rows on screen.
export const ACCOUNT_LIST_REFETCH_DEBOUNCE_MS = 1000;
// Login-less scope hints and resyncs carry no operation, and a busy broker sends many: at most one refetch per window.
export const ACCOUNT_LIST_SLOW_REFETCH_MS = 10_000;

const ACCOUNT_ROW_ADDED_OR_REMOVED = new Set(['insert', 'delete']);

/**
 * How an /OnAccountUpdate message affects the grid:
 * - 'now': an account the grid does not show was created or removed (operation insert/delete);
 * - 'slow': a login-less scope hint, a resync, or an account event without an operation (throttled);
 * - false: nothing to do (other entities, or an update of a shown row, which the metrics overlay handles); a shown
 *   row that is deleted is 'now'.
 */
export const accountListEventNeedsRefetch = (payload, knownLogins) => {
  if (!payload || payload.type !== 'state_changed' || !payload.data || typeof payload.data !== 'object') return false;
  const { entity } = payload.data;
  if (entity === 'resync') return 'slow';
  if (entity !== 'accounts') return false;
  const login = Number(payload.data.account_login ?? payload.data.login);
  // The server sends a login-less hint for a login outside the cached scope (a new account can precede it).
  if (!Number.isSafeInteger(login) || login <= 0) return 'slow';
  const operation = String(payload.data.operation ?? '').trim().toLowerCase();
  if (knownLogins instanceof Set && knownLogins.has(String(login))) {
    // A shown row: the metrics overlay keeps it current, but a removed account must leave the page.
    return operation === 'delete' ? 'now' : false;
  }
  if (operation === '') return 'slow';
  // A balance, credit or margin update of an account on another page is not a list change.
  return ACCOUNT_ROW_ADDED_OR_REMOVED.has(operation) ? 'now' : false;
};

const createAccountUpdatesClient = () => new PositionSyncClient({
  requestTicket: () => apiClient.post('/api/v1/manager/ws-ticket', { path: '/OnAccountUpdate' }),
  buildUrl: buildAccountUpdatesWsUrl,
});

/**
 * Watch the broker's account invalidations while the grid is mounted. A new or removed account refetches after
 * `debounceMs`; slow signals refetch at most once per `slowMs`; a reconnect refetches once (events may have been
 * missed while disconnected), and the resync the server sends right after each connect is not a second refetch.
 * Returns the stop function.
 */
export function watchAccountList({
  getKnownLogins,
  onRefetch,
  debounceMs = ACCOUNT_LIST_REFETCH_DEBOUNCE_MS,
  slowMs = ACCOUNT_LIST_SLOW_REFETCH_MS,
  createClient = createAccountUpdatesClient,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  nowFn = Date.now,
} = {}) {
  let timer = null;
  let timerDue = 0;
  let lastRefetchAt = -Infinity;
  let connectedOnce = false;
  let skipNextResync = false;
  const schedule = (kind) => {
    const now = nowFn();
    const delay = kind === 'now' ? debounceMs : Math.max(debounceMs, lastRefetchAt + slowMs - now);
    const due = now + delay;
    if (timer && timerDue <= due) return;
    if (timer) clearTimeoutFn(timer);
    timerDue = due;
    timer = setTimeoutFn(() => {
      timer = null;
      lastRefetchAt = nowFn();
      onRefetch?.();
    }, delay);
  };
  const client = createClient();
  const unsubscribe = client.subscribe((event) => {
    if (event?.type === 'snapshot' && event.reason === 'connected') {
      if (connectedOnce) schedule('now');
      connectedOnce = true;
      skipNextResync = true;
      return;
    }
    if (event?.type !== 'position') return;
    const need = accountListEventNeedsRefetch(event.payload, getKnownLogins?.());
    if (!need) return;
    if (event.payload.data.entity === 'resync' && skipNextResync) {
      skipNextResync = false;
      return;
    }
    schedule(need);
  });
  client.start();
  return () => {
    if (timer) clearTimeoutFn(timer);
    timer = null;
    unsubscribe?.();
    client.stop();
  };
}
