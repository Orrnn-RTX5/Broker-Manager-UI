import {
  getRuntimeConfigValue,
  isTestBrokerInfo,
  normalizeBrokerInfo,
  resolveBrokerBackendUrl,
  resolveBrokerDefaultMt5Server,
  TEST_BROKER_PUBLIC_BACKEND_URL,
  TEST_BROKER_DIRECT_HOST,
  TEST_BROKER_DIRECT_PORT,
  TEST_BROKER_WS_URL,
  TEST_BROKER_FEED_STATUS_URL,
  TEST_BROKER_DEFAULT_MT5_SERVER,
} from '../config/backendTarget.js';
import {
  buildManagerApiUrl,
  shouldUseManagerDevProxy,
  updateDynamicEndpoints,
} from '../config/endpoints.js';
import { normalizeTokenExpiresAt, setSession } from './authService.js';
import { MANAGER_API } from '../config/managerApiContract.js';

const BROKER_INFO_KEY = 'broker_info';
const RECENT_BROKERS_KEY = 'recent_brokers';
const PLATFORM_DISCOVERY_BASE_URL = 'https://superbackend.orrnn.com';

export const DISCOVERY_BASE_URL = getRuntimeConfigValue(
  ['DISCOVERY_BASE_URL', 'VITE_DISCOVERY_BASE_URL'],
  PLATFORM_DISCOVERY_BASE_URL
);

// Set VITE_USE_MOCK_DISCOVERY=true in .env only when local mock data is needed.
const USE_MOCK_DISCOVERY = getRuntimeConfigValue(['USE_MOCK_DISCOVERY', 'VITE_USE_MOCK_DISCOVERY'], 'false') === 'true';

export const TEST_BROKER_DEFAULT_ENTRY = {
  broker_id: 'TEST',
  name: 'TEST',
  broker_name: 'TEST',
  status: 'active',
  server: 'fxtrustbrokerbackend.orrnn.com:443',
  backend_url: TEST_BROKER_PUBLIC_BACKEND_URL,
  server_url: TEST_BROKER_PUBLIC_BACKEND_URL,
  market_api_url: TEST_BROKER_PUBLIC_BACKEND_URL,
  server_ip: TEST_BROKER_DIRECT_HOST,
  server_port: TEST_BROKER_DIRECT_PORT,
  ws_url: TEST_BROKER_WS_URL,
  feed_ws_url: TEST_BROKER_WS_URL,
  feed_status_url: TEST_BROKER_FEED_STATUS_URL,
  default_mt5_server: TEST_BROKER_DEFAULT_MT5_SERVER,
};

// ---------------------------------------------------------------------------
// Mock broker list — mirrors what the real /api/v2/broker/servers returns.
// ---------------------------------------------------------------------------
export const MOCK_BROKER_LIST = [
  TEST_BROKER_DEFAULT_ENTRY,
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

export const buildBrokerDiscoveryUrl = (useDevProxy = shouldUseManagerDevProxy()) => {
  const path = '/api/v2/broker/servers';
  // Vite forwards this same-origin path to DISCOVERY_BASE_URL in local web
  // development. Production continues to use the configured public host.
  if (useDevProxy) return `/discovery-api${path}`;
  return `${DISCOVERY_BASE_URL.replace(/\/+$/, '')}${path}`;
};

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
      buildBrokerDiscoveryUrl(),
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
  const normalized = list
    .filter((b) => !b.status || b.status === 'active')
    .map((broker) => normalizeBrokerInfo(broker));

  const runtimeBrokerId = String(getRuntimeBrokerId() || '').trim().toLowerCase();
  const wantsTestBroker = runtimeBrokerId === 'test' || runtimeBrokerId === 'test-broker';
  const usable = normalized.filter((broker) => !isOpaqueLocalTestBroker(broker));
  const hasTestBroker = usable.some((broker) => isTestBrokerInfo(broker));
  if (!hasTestBroker && (wantsTestBroker || normalized.length === 0 || normalized.some((broker) => isTestBrokerInfo(broker)))) {
    usable.push(normalizeBrokerInfo(TEST_BROKER_DEFAULT_ENTRY));
  }

  return usable;
};

// ---------------------------------------------------------------------------
// discoverBrokerById — resolves a selected broker from the already-fetched list
// ---------------------------------------------------------------------------
export const getBrokerSelectionId = (broker = {}) =>
  broker.server || broker.server_handle || broker.handle || broker.broker_id || broker.id || '';

const isOpaqueBrokerServerHandle = (value = '') => /^broker-server-\d+$/i.test(String(value || '').trim());

const hasPublicBrokerBackend = (broker = {}) =>
  [broker.server_url, broker.backend_url, broker.market_api_url, broker.api_url]
    .some((value) => /^https:\/\//i.test(String(value || '').trim()));

const isOpaqueLocalTestBroker = (broker = {}) =>
  isTestBrokerInfo(broker) && isOpaqueBrokerServerHandle(getBrokerSelectionId(broker));

const pickPreferredBrokerMatch = (matches = []) => {
  if (matches.length <= 1) return matches[0];
  return (
    matches.find((broker) => hasPublicBrokerBackend(broker) && !isOpaqueBrokerServerHandle(getBrokerSelectionId(broker)))
    || matches.find((broker) => !isOpaqueBrokerServerHandle(getBrokerSelectionId(broker)))
    || matches[0]
  );
};

const HOSTNAME_DOMAIN_KEYS = [
  'domain',
  'domain_name',
  'domainName',
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
  'server_domain',
  'serverDomain',
  'server_url',
  'serverUrl',
  'services_domain',
  'servicesDomain',
  'service_domain',
  'serviceDomain',
  'backend_url',
  'backendUrl',
  'api_url',
  'apiUrl',
  'market_api_url',
  'marketApiUrl',
  'webterminal_domain',
  'webterminalDomain',
  'env.DOMAIN',
  'env.MANAGER_DOMAIN',
  'env.VITE_MANAGER_DOMAIN',
  'env.UI_DOMAIN',
  'env.VITE_UI_DOMAIN',
  'env.API_HOST',
  'env.VITE_API_HOST',
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
  'domain_name',
  'domainName',
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
  'server',
  'server_domain',
  'serverDomain',
  'services',
  'services_domain',
  'servicesDomain',
  'service_domain',
  'serviceDomain',
  'backend',
  'backend_url',
  'backendUrl',
  'api',
  'api_url',
  'apiUrl',
  'webterminal',
  'webterminal_domain',
  'webterminalDomain',
];

const RUNTIME_BROKER_ID_KEYS = [
  'FEED_BROKER_ID',
  'VITE_FEED_BROKER_ID',
  'BROKER_ID',
  'VITE_BROKER_ID',
];

const RUNTIME_HOSTNAME_KEYS = [
  'API_HOST',
  'VITE_API_HOST',
  'API_HOST_EXT',
  'VITE_API_HOST_EXT',
  'WS_HOST',
  'VITE_WS_HOST',
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

const normalizeSelectionValue = (value = '') => String(value || '').trim().toLowerCase();

const brokerMatchesSelectionId = (broker = {}, selectionId = '') => {
  const normalizedSelectionId = normalizeSelectionValue(selectionId);
  if (!normalizedSelectionId) return false;

  return [
    getBrokerSelectionId(broker),
    broker.broker_id,
    broker.id,
    broker.slug,
    broker.handle,
    broker.server_handle,
  ].some((candidate) => normalizeSelectionValue(candidate) === normalizedSelectionId);
};

const getRuntimeBrokerId = () => getRuntimeConfigValue(RUNTIME_BROKER_ID_KEYS);

const getRuntimeHostnames = () => RUNTIME_HOSTNAME_KEYS
  .map((key) => getRuntimeConfigValue([key]))
  .filter(Boolean);

const createBrokerSelectionResult = (broker, source, locked = false) => ({
  broker,
  brokerId: broker ? getBrokerSelectionId(broker) : '',
  source,
  locked,
});

export const resolveDefaultBrokerSelectionId = (
  brokerList = [],
  {
    currentHostname = typeof window !== 'undefined' ? window.location?.hostname : '',
    runtimeBrokerId = getRuntimeBrokerId(),
    runtimeHostnames = getRuntimeHostnames(),
    storedBrokerId = '',
  } = {}
) => resolveBrokerSelection(brokerList, {
  currentHostname,
  runtimeBrokerId,
  runtimeHostnames,
  storedBrokerId,
}).brokerId;

export const resolveInteractiveBrokerSelection = (
  brokerList = [],
  {
    storedBrokerId = '',
    recentBrokerIds = [],
  } = {}
) => {
  const storedBroker = brokerList.find((broker) => brokerMatchesSelectionId(broker, storedBrokerId));
  if (storedBroker) return createBrokerSelectionResult(storedBroker, 'stored-broker', false);

  const recentIds = Array.isArray(recentBrokerIds) ? recentBrokerIds : [];
  for (const brokerId of recentIds) {
    const recentBroker = brokerList.find((broker) => brokerMatchesSelectionId(broker, brokerId));
    if (recentBroker) return createBrokerSelectionResult(recentBroker, 'recent-broker', false);
  }

  return createBrokerSelectionResult(brokerList[0], brokerList[0] ? 'first-broker' : 'none', false);
};

export const resolveBrokerSelection = (
  brokerList = [],
  {
    currentHostname = typeof window !== 'undefined' ? window.location?.hostname : '',
    runtimeBrokerId = getRuntimeBrokerId(),
    runtimeHostnames = getRuntimeHostnames(),
    storedBrokerId = '',
  } = {}
) => {
  const runtimeBroker = pickPreferredBrokerMatch(
    brokerList.filter((broker) => brokerMatchesSelectionId(broker, runtimeBrokerId))
  );
  if (runtimeBroker) return createBrokerSelectionResult(runtimeBroker, 'runtime-broker-id', true);

  const hostnameMatchedBroker = brokerList.find((broker) => brokerMatchesHostname(broker, currentHostname));
  if (hostnameMatchedBroker) return createBrokerSelectionResult(hostnameMatchedBroker, 'hostname', true);

  const runtimeHostnameMatchedBroker = brokerList.find((broker) => (
    runtimeHostnames.some((hostname) => brokerMatchesHostname(broker, hostname))
  ));
  if (runtimeHostnameMatchedBroker) return createBrokerSelectionResult(runtimeHostnameMatchedBroker, 'runtime-hostname', true);

  const storedBroker = brokerList.find((broker) => brokerMatchesSelectionId(broker, storedBrokerId));
  if (storedBroker) return createBrokerSelectionResult(storedBroker, 'stored-broker', false);

  return createBrokerSelectionResult(brokerList[0], brokerList[0] ? 'first-broker' : 'none', false);
};

export const getBrokerDisplayServerName = (broker = {}) => {
  const normalized = normalizeBrokerInfo(broker);
  // Opaque discovery handles belong in the login payload, not the server label.
  return [
    broker.server_name,
    broker.display_server_name,
    broker.default_mt5_server,
    broker.mt5_server,
    normalized.server_ip,
    resolveBrokerDefaultMt5Server(normalized, normalized.backend_url),
    broker.server_url,
    broker.broker_name,
    broker.name,
    broker.display_name,
    broker.broker_id,
    broker.id,
  ].find((value) => value && !isOpaqueBrokerServerHandle(value)) || '';
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
      buildManagerApiUrl(MANAGER_API.login),
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
