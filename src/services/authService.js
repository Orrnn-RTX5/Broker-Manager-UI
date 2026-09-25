/**
 * Authentication Service
 * Centralizes localStorage operations for tokens and handles session refresh.
 */

import { buildManagerApiUrl } from '../config/endpoints.js';
import { MANAGER_API } from '../config/managerApiContract.js';
import { desktopFetch } from './desktopHttp.js';
import { getRuntimeConfigValue, isDesktopBackendTarget } from '../config/backendTarget.js';

const TOKENS = {
  AUTH: 'authToken',
  REFRESH: 'refreshToken',
  BROKER_LOGIN: 'brokerLogin',
  BROKER_ID: 'brokerId',
  EXPIRES_AT: 'tokenExpiresAt',
  EXPIRES_AT_LEGACY: 'token_expires_at',
};

const AUTH_SESSION_KEY = 'auth';
const SESSION_EXPIRED_EVENT = 'auth:session-expired';
const TOKEN_UPDATED_EVENT = 'auth:token-updated';
const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';

// Refresh tokens are single-use, so only one tab may call the refresh endpoint
// at a time. navigator.locks is preferred; the localStorage lock is the fallback.
const REFRESH_LOCK_NAME = 'rtx5-auth-refresh';
const REFRESH_LOCK_KEY = 'authRefreshLock';
const REFRESH_LOCK_TTL_MS = 15_000;
const REFRESH_REQUEST_TIMEOUT_MS = 15_000;

// These reasons mean the shared localStorage tokens belong to another live tab
// (a new tab without its own session, or a different manager signed in there).
// Only this tab's session is dropped so the other tab keeps working.
const TAB_SCOPED_EXPIRY_REASONS = new Set(['session_storage_auth_missing', 'token_storage_mismatch']);

const TOKEN_FIELDS = [
  'token', 'access_token', 'session_token', 'refresh_token',
  'tokenExpiresAt', 'expires_at', 'expiresAt', 'token_expires_at', 'expires_in', 'expiresIn',
];

export const AUTH_STORAGE_KEYS = [
  AUTH_SESSION_KEY,
  TOKENS.AUTH,
  TOKENS.REFRESH,
  TOKENS.BROKER_LOGIN,
  TOKENS.BROKER_ID,
  TOKENS.EXPIRES_AT,
  TOKENS.EXPIRES_AT_LEGACY,
];

export const normalizeTokenExpiresAt = (expiresAt, expiresIn) => {
  if (expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
    if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
      return expiresAt < 100000000000 ? expiresAt * 1000 : expiresAt;
    }

    const raw = String(expiresAt).trim();
    if (/^\d+$/.test(raw)) {
      const numeric = Number(raw);
      return numeric < 100000000000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (expiresIn !== undefined && expiresIn !== null && expiresIn !== '') {
    const seconds = Number(expiresIn);
    return Number.isFinite(seconds) ? Date.now() + seconds * 1000 : null;
  }

  return null;
};

const dispatchAuthEvent = (eventName, detail) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
};

// Session checks run during render; listeners update React state, so the event
// is delivered after the current synchronous work instead of inside it.
const dispatchAuthEventLater = (eventName, detail) => {
  const run = () => dispatchAuthEvent(eventName, detail);
  if (typeof queueMicrotask === 'function') queueMicrotask(run);
  else Promise.resolve().then(run);
};

const getStorageItem = (storageName, key) => {
  try {
    const storage = typeof window === 'undefined' ? null : window[storageName];
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const setStorageItem = (storageName, key, value) => {
  try {
    const storage = typeof window === 'undefined' ? null : window[storageName];
    if (value === null || value === undefined) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, quota); auth falls back to memory-less behavior.
  }
};

const withoutTokenFields = (session = {}) => {
  const rest = { ...session };
  TOKEN_FIELDS.forEach((field) => delete rest[field]);
  return rest;
};

const normalizeIdentityPart = (value) => String(value ?? '').trim().toLowerCase();

const getSessionAuth = () => {
  try {
    const raw = getStorageItem('sessionStorage', AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getSessionToken = () => {
  const session = getSessionAuth();
  return session?.token || session?.access_token || session?.session_token || null;
};

const getLocalAuthToken = () => getStorageItem('localStorage', TOKENS.AUTH);

// Synchronous read of the role claims the login endpoint embedded in the
// session blob (the login response is spread into `auth`). Used by the
// client RBAC layer for an immediate admin/manager decision before the richer
// manager session permission set has loaded. The backend remains the authority.
export const getSessionClaims = () => {
  const session = getSessionAuth() || {};
  return {
    isAdmin: session.is_admin === true,
    login: session.login ?? null,
    brokerId: session.broker_id ?? null,
  };
};

export const getAuthToken = () => getSessionToken() || getLocalAuthToken();
export const getRefreshToken = () => getSessionAuth()?.refresh_token || getStorageItem('localStorage', TOKENS.REFRESH);

// Stable for the whole login (it survives token refreshes), so caches and
// permission queries scoped to the session are not reset every hour.
export const getSessionScopeKey = () => getSessionAuth()?.session_scope || getAuthToken();

const getSessionIdentity = (session) => (
  session ? `${normalizeIdentityPart(session.login)}|${normalizeIdentityPart(session.broker_id)}` : null
);

const readLocalExpiry = () => (
  normalizeTokenExpiresAt(getStorageItem('localStorage', TOKENS.EXPIRES_AT)) ||
  normalizeTokenExpiresAt(getStorageItem('localStorage', TOKENS.EXPIRES_AT_LEGACY))
);

// Another tab refreshing (the refresh token is single-use) or signing in again
// as the same manager writes new tokens to localStorage. Adopt them into this
// tab's session instead of treating the change as a foreign session. Tokens of
// a different manager or broker are never adopted.
const adoptRotatedTokens = () => {
  const session = getSessionAuth();
  const sessionToken = session?.token || session?.access_token || session?.session_token || null;
  const localToken = getLocalAuthToken();
  if (!session || !sessionToken || !localToken) return false;

  const localRefresh = getStorageItem('localStorage', TOKENS.REFRESH);
  const localExpiry = readLocalExpiry();
  const sessionExpiry = normalizeTokenExpiresAt(session.tokenExpiresAt) || null;
  const refreshTokenChanged = Boolean(localRefresh && localRefresh !== session.refresh_token);
  if (localToken !== sessionToken) {
    // A rotation always brings a new single-use refresh token; a different
    // access token without one is a storage conflict, not a refresh.
    if (!refreshTokenChanged) return false;
  } else if (!refreshTokenChanged && localExpiry === sessionExpiry) {
    return false;
  }

  const localLogin = getStorageItem('localStorage', TOKENS.BROKER_LOGIN);
  const localBrokerId = getStorageItem('localStorage', TOKENS.BROKER_ID);
  if (normalizeIdentityPart(session.login) !== normalizeIdentityPart(localLogin)) return false;
  if (
    session.broker_id && localBrokerId &&
    normalizeIdentityPart(session.broker_id) !== normalizeIdentityPart(localBrokerId)
  ) {
    return false;
  }

  const nextSession = {
    ...withoutTokenFields(session),
    token: localToken,
    refresh_token: localRefresh || session.refresh_token,
    tokenExpiresAt: localExpiry,
  };
  setStorageItem('sessionStorage', AUTH_SESSION_KEY, JSON.stringify(nextSession));
  dispatchAuthEventLater(TOKEN_UPDATED_EVENT, { tokenExpiresAt: localExpiry, source: 'other_tab' });
  return true;
};

export const getTokenExpiresAt = () => {
  const session = getSessionAuth();
  const expiresAt = session?.tokenExpiresAt || session?.expires_at || session?.expiresAt || session?.token_expires_at;
  return normalizeTokenExpiresAt(expiresAt) ||
    normalizeTokenExpiresAt(getStorageItem('localStorage', TOKENS.EXPIRES_AT)) ||
    normalizeTokenExpiresAt(getStorageItem('localStorage', TOKENS.EXPIRES_AT_LEGACY));
};

export const isTokenExpired = (skewMs = 0) => {
  const expiresAt = getTokenExpiresAt();
  return Boolean(expiresAt && expiresAt <= Date.now() + skewMs);
};

export const getAuthSnapshot = () => {
  const session = getSessionAuth();
  const sessionToken = session?.token || session?.access_token || session?.session_token || null;
  const localToken = getLocalAuthToken();
  const expiresAt = getTokenExpiresAt();

  return {
    token: sessionToken || localToken,
    sessionToken,
    localToken,
    identity: getSessionIdentity(session),
    hasSessionAuth: Boolean(session),
    refreshToken: getRefreshToken(),
    expiresAt,
    isExpired: Boolean(expiresAt && expiresAt <= Date.now()),
  };
};

const invalidStatus = (reason, snapshot) => ({
  authenticated: false,
  reason,
  message: SESSION_ERROR_MESSAGE,
  snapshot,
  hasAuthState: Boolean(
    snapshot.token ||
    snapshot.refreshToken ||
    snapshot.hasSessionAuth ||
    snapshot.expiresAt ||
    getStorageItem('localStorage', TOKENS.BROKER_LOGIN) ||
    getStorageItem('localStorage', TOKENS.BROKER_ID)
  ),
});

export const getSessionStatus = ({ baseline } = {}) => {
  adoptRotatedTokens();
  const snapshot = getAuthSnapshot();

  if (!snapshot.hasSessionAuth) {
    return invalidStatus(snapshot.token ? 'session_storage_auth_missing' : 'token_missing', snapshot);
  }
  if (!snapshot.sessionToken) {
    return invalidStatus('session_storage_token_missing', snapshot);
  }
  if (!snapshot.localToken) {
    return invalidStatus('local_storage_token_missing', snapshot);
  }
  // Same-manager rotations were adopted above, so a remaining difference means
  // another manager or broker signed in from a different tab.
  if (snapshot.sessionToken !== snapshot.localToken) {
    return invalidStatus('token_storage_mismatch', snapshot);
  }
  if (baseline?.identity && snapshot.identity !== baseline.identity) {
    return invalidStatus('session_identity_changed', snapshot);
  }
  // A passed local expiry is not a logout while a refresh token exists: the
  // request layer renews the token before sending (needsRefresh).
  if (snapshot.isExpired && !snapshot.refreshToken) return invalidStatus('token_expired', snapshot);

  // Web deployments pin the broker through environment configuration. A
  // session saved before a broker switch must not reopen the previous broker.
  // Desktop intentionally allows selecting different brokers at login.
  if (!isDesktopBackendTarget()) {
    const configuredBrokerId = getRuntimeConfigValue([
      'FEED_BROKER_ID', 'VITE_FEED_BROKER_ID', 'BROKER_ID', 'VITE_BROKER_ID',
    ]).trim().toLowerCase();
    const sessionBrokerId = String(
      getSessionAuth()?.broker_id || getStorageItem('localStorage', TOKENS.BROKER_ID) || ''
    ).trim().toLowerCase();
    if (configuredBrokerId && sessionBrokerId && configuredBrokerId !== sessionBrokerId) {
      return invalidStatus('broker_configuration_changed', snapshot);
    }
  }

  return {
    authenticated: true,
    needsRefresh: snapshot.isExpired,
    reason: null,
    message: null,
    snapshot,
    hasAuthState: true,
  };
};

export const setSession = (data) => {
  const token = data.token || data.access_token || data.session_token;
  const refreshToken = data.refresh_token || getRefreshToken() || token;
  const tokenExpiresAt = normalizeTokenExpiresAt(
    data.expires_at || data.expiresAt || data.token_expires_at,
    data.expires_in || data.expiresIn
  );
  const nextSession = {
    ...data,
    token,
    refresh_token: refreshToken,
    tokenExpiresAt,
    session_scope: data.session_scope || token,
  };

  sessionStorage.setItem('auth', JSON.stringify(nextSession));
  if (refreshToken) localStorage.setItem(TOKENS.REFRESH, refreshToken);
  if (tokenExpiresAt) {
    localStorage.setItem(TOKENS.EXPIRES_AT, String(tokenExpiresAt));
    localStorage.setItem(TOKENS.EXPIRES_AT_LEGACY, String(tokenExpiresAt));
  } else {
    // A stale expiry left from the previous token would trigger endless refreshes.
    localStorage.removeItem(TOKENS.EXPIRES_AT);
    localStorage.removeItem(TOKENS.EXPIRES_AT_LEGACY);
  }
  if (nextSession.login) localStorage.setItem(TOKENS.BROKER_LOGIN, String(nextSession.login));
  if (nextSession.broker_id) localStorage.setItem(TOKENS.BROKER_ID, nextSession.broker_id);
  // Written last: other tabs adopt a rotation when they see the new access token.
  if (token) localStorage.setItem(TOKENS.AUTH, token);
  dispatchAuthEvent(TOKEN_UPDATED_EVENT, { tokenExpiresAt });
  return nextSession;
};

export const clearSession = ({ tabOnly = false } = {}) => {
  sessionStorage.removeItem('auth');
  if (tabOnly) return;
  localStorage.removeItem(TOKENS.AUTH);
  localStorage.removeItem(TOKENS.REFRESH);
  localStorage.removeItem(TOKENS.BROKER_LOGIN);
  localStorage.removeItem(TOKENS.BROKER_ID);
  localStorage.removeItem(TOKENS.EXPIRES_AT);
  localStorage.removeItem(TOKENS.EXPIRES_AT_LEGACY);
};

export const isTabScopedExpiry = (reason) => TAB_SCOPED_EXPIRY_REASONS.has(reason);

export const expireSession = (reason = 'token_expired') => {
  const tabOnly = isTabScopedExpiry(reason);
  const hadSession = Boolean(
    getSessionAuth() || (!tabOnly && (getLocalAuthToken() || getStorageItem('localStorage', TOKENS.REFRESH)))
  );
  clearSession({ tabOnly });
  // Several in-flight requests can fail together; the app hears about the
  // expiry once, so it redirects to the login screen once.
  if (hadSession) dispatchAuthEvent(SESSION_EXPIRED_EVENT, { reason });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readRefreshLock = () => {
  try {
    return JSON.parse(getStorageItem('localStorage', REFRESH_LOCK_KEY) || 'null');
  } catch {
    return null;
  }
};

const withStorageRefreshLock = async (task) => {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + REFRESH_LOCK_TTL_MS;
  let acquired = false;

  while (!acquired && Date.now() < deadline) {
    const lock = readRefreshLock();
    if (lock && lock.expiresAt > Date.now()) {
      await sleep(100);
      continue;
    }
    setStorageItem('localStorage', REFRESH_LOCK_KEY, JSON.stringify({
      owner,
      expiresAt: Date.now() + REFRESH_LOCK_TTL_MS,
    }));
    // Another tab may have written at the same moment; the last writer wins.
    await sleep(25);
    acquired = readRefreshLock()?.owner === owner;
  }

  try {
    // After the deadline the task still runs: it re-reads the shared tokens
    // first, so a rotation by the lock holder is picked up.
    return await task();
  } finally {
    if (readRefreshLock()?.owner === owner) setStorageItem('localStorage', REFRESH_LOCK_KEY, null);
  }
};

const withCrossTabRefreshLock = (task) => {
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request === 'function') return locks.request(REFRESH_LOCK_NAME, task);
  if (typeof window !== 'undefined' && window.localStorage) return withStorageRefreshLock(task);
  return task();
};

// Calls the refresh endpoint. `rejected` means the backend refused the refresh
// token (the session is over); otherwise a failure is transient (network, 5xx).
const requestTokenRefresh = async (refreshToken) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), REFRESH_REQUEST_TIMEOUT_MS) : null;
  try {
    const response = await desktopFetch(buildManagerApiUrl(MANAGER_API.refresh), {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller?.signal,
    });

    if ([400, 401, 403].includes(response.status)) return { rejected: true };
    if (!response.ok) return { rejected: false, error: new Error(`Refresh failed: HTTP ${response.status}`) };

    const data = await response.json();
    if (!(data?.access_token || data?.token || data?.session_token)) {
      return { rejected: false, error: new Error('Refresh response did not include an access token') };
    }
    return { rejected: false, data };
  } catch (error) {
    return { rejected: false, error };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

let refreshPromise = null;

/**
 * Renews the access token with the refresh token and resolves the new token,
 * or null when it could not be renewed. A rejected refresh token ends the
 * session; a network/server failure does not (the caller may retry).
 *
 * Single-flight: one refresh per tab (promise lock) and across tabs (lock plus
 * re-reading the shared tokens), because a refresh token can be used once.
 *
 * - rejectedToken: the access token the backend just refused. If the current
 *   token already differs, someone else refreshed and it is returned as is.
 * - minValidityMs: skip the call while the token is valid for at least this
 *   long (used by the scheduled refresh when another tab refreshed first).
 */
export const refreshSession = ({ rejectedToken = null, minValidityMs = 0 } = {}) => {
  if (refreshPromise) return refreshPromise;

  adoptRotatedTokens();
  const startingRefreshToken = getRefreshToken();
  if (!startingRefreshToken) {
    expireSession('refresh_token_missing');
    return Promise.resolve(null);
  }

  refreshPromise = (async () => {
    try {
      return await withCrossTabRefreshLock(async () => {
        adoptRotatedTokens();
        if (!getSessionAuth()) return null;

        const accessToken = getAuthToken();
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          expireSession('refresh_token_missing');
          return null;
        }

        const expiresAt = getTokenExpiresAt();
        const remainingMs = expiresAt ? expiresAt - Date.now() : Number.POSITIVE_INFINITY;
        const rotatedElsewhere = refreshToken !== startingRefreshToken ||
          Boolean(rejectedToken && accessToken && accessToken !== rejectedToken);
        if (accessToken && remainingMs > 0 && rotatedElsewhere) return accessToken;
        if (accessToken && minValidityMs > 0 && remainingMs > minValidityMs) return accessToken;

        const result = await requestTokenRefresh(refreshToken);
        if (result.rejected) {
          expireSession('refresh_rejected');
          return null;
        }
        if (!result.data) {
          console.error('Session refresh failed:', result.error);
          return null;
        }
        // A logout while the request was in flight must not be undone.
        const currentSession = getSessionAuth();
        if (!currentSession) return null;

        const nextSession = setSession({ ...withoutTokenFields(currentSession), ...result.data });
        return nextSession.token || null;
      });
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

export default {
  AUTH_STORAGE_KEYS,
  getAuthToken,
  getSessionClaims,
  getRefreshToken,
  getSessionScopeKey,
  getTokenExpiresAt,
  isTokenExpired,
  getAuthSnapshot,
  getSessionStatus,
  setSession,
  clearSession,
  isTabScopedExpiry,
  expireSession,
  refreshSession,
};
