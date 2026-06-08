import { buildManagerApiUrl } from '../config/endpoints';
import authService from './authService';

const AUTH_REJECTION_STATUSES = new Set([401, 403]);
const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';

const isLoginEndpoint = (endpoint) =>
  endpoint.startsWith('/Connect') || endpoint.includes('/Connect?');

const browserOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost';
};

const buildAuthenticatedUrl = (endpoint, token, legacyQueryToken = false) => {
  const url = new URL(buildManagerApiUrl(endpoint), browserOrigin());
  if (legacyQueryToken && token) {
    url.searchParams.set('id', token);
  } else {
    url.searchParams.delete('id');
  }
  return url.toString();
};

export const fetchManagerApi = async (endpoint, options = {}) => {
  if (isLoginEndpoint(endpoint)) {
    throw new Error('Legacy /Connect login is disabled. Use broker login instead.');
  }

  const { legacyQueryToken = false, headers: optionHeaders, ...fetchOptions } = options || {};
  const sessionStatus = authService.getSessionStatus();
  if (!sessionStatus.authenticated) {
    authService.expireSession(sessionStatus.reason || 'session_invalid');
    throw new Error(SESSION_ERROR_MESSAGE);
  }

  const token = sessionStatus.snapshot.token;
  const headers = { accept: 'application/json', ...optionHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(buildAuthenticatedUrl(endpoint, token, legacyQueryToken), {
    ...fetchOptions,
    headers,
  });

  if (AUTH_REJECTION_STATUSES.has(response.status)) {
    authService.expireSession('token_rejected');
  }

  return response;
};
