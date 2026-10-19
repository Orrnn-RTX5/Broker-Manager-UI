import {
  getRuntimeConfigValue,
  getDeploymentRuntimeConfig,
  normalizeBrokerInfo,
  resolveBrokerDefaultMt5Server,
  resolveBrokerBackendUrl,
  resolveBrokerExtApiUrl,
  resolveBrokerWsUrl,
  isDirectBrokerBackendUrl,
  trimTrailingSlash,
} from './backendTarget.js';

// Central place for all network endpoints.
// Components should import from here instead of hardcoding a host.

const DEFAULTS = {
  API_HOST: trimTrailingSlash(getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST'])),
  WS_HOST: trimTrailingSlash(getRuntimeConfigValue(['WS_HOST', 'VITE_WS_HOST'])),
  API_HOST_EXT: trimTrailingSlash(getRuntimeConfigValue(['API_HOST_EXT', 'VITE_API_HOST_EXT'])),
  DEFAULT_MT5_SERVER: getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER']),
};

const WS_FEED_PATH = trimTrailingSlash(getRuntimeConfigValue(['WS_FEED_PATH', 'VITE_WS_FEED_PATH'], '/ws/feed'));
const getPinnedBrokerId = () => getRuntimeConfigValue(
  ['BROKER_ID', 'VITE_BROKER_ID', 'FEED_BROKER_ID', 'VITE_FEED_BROKER_ID']
).toLowerCase();
const hasPinnedApiHost = () => Boolean(
  getPinnedBrokerId() && getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST'])
);

export let API_HOST = DEFAULTS.API_HOST;
export let WS_HOST = DEFAULTS.WS_HOST;
export let API_HOST_EXT = DEFAULTS.API_HOST_EXT;
export let DEFAULT_MT5_SERVER = DEFAULTS.DEFAULT_MT5_SERVER;

const readBrokerInfo = () => {
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem('broker_info');
    const brokerInfo = raw ? JSON.parse(raw) : null;
    const storedBrokerId = String(brokerInfo?.broker_id || brokerInfo?.id || '').toLowerCase();
    const pinnedBrokerId = getPinnedBrokerId();
    return (pinnedBrokerId && storedBrokerId !== pinnedBrokerId)
      || (getDeploymentRuntimeConfig() && !pinnedBrokerId) ? null : brokerInfo;
  } catch {
    return null;
  }
};

const writeBrokerInfo = (brokerInfo) => {
  if (!brokerInfo || typeof sessionStorage === 'undefined') return;

  sessionStorage.setItem('broker_info', JSON.stringify(brokerInfo));

  if (typeof localStorage !== 'undefined' && localStorage.getItem('broker_info')) {
    localStorage.setItem('broker_info', JSON.stringify(brokerInfo));
  }
};

const withProtocol = (value = '') => (/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`);

const buildWsHost = (backendUrl = '') => {
  const trimmed = trimTrailingSlash(backendUrl);
  if (!trimmed) return '';

  try {
    const url = new URL(withProtocol(trimmed));
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return trimTrailingSlash(url.toString());
  } catch {
    return trimmed.replace(/^https?:/i, (protocol) =>
      protocol.toLowerCase() === 'https:' ? 'wss:' : 'ws:'
    );
  }
};

const getWsBaseHost = (wsEndpoint = '') => {
  try {
    const url = new URL(wsEndpoint);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return trimTrailingSlash(url.toString());
  } catch {
    return '';
  }
};

export const updateDynamicEndpoints = () => {
  const configuredApiHost = trimTrailingSlash(getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']));
  if (getDeploymentRuntimeConfig() || (getPinnedBrokerId() && configuredApiHost)) {
    const configuredWsHost = trimTrailingSlash(getRuntimeConfigValue(['WS_HOST', 'VITE_WS_HOST']));
    API_HOST = configuredApiHost;
    WS_HOST = getWsBaseHost(configuredWsHost) || buildWsHost(configuredApiHost);
    API_HOST_EXT = trimTrailingSlash(getRuntimeConfigValue(['API_HOST_EXT', 'VITE_API_HOST_EXT'])) || configuredApiHost;
    DEFAULT_MT5_SERVER = getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER']);
    return;
  }

  try {
    const storedInfo = readBrokerInfo();
    const brokerInfo = storedInfo ? normalizeBrokerInfo(storedInfo, DEFAULTS.API_HOST) : {};
    const backendUrl = resolveBrokerBackendUrl(brokerInfo, DEFAULTS.API_HOST);

    if (backendUrl) {
      if (storedInfo) writeBrokerInfo(brokerInfo);
      API_HOST = backendUrl;
      API_HOST_EXT = resolveBrokerExtApiUrl(brokerInfo, DEFAULTS.API_HOST_EXT || backendUrl) || DEFAULTS.API_HOST_EXT || backendUrl;
      const feedUrl = resolveBrokerWsUrl(brokerInfo, DEFAULTS.WS_HOST || backendUrl, WS_FEED_PATH);
      WS_HOST = getWsBaseHost(feedUrl) || buildWsHost(backendUrl);
      DEFAULT_MT5_SERVER = resolveBrokerDefaultMt5Server(brokerInfo, backendUrl);
      return;
    }
  } catch (error) {
    console.error('Error updating dynamic endpoints:', error);
  }

  API_HOST = DEFAULTS.API_HOST;
  WS_HOST = getWsBaseHost(DEFAULTS.WS_HOST) || buildWsHost(DEFAULTS.API_HOST);
  API_HOST_EXT = DEFAULTS.API_HOST_EXT || DEFAULTS.API_HOST;
  DEFAULT_MT5_SERVER = DEFAULTS.DEFAULT_MT5_SERVER;
};

updateDynamicEndpoints();

const joinUrl = (base, path = '') => {
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path || '';

  const normalizedPath = String(path || '');
  if (!normalizedPath) return trimTrailingSlash(base);

  return `${trimTrailingSlash(base)}/${normalizedPath.replace(/^\/+/, '')}`;
};

// In Vite dev mode the page is always served by the dev server itself, so the
// same-origin proxies (/discovery-api, /api, /ext-api, /ws/feed) exist on
// whatever origin the browser used to open it: localhost, the LAN IP shown as
// "Network:" by Vite, or any tunnel host (Cloudflare, ngrok, Dev Tunnels, ...).
// Only non-http(s) origins (e.g. file:// in packaged Electron) cannot proxy.
const isProxyableDevOrigin = () => {
  if (typeof window === 'undefined' || !window.location?.origin) return false;
  try {
    const url = new URL(window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return Boolean(url.hostname);
  } catch {
    return false;
  }
};

export const shouldUseManagerDevProxy = (
  isDev = import.meta.env?.DEV === true,
  isProxyableOrigin = isProxyableDevOrigin()
) => {
  const explicit = getRuntimeConfigValue([
    'MANAGER_USE_DEV_PROXY',
    'VITE_MANAGER_USE_DEV_PROXY',
  ], 'false');

  return isDev && isProxyableOrigin && explicit.toLowerCase() === 'true';
};

export const shouldUseManagerProxyPrefix = (backendUrl = '', brokerInfo = {}) => {
  const stripManagerPrefix = getRuntimeConfigValue([
    'MANAGER_PROXY_STRIP_MANAGER_PREFIX',
    'VITE_MANAGER_PROXY_STRIP_MANAGER_PREFIX',
  ]).toLowerCase() === 'true';

  return !stripManagerPrefix && !isDirectBrokerBackendUrl(backendUrl, brokerInfo);
};

// Versioned API routes are owned by the broker backend itself. They must not
// receive the legacy `/manager` prefix used by the older Manager endpoints.
const isNativeApiPath = (path = '') => (
  /^\/api\/v\d+(?:\/|\?|$)/i.test(path) ||
  /^\/reports\/v\d+(?:\/|\?|$)/i.test(path)
);

export const buildManagerApiPath = (endpoint = '', useProxyPrefix = true) => {
  const raw = String(endpoint || '');
  const path = raw
    .replace(/^\/api\/manager(?=\/|\?|$)/, '')
    .replace(/^\/manager(?=\/|\?|$)/, '');

  if (isNativeApiPath(path)) return path;

  if (useProxyPrefix) {
    return path
      ? `/manager${path.startsWith('/') || path.startsWith('?') ? path : `/${path}`}`
      : '/manager';
  }

  if (!path) return '';
  return path.startsWith('/') || path.startsWith('?') ? path : `/${path}`;
};

export const buildManagerApiUrl = (endpoint = '') => {
  const raw = String(endpoint || '');
  if (/^https?:\/\//i.test(raw)) return raw;

  updateDynamicEndpoints();

  const storedInfo = readBrokerInfo();
  const brokerInfo = storedInfo ? normalizeBrokerInfo(storedInfo, DEFAULTS.API_HOST) : {};
  const useProxyPrefix = shouldUseManagerProxyPrefix(API_HOST, brokerInfo);
  const managerPath = buildManagerApiPath(raw, useProxyPrefix);

  if (shouldUseManagerDevProxy()) {
    if (isNativeApiPath(managerPath)) return managerPath;
    const rootPath = buildManagerApiPath(raw, false);
    return `/api/manager${rootPath}`;
  }

  return joinUrl(API_HOST, managerPath);
};

export const buildBrokerApiUrl = (endpoint = '') => {
  const raw = String(endpoint || '');
  if (/^https?:\/\//i.test(raw)) return raw;

  updateDynamicEndpoints();
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return shouldUseManagerDevProxy() ? path : joinUrl(API_HOST, path);
};

export const buildExtApiUrl = (endpoint = '') => {
  const raw = String(endpoint || '');
  if (/^https?:\/\//i.test(raw)) return raw;

  updateDynamicEndpoints();

  const path = raw.replace(/^\/ext-api(?=\/|\?|$)/, '');
  const extPath = path
    ? path.startsWith('/') || path.startsWith('?') ? path : `/${path}`
    : '';

  if (shouldUseManagerDevProxy()) return `/ext-api${extPath}`;
  return API_HOST_EXT ? joinUrl(API_HOST_EXT, extPath) : `/ext-api${extPath}`;
};

const getNestedValue = (source, key) => {
  if (!source || !key) return '';
  const direct = source[key];
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
    return String(direct).trim();
  }
  if (!key.includes('.')) return '';
  const nested = key.split('.').reduce((value, part) => {
    if (value === undefined || value === null) return undefined;
    return value[part];
  }, source);
  return nested !== undefined && nested !== null && String(nested).trim() !== ''
    ? String(nested).trim()
    : '';
};

const firstValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
};

const firstBrokerValue = (brokerInfo, keys) => {
  for (const key of keys) {
    const value = getNestedValue(brokerInfo, key);
    if (value) return value;
  }
  return '';
};

const FEED_BROKER_ID_KEYS = [
  'feed_broker_id',
  'feedBrokerId',
  'ws_broker_id',
  'wsBrokerId',
  'broker_id',
  'id',
  'env.FEED_BROKER_ID',
  'env.VITE_FEED_BROKER_ID',
  'env.BROKER_ID',
  'env.VITE_BROKER_ID',
];

const FEED_STATUS_URL_KEYS = [
  'web_feed_status_https_url',
  'webFeedStatusHttpsUrl',
  'feed_status_https_url',
  'feedStatusHttpsUrl',
  'web_feed_status_url',
  'webFeedStatusUrl',
  'feed_status_url',
  'feedStatusUrl',
  'env.FEED_STATUS_URL',
  'env.VITE_FEED_STATUS_URL',
];

export const resolveFeedBrokerId = (brokerInfo = {}) => {
  const configured = getRuntimeConfigValue(['FEED_BROKER_ID', 'VITE_FEED_BROKER_ID', 'BROKER_ID', 'VITE_BROKER_ID']);
  return getDeploymentRuntimeConfig()
    ? configured
    : firstValue(firstBrokerValue(brokerInfo, FEED_BROKER_ID_KEYS), configured);
};

export const shouldUseFeedDevProxy = (
  isDev = import.meta.env?.DEV === true,
  isProxyableOrigin = isProxyableDevOrigin()
) => {
  const explicit = getRuntimeConfigValue(['FEED_USE_DEV_PROXY', 'VITE_FEED_USE_DEV_PROXY'], 'true');
  return isDev && explicit !== 'false' && isProxyableOrigin;
};

export const toLocalDevFeedProxyUrl = (
  feedUrl = '',
  useProxy = shouldUseFeedDevProxy(),
  localOrigin = typeof window !== 'undefined' ? window.location?.origin : ''
) => {
  if (!useProxy || !localOrigin) return feedUrl;

  try {
    const upstream = new URL(feedUrl);
    const local = new URL(localOrigin);
    local.pathname = upstream.pathname;
    local.search = upstream.search;
    local.hash = '';
    return local.toString();
  } catch {
    return feedUrl;
  }
};

const normalizeFeedStatusUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol === 'wss:') url.protocol = 'https:';
    if (url.protocol === 'ws:') url.protocol = 'http:';
    if (!/\/status\/?$/i.test(url.pathname)) {
      url.pathname = `${trimTrailingSlash(url.pathname || WS_FEED_PATH)}/status`;
    }
    url.search = '';
    url.hash = '';
    return trimTrailingSlash(url.toString());
  } catch {
    const withoutTrailingSlash = trimTrailingSlash(raw)
      .replace(/^wss:/i, 'https:')
      .replace(/^ws:/i, 'http:');
    return /\/status$/i.test(withoutTrailingSlash)
      ? withoutTrailingSlash
      : `${withoutTrailingSlash}/status`;
  }
};

export const appendFeedBrokerIdToWsUrl = (wsUrl, brokerID = '') => {
  const id = String(brokerID || '').trim();

  try {
    const url = new URL(wsUrl);
    url.searchParams.delete('token');
    if (id && !url.searchParams.has('broker_id')) {
      url.searchParams.set('broker_id', id);
    }
    return url.toString();
  } catch {
    const raw = String(wsUrl || '');
    const hashIndex = raw.indexOf('#');
    const fragment = hashIndex < 0 ? '' : raw.slice(hashIndex);
    const withoutFragment = hashIndex < 0 ? raw : raw.slice(0, hashIndex);
    const queryIndex = withoutFragment.indexOf('?');
    const path = queryIndex < 0 ? withoutFragment : withoutFragment.slice(0, queryIndex);
    const params = new URLSearchParams(queryIndex < 0 ? '' : withoutFragment.slice(queryIndex + 1));
    params.delete('token');
    if (id && !params.has('broker_id')) params.set('broker_id', id);
    const query = params.toString();
    return `${path}${query ? `?${query}` : ''}${fragment}`;
  }
};

export const buildFeedStatusUrl = () => {
  const storedInfo = readBrokerInfo();
  const brokerInfo = storedInfo ? normalizeBrokerInfo(storedInfo, DEFAULTS.API_HOST) : {};
  const explicit = firstValue(
    getRuntimeConfigValue(['FEED_STATUS_URL', 'VITE_FEED_STATUS_URL']),
    hasPinnedApiHost() ? '' : firstBrokerValue(brokerInfo, FEED_STATUS_URL_KEYS)
  );

  if (explicit) return toLocalDevFeedProxyUrl(normalizeFeedStatusUrl(explicit));

  const wsUrl = hasPinnedApiHost()
    ? resolveBrokerWsUrl({}, DEFAULTS.WS_HOST || API_HOST, WS_FEED_PATH)
    : resolveBrokerWsUrl(brokerInfo, DEFAULTS.WS_HOST || API_HOST, WS_FEED_PATH);
  return toLocalDevFeedProxyUrl(normalizeFeedStatusUrl(wsUrl));
};

export const getFeedWsDisabledMessage = () => (
  'Market feed unavailable: websocket connection could not be started.'
);

export const buildFeedWsUrl = () => {
  const storedInfo = readBrokerInfo();
  const brokerInfo = storedInfo ? normalizeBrokerInfo(storedInfo, DEFAULTS.API_HOST) : {};
  const wsUrl = hasPinnedApiHost()
    ? resolveBrokerWsUrl({}, DEFAULTS.WS_HOST || API_HOST, WS_FEED_PATH)
    : resolveBrokerWsUrl(brokerInfo, DEFAULTS.WS_HOST || API_HOST, WS_FEED_PATH);
  const proxiedUrl = toLocalDevFeedProxyUrl(
    appendFeedBrokerIdToWsUrl(wsUrl, resolveFeedBrokerId(brokerInfo))
  );
  try {
    const url = new URL(proxiedUrl);
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (url.protocol === 'http:') url.protocol = 'ws:';
    return url.toString();
  } catch {
    return proxiedUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  }
};

export const resolveManagerWsBase = (configuredHost, useDevProxy, pageOrigin) => {
  if (useDevProxy && pageOrigin) {
    return String(pageOrigin).replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/+$/, '');
  }
  return trimTrailingSlash(configuredHost).replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
};

const getBaseWsHost = () => {
  updateDynamicEndpoints();
  const configured = getRuntimeConfigValue(['MANAGER_WS_HOST', 'VITE_MANAGER_WS_HOST'])
    || WS_HOST || buildWsHost(API_HOST);
  const pageOrigin = typeof window !== 'undefined' ? window.location?.origin : '';
  return resolveManagerWsBase(configured, shouldUseManagerDevProxy(), pageOrigin);
};

export const isManagerMarketFeed = () => getRuntimeConfigValue(
  ['MARKET_DATA_SOURCE', 'VITE_MARKET_DATA_SOURCE'], 'bridge'
).toLowerCase() === 'manager';

const buildManagerTicketWsUrl = (endpoint, ticket) => {
  if (!ticket) throw new Error('A one-time websocket ticket is required.');
  updateDynamicEndpoints();
  const path = buildManagerApiPath(endpoint, shouldUseManagerProxyPrefix(API_HOST, readBrokerInfo() || {}));
  const url = new URL(toLocalDevFeedProxyUrl(`${getBaseWsHost()}${path}`, shouldUseManagerDevProxy()));
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  url.searchParams.set('ticket', String(ticket));
  return url.toString();
};

export const buildManagerMarketWsUrl = (ticket) => buildManagerTicketWsUrl('/OnTick', ticket);

export const buildAccountMetricsWsUrl = (ticket) => buildManagerTicketWsUrl('/OnAccountMetrics', ticket);

export const getPositionUpdatesWsPath = () => {
  updateDynamicEndpoints();
  const fallback = getDeploymentRuntimeConfig()
    ? buildManagerApiPath('/OnPositionUpdate', shouldUseManagerProxyPrefix(API_HOST))
    : '/OnPositionUpdate';
  const configuredPath = getRuntimeConfigValue(
    ['POSITION_UPDATES_WS_PATH', 'VITE_POSITION_UPDATES_WS_PATH'],
    fallback
  );
  return configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
};

export const buildPositionUpdatesWsUrl = (ticket) => {
  if (!ticket) throw new Error('A one-time websocket ticket is required.');
  const url = new URL(`${getBaseWsHost()}${getPositionUpdatesWsPath()}`);
  url.searchParams.set('ticket', String(ticket));
  return url.toString();
};

export const buildMetricsWsUrl = (token, login) => {
  // Browser WebSocket calls cannot attach Authorization headers, so this
  // legacy endpoint is the only remaining token-in-query path.
  const params = new URLSearchParams({
    id: String(token || ''),
    login: String(login || ''),
  });
  return `${getBaseWsHost()}/manager/OnAccountMetrics?${params.toString()}`;
};
