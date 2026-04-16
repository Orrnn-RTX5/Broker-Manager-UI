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

/**
 * Attempts to refresh the authentication token using the refresh token.
 * Returns the new auth token if successful, or null if failed.
 */
export const refreshSession = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    // Attempting refresh using the standard pattern predicted from Swagger
    // Note: If /Refresh doesn't exist, we fallback to Connect logic if possible
    const response = await fetch(`/api/manager/Refresh?token=${encodeURIComponent(refreshToken)}`, {
      method: 'GET',
      headers: { 'accept': 'application/json' }
    });

    if (!response.ok) {
       // If /Refresh is not correct, the backend might use /Connect with the old token
       // We'll throw here so the interceptor can handle the failure
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
  }
};

export default {
  getAuthToken,
  getRefreshToken,
  setSession,
  clearSession,
  refreshSession,
};
