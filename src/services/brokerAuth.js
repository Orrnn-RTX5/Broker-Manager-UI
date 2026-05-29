const BROKER_INFO_KEY = 'broker_info';
const AUTH_KEY = 'auth';
const RECENT_BROKERS_KEY = 'recent_brokers';
const ADMIN_LOGIN_PORT = 8091;

export const DISCOVERY_BASE_URL =
  import.meta.env.VITE_DISCOVERY_BASE_URL || 'https://superbackend.orrnn.com';

// Set VITE_USE_MOCK_DISCOVERY=true in .env only when local mock data is needed.
const USE_MOCK_DISCOVERY = import.meta.env.VITE_USE_MOCK_DISCOVERY === 'true';

// ---------------------------------------------------------------------------
// Mock broker list — mirrors what the real /api/v2/broker/servers returns.
// ---------------------------------------------------------------------------
const MOCK_BROKER_LIST = [
  {
    broker_id: 'testorrnn',
    name: 'Test Orrnn Broker (Demo)',
    status: 'active',
    backend_url: 'https://testbrokerbackend.orrnn.com',
    server_ip: 'testbrokerbackend.orrnn.com',
    server_port: 443,
  },
  {
    broker_id: 'orrnn',
    name: 'Orrnn Broker',
    status: 'active',
    backend_url: 'https://testbrokerbackend.orrnn.com',
    server_ip: 'testbrokerbackend.orrnn.com',
    server_port: 443,
  },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');

const isIpAddress = (host) => {
  return /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host);
};

const convertToHttpForIp = (url) => {
  try {
    const urlObj = new URL(url);
    if (isIpAddress(urlObj.host)) {
      urlObj.protocol = urlObj.protocol === 'https:' ? 'http:' : urlObj.protocol === 'wss:' ? 'ws:' : urlObj.protocol;
      urlObj.port = '';
      return urlObj.toString();
    }
    return url;
  } catch {
    return url;
  }
};

const buildBackendUrl = (info) => {
  const explicitUrl = info.backend_url || info.api_url || info.server_url;
  if (explicitUrl) return trimTrailingSlash(explicitUrl);

  const host = info.server_ip || info.host;
  if (!host) return '';

  if (/^https?:\/\//i.test(host)) return trimTrailingSlash(host);

  const port = Number(info.server_port);
  const protocol = info.protocol || (isIpAddress(host) ? 'http' : (port === 443 ? 'https' : 'http'));
  const portSuffix = port && ![80, 443].includes(port) ? `:${port}` : '';

  return `${protocol}://${host}${portSuffix}`;
};

const normalizeBrokerInfo = (info) => {
  let backend_url = buildBackendUrl(info);
  backend_url = convertToHttpForIp(backend_url);

  return {
    ...info,
    broker_id: info.broker_id,
    name: info.name || info.broker_name || info.broker_id,
    status: info.status || 'active',
    backend_url,
    server_ip: info.server_ip || getServerFromBackend(backend_url),
  };
};

const getServerFromBackend = (backendUrl) => {
  try {
    return new URL(backendUrl).host;
  } catch {
    return backendUrl || '';
  }
};

const readJson = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const getResponseMessage = (data) =>
  data?.error?.message ||
  data?.error ||
  data?.message ||
  data?.detail ||
  data?.title ||
  '';

const withAdminPort = (backendUrl = '') => {
  const trimmed = trimTrailingSlash(backendUrl);
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (!url.port || url.port === '443') {
      url.port = String(ADMIN_LOGIN_PORT);
    }
    return trimTrailingSlash(url.toString());
  } catch {
    return trimmed.replace(/:443(?=\/|$)/, `:${ADMIN_LOGIN_PORT}`);
  }
};

// ---------------------------------------------------------------------------
// fetchBrokerList — returns array of broker objects (name + id only shown in UI)
// Calls:  GET {DISCOVERY_BASE_URL}/api/v1/broker/servers
// ---------------------------------------------------------------------------
export const fetchBrokerList = async () => {
  if (USE_MOCK_DISCOVERY) {
    // Local fallback only; set VITE_USE_MOCK_DISCOVERY=true to use it.
    return MOCK_BROKER_LIST.filter((b) => b.status === 'active').map(normalizeBrokerInfo);
  }

  let response;
  try {
    response = await fetch(
      `${DISCOVERY_BASE_URL.replace(/\/+$/, '')}/api/v1/broker/servers`,
      {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      }
    );
  } catch {
    throw new Error('Cannot reach platform. Try again.');
  }

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(getResponseMessage(data) || 'Failed to load broker list.');
  }

  // API may return array directly or wrapped: { brokers: [...] } / { data: [...] }
  const list = Array.isArray(data) ? data : (data?.brokers ?? data?.data ?? []);
  return list
    .filter((b) => !b.status || b.status === 'active')
    .map(normalizeBrokerInfo);
};

// ---------------------------------------------------------------------------
// discoverBrokerById — resolves a selected broker from the already-fetched list
// ---------------------------------------------------------------------------
export const discoverBrokerById = (brokerList, brokerId) => {
  const found = brokerList.find((b) => b.broker_id === brokerId);
  if (!found) throw new Error('Broker not found');
  if (found.status && found.status !== 'active') {
    throw new Error(`Broker is ${found.status}. Contact support.`);
  }
  return found;
};

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
export const normalizeBrokerId = (value) => value.trim().toLowerCase();

const postJson = async (url, body) => {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Connection failed');
  }

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(getResponseMessage(data) || `HTTP ${response.status}`);
  }

  return data || {};
};

export const loginManager = async (brokerInfo, { user, password, server }) => {
  try {
    return await postJson(
      `${brokerInfo.backend_url.replace(/\/+$/, '')}/api/v2/auth/login`,
      { user, password, server }
    );
  } catch (error) {
    throw new Error(mapManagerLoginError(error.message));
  }
};

export const loginAdmin = async (brokerInfo, { user, password }) => {
  try {
    return await postJson(
      `${brokerInfo.backend_url.replace(/\/+$/, '')}/api/v2/admin/login`,
      { user, password }
    );
  } catch (error) {
    throw new Error(mapAdminLoginError(error.message));
  }
};

const mapManagerLoginError = (message = '') => {
  if (message.includes('Account is disabled')) {
    return 'Your account is disabled. Contact your broker admin.';
  }
  if (message.includes('Invalid login or password')) {
    return 'Wrong login or password.';
  }
  if (message.includes('Account temporarily locked')) return message;
  if (message.includes('Broker license')) return message;
  if (message.includes('Server not authorized')) {
    return 'Server mismatch - please switch broker.';
  }
  return message || 'Login failed.';
};

const mapAdminLoginError = (message = '') => {
  if (message.includes('Invalid credentials')) {
    return 'Wrong login or password, or account is not an admin.';
  }
  return message || 'Login failed.';
};

import { updateDynamicEndpoints } from '../config/endpoints';

export const getBrokerInfo = () => {
  try {
    const raw = sessionStorage.getItem(BROKER_INFO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setBrokerInfo = (brokerInfo) => {
  const normalized = normalizeBrokerInfo(brokerInfo);
  sessionStorage.setItem(BROKER_INFO_KEY, JSON.stringify(normalized));
  updateDynamicEndpoints();
};

export const clearBrokerInfo = () => {
  sessionStorage.removeItem(BROKER_INFO_KEY);
  updateDynamicEndpoints();
};

export const getRecentBrokers = () => {
  try {
    const raw = localStorage.getItem(RECENT_BROKERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
};

export const rememberBroker = (brokerId) => {
  const normalized = normalizeBrokerId(brokerId);
  const next = [normalized, ...getRecentBrokers().filter((id) => id !== normalized)].slice(0, 5);
  localStorage.setItem(RECENT_BROKERS_KEY, JSON.stringify(next));
  return next;
};

export const setAuthSession = (authData, brokerInfo) => {
  const auth = {
    ...authData,
    broker_id: authData?.broker_id || brokerInfo?.broker_id,
  };

  sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth));

  if (auth.token) localStorage.setItem('authToken', auth.token);
  if (auth.refresh_token) localStorage.setItem('refreshToken', auth.refresh_token);
  if (auth.login) localStorage.setItem('brokerLogin', String(auth.login));
  if (auth.broker_id) localStorage.setItem('brokerId', auth.broker_id);

  return auth;
};
