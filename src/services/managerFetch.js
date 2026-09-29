import { getDataAccessScope, assertDataAccessScope } from './dataAccessScope.js';
import { buildManagerApiUrl } from '../config/endpoints.js';
import { desktopFetch } from './desktopHttp.js';
import { sendWithSessionRefresh } from './authRequest.js';

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
  const accessScope = getDataAccessScope();
  if (isLoginEndpoint(endpoint)) {
    throw new Error('Legacy /Connect login is disabled. Use broker login instead.');
  }

  const {
    legacyQueryToken = false,
    preserveQueryId = false,
    headers: optionHeaders,
    ...fetchOptions
  } = options || {};

  // Renews a stale token before sending, and once after a rejected token
  // (401, or 403 "Not authenticated") before retrying; see authRequest.js.
  const response = await sendWithSessionRefresh((token) => {
    const headers = { accept: 'application/json', ...optionHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    return desktopFetch(buildAuthenticatedUrl(endpoint, token, { legacyQueryToken, preserveQueryId }), {
      ...fetchOptions,
      headers,
    });
  });
  assertDataAccessScope(accessScope);
  return response;
};
