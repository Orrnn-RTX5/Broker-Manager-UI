import { getRuntimeConfigValue, normalizeBrokerInfo, resolveBrokerBackendUrl } from '../config/backendTarget';
import { updateDynamicEndpoints } from '../config/endpoints';

const BROKER_INFO_KEY = 'broker_info';
const AUTH_KEY = 'auth';
const RECENT_BROKERS_KEY = 'recent_brokers';

export const DISCOVERY_BASE_URL =
  getRuntimeConfigValue(['DISCOVERY_BASE_URL', 'VITE_DISCOVERY_BASE_URL'], 'https://superbackend.orrnn.com');

// Set VITE_USE_MOCK_DISCOVERY=true in .env only when local mock data is needed.
const USE_MOCK_DISCOVERY = getRuntimeConfigValue(['USE_MOCK_DISCOVERY', 'VITE_USE_MOCK_DISCOVERY'], 'false') === 'true';

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

// ---------------------------------------------------------------------------
// fetchBrokerList — returns array of broker objects (name + id only shown in UI)
// Calls:  GET {DISCOVERY_BASE_URL}/api/v1/broker/servers
// ---------------------------------------------------------------------------
export const fetchBrokerList = async () => {
  if (USE_MOCK_DISCOVERY) {
    // Local fallback only; set VITE_USE_MOCK_DISCOVERY=true to use it.
    return MOCK_BROKER_LIST.filter((b) => b.status === 'active').map((broker) => normalizeBrokerInfo(broker));
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
    .map((broker) => normalizeBrokerInfo(broker));
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

const saveBrokerInfo = (brokerInfo) => {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(BROKER_INFO_KEY, JSON.stringify(brokerInfo));
  }
  if (typeof localStorage !== 'undefined' && localStorage.getItem(BROKER_INFO_KEY)) {
    localStorage.setItem(BROKER_INFO_KEY, JSON.stringify(brokerInfo));
  }
  updateDynamicEndpoints();
};

export const loginManager = async (brokerInfo, { user, password, server }) => {
  const resolvedBrokerInfo = normalizeBrokerInfo(brokerInfo);
  const backendUrl = resolveBrokerBackendUrl(resolvedBrokerInfo);
  if (!backendUrl) throw new Error('Broker backend URL is not configured.');
  saveBrokerInfo(resolvedBrokerInfo);
  try {
    return await postJson(
      `${backendUrl.replace(/\/+$/, '')}/api/v2/auth/login`,
      { user, password, server }
    );
  } catch (error) {
    throw new Error(mapManagerLoginError(error.message));
  }
};

export const loginAdmin = async (brokerInfo, { user, password }) => {
  const resolvedBrokerInfo = normalizeBrokerInfo(brokerInfo);
  const backendUrl = resolveBrokerBackendUrl(resolvedBrokerInfo);
  if (!backendUrl) throw new Error('Broker backend URL is not configured.');
  saveBrokerInfo(resolvedBrokerInfo);
  try {
    return await postJson(
      `${backendUrl.replace(/\/+$/, '')}/api/v2/admin/login`,
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

export const getBrokerInfo = () => {
  try {
    const raw = sessionStorage.getItem(BROKER_INFO_KEY);
    if (!raw) return null;
    const normalized = normalizeBrokerInfo(JSON.parse(raw));
    saveBrokerInfo(normalized);
    return normalized;
  } catch {
    return null;
  }
};

export const setBrokerInfo = (brokerInfo) => {
  saveBrokerInfo(normalizeBrokerInfo(brokerInfo));
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
