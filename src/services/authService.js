/**
 * Authentication Service
 * Centralizes localStorage operations for tokens and handles session refresh.
 */

import { buildManagerApiUrl } from '../config/endpoints';

const TOKENS = {
  AUTH: 'authToken',
  REFRESH: 'refreshToken',
  BROKER_LOGIN: 'brokerLogin',
  BROKER_ID: 'brokerId',
  EXPIRES_AT: 'tokenExpiresAt',
  EXPIRES_AT_LEGACY: 'token_expires_at',
};

const SESSION_EXPIRED_EVENT = 'auth:session-expired';
const TOKEN_UPDATED_EVENT = 'auth:token-updated';

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

const getSessionAuth = () => {
  try {
    const raw = sessionStorage.getItem('auth');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const getAuthToken = () => getSessionAuth()?.token || localStorage.getItem(TOKENS.AUTH);
export const getRefreshToken = () => getSessionAuth()?.refresh_token || localStorage.getItem(TOKENS.REFRESH);

export const getTokenExpiresAt = () => {
  const session = getSessionAuth();
  const expiresAt = session?.tokenExpiresAt || session?.expires_at || session?.expiresAt || session?.token_expires_at;
  return normalizeTokenExpiresAt(expiresAt) ||
    normalizeTokenExpiresAt(localStorage.getItem(TOKENS.EXPIRES_AT)) ||
    normalizeTokenExpiresAt(localStorage.getItem(TOKENS.EXPIRES_AT_LEGACY));
};

export const isTokenExpired = (skewMs = 0) => {
  const expiresAt = getTokenExpiresAt();
  return Boolean(expiresAt && expiresAt <= Date.now() + skewMs);
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
      const response = await fetch(buildManagerApiUrl('/api/v1/auth/refresh'), {
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
  getAuthToken,
  getRefreshToken,
  getTokenExpiresAt,
  isTokenExpired,
  setSession,
  clearSession,
  expireSession,
  refreshSession,
};
