/**
 * Authentication Service
 * Centralizes localStorage operations for tokens and handles session refresh.
 */

const TOKENS = {
  AUTH: 'authToken',
  REFRESH: 'refreshToken',
  BROKER_LOGIN: 'brokerLogin',
  BROKER_ID: 'brokerId',
};

export const getAuthToken = () => localStorage.getItem(TOKENS.AUTH);
export const getRefreshToken = () => localStorage.getItem(TOKENS.REFRESH);

export const setSession = (data) => {
  if (data.token) localStorage.setItem(TOKENS.AUTH, data.token);
  if (data.refresh_token) localStorage.setItem(TOKENS.REFRESH, data.refresh_token);
  if (data.login) localStorage.setItem(TOKENS.BROKER_LOGIN, String(data.login));
  if (data.broker_id) localStorage.setItem(TOKENS.BROKER_ID, data.broker_id);
};

export const clearSession = () => {
  localStorage.removeItem(TOKENS.AUTH);
  localStorage.removeItem(TOKENS.REFRESH);
  localStorage.removeItem(TOKENS.BROKER_LOGIN);
  localStorage.removeItem(TOKENS.BROKER_ID);
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
      // Attempting refresh using the standard pattern predicted from Swagger/JSON
      const response = await fetch(`/api/manager/Refresh?token=${encodeURIComponent(refreshToken)}`, {
        method: 'GET',
        headers: { 'accept': 'application/json' }
      });

      if (!response.ok) {
         throw new Error('Refresh failed');
      }

      const data = await response.json();
      if (data.token) {
        setSession(data);
        return data.token;
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
  setSession,
  clearSession,
  refreshSession,
};
