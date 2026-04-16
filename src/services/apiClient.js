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
    
    // Ensure 'id' parameter is present in the URL for MT5 compatibility
    const token = authService.getAuthToken();
    if (token) {
      const urlObj = new URL(url, window.location.origin);
      if (!urlObj.searchParams.has('id')) {
        urlObj.searchParams.set('id', token);
      }
      url = urlObj.pathname + urlObj.search;
    }

    const headers = {
      'accept': 'application/json',
      ...options.headers,
    };

    // Also include Bearer token in headers as recommended by Swagger
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let response = await fetch(url, { ...options, headers });

      // Handle 401 Unauthorized (Token Expired)
      if (response.status === 401) {
        console.warn('Authentication expired. Attempting silent refresh...');
        
        const newToken = await authService.refreshSession();
        
        if (newToken) {
          console.log('Refresh successful. Retrying original request...');
          
          // Update URL with NEW token
          const urlObj = new URL(url, window.location.origin);
          urlObj.searchParams.set('id', newToken);
          const retryUrl = urlObj.pathname + urlObj.search;
          
          // Update Headers with NEW token
          const retryHeaders = {
            ...headers,
            'Authorization': `Bearer ${newToken}`
          };
          
          // Retry the request
          return await fetch(retryUrl, { ...options, headers: retryHeaders }).then(res => this.handleResponse(res));
        } else {
          // Refresh failed, trigger logout
          console.error('Refresh failed. Redirecting to login.');
          authService.clearSession();
          window.location.href = '/'; // Simple redirect for now
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
