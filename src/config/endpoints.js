// Central place for all network endpoints.
// Components should import from here instead of hardcoding a host.

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');
const hasProtocol = (value = '') => /^[a-z][a-z\d+.-]*:\/\//i.test(value);
const withProtocol = (value = '') => (hasProtocol(value) ? value : `http://${value}`);

const DEFAULTS = {
  API_HOST: trimTrailingSlash(import.meta.env.VITE_API_HOST || ''),
  WS_HOST: trimTrailingSlash(import.meta.env.VITE_WS_HOST || ''),
  API_HOST_EXT: trimTrailingSlash(import.meta.env.VITE_API_HOST_EXT || ''),
  DEFAULT_MT5_SERVER: import.meta.env.VITE_DEFAULT_MT5_SERVER || '',
};
const WS_FEED_PATH = trimTrailingSlash(import.meta.env.VITE_WS_FEED_PATH || '/ws/feed');

export let API_HOST = DEFAULTS.API_HOST;
export let WS_HOST = DEFAULTS.WS_HOST;
export let API_HOST_EXT = DEFAULTS.API_HOST_EXT;
export let DEFAULT_MT5_SERVER = DEFAULTS.DEFAULT_MT5_SERVER;

const readBrokerInfo = () => {
  if (typeof sessionStorage === 'undefined') return null;

  const raw = sessionStorage.getItem('broker_info');
  if (!raw) return null;

  return JSON.parse(raw);
};

const getExplicitPort = (endpoint) => {
  const trimmed = trimTrailingSlash(endpoint);
  if (!trimmed) return '';

  try {
    return new URL(withProtocol(trimmed)).port;
  } catch {
    const match = trimmed.match(/:(\d+)(?:\/|$)/);
    return match?.[1] || '';
  }
};

const buildWsHost = (backendUrl) => {
  const trimmed = trimTrailingSlash(backendUrl);
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.port = '';
    return trimTrailingSlash(url.toString());
  } catch {
    return trimmed.replace(/^https?:/i, (protocol) =>
      protocol.toLowerCase() === 'https:' ? 'wss:' : 'ws:'
    );
  }
};

const buildExtHost = (backendUrl) => {
  const trimmed = trimTrailingSlash(backendUrl);
  const extPort = getExplicitPort(DEFAULTS.API_HOST_EXT);

  try {
    const url = new URL(trimmed);
    if (extPort) return `${url.protocol}//${url.hostname}:${extPort}`;
    return trimTrailingSlash(url.origin);
  } catch {
    return trimmed;
  }
};

const toWsUrl = (value, fallbackBase = '') => {
  const raw = trimTrailingSlash(String(value || '').trim());
  if (!raw) return '';

  if (/^wss?:\/\//i.test(raw) || /^ws:\/\//i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return trimTrailingSlash(url.toString());
    } catch {
      return raw.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    }
  }
  if (raw.startsWith('//')) return `ws:${raw}`;
  if (fallbackBase && raw.startsWith('/')) return `${trimTrailingSlash(fallbackBase)}${raw}`;
  if (fallbackBase) return `${trimTrailingSlash(fallbackBase)}/${raw}`;
  return raw;
};

const getValue = (obj, keys, fallback = '') => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return fallback;
};

const hostToWsUrl = (host, port, protocolHint = 'wss') => {
  const trimmedHost = String(host || '').trim().replace(/\/+$/, '');
  if (!trimmedHost) return '';

  if (trimmedHost.includes('/')) return toWsUrl(trimmedHost, '');

  let proto = String(protocolHint || 'wss').toLowerCase().replace(':', '');
  if (proto === 'http') proto = 'ws';
  if (proto === 'https') proto = 'wss';
  if (!/^wss?$/.test(proto)) proto = 'wss';

  const explicitPort = String(port || '').trim();
  const suffix = explicitPort ? `:${explicitPort}` : '';
  return `${proto}://${trimmedHost}${suffix}`;
};

const inferWsProtocol = (brokerInfo, host, portFromHost) => {
  const explicit = getValue(brokerInfo, ['market_watch_protocol', 'protocol', 'ws_protocol'], '');
  if (explicit) {
    const value = String(explicit).trim().toLowerCase();
    if (value === 'https' || value === 'wss') return 'wss';
    if (value === 'http' || value === 'ws') return 'ws';
  }

  const backendUrl = getValue(brokerInfo, ['market_watch_ws_url', 'marketWatchWsUrl', 'websocket_url', 'websocketUrl', 'ws_url', 'backend_url', 'api_url', 'server_url'], '');
  try {
    if (backendUrl) {
      const parsed = new URL(backendUrl.includes('://') ? backendUrl : `http://${backendUrl}`);
      return parsed.protocol === 'https:' ? 'wss' : 'ws';
    }
  } catch {
    // ignore
  }

  const protocolFromHost = host.includes('://')
    ? host.startsWith('wss://') ? 'wss' : host.startsWith('ws://') ? 'ws' : ''
    : '';
  if (protocolFromHost) return protocolFromHost;

  const port = Number(portFromHost || '');
  if (!Number.isNaN(port) && Number.isFinite(port) && port > 0) {
    if (port === 443 || port === 8443) return 'wss';
    if (port === 80) return 'ws';
  }

  return 'ws';
};

const resolveMt5Server = (brokerInfo, backendUrl) => {
  if (brokerInfo?.server_ip) return brokerInfo.server_ip;
  if (brokerInfo?.host) return brokerInfo.host;

  try {
    return new URL(backendUrl).hostname;
  } catch {
    return backendUrl || '';
  }
};

export const updateDynamicEndpoints = () => {
  try {
    const info = readBrokerInfo();
    const backendUrl = trimTrailingSlash(info?.backend_url || '');

    if (backendUrl) {
      API_HOST = backendUrl;
      WS_HOST = buildWsHost(backendUrl);
      API_HOST_EXT = buildExtHost(backendUrl);
      DEFAULT_MT5_SERVER = resolveMt5Server(info, backendUrl);
      return;
    }
  } catch (error) {
    console.error('Error updating dynamic endpoints:', error);
  }

  API_HOST = DEFAULTS.API_HOST;
  WS_HOST = DEFAULTS.WS_HOST;
  API_HOST_EXT = DEFAULTS.API_HOST_EXT;
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

  const path = raw.replace(/^\/ext-api(?=\/|\?|$)/, '');
  const extPath = path
    ? path.startsWith('/') || path.startsWith('?') ? path : `/${path}`
    : '';

  return API_HOST_EXT ? joinUrl(API_HOST_EXT, extPath) : `/ext-api${extPath}`;
};

const getBaseWsHost = () => trimTrailingSlash(WS_HOST || buildWsHost(API_HOST));
const resolveFeedWsPath = (brokerInfo = {}) => {
  const dynamicPath = getValue(
    brokerInfo,
    ['market_watch_ws_path', 'marketWatchWsPath', 'feed_ws_path', 'ws_path'],
    ''
  );

  if (dynamicPath) {
    return trimTrailingSlash(dynamicPath);
  }

  return WS_FEED_PATH || '/ws/feed';
};
const resolveFeedWsHost = (brokerInfo = {}) => {
  const overrideUrl = getValue(
    brokerInfo,
    [
      'market_watch_ws_url',
      'marketWatchWsUrl',
      'market_watch_ws',
      'marketWatchWs',
      'feed_ws_url',
      'feedWsUrl',
      'websocket_url',
      'websocketUrl',
      'ws_url',
      'wsUrl',
    ],
    ''
  );
  if (overrideUrl) return toWsUrl(overrideUrl, '');

  const host = getValue(
    brokerInfo,
    ['market_watch_ws_host', 'marketWatchWsHost', 'ws_host', 'server_ip', 'server_host', 'host', 'backend_url', 'api_url', 'server_url'],
    ''
  );
  const port = getValue(brokerInfo, ['market_watch_port', 'ws_port', 'server_port'], '');
  const protocol = inferWsProtocol(brokerInfo, host, port);

  if (host) {
    return hostToWsUrl(host, port, protocol);
  }

  return getBaseWsHost();
};
const buildWsEndpoint = (url, path) => {
  const base = trimTrailingSlash(url);
  if (!base) return path || '/ws/feed';
  if (!path) return base;
  if (base.endsWith(path)) return base;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
};

export const buildFeedWsUrl = () => {
  const brokerInfo = readBrokerInfo();
  const base = resolveFeedWsHost(brokerInfo);
  const path = resolveFeedWsPath(brokerInfo);
  return buildWsEndpoint(base || '', path || '/ws/feed');
};

export const buildMetricsWsUrl = (token, login) =>
  `${getBaseWsHost()}/manager/OnAccountMetrics?id=${token}&login=${login}`;
