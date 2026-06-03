const DEFAULT_BACKEND_TARGET = 'web';
const DEFAULT_DIRECT_BACKEND_PORT = 8091;
const DEFAULT_WS_PATH = '/ws/feed';

const GTA_PUBLIC_BACKEND_URL = 'https://services.growtradingacademy.com';
const GTA_DIRECT_HOST = '103.91.186.142';
const GTA_DIRECT_PORT = 8091;

export const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');

const hasProtocol = (value = '') => /^[a-z][a-z\d+.-]*:\/\//i.test(value);
const getBuildEnv = () => import.meta.env || {};
const getRoot = () => (typeof globalThis !== 'undefined' ? globalThis : {});

const normalizeTarget = (value = '') => {
  const target = String(value || '').trim().toLowerCase();
  if (target === 'desktop' || target === 'electron') return 'desktop';
  return DEFAULT_BACKEND_TARGET;
};

const runtimeConfigSources = () => {
  const root = getRoot();
  return [
    root.__RTX_RUNTIME_CONFIG__,
    root.RUNTIME_CONFIG,
    root.__RUNTIME_CONFIG__,
    root.__APP_CONFIG__,
    root._env_,
    root.env,
  ].filter((source) => source && typeof source === 'object');
};

export const getRuntimeConfigValue = (keys = [], fallback = '') => {
  for (const source of runtimeConfigSources()) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
  }

  const buildEnv = getBuildEnv();
  for (const key of keys) {
    const value = buildEnv[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return fallback;
};

export const getBackendTarget = () => normalizeTarget(
  getRuntimeConfigValue(['BACKEND_TARGET', 'VITE_BACKEND_TARGET', 'BACKEND_MODE', 'VITE_BACKEND_MODE'])
);

export const isDesktopBackendTarget = () => getBackendTarget() === 'desktop';

const getNestedValue = (source, path) => {
  if (!source || !path) return '';

  const direct = source[path];
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
    return String(direct).trim();
  }

  return path.split('.').reduce((value, key) => {
    if (value === undefined || value === null) return undefined;
    return value[key];
  }, source);
};

const getValue = (source, keys = [], fallback = '') => {
  for (const key of keys) {
    const value = getNestedValue(source, key);
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return fallback;
};

const withProtocol = (value = '', defaultProtocol = 'https') => {
  const raw = trimTrailingSlash(String(value || '').trim());
  if (!raw) return '';
  if (hasProtocol(raw)) return raw;
  if (raw.startsWith('//')) return `${defaultProtocol}:${raw}`;
  return `${defaultProtocol}://${raw}`;
};

const isIpAddress = (host = '') => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(host || '').trim());
const isLocalHost = (host = '') => /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(String(host || '').trim());

const hostnameFromUrl = (value = '') => {
  try {
    return new URL(withProtocol(value, 'http')).hostname;
  } catch {
    return '';
  }
};

const portFromUrl = (value = '') => {
  try {
    return new URL(withProtocol(value, 'http')).port;
  } catch {
    const match = String(value || '').match(/:(\d+)(?:\/|$)/);
    return match?.[1] || '';
  }
};

const normalizeHttpUrl = (value = '', defaultProtocol = 'https', forceHttps = false) => {
  const raw = withProtocol(value, defaultProtocol);
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (forceHttps && url.protocol === 'http:' && !isLocalHost(url.hostname)) {
      url.protocol = 'https:';
    }
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    return trimTrailingSlash(url.toString());
  } catch {
    return trimTrailingSlash(raw);
  }
};

const hasGtaMarker = (value = '') => {
  const text = String(value || '').toLowerCase();
  return (
    text.includes(GTA_DIRECT_HOST) ||
    text.includes('gta_broker') ||
    text.includes('grow-trading-academy') ||
    text.includes('services.growtradingacademy.com')
  );
};

const isGtaBrokerInfo = (brokerInfo = {}, fallbackUrl = '') => {
  const markerFields = [
    'id',
    'broker_id',
    'slug',
    'name',
    'broker_name',
    'backend_url',
    'api_url',
    'server_url',
    'web_backend_url',
    'web_api_url',
    'public_backend_url',
    'public_api_url',
    'desktop_backend_url',
    'desktop_api_url',
    'server_ip',
    'host',
    'ip',
  ];

  return (
    markerFields.some((field) => hasGtaMarker(getValue(brokerInfo, [field]))) ||
    hasGtaMarker(JSON.stringify(brokerInfo?.env || {})) ||
    hasGtaMarker(fallbackUrl)
  );
};

const isUiOnlyHost = (host = '') => /^(admin|client|manager)\./i.test(host);

const normalizeDomainCandidate = (candidate = '') => {
  const value = String(candidate || '').trim();
  if (!value) return '';
  return hasProtocol(value) ? value : `https://${value}`;
};

const sanitizeWebBackendCandidate = (candidate = '', brokerInfo = {}, fallbackUrl = '') => {
  if (!candidate) return '';
  if (isGtaBrokerInfo(brokerInfo, fallbackUrl) || hasGtaMarker(candidate)) return GTA_PUBLIC_BACKEND_URL;

  const normalized = normalizeHttpUrl(candidate, 'https', true);
  const host = hostnameFromUrl(normalized);
  if (!host) return '';
  if (isIpAddress(host)) return '';
  if (isUiOnlyHost(host)) return '';

  return normalized;
};

const buildDirectBackendUrl = (hostValue = '', portValue = DEFAULT_DIRECT_BACKEND_PORT) => {
  const rawHost = String(hostValue || '').trim();
  if (!rawHost) return '';

  const explicitPort = String(portValue || DEFAULT_DIRECT_BACKEND_PORT).trim();

  try {
    const url = new URL(withProtocol(rawHost, 'http'));
    url.protocol = isIpAddress(url.hostname) || isLocalHost(url.hostname) ? 'http:' : (url.protocol || 'http:');
    url.pathname = '';
    url.search = '';
    url.hash = '';
    if (explicitPort) url.port = explicitPort;
    return trimTrailingSlash(url.toString());
  } catch {
    const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
    return `http://${host}:${explicitPort}`;
  }
};

const WEB_BACKEND_KEYS = [
  'web_backend_url',
  'web_api_url',
  'public_backend_url',
  'public_api_url',
  'env.API_HOST',
  'env.VITE_API_HOST',
  'backend_url',
  'api_url',
  'server_url',
];

const WEB_BACKEND_DOMAIN_KEYS = [
  'backend_domain',
  'api_domain',
  'service_domain',
  'services_domain',
  'web_backend_domain',
];

const DESKTOP_BACKEND_KEYS = [
  'desktop_backend_url',
  'desktop_api_url',
  'local_backend_url',
  'ip_backend_url',
];

const DIRECT_HOST_KEYS = ['server_ip', 'host', 'ip'];
const DIRECT_PORT_KEYS = ['server_port', 'backend_port', 'api_port', 'port'];

const resolveWebBackendUrl = (brokerInfo = {}, fallbackUrl = '') => {
  if (isGtaBrokerInfo(brokerInfo, fallbackUrl)) return GTA_PUBLIC_BACKEND_URL;

  const candidates = [
    ...WEB_BACKEND_KEYS.map((key) => getValue(brokerInfo, [key])),
    ...WEB_BACKEND_DOMAIN_KEYS.map((key) => normalizeDomainCandidate(getValue(brokerInfo, [key]))),
    fallbackUrl,
    getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']),
  ];

  for (const candidate of candidates) {
    const resolved = sanitizeWebBackendCandidate(candidate, brokerInfo, fallbackUrl);
    if (resolved) return resolved;
  }

  return '';
};

const resolveDesktopBackendUrl = (brokerInfo = {}, fallbackUrl = '') => {
  if (isGtaBrokerInfo(brokerInfo, fallbackUrl)) {
    return `http://${GTA_DIRECT_HOST}:${GTA_DIRECT_PORT}`;
  }

  const explicit = getValue(brokerInfo, DESKTOP_BACKEND_KEYS);
  if (explicit) return normalizeHttpUrl(explicit, 'http', false);

  const host = getValue(brokerInfo, DIRECT_HOST_KEYS);
  const port = getValue(brokerInfo, DIRECT_PORT_KEYS, String(DEFAULT_DIRECT_BACKEND_PORT));
  if (host) return buildDirectBackendUrl(host, port);

  const fallbackCandidate =
    fallbackUrl ||
    getValue(brokerInfo, ['backend_url', 'api_url', 'server_url']) ||
    getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']);

  return normalizeHttpUrl(fallbackCandidate, 'http', false);
};

export const resolveBrokerBackendUrl = (brokerInfo = {}, fallbackUrl = '') => (
  isDesktopBackendTarget()
    ? resolveDesktopBackendUrl(brokerInfo, fallbackUrl)
    : resolveWebBackendUrl(brokerInfo, fallbackUrl)
);

export const resolveBrokerExtApiUrl = (brokerInfo = {}, backendUrl = '') => {
  const explicitKeys = isDesktopBackendTarget()
    ? ['desktop_ext_api_url', 'desktopExtApiUrl', 'ext_api_url', 'extApiUrl']
    : ['web_ext_api_url', 'webExtApiUrl', 'ext_api_url', 'extApiUrl', 'env.API_HOST_EXT', 'env.VITE_API_HOST_EXT'];

  const explicit = getValue(brokerInfo, explicitKeys);
  if (explicit) {
    return isDesktopBackendTarget()
      ? normalizeHttpUrl(explicit, 'http', false)
      : sanitizeWebBackendCandidate(explicit, brokerInfo, backendUrl);
  }

  const fallback =
    backendUrl ||
    getRuntimeConfigValue(['API_HOST_EXT', 'VITE_API_HOST_EXT']) ||
    resolveBrokerBackendUrl(brokerInfo);

  return isDesktopBackendTarget()
    ? normalizeHttpUrl(fallback, 'http', false)
    : sanitizeWebBackendCandidate(fallback, brokerInfo, backendUrl);
};

const toWsUrl = (value = '', defaultProtocol = 'ws') => {
  const raw = trimTrailingSlash(String(value || '').trim());
  if (!raw) return '';

  if (/^wss?:\/\//i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return trimTrailingSlash(url.toString());
    } catch {
      return raw.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    }
  }
  if (raw.startsWith('//')) return `${defaultProtocol}:${raw}`;
  return `${defaultProtocol}://${raw}`;
};

const buildWsEndpoint = (baseUrl = '', path = DEFAULT_WS_PATH) => {
  const base = trimTrailingSlash(baseUrl);
  const wsPath = path || DEFAULT_WS_PATH;
  if (!base) return wsPath;
  if (!wsPath) return base;
  if (base.endsWith(wsPath)) return base;
  return `${base}${wsPath.startsWith('/') ? '' : '/'}${wsPath}`;
};

const sanitizeWebWsCandidate = (candidate = '', brokerInfo = {}, fallbackUrl = '') => {
  if (!candidate) return '';
  if (isGtaBrokerInfo(brokerInfo, fallbackUrl) || hasGtaMarker(candidate)) {
    return 'wss://services.growtradingacademy.com';
  }

  const wsUrl = toWsUrl(candidate, 'wss');
  const host = hostnameFromUrl(wsUrl);
  if (!host) return '';
  if (isIpAddress(host)) return '';
  if (isUiOnlyHost(host)) return '';
  return wsUrl;
};

export const resolveBrokerWsUrl = (brokerInfo = {}, fallbackUrl = '', path = DEFAULT_WS_PATH) => {
  const explicitKeys = isDesktopBackendTarget()
    ? ['desktop_ws_url', 'desktopWsUrl', 'ws_url', 'wsUrl']
    : ['web_ws_url', 'webWsUrl', 'env.WS_HOST', 'env.VITE_WS_HOST', 'ws_url', 'wsUrl'];

  const explicit = getValue(brokerInfo, explicitKeys) || getRuntimeConfigValue(['WS_HOST', 'VITE_WS_HOST']);
  if (explicit) {
    const resolvedExplicit = isDesktopBackendTarget()
      ? toWsUrl(explicit, 'ws')
      : sanitizeWebWsCandidate(explicit, brokerInfo, fallbackUrl);
    if (resolvedExplicit) return buildWsEndpoint(resolvedExplicit, path);
  }

  const backendUrl = resolveBrokerBackendUrl(brokerInfo, fallbackUrl);
  const defaultProtocol = backendUrl.startsWith('https://') ? 'wss' : 'ws';
  return buildWsEndpoint(toWsUrl(backendUrl || fallbackUrl, defaultProtocol), path);
};

export const isDirectBrokerBackendUrl = (backendUrl = '', brokerInfo = {}) => {
  const host = hostnameFromUrl(backendUrl);
  if (!host) return false;
  if (isIpAddress(host)) return true;

  const directHosts = [
    getValue(brokerInfo, DIRECT_HOST_KEYS),
    hostnameFromUrl(getValue(brokerInfo, DESKTOP_BACKEND_KEYS)),
    hostnameFromUrl(getValue(brokerInfo, ['local_backend_url', 'ip_backend_url'])),
  ].filter(Boolean);

  return directHosts.some((directHost) => host.toLowerCase() === directHost.toLowerCase());
};

export const resolveBrokerDefaultMt5Server = (brokerInfo = {}, backendUrl = '') => (
  getValue(brokerInfo, ['env.DEFAULT_MT5_SERVER', 'env.VITE_DEFAULT_MT5_SERVER', 'default_mt5_server', 'mt5_server']) ||
  getValue(brokerInfo, ['server_ip', 'host', 'ip']) ||
  hostnameFromUrl(backendUrl) ||
  getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER'])
);

export const normalizeBrokerInfo = (brokerInfo = {}, fallbackUrl = '') => {
  const source = brokerInfo || {};
  const backendUrl = resolveBrokerBackendUrl(source, fallbackUrl);
  const desktopUrl = resolveDesktopBackendUrl(source, fallbackUrl);
  const serverIp =
    (isGtaBrokerInfo(source, fallbackUrl) ? GTA_DIRECT_HOST : getValue(source, DIRECT_HOST_KEYS)) ||
    hostnameFromUrl(desktopUrl || backendUrl);
  const serverPort =
    (isGtaBrokerInfo(source, fallbackUrl) ? String(GTA_DIRECT_PORT) : getValue(source, DIRECT_PORT_KEYS)) ||
    portFromUrl(desktopUrl || backendUrl) ||
    String(DEFAULT_DIRECT_BACKEND_PORT);

  const normalized = {
    ...source,
    broker_id: source.broker_id || source.id,
    name: source.name || source.broker_name || source.broker_id || source.id,
    status: source.status || 'active',
    backend_url: backendUrl,
    api_url: backendUrl || source.api_url,
    server_ip: serverIp,
    server_port: Number(serverPort),
  };

  if (backendUrl && !isDesktopBackendTarget()) normalized.web_backend_url = backendUrl;
  if (desktopUrl) normalized.desktop_backend_url = desktopUrl;

  return normalized;
};

export const normalizeBrokerInfoForTarget = normalizeBrokerInfo;
