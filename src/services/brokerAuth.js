import {
  getRuntimeConfigValue,
  normalizeBrokerInfo,
  resolveBrokerBackendUrl,
  resolveBrokerDefaultMt5Server,
} from '../config/backendTarget.js';
import { buildManagerApiUrl, updateDynamicEndpoints } from '../config/endpoints.js';
import { normalizeTokenExpiresAt, setSession } from './authService.js';

const BROKER_INFO_KEY = 'broker_info';
const RECENT_BROKERS_KEY = 'recent_brokers';
const PLATFORM_DISCOVERY_BASE_URL = 'https://superbackend.orrnn.com';

export const DISCOVERY_BASE_URL = PLATFORM_DISCOVERY_BASE_URL;

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
    server: 'broker-server-testorrnn',
    backend_url: 'https://testbrokerbackend.orrnn.com',
  },
  {
    broker_id: 'orrnn',
    name: 'Orrnn Broker',
    status: 'active',
    server: 'broker-server-orrnn',
    backend_url: 'https://testbrokerbackend.orrnn.com',
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
// Calls:  GET https://superbackend.orrnn.com/api/v2/broker/servers
// ---------------------------------------------------------------------------
export const fetchBrokerList = async () => {
  if (USE_MOCK_DISCOVERY) {
    // Local fallback only; set VITE_USE_MOCK_DISCOVERY=true to use it.
    return MOCK_BROKER_LIST.filter((b) => b.status === 'active').map((broker) => normalizeBrokerInfo(broker));
  }

  let response;
  try {
    response = await fetch(
      `${DISCOVERY_BASE_URL.replace(/\/+$/, '')}/api/v2/broker/servers`,
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

  // API may return array directly or wrapped: { servers: [...] } / { brokers: [...] } / { data: [...] }
  const list = Array.isArray(data) ? data : (data?.servers ?? data?.brokers ?? data?.data ?? []);
  return list
    .filter((b) => !b.status || b.status === 'active')
    .map((broker) => normalizeBrokerInfo(broker));
};

// ---------------------------------------------------------------------------
// discoverBrokerById — resolves a selected broker from the already-fetched list
// ---------------------------------------------------------------------------
export const getBrokerSelectionId = (broker = {}) =>
  broker.server || broker.server_handle || broker.handle || broker.broker_id || broker.id || '';

const HOSTNAME_DOMAIN_KEYS = [
  'domain',
  'manager_domain',
  'managerDomain',
  'manager_url',
  'managerUrl',
  'manager_host',
  'managerHost',
  'ui_domain',
  'uiDomain',
  'ui_url',
  'uiUrl',
  'frontend_domain',
  'frontendDomain',
  'frontend_url',
  'frontendUrl',
  'web_domain',
  'webDomain',
  'web_url',
  'webUrl',
  'env.DOMAIN',
  'env.MANAGER_DOMAIN',
  'env.VITE_MANAGER_DOMAIN',
  'env.UI_DOMAIN',
  'env.VITE_UI_DOMAIN',
];

const HOSTNAME_DOMAIN_ARRAY_KEYS = [
  'domains',
  'manager_domains',
  'managerDomains',
  'ui_domains',
  'uiDomains',
  'frontend_domains',
  'frontendDomains',
  'web_domains',
  'webDomains',
  'custom_domains',
  'customDomains',
  'allowed_domains',
  'allowedDomains',
];

const HOSTNAME_OBJECT_KEYS = [
  'domain',
  'hostname',
  'host',
  'url',
  'manager_domain',
  'managerDomain',
  'manager_url',
  'managerUrl',
  'ui_domain',
  'uiDomain',
  'ui_url',
  'uiUrl',
];

const getNestedValue = (source, path) => {
  if (!source || !path) return undefined;
  if (!path.includes('.')) return source[path];
  return path.split('.').reduce((value, key) => {
    if (value === undefined || value === null) return undefined;
    return value[key];
  }, source);
};

export const normalizeBrokerHostname = (value = '') => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';

  const withoutWildcard = trimmed.replace(/^\*\./, '');
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(withoutWildcard)
    ? withoutWildcard
    : `https://${withoutWildcard}`;

  try {
    return new URL(withProtocol).hostname.replace(/^\*\./, '').replace(/^www\./, '');
  } catch {
    return withoutWildcard
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');
  }
};

const collectHostnameCandidates = (value, candidates) => {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectHostnameCandidates(item, candidates));
    return;
  }

  if (typeof value === 'object') {
    HOSTNAME_OBJECT_KEYS.forEach((key) => collectHostnameCandidates(value[key], candidates));
    return;
  }

  const hostname = normalizeBrokerHostname(value);
  if (hostname) candidates.add(hostname);
};

const getBrokerHostnameCandidates = (broker = {}) => {
  const candidates = new Set();

  HOSTNAME_DOMAIN_KEYS.forEach((key) => collectHostnameCandidates(getNestedValue(broker, key), candidates));
  HOSTNAME_DOMAIN_ARRAY_KEYS.forEach((key) => collectHostnameCandidates(getNestedValue(broker, key), candidates));

  return candidates;
};

export const brokerMatchesHostname = (broker = {}, hostname = '') => {
  const currentHostname = normalizeBrokerHostname(hostname);
  if (!currentHostname) return false;

  for (const candidate of getBrokerHostnameCandidates(broker)) {
    if (currentHostname === candidate || currentHostname.endsWith(`.${candidate}`)) {
      return true;
    }
  }

  return false;
};

export const resolveDefaultBrokerSelectionId = (
  brokerList = [],
  { currentHostname = typeof window !== 'undefined' ? window.location?.hostname : '', storedBrokerId = '' } = {}
) => {
  const hostnameMatchedBroker = brokerList.find((broker) => brokerMatchesHostname(broker, currentHostname));
  if (hostnameMatchedBroker) return getBrokerSelectionId(hostnameMatchedBroker);

  const storedBroker = brokerList.find((broker) => (
    getBrokerSelectionId(broker) === storedBrokerId || broker.broker_id === storedBrokerId
  ));
  if (storedBroker) return getBrokerSelectionId(storedBroker);

  return brokerList[0] ? getBrokerSelectionId(brokerList[0]) : '';
};

export const getBrokerDisplayServerName = (broker = {}) => {
  const normalized = normalizeBrokerInfo(broker);
  return (
    broker.server_name ||
    broker.display_server_name ||
    broker.default_mt5_server ||
    broker.mt5_server ||
    normalized.server_ip ||
    resolveBrokerDefaultMt5Server(normalized, normalized.backend_url) ||
    broker.server_url ||
    broker.broker_name ||
    broker.name ||
    broker.display_name ||
    broker.broker_id ||
    broker.id ||
    getBrokerSelectionId(broker)
  );
};

export const discoverBrokerById = (brokerList, brokerId) => {
  const found = brokerList.find((b) => getBrokerSelectionId(b) === brokerId || b.broker_id === brokerId);
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
  const serverHandle = server || getBrokerSelectionId(resolvedBrokerInfo);
  if (!backendUrl) throw new Error('Broker backend URL is not configured.');
  if (!serverHandle) throw new Error('Broker server handle is not configured.');
  saveBrokerInfo(resolvedBrokerInfo);
  try {
    return await postJson(
      buildManagerApiUrl('/api/v2/auth/login'),
      { user, password, server: serverHandle }
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
      buildManagerApiUrl('/api/v2/admin/login'),
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
  const accessToken = authData?.token || authData?.access_token || authData?.session_token;
  const refreshToken = authData?.refresh_token || accessToken;
  const tokenExpiresAt = normalizeTokenExpiresAt(
    authData?.expires_at || authData?.expiresAt || authData?.token_expires_at,
    authData?.expires_in || authData?.expiresIn
  );
  const auth = {
    ...authData,
    token: accessToken,
    refresh_token: refreshToken,
    tokenExpiresAt,
    broker_id: authData?.broker_id || brokerInfo?.broker_id,
  };

  return setSession(auth);
};
