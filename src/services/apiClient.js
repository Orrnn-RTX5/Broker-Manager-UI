import authService from './authService';
import { desktopFetch } from './desktopHttp.js';
import { buildExtApiUrl, buildManagerApiUrl } from '../config/endpoints';
import { isAuthExpiredResponse, isAuthExpiredStatus } from './authHttpStatus.js';
import { redactHeaders, redactSensitive, redactUrl } from '../utils/redaction';

const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';
const RESPONSE_TOO_LARGE_MESSAGE =
  'Response is too large for a paged grid request. Backend must honor limit/offset/search before the UI can load it safely.';
const API_DEBUG_ENABLED = import.meta.env?.VITE_DEBUG_API === 'true';

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

const readResponseText = async (response, maxResponseBytes) => {
  if (!maxResponseBytes) return response.text();

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
  }

  if (!response.body) {
    const text = await response.text();
    if (text.length > maxResponseBytes) throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new globalThis.TextDecoder();
  let received = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    received += value.byteLength;
    if (received > maxResponseBytes) {
      await reader.cancel();
      throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
};

/**
 * Fetch wrapper that handles:
 * 1. Authorization header attachment
 * 2. Standardized error handling
 * 3. Silent token refresh on 401 Unauthorized
 * 4. Automatic retry after refresh
 */
const apiClient = {
  async rawRequest(endpoint, options = {}) {
    const {
      maxResponseBytes: _maxResponseBytes,
      responseType: _responseType,
      ...requestOptions
    } = options;
    const url = endpoint.startsWith('/ext-api')
      ? buildExtApiUrl(endpoint)
      : buildManagerApiUrl(endpoint);

    const prepareRequest = () => {
      const sessionStatus = authService.getSessionStatus();
      if (!sessionStatus.authenticated) {
        expireAndThrow(sessionStatus.reason || 'session_invalid');
      }

      const token = sessionStatus.snapshot.token;
      const headers = { accept: 'application/json', ...requestOptions.headers };
      const finalUrl = withoutQueryToken(url);

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return { finalUrl, headers };
    };

    const { finalUrl, headers } = prepareRequest();

    if (API_DEBUG_ENABLED) {
      console.debug(`[API REQUEST] ${requestOptions.method || 'GET'} ${redactUrl(finalUrl)}`, {
        headers: redactHeaders(headers),
        body: redactSensitive(safeRequestBody(requestOptions.body)),
        responseType: 'raw',
      });
    }

    const response = await desktopFetch(finalUrl, { ...requestOptions, headers });

    if (isAuthExpiredStatus(response.status)) {
      console.warn('Authentication expired. Attempting silent refresh...');

      const sessionStatus = authService.getSessionStatus();
      if (!sessionStatus.authenticated) {
        expireAndThrow(sessionStatus.reason || 'token_rejected');
      }

      const newToken = await authService.refreshSession();
      if (newToken) {
        const { finalUrl: retryUrl, headers: retryHeaders } = prepareRequest();
        return desktopFetch(retryUrl, { ...requestOptions, headers: retryHeaders });
      }
      expireAndThrow('refresh_failed');
    }

    return response;
  },

  async request(endpoint, options = {}) {
    const {
      maxResponseBytes,
      responseType = 'json',
      ...requestOptions
    } = options;
    const url = endpoint.startsWith('/ext-api')
      ? buildExtApiUrl(endpoint)
      : buildManagerApiUrl(endpoint);

    const prepareRequest = () => {
      const sessionStatus = authService.getSessionStatus();
      if (!sessionStatus.authenticated) {
        expireAndThrow(sessionStatus.reason || 'session_invalid');
      }

      const token = sessionStatus.snapshot.token;
      const headers = { accept: 'application/json', ...requestOptions.headers };
      const finalUrl = withoutQueryToken(url);

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return { finalUrl, headers };
    };

    const { finalUrl, headers } = prepareRequest();

    if (API_DEBUG_ENABLED) {
      console.debug(`[API REQUEST] ${requestOptions.method || 'GET'} ${redactUrl(finalUrl)}`, {
        headers: redactHeaders(headers),
        body: redactSensitive(safeRequestBody(requestOptions.body)),
      });
    }

    try {
      const response = await desktopFetch(finalUrl, { ...requestOptions, headers });

      if (isAuthExpiredStatus(response.status)) {
        console.warn('Authentication expired. Attempting silent refresh...');

        const sessionStatus = authService.getSessionStatus();
        if (!sessionStatus.authenticated) {
          expireAndThrow(sessionStatus.reason || 'token_rejected');
        }

        const newToken = await authService.refreshSession();

        if (newToken) {
          const { finalUrl: retryUrl, headers: retryHeaders } = prepareRequest();
          return await desktopFetch(retryUrl, { ...requestOptions, headers: retryHeaders })
            .then((res) => this.handleResponse(res, { maxResponseBytes, responseType }));
        }
        expireAndThrow('refresh_failed');
      }

      return await this.handleResponse(response, { maxResponseBytes, responseType });
    } catch (error) {
      console.error('API request failed:', redactSensitive(error));
      throw error;
    }
  },

  async handleResponse(response, { maxResponseBytes, responseType = 'json' } = {}) {
    const text = await readResponseText(response, maxResponseBytes);

    if (responseType === 'text') {
      if (!response.ok) {
        if (isAuthExpiredResponse(response.status, text)) {
          expireAndThrow('token_rejected');
        }
        const errMsg = `HTTP ${response.status}: ${response.statusText}`;
        console.error(`[API RESPONSE ERROR] ${response.status}`, errMsg, redactSensitive(text.slice(0, 500)));
        throw new Error(errMsg);
      }

      if (API_DEBUG_ENABLED) {
        console.debug(`[API RESPONSE SUCCESS] ${response.status}`, {
          responseType: 'text',
          bytes: text.length,
        });
      }
      return text;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) {
        if (isAuthExpiredResponse(response.status, text)) {
          expireAndThrow('token_rejected');
        }
        const errMsg = `HTTP ${response.status}: ${response.statusText}`;
        console.error(`[API RESPONSE ERROR] ${response.status}`, errMsg, redactSensitive(text));
        throw new Error(errMsg);
      }
      if (API_DEBUG_ENABLED) {
        console.debug(`[API RESPONSE SUCCESS] ${response.status}`, {
          responseType: 'text',
          bytes: text.length,
        });
      }
      return text;
    }

    if (!response.ok) {
      if (isAuthExpiredResponse(response.status, data)) {
        expireAndThrow('token_rejected');
      }
      const errorMsg = data.error || data.message || `HTTP ${response.status}`;
      console.error(`[API RESPONSE ERROR] ${response.status}`, errorMsg, redactSensitive(data));
      throw new Error(errorMsg);
    }

    if (API_DEBUG_ENABLED) {
      console.debug(`[API RESPONSE SUCCESS] ${response.status}`, {
        responseType: 'json',
        bytes: text.length,
      });
    }
    return data;
  },

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  },

  getRaw(endpoint, options = {}) {
    return this.rawRequest(endpoint, { ...options, method: 'GET' });
  },

  getText(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET', responseType: 'text' });
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
