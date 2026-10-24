import { getDataAccessScope, assertDataAccessScope } from './dataAccessScope.js';
import authService from './authService.js';
import { desktopFetch } from './desktopHttp.js';
import { buildExtApiUrl, buildManagerApiUrl } from '../config/endpoints.js';
import { isAuthExpiredResponse } from './authHttpStatus.js';
import { sendWithSessionRefresh } from './authRequest.js';
import { redactHeaders, redactSensitive, redactUrl } from '../utils/redaction.js';

const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';
const RESPONSE_TOO_LARGE_MESSAGE =
  'Response is too large for a paged grid request. Backend must honor limit/offset/search before the UI can load it safely.';
const API_DEBUG_ENABLED = import.meta.env?.VITE_DEBUG_API === 'true';

const expireAndThrow = (reason) => {
  authService.expireSession(reason);
  throw new Error(SESSION_ERROR_MESSAGE);
};

/**
 * Broker backends answer HTTP 200 with an application-level failure flag when
 * a trade action is rejected ({ success: false }, { ok: false }, an `error`
 * member, or an MT5 retcode such as { success: true, retcode: 'MT_RET_ERR_*' }
 * / { success: true, code: 'MT_RET_ERR_*' }). HTTP completion alone must never
 * read as success, so these payloads are classified as errors at this
 * boundary. Only explicit failure signals count — lists, envelopes and other
 * payloads without them pass through untouched. This checks explicit flags
 * only; wording-based (text / regex) classification lives in normalizeResult
 * (utils/resultMessage.js), which the result dialog applies on top, so the
 * transport boundary never claims agreement on outcomes it does not evaluate.
 */
const isMtRetErrorCode = (value) => typeof value === 'string' && /MT_RET_ERR_/i.test(value);

export const isErrorPayload = (data) => {
  if (data === false) return true;
  if (!data || typeof data !== 'object') return false;
  if (data.success === false || data.ok === false || Boolean(data.error)) return true;
  return isMtRetErrorCode(data.retcode) || isMtRetErrorCode(data.code);
};

export const isSuccessPayload = (data) => !isErrorPayload(data);

const asNonEmptyMessageText = (value) => (
  typeof value === 'string' && value !== '' ? value : undefined
);

const getErrorPayloadMessage = (data, fallback) => (
  asNonEmptyMessageText(data?.error?.message)
  ?? (typeof data?.error === 'string' && data.error !== '' ? data.error : undefined)
  ?? asNonEmptyMessageText(data?.message)
  ?? asNonEmptyMessageText(data?.detail)
  ?? fallback
);

/**
 * Throw when a payload carries an application-level failure, using the same
 * error shape as ordinary HTTP failures (message, status, statusText, code)
 * so existing catch paths and error contracts are preserved.
 */
export const throwIfErrorPayload = (data, { status, statusText } = {}) => {
  if (!isErrorPayload(data)) return data;
  const code = data?.error?.code ?? data?.retcode ?? data?.code;
  const message = getErrorPayloadMessage(data, `Request failed${status ? ` (HTTP ${status})` : ''}`);
  console.error(`[API RESPONSE ERROR] ${status ?? 'payload'}`, message, redactSensitive(data));
  throw Object.assign(new Error(message), { status, statusText, code });
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

const notifyResponseReceived = (callback, response, text) => {
  if (typeof callback !== 'function') return;
  try {
    callback({
      status: response.status,
      ok: response.ok,
      bytes: typeof text === 'string' ? text.length : null,
      serverTiming: response.headers.get('server-timing') || null,
    });
  } catch {
    // Performance diagnostics must never change API behavior.
  }
};

const isTransientGatewayStatus = (status) => (
  [502, 503, 504, 520, 521, 522, 523, 524].includes(Number(status))
);

const isAbortError = (error) => (
  error?.name === 'AbortError' || Number(error?.code) === 20
);

/**
 * Fetch wrapper that handles:
 * 1. Authorization header attachment
 * 2. Standardized error handling
 * 3. Silent token refresh on 401, or 403 "Not authenticated"
 * 4. Automatic retry after refresh
 */
const apiClient = {
  async rawRequest(endpoint, options = {}) {
    const accessScope = getDataAccessScope();
    const {
      maxResponseBytes: _maxResponseBytes,
      responseType: _responseType,
      onResponseReceived: _onResponseReceived,
      ...requestOptions
    } = options;
    const url = endpoint.startsWith('/ext-api')
      ? buildExtApiUrl(endpoint)
      : buildManagerApiUrl(endpoint);
    const finalUrl = withoutQueryToken(url);

    const response = await sendWithSessionRefresh((token) => {
      const headers = { accept: 'application/json', ...requestOptions.headers };
      if (token) headers.Authorization = `Bearer ${token}`;

      if (API_DEBUG_ENABLED) {
        console.debug(`[API REQUEST] ${requestOptions.method || 'GET'} ${redactUrl(finalUrl)}`, {
          headers: redactHeaders(headers),
          body: redactSensitive(safeRequestBody(requestOptions.body)),
          responseType: 'raw',
        });
      }
      return desktopFetch(finalUrl, { ...requestOptions, headers });
    });
    assertDataAccessScope(accessScope);
    return response;
  },

  async request(endpoint, options = {}) {
    const accessScope = getDataAccessScope();
    const {
      maxResponseBytes,
      responseType = 'json',
      onResponseReceived,
      ...requestOptions
    } = options;
    const url = endpoint.startsWith('/ext-api')
      ? buildExtApiUrl(endpoint)
      : buildManagerApiUrl(endpoint);
    const finalUrl = withoutQueryToken(url);

    try {
      // Refreshes ahead of a stale local expiry, and once on a rejected token
      // (401 or 403 "Not authenticated") before retrying the request.
      const response = await sendWithSessionRefresh((token) => {
        const headers = { accept: 'application/json', ...requestOptions.headers };
        if (token) headers.Authorization = `Bearer ${token}`;

        if (API_DEBUG_ENABLED) {
          console.debug(`[API REQUEST] ${requestOptions.method || 'GET'} ${redactUrl(finalUrl)}`, {
            headers: redactHeaders(headers),
            body: redactSensitive(safeRequestBody(requestOptions.body)),
          });
        }
        return desktopFetch(finalUrl, { ...requestOptions, headers });
      });

      const result = await this.handleResponse(response, { maxResponseBytes, responseType, onResponseReceived });
      assertDataAccessScope(accessScope);
      return result;
    } catch (error) {
      if (!isAbortError(error) && !isTransientGatewayStatus(error?.status)) {
        console.error('API request failed:', redactSensitive(error));
      } else if (API_DEBUG_ENABLED) {
        console.debug('API request failed (transient/aborted):', redactSensitive(error));
      }
      throw error;
    }
  },

  async handleResponse(response, { maxResponseBytes, responseType = 'json', onResponseReceived } = {}) {
    const text = await readResponseText(response, maxResponseBytes);
    notifyResponseReceived(onResponseReceived, response, text);

    if (responseType === 'text') {
      if (!response.ok) {
        if (isAuthExpiredResponse(response.status, text)) {
          expireAndThrow('token_rejected');
        }
        const errMsg = `HTTP ${response.status}: ${response.statusText}`;
        if (!isTransientGatewayStatus(response.status)) {
          console.error(`[API RESPONSE ERROR] ${response.status}`, errMsg, redactSensitive(text.slice(0, 500)));
        } else if (API_DEBUG_ENABLED) {
          console.debug(`[API RESPONSE ERROR] ${response.status}`, errMsg, redactSensitive(text.slice(0, 500)));
        }
        throw Object.assign(new Error(errMsg), { status: response.status, statusText: response.statusText });
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
        if (!isTransientGatewayStatus(response.status)) {
          console.error(`[API RESPONSE ERROR] ${response.status}`, errMsg, redactSensitive(text));
        } else if (API_DEBUG_ENABLED) {
          console.debug(`[API RESPONSE ERROR] ${response.status}`, errMsg, redactSensitive(text));
        }
        throw Object.assign(new Error(errMsg), { status: response.status, statusText: response.statusText });
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
      const errorMsg = getErrorPayloadMessage(data, `HTTP ${response.status}`);
      if (!isTransientGatewayStatus(response.status)) {
        console.error(`[API RESPONSE ERROR] ${response.status}`, errorMsg, redactSensitive(data));
      } else if (API_DEBUG_ENABLED) {
        console.debug(`[API RESPONSE ERROR] ${response.status}`, errorMsg, redactSensitive(data));
      }
      throw Object.assign(new Error(errorMsg), { status: response.status, statusText: response.statusText, code: data?.error?.code ?? data?.retcode ?? data?.code });
    }

    // A completed HTTP request can still report a rejected action
    // ({ success: false }, { ok: false }, an `error` member, or an
    // MT_RET_ERR_* retcode/code). Fail here so callers cannot mistake it
    // for success.
    throwIfErrorPayload(data, { status: response.status, statusText: response.statusText });

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
