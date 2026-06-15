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

export const shouldUseManagerProxyPrefix = (backendUrl = '', brokerInfo = {}) =>
  !isDirectBrokerBackendUrl(backendUrl, brokerInfo);

export const buildManagerApiPath = (endpoint = '', useProxyPrefix = true) => {
  const raw = String(endpoint || '');
  const path = raw
    .replace(/^\/api\/manager(?=\/|\?|$)/, '')
    .replace(/^\/manager(?=\/|\?|$)/, '');

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

  return joinUrl(API_HOST, managerPath);
};

export const buildExtApiUrl = (endpoint = '') => {
  const raw = String(endpoint || '');
  if (/^https?:\/\//i.test(raw)) return raw;

  updateDynamicEndpoints();

  const path = raw.replace(/^\/ext-api(?=\/|\?|$)/, '');
  const extPath = path
    ? path.startsWith('/') || path.startsWith('?') ? path : `/${path}`
    : '';

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

export const resolveFeedAuthRequired = (brokerInfo = {}) => isTruthyConfigValue(firstValue(
  firstBrokerValue(brokerInfo, FEED_AUTH_REQUIRED_KEYS),
  getRuntimeConfigValue(['FEED_AUTH_REQUIRED', 'VITE_FEED_AUTH_REQUIRED'])
));

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
  const token = auth.token || getExistingFeedQueryToken(wsUrl);
  if (!token && resolveFeedAuthRequired(brokerInfo)) {
    throw new FeedWsAuthConfigError();
  }
  return appendFeedAuthToWsUrl(wsUrl, { ...auth, token });
};

const getBaseWsHost = () => trimTrailingSlash(WS_HOST || buildWsHost(API_HOST));

export const buildMetricsWsUrl = (token, login) => {
  // Browser WebSocket calls cannot attach Authorization headers, so this
  // legacy endpoint is the only remaining token-in-query path.
  const params = new URLSearchParams({
    id: String(token || ''),
    login: String(login || ''),
  });
  return `${getBaseWsHost()}/manager/OnAccountMetrics?${params.toString()}`;
};
