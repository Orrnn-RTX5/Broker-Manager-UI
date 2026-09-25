import authService from './authService.js';

// Renew this long before the access token's expiry. Short-lived tokens (e.g. a
// 2 minute dev TTL) renew at half their remaining life instead.
export const TOKEN_REFRESH_LEAD_MS = 120_000;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export const getRefreshRetryDelay = (failures) =>
  Math.min(RETRY_BASE_MS * (2 ** Math.max(failures - 1, 0)), RETRY_MAX_MS);

/**
 * Keeps the session alive by refreshing the access token ahead of its expiry.
 * A refused refresh token ends the session (inside refreshSession); network or
 * server failures retry with backoff and never log the user out.
 */
export const startSessionRefreshScheduler = ({
  auth = authService,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutFn = (id) => clearTimeout(id),
  now = () => Date.now(),
  leadMs = TOKEN_REFRESH_LEAD_MS,
} = {}) => {
  let stopped = false;
  let timer = null;
  let failures = 0;
  let scheduledLeadMs = leadMs;

  const schedule = (delay, run) => {
    if (stopped) return;
    if (timer !== null) clearTimeoutFn(timer);
    timer = setTimeoutFn(run, Math.min(Math.max(delay, 0), MAX_TIMEOUT_MS));
  };

  const run = async () => {
    timer = null;
    if (stopped) return;

    const token = await auth.refreshSession({ minValidityMs: scheduledLeadMs });
    if (stopped) return;

    if (token) {
      failures = 0;
      scheduleFromExpiry();
      return;
    }
    if (!auth.getSessionStatus().authenticated) return;

    failures += 1;
    schedule(getRefreshRetryDelay(failures), run);
  };

  function scheduleFromExpiry() {
    const expiresAt = auth.getTokenExpiresAt();
    if (!expiresAt) return;
    const remainingMs = expiresAt - now();
    scheduledLeadMs = Math.min(leadMs, Math.max(remainingMs / 2, 0));
    schedule(remainingMs - scheduledLeadMs, run);
  }

  scheduleFromExpiry();

  return {
    stop() {
      stopped = true;
      if (timer !== null) clearTimeoutFn(timer);
      timer = null;
    },
  };
};
