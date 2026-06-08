import authService from './authService';
import { buildExtApiUrl, buildManagerApiUrl } from '../config/endpoints';
import { redactHeaders, redactSensitive, redactUrl } from '../utils/redaction';

const AUTH_REJECTION_STATUSES = new Set([401, 403]);
const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';

const expireAndThrow = (reason) => {
  authService.expireSession(reason);
  throw new Error(SESSION_ERROR_MESSAGE);
};

const browserOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost';
};

const withoutQueryToken = (url) => {
  const urlObj = new URL(url, browserOrigin());
  urlObj.searchParams.delete('id');
  return urlObj.toString();
};

const safeRequestBody = (body) => {
  if (!body || typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

/**
 * Fetch wrapper that handles:
 * 1. Authorization header attachment
 * 2. Standardized error handling
 * 3. Silent token refresh on 401 Unauthorized
 * 4. Automatic retry after refresh
 */
const apiClient = {
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('/ext-api')
      ? buildExtApiUrl(endpoint)
      : buildManagerApiUrl(endpoint);

    const prepareRequest = () => {
      const sessionStatus = authService.getSessionStatus();
      if (!sessionStatus.authenticated) {
        expireAndThrow(sessionStatus.reason || 'session_invalid');
      }

      const token = sessionStatus.snapshot.token;
      const headers = { accept: 'application/json', ...options.headers };
      const finalUrl = withoutQueryToken(url);

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return { finalUrl, headers };
    };

    const { finalUrl, headers } = prepareRequest();

    console.debug(`[API REQUEST] ${options.method || 'GET'} ${redactUrl(finalUrl)}`, {
      headers: redactHeaders(headers),
      body: redactSensitive(safeRequestBody(options.body)),
    });

    try {
      const response = await fetch(finalUrl, { ...options, headers });

      if (response.status === 401) {
        console.warn('Authentication expired. Attempting silent refresh...');

        const sessionStatus = authService.getSessionStatus();
        if (!sessionStatus.authenticated) {
          expireAndThrow(sessionStatus.reason || 'token_rejected');
        }

        const newToken = await authService.refreshSession();

        if (newToken) {
          const { finalUrl: retryUrl, headers: retryHeaders } = prepareRequest();
          return await fetch(retryUrl, { ...options, headers: retryHeaders }).then((res) => this.handleResponse(res));
        }
        expireAndThrow('refresh_failed');
      }

      if (response.status === 403) {
        expireAndThrow('token_rejected');
      }

      return await this.handleResponse(response);
    } catch (error) {
      console.error('API request failed:', redactSensitive(error));
      throw error;
    }
  },

  async handleResponse(response) {
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) {
        if (AUTH_REJECTION_STATUSES.has(response.status)) {
          expireAndThrow('token_rejected');
        }
        const errMsg = `HTTP ${response.status}: ${response.statusText}`;
        console.error(`[API RESPONSE ERROR] ${response.status}`, errMsg, redactSensitive(text));
        throw new Error(errMsg);
      }
      console.debug(`[API RESPONSE SUCCESS] ${response.status}`, redactSensitive(text));
      return text;
    }

    if (!response.ok) {
      if (AUTH_REJECTION_STATUSES.has(response.status)) {
        expireAndThrow('token_rejected');
      }
      const errorMsg = data.error || data.message || `HTTP ${response.status}`;
      console.error(`[API RESPONSE ERROR] ${response.status}`, errorMsg, redactSensitive(data));
      throw new Error(errorMsg);
    }

    console.debug(`[API RESPONSE SUCCESS] ${response.status}`, redactSensitive(data));
    return data;
  },

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  },

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify(body),
    });
  },
};

export default apiClient;
