import {
  getRuntimeConfigValue,
  normalizeBrokerInfo,
  resolveBrokerDefaultMt5Server,
  resolveBrokerBackendUrl,
  resolveBrokerExtApiUrl,
  resolveBrokerWsUrl,
  trimTrailingSlash,
} from './backendTarget';

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

export const buildManagerApiUrl = (endpoint = '') => {
  const raw = String(endpoint || '');
  if (/^https?:\/\//i.test(raw)) return raw;

  updateDynamicEndpoints();

  const path = raw
    .replace(/^\/api\/manager(?=\/|\?|$)/, '')
    .replace(/^\/manager(?=\/|\?|$)/, '');
  const managerPath = path
    ? `/manager${path.startsWith('/') || path.startsWith('?') ? path : `/${path}`}`
    : '/manager';

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

export const buildFeedWsUrl = () => {
  const storedInfo = readBrokerInfo();
  const brokerInfo = storedInfo ? normalizeBrokerInfo(storedInfo, DEFAULTS.API_HOST) : {};
  return resolveBrokerWsUrl(brokerInfo, DEFAULTS.WS_HOST || API_HOST, WS_FEED_PATH);
};

const getBaseWsHost = () => trimTrailingSlash(WS_HOST || buildWsHost(API_HOST));

export const buildMetricsWsUrl = (token, login) =>
  `${getBaseWsHost()}/manager/OnAccountMetrics?id=${token}&login=${login}`;
