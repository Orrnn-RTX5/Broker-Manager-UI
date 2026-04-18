import authService from './authService';

const DEFAULT_BASE_URL = '/api/manager';

/**
 * Enhanced fetch wrapper that handles:
 * 1. Automatic inclusion of auth tokens (id param)
 * 2. Standardized error handling
 * 3. Silent token refresh on 401 Unauthorized
 * 4. Automatic retry after refresh
 */
const apiClient = {
  async request(endpoint, options = {}) {
    let url = endpoint.startsWith('http') ? endpoint : `${DEFAULT_BASE_URL}${endpoint}`;
    
    // Preparation function for headers and URL with current token
    const prepareRequest = () => {
      const token = authService.getAuthToken();
      const headers = { 'accept': 'application/json', ...options.headers };
      let finalUrl = url;

      if (token) {
        const urlObj = new URL(url, window.location.origin);
        urlObj.searchParams.set('id', token);
        finalUrl = urlObj.pathname + urlObj.search;
        headers['Authorization'] = `Bearer ${token}`;
      }
      return { finalUrl, headers };
    };

    const { finalUrl, headers } = prepareRequest();

    try {
      let response = await fetch(finalUrl, { ...options, headers });

      if (response.status === 401) {
        console.warn('Authentication expired. Attempting silent refresh...');
        
        // Wait for refreshSession (which has its own lock)
        const newToken = await authService.refreshSession();
        
        if (newToken) {
          console.log('Refresh successful. Retrying original request...');
          const { finalUrl: retryUrl, headers: retryHeaders } = prepareRequest();
          return await fetch(retryUrl, { ...options, headers: retryHeaders }).then(res => this.handleResponse(res));
        } else {
          console.error('Refresh failed. Redirecting to login.');
          authService.clearSession();
          // We don't force a page reload here to avoid losing UI state if the user 
          // can just re-open a login modal, but we throw to stop the request.
          throw new Error('Session expired. Please log in again.');
        }
      }

      return await this.handleResponse(response);
    } catch (error) {
      throw error;
    }
  },

  async handleResponse(response) {
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return text; // Return raw text if not JSON but status is OK
    }

    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }

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
