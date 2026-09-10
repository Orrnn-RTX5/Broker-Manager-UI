import {
  getRuntimeConfigValue,
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

export let API_HOST = DEFAULTS.API_HOST;
export let WS_HOST = DEFAULTS.WS_HOST;
export let API_HOST_EXT = DEFAULTS.API_HOST_EXT;
export let DEFAULT_MT5_SERVER = DEFAULTS.DEFAULT_MT5_SERVER;

const readBrokerInfo = () => {
  if (typeof sessionStorage === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem('broker_info');
    return raw ? JSON.parse(raw) : null;
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
    url.port = '';
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

const isLoopbackHost = (hostname = '') =>
  /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(String(hostname || '').trim());

const isForwardedDevHost = (hostname = '') => {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  return (
    host.endsWith('.devtunnels.ms') ||
    host.endsWith('.github.dev') ||
    host.endsWith('.app.github.dev') ||
    host.endsWith('.trycloudflare.com') ||
    host.endsWith('.ngrok-free.app') ||
    host.endsWith('.ngrok.app') ||
    host.endsWith('.ngrok.io') ||
    host.endsWith('.loca.lt')
  );
};

const isProxyableDevOrigin = () => {
  if (typeof window === 'undefined' || !window.location?.origin) return false;
  try {
    const url = new URL(window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return isLoopbackHost(url.hostname) || isForwardedDevHost(url.hostname);
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

const FEED_TOKEN_KEYS = [
  'feed_token',
  'feedToken',
  'feed_broker_token',
  'feedBrokerToken',
  'broker_feed_token',
  'brokerFeedToken',
  'upstream_ws_token',
  'upstreamWsToken',
  'ws_feed_token',
  'wsFeedToken',
  'env.FEED_BROKER_TOKEN',
  'env.VITE_FEED_BROKER_TOKEN',
  'env.BROKER_FEED_TOKEN',
  'env.VITE_BROKER_FEED_TOKEN',
  'env.WS_FEED_TOKEN',
  'env.VITE_WS_FEED_TOKEN',
];

const FEED_AUTH_REQUIRED_KEYS = [
  'feed_auth_required',
  'feedAuthRequired',
  'env.FEED_AUTH_REQUIRED',
  'env.VITE_FEED_AUTH_REQUIRED',
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

export const FEED_WS_AUTH_NOT_CONFIGURED = 'FEED_WS_AUTH_NOT_CONFIGURED';
export const FEED_WS_AUTH_NOT_CONFIGURED_MESSAGE =
  'Market feed disabled: configure FEED_BROKER_TOKEN or VITE_FEED_BROKER_TOKEN for this manager UI deployment.';

export class FeedWsAuthConfigError extends Error {
  constructor(message = FEED_WS_AUTH_NOT_CONFIGURED_MESSAGE) {
    super(message);
    this.name = 'FeedWsAuthConfigError';
    this.code = FEED_WS_AUTH_NOT_CONFIGURED;
  }
}

export const resolveFeedWsAuth = (brokerInfo = {}) => {
  const brokerID = firstValue(
    firstBrokerValue(brokerInfo, FEED_BROKER_ID_KEYS),
    getRuntimeConfigValue(['FEED_BROKER_ID', 'VITE_FEED_BROKER_ID', 'BROKER_ID', 'VITE_BROKER_ID'])
  );

  const token = firstValue(
    firstBrokerValue(brokerInfo, FEED_TOKEN_KEYS),
    getRuntimeConfigValue([
      'FEED_BROKER_TOKEN',
      'VITE_FEED_BROKER_TOKEN',
      'BROKER_FEED_TOKEN',
      'VITE_BROKER_FEED_TOKEN',
      'WS_FEED_TOKEN',
      'VITE_WS_FEED_TOKEN',
    ])
  );

  return { brokerID, token };
};

const isTruthyConfigValue = (value = '') => /^(1|true|yes|on|required)$/i.test(String(value || '').trim());

export const resolveFeedAuthRequired = (brokerInfo = {}) => {
  const runtimeOverride = getRuntimeConfigValue(['FEED_AUTH_REQUIRED', 'VITE_FEED_AUTH_REQUIRED']);
  return isTruthyConfigValue(runtimeOverride || firstBrokerValue(brokerInfo, FEED_AUTH_REQUIRED_KEYS));
};

export const appendFeedAuthToWsUrl = (wsUrl, auth = {}) => {
  const token = String(auth.token || '').trim();
  const brokerID = String(auth.brokerID || auth.broker_id || '').trim();
  if (!brokerID && !token) return wsUrl;

  try {
    const url = new URL(wsUrl);
    if (brokerID && !url.searchParams.has('broker_id')) {
      url.searchParams.set('broker_id', brokerID);
    }
    if (token && !url.searchParams.has('token')) {
      url.searchParams.set('token', token);
    }
    return url.toString();
  } catch {
    const params = new URLSearchParams();
    if (brokerID) params.set('broker_id', brokerID);
    if (token) params.set('token', token);
    const glue = String(wsUrl || '').includes('?') ? '&' : '?';
    return `${wsUrl}${glue}${params.toString()}`;
  }
};

const getExistingFeedQueryToken = (wsUrl = '') => {
  const raw = String(wsUrl || '');
  if (!raw) return '';

  try {
    const url = new URL(raw, 'http://rtx.local');
    return String(url.searchParams.get('token') || '').trim();
  } catch {
    const query = raw.split('?')[1]?.split('#')[0];
    if (!query) return '';
    try {
      return String(new URLSearchParams(query).get('token') || '').trim();
    } catch {
      return '';
    }
  }
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

export const buildFeedStatusUrl = () => {
  const storedInfo = readBrokerInfo();
  const brokerInfo = storedInfo ? normalizeBrokerInfo(storedInfo, DEFAULTS.API_HOST) : {};
  const explicit = firstValue(
    getRuntimeConfigValue(['FEED_STATUS_URL', 'VITE_FEED_STATUS_URL']),
    firstBrokerValue(brokerInfo, FEED_STATUS_URL_KEYS)
  );

  if (explicit) return toLocalDevFeedProxyUrl(normalizeFeedStatusUrl(explicit));

  const wsUrl = resolveBrokerWsUrl(brokerInfo, DEFAULTS.WS_HOST || API_HOST, WS_FEED_PATH);
  return toLocalDevFeedProxyUrl(normalizeFeedStatusUrl(wsUrl));
};

export const getFeedWsDisabledMessage = (error) => (
  error?.code === FEED_WS_AUTH_NOT_CONFIGURED
    ? error.message
    : 'Market feed unavailable: websocket connection could not be started.'
);

export const buildFeedWsUrl = () => {
  const storedInfo = readBrokerInfo();
  const brokerInfo = storedInfo ? normalizeBrokerInfo(storedInfo, DEFAULTS.API_HOST) : {};
  const wsUrl = resolveBrokerWsUrl(brokerInfo, DEFAULTS.WS_HOST || API_HOST, WS_FEED_PATH);
  const auth = resolveFeedWsAuth(brokerInfo);
  const sendToken = getRuntimeConfigValue(
    ['FEED_SEND_TOKEN', 'VITE_FEED_SEND_TOKEN'],
    'true'
  ).toLowerCase() !== 'false';
  const token = sendToken ? (auth.token || getExistingFeedQueryToken(wsUrl)) : '';
  if (!token && resolveFeedAuthRequired(brokerInfo)) {
    throw new FeedWsAuthConfigError();
  }
  const proxiedUrl = toLocalDevFeedProxyUrl(appendFeedAuthToWsUrl(wsUrl, { ...auth, token }));
  try {
    const url = new URL(proxiedUrl);
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (url.protocol === 'http:') url.protocol = 'ws:';
    return url.toString();
  } catch {
    return proxiedUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  }
};

const getBaseWsHost = () => trimTrailingSlash(WS_HOST || buildWsHost(API_HOST));

export const getPositionUpdatesWsPath = () => {
  const configuredPath = getRuntimeConfigValue(
    ['POSITION_UPDATES_WS_PATH', 'VITE_POSITION_UPDATES_WS_PATH'],
    '/OnPositionUpdate'
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
