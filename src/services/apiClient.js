import authService from './authService';
import { buildExtApiUrl, buildManagerApiUrl } from '../config/endpoints';

const AUTH_REJECTION_STATUSES = new Set([401, 403]);
const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';

const expireAndThrow = (reason) => {
  authService.expireSession(reason);
  throw new Error(SESSION_ERROR_MESSAGE);
};

/**
 * Enhanced fetch wrapper that handles:
 * 1. Automatic inclusion of auth tokens (id param)
 * 2. Standardized error handling
 * 3. Silent token refresh on 401 Unauthorized
 * 4. Automatic retry after refresh
 */
const apiClient = {
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('/ext-api')
      ? buildExtApiUrl(endpoint)
      : buildManagerApiUrl(endpoint);

    // Preparation function for headers and URL with current token
    const prepareRequest = () => {
      const sessionStatus = authService.getSessionStatus();
      if (!sessionStatus.authenticated) {
        expireAndThrow(sessionStatus.reason || 'session_invalid');
      }

      const token = sessionStatus.snapshot.token;
      const headers = { 'accept': 'application/json', ...options.headers };
      let finalUrl = url;

      if (token) {
        const urlObj = new URL(url, window.location.origin);
        urlObj.searchParams.set('id', token);
        finalUrl = urlObj.toString();
        headers['Authorization'] = `Bearer ${token}`;
      }
      return { finalUrl, headers };
    };

    const { finalUrl, headers } = prepareRequest();

    console.log(`📤 [API REQUEST] ${options.method || 'GET'} ${finalUrl}`, {
      headers,
      body: options.body ? JSON.parse(options.body) : undefined,
    });

    try {
      let response = await fetch(finalUrl, { ...options, headers });

      if (response.status === 401) {
        console.warn('Authentication expired. Attempting silent refresh...');

        const sessionStatus = authService.getSessionStatus();
        if (!sessionStatus.authenticated) {
          expireAndThrow(sessionStatus.reason || 'token_rejected');
        }

        // Wait for refreshSession (which has its own lock)
        const newToken = await authService.refreshSession();

        if (newToken) {
          const { finalUrl: retryUrl, headers: retryHeaders } = prepareRequest();
          return await fetch(retryUrl, { ...options, headers: retryHeaders }).then(res => this.handleResponse(res));
        } else {
          expireAndThrow('refresh_failed');
        }
      }

      if (response.status === 403) {
        expireAndThrow('token_rejected');
      }

      return await this.handleResponse(response);
    } catch (error) {
      console.error('API request failed:', error);
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
        console.error(`📥 [API RESPONSE ERROR] ${response.status}`, errMsg, text);
        throw new Error(errMsg);
      }
      console.log(`📥 [API RESPONSE SUCCESS] ${response.status}`, text);
      return text;
    }

    if (!response.ok) {
      if (AUTH_REJECTION_STATUSES.has(response.status)) {
        expireAndThrow('token_rejected');
      }
      const errorMsg = data.error || data.message || `HTTP ${response.status}`;
      console.error(`📥 [API RESPONSE ERROR] ${response.status}`, errorMsg, data);
      throw new Error(errorMsg);
    }

    console.log(`📥 [API RESPONSE SUCCESS] ${response.status}`, data);
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
  }
};

export default apiClient;
