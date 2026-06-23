import { buildManagerApiUrl } from '../config/endpoints';
import authService from './authService';
import { desktopFetch } from './desktopHttp.js';
import { isAuthExpiredResponse, isAuthExpiredStatus } from './authHttpStatus.js';

const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';

const isLoginEndpoint = (endpoint) =>
  endpoint.startsWith('/Connect') || endpoint.includes('/Connect?');

const browserOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost';
};

const buildAuthenticatedUrl = (endpoint, token, { legacyQueryToken = false, preserveQueryId = false } = {}) => {
  const url = new URL(buildManagerApiUrl(endpoint), browserOrigin());
  if (legacyQueryToken && token) {
    url.searchParams.set('id', token);
  } else if (!preserveQueryId) {
    url.searchParams.delete('id');
  }
  return url.toString();
};

export const fetchManagerApi = async (endpoint, options = {}) => {
  if (isLoginEndpoint(endpoint)) {
    throw new Error('Legacy /Connect login is disabled. Use broker login instead.');
  }

  const {
    legacyQueryToken = false,
    preserveQueryId = false,
    headers: optionHeaders,
    ...fetchOptions
  } = options || {};
  const sessionStatus = authService.getSessionStatus();
  if (!sessionStatus.authenticated) {
    authService.expireSession(sessionStatus.reason || 'session_invalid');
    throw new Error(SESSION_ERROR_MESSAGE);
  }

  const token = sessionStatus.snapshot.token;
  const headers = { accept: 'application/json', ...optionHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await desktopFetch(buildAuthenticatedUrl(endpoint, token, { legacyQueryToken, preserveQueryId }), {
    ...fetchOptions,
    headers,
  });

  if (isAuthExpiredStatus(response.status)) {
    authService.expireSession('token_rejected');
  } else if (response.status === 403) {
    const errorText = await response.clone().text().catch(() => '');
    if (isAuthExpiredResponse(response.status, errorText)) {
      authService.expireSession('token_rejected');
    }
  }

  return response;
};
