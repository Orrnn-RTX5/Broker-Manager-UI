/**
 * Authentication Service
 * Centralizes localStorage operations for tokens and handles session refresh.
 */

import { buildManagerApiUrl } from '../config/endpoints.js';
import { MANAGER_API } from '../config/managerApiContract.js';
import { desktopFetch } from './desktopHttp.js';

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
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
};

const getStorageItem = (storageName, key) => {
  try {
    const storage = typeof window === 'undefined' ? null : window[storageName];
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

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
  if (snapshot.sessionToken !== snapshot.localToken) {
    return invalidStatus('token_storage_mismatch', snapshot);
  }
  if (baseline?.sessionToken && snapshot.sessionToken !== baseline.sessionToken) {
    return invalidStatus('session_storage_token_changed', snapshot);
  }
  if (baseline?.localToken && snapshot.localToken !== baseline.localToken) {
    return invalidStatus('local_storage_token_changed', snapshot);
  }
  if (snapshot.isExpired) return invalidStatus('token_expired', snapshot);

  return {
    authenticated: true,
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
  };

  sessionStorage.setItem('auth', JSON.stringify(nextSession));
  if (token) localStorage.setItem(TOKENS.AUTH, token);
  if (refreshToken) localStorage.setItem(TOKENS.REFRESH, refreshToken);
  if (tokenExpiresAt) {
    localStorage.setItem(TOKENS.EXPIRES_AT, String(tokenExpiresAt));
    localStorage.setItem(TOKENS.EXPIRES_AT_LEGACY, String(tokenExpiresAt));
  }
  if (nextSession.login) localStorage.setItem(TOKENS.BROKER_LOGIN, String(nextSession.login));
  if (nextSession.broker_id) localStorage.setItem(TOKENS.BROKER_ID, nextSession.broker_id);
  dispatchAuthEvent(TOKEN_UPDATED_EVENT, { tokenExpiresAt });
  return nextSession;
};

export const clearSession = () => {
  sessionStorage.removeItem('auth');
  localStorage.removeItem(TOKENS.AUTH);
  localStorage.removeItem(TOKENS.REFRESH);
  localStorage.removeItem(TOKENS.BROKER_LOGIN);
  localStorage.removeItem(TOKENS.BROKER_ID);
  localStorage.removeItem(TOKENS.EXPIRES_AT);
  localStorage.removeItem(TOKENS.EXPIRES_AT_LEGACY);
};

export const expireSession = (reason = 'token_expired') => {
  clearSession();
  dispatchAuthEvent(SESSION_EXPIRED_EVENT, { reason });
};

let isRefreshing = false;
let refreshPromise = null;

/**
 * Attempts to refresh the authentication token using the refresh token.
 * Uses a promise-lock to prevent multiple simultaneous refresh calls.
 */
export const refreshSession = async () => {
  if (isRefreshing) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await desktopFetch(buildManagerApiUrl(MANAGER_API.refresh), {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const data = await response.json();
      const nextSession = setSession(data);
      if (nextSession.token) {
        return nextSession.token;
      }
      return null;
    } catch (err) {
      console.error('Session refresh failed:', err);
      return null;
    } finally {
      isRefreshing = false;
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
  getTokenExpiresAt,
  isTokenExpired,
  getAuthSnapshot,
  getSessionStatus,
  setSession,
  clearSession,
  expireSession,
  refreshSession,
};
