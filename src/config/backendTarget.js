const DEFAULT_BACKEND_TARGET = 'web';
const DEFAULT_DIRECT_BACKEND_PORT = 8091;
const DEFAULT_WS_PATH = '/ws/feed';

const GTA_PUBLIC_BACKEND_URL = 'https://fxtrustbrokerbackend.orrnn.com';
const GTA_DIRECT_HOST = '103.91.186.142';
const GTA_DIRECT_PORT = 8091;

export const TEST_BROKER_PUBLIC_BACKEND_URL = 'https://fxtrustbrokerbackend.orrnn.com';
export const TEST_BROKER_DIRECT_HOST = '100.120.168.28';
export const TEST_BROKER_DIRECT_PORT = 8091;
export const TEST_BROKER_WS_URL = 'wss://fxtrustbrokerbackend.orrnn.com/ws/feed';
export const TEST_BROKER_FEED_STATUS_URL = 'https://fxtrustbrokerbackend.orrnn.com/ws/feed/status';
export const TEST_BROKER_DEFAULT_MT5_SERVER = '100.120.168.28';

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

export const getDeploymentRuntimeConfig = () => runtimeConfigSources().find(
  (source) => source.CONFIG_SOURCE === 'deployment'
);

// A container's routing profile is complete. An absent optional override must
// derive from that profile, never resurrect a broker baked into the image.
const deploymentRoutingKeys = new Set([
  'BACKEND_TARGET', 'BACKEND_MODE', 'BROKER_ID', 'FEED_BROKER_ID',
  'API_HOST', 'API_HOST_EXT', 'REPORTS_API_HOST', 'WS_HOST', 'WS_FEED_PATH',
  'MANAGER_WS_HOST', 'MARKET_DATA_SOURCE', 'MANAGER_PROXY_STRIP_MANAGER_PREFIX',
  'POSITION_UPDATES_WS_PATH', 'FEED_WS_URL', 'FEED_STATUS_URL',
  'DISCOVERY_BASE_URL', 'DEFAULT_MT5_SERVER', 'USE_MOCK_DISCOVERY', 'LOCAL_BACKEND',
]);

export const getRuntimeConfigValue = (keys = [], fallback = '', { allowEmpty = false } = {}) => {
  const deployment = getDeploymentRuntimeConfig();
  if (deployment && keys.some((key) => deploymentRoutingKeys.has(key.replace(/^VITE_/, '')))) {
    for (const key of keys) {
      const value = deployment[key];
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      return (allowEmpty || text !== '') ? text : fallback;
    }
    return fallback;
  }

  for (const source of runtimeConfigSources()) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && (allowEmpty || String(value).trim() !== '')) {
        return String(value).trim();
      }
    }
  }

  const buildEnv = getBuildEnv();
  for (const key of keys) {
    const value = buildEnv[key];
    if (value !== undefined && value !== null && (allowEmpty || String(value).trim() !== '')) {
      return String(value).trim();
    }
  }

  return fallback;
};

export const getBackendTarget = () => normalizeTarget(
  getRuntimeConfigValue(['BACKEND_TARGET', 'VITE_BACKEND_TARGET', 'BACKEND_MODE', 'VITE_BACKEND_MODE'])
);

export const isDesktopBackendTarget = () => getBackendTarget() === 'desktop';

export const isConfiguredRuntimeBroker = (brokerInfo = {}) => {
  const configuredBrokerId = getRuntimeConfigValue([
    'BROKER_ID',
    'VITE_BROKER_ID',
    'FEED_BROKER_ID',
    'VITE_FEED_BROKER_ID',
  ]).toLowerCase();
  if (!configuredBrokerId) return false;

  return [
    brokerInfo?.broker_id,
    brokerInfo?.id,
    brokerInfo?.slug,
    brokerInfo?.handle,
    brokerInfo?.server_handle,
    brokerInfo?.server,
  ].some((candidate) => String(candidate || '').trim().toLowerCase() === configuredBrokerId);
};

// Discovery intentionally hides backend addresses. Local development supplies
// the selected broker's addresses without activating the legacy TEST profile.
const isConfiguredLocalBroker = (brokerInfo = {}) => (
  getRuntimeConfigValue(['LOCAL_BACKEND', 'VITE_LOCAL_BACKEND']) === 'true'
  && isConfiguredRuntimeBroker(brokerInfo)
);

const getNestedValue = (source, path) => {
  if (!source || !path) return '';

  // N4-01: when the path is dotted, descend the nested structure FIRST so a
  // genuinely-nested value (e.g. env.BACKEND_TARGET) is not shadowed by a flat
  // key that happens to contain a literal dot. Fall back to the flat key only if
  // the nested descent yields nothing.
  if (path.includes('.')) {
    const nested = path.split('.').reduce((value, key) => {
      if (value === undefined || value === null) return undefined;
      return value[key];
    }, source);
    if (nested !== undefined && nested !== null && String(nested).trim() !== '') {
      return String(nested).trim();
    }
  }

  const direct = source[path];
  if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
    return String(direct).trim();
  }

  return undefined;
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

const normalizeDesktopHttpUrl = (value = '') => {
  const raw = withProtocol(value, 'https');
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (isLocalHost(url.hostname) || isIpAddress(url.hostname)) {
      if (!hasProtocol(value)) url.protocol = 'http:';
    } else if (url.protocol === 'http:') {
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

export const hasTestBrokerMarker = (value = '') => {
  const text = String(value || '').toLowerCase().trim();
  if (!text) return false;
  return (
    text === 'test' ||
    text === 'test-broker' ||
    text.includes('100.120.168.28') ||
    text.includes('fxtrust') ||
    text.includes('rtx5-local-test-broker') ||
    text.includes('test broker')
  );
};

export const isTestBrokerInfo = (brokerInfo = {}, fallbackUrl = '') => {
  if (isConfiguredLocalBroker(brokerInfo)) return false;
  const markerFields = [
    'id',
    'broker_id',
    'slug',
    'name',
    'broker_name',
    'server',
    'server_handle',
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
    markerFields.some((field) => hasTestBrokerMarker(getValue(brokerInfo, [field]))) ||
    hasTestBrokerMarker(JSON.stringify(brokerInfo?.env || {})) ||
    hasTestBrokerMarker(fallbackUrl)
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
  if (host.toLowerCase() === 'services.myprop.trad.app') return 'https://services.myprop.trade';
  if (isIpAddress(host)) return '';
  if (isUiOnlyHost(host)) return '';

  return normalized;
};

const buildDirectBackendUrl = (hostValue = '', portValue = DEFAULT_DIRECT_BACKEND_PORT) => {
  const rawHost = String(hostValue || '').trim();
  if (!rawHost) return '';

  const explicitPort = String(portValue || DEFAULT_DIRECT_BACKEND_PORT).trim();

  try {
    const url = new URL(withProtocol(rawHost, 'https'));
    if (isIpAddress(url.hostname) || isLocalHost(url.hostname)) {
      if (!hasProtocol(rawHost)) url.protocol = 'http:';
    } else if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }
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

const BROKER_PUBLIC_BACKEND_KEYS = [
  ...WEB_BACKEND_KEYS,
  ...WEB_BACKEND_DOMAIN_KEYS,
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
  if (getDeploymentRuntimeConfig()) {
    return normalizeHttpUrl(getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']), 'https', true);
  }
  if (isTestBrokerInfo(brokerInfo, fallbackUrl)) {
    const explicitCandidates = [
      ...WEB_BACKEND_KEYS.map((key) => getValue(brokerInfo, [key])),
      ...WEB_BACKEND_DOMAIN_KEYS.map((key) => normalizeDomainCandidate(getValue(brokerInfo, [key]))),
    ];
    for (const candidate of explicitCandidates) {
      const resolved = sanitizeWebBackendCandidate(candidate, brokerInfo, fallbackUrl);
      if (resolved) return resolved;
    }
    return TEST_BROKER_PUBLIC_BACKEND_URL;
  }
  if (isGtaBrokerInfo(brokerInfo, fallbackUrl)) return GTA_PUBLIC_BACKEND_URL;

  const configuredRuntimeApiHost = isConfiguredRuntimeBroker(brokerInfo)
    ? getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST'])
    : '';
  const candidates = [
    configuredRuntimeApiHost,
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

const resolveBrokerPublicBackendUrl = (brokerInfo = {}, fallbackUrl = '') => {
  for (const key of BROKER_PUBLIC_BACKEND_KEYS) {
    const candidate = WEB_BACKEND_DOMAIN_KEYS.includes(key)
      ? normalizeDomainCandidate(getValue(brokerInfo, [key]))
      : getValue(brokerInfo, [key]);
    const resolved = sanitizeWebBackendCandidate(candidate, brokerInfo, fallbackUrl);
    if (resolved) return resolved;
  }

  return '';
};

const resolveDesktopBackendUrl = (brokerInfo = {}, fallbackUrl = '') => {
  const explicit = getValue(brokerInfo, DESKTOP_BACKEND_KEYS);
  const normalizedExplicit = explicit ? normalizeDesktopHttpUrl(explicit) : '';
  const explicitHost = hostnameFromUrl(normalizedExplicit);
  if (normalizedExplicit && hasGtaMarker(normalizedExplicit)) return GTA_PUBLIC_BACKEND_URL;
  if (normalizedExplicit && explicitHost && !isIpAddress(explicitHost)) return normalizedExplicit;

  if (isTestBrokerInfo(brokerInfo, fallbackUrl)) {
    if (normalizedExplicit && !hasGtaMarker(normalizedExplicit)) return normalizedExplicit;
    const publicBackend = resolveBrokerPublicBackendUrl(brokerInfo, fallbackUrl);
    if (publicBackend) return publicBackend;
    const host = getValue(brokerInfo, DIRECT_HOST_KEYS) || TEST_BROKER_DIRECT_HOST;
    const port = getValue(brokerInfo, DIRECT_PORT_KEYS, String(TEST_BROKER_DIRECT_PORT));
    if (host) return buildDirectBackendUrl(host, port);
    return TEST_BROKER_PUBLIC_BACKEND_URL;
  }

  if (isGtaBrokerInfo(brokerInfo, fallbackUrl)) {
    return GTA_PUBLIC_BACKEND_URL;
  }

  const publicBackend = resolveBrokerPublicBackendUrl(brokerInfo, fallbackUrl);
  if (publicBackend) return publicBackend;

  if (normalizedExplicit) return normalizedExplicit;

  const host = getValue(brokerInfo, DIRECT_HOST_KEYS);
  const port = getValue(brokerInfo, DIRECT_PORT_KEYS, String(DEFAULT_DIRECT_BACKEND_PORT));
  if (host) return buildDirectBackendUrl(host, port);

  const fallbackCandidate =
    fallbackUrl ||
    getValue(brokerInfo, ['backend_url', 'api_url', 'server_url']) ||
    getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']);

  return normalizeDesktopHttpUrl(fallbackCandidate);
};

export const resolveBrokerBackendUrl = (brokerInfo = {}, fallbackUrl = '') => (
  isDesktopBackendTarget()
    ? resolveDesktopBackendUrl(brokerInfo, fallbackUrl)
    : resolveWebBackendUrl(brokerInfo, fallbackUrl)
);

export const resolveBrokerExtApiUrl = (brokerInfo = {}, backendUrl = '') => {
  if (getDeploymentRuntimeConfig()) {
    return normalizeHttpUrl(
      getRuntimeConfigValue(['API_HOST_EXT', 'VITE_API_HOST_EXT'])
        || getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']),
      'https', true
    );
  }
  if (!isDesktopBackendTarget() && isConfiguredRuntimeBroker(brokerInfo)) {
    const configuredExt = getRuntimeConfigValue(['API_HOST_EXT', 'VITE_API_HOST_EXT'])
      || getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']);
    const resolvedConfiguredExt = sanitizeWebBackendCandidate(configuredExt, brokerInfo, backendUrl);
    if (resolvedConfiguredExt) return resolvedConfiguredExt;
  }
  const explicitKeys = isDesktopBackendTarget()
    ? ['desktop_ext_api_url', 'desktopExtApiUrl', 'ext_api_url', 'extApiUrl']
    : ['web_ext_api_url', 'webExtApiUrl', 'ext_api_url', 'extApiUrl', 'env.API_HOST_EXT', 'env.VITE_API_HOST_EXT'];

  const explicit = getValue(brokerInfo, explicitKeys);
  if (explicit) {
    if (hasGtaMarker(explicit)) return GTA_PUBLIC_BACKEND_URL;
    return isDesktopBackendTarget()
      ? normalizeDesktopHttpUrl(explicit)
      : sanitizeWebBackendCandidate(explicit, brokerInfo, backendUrl);
  }

  const fallback =
    backendUrl ||
    getRuntimeConfigValue(['API_HOST_EXT', 'VITE_API_HOST_EXT']) ||
    resolveBrokerBackendUrl(brokerInfo);

  return isDesktopBackendTarget()
    ? normalizeDesktopHttpUrl(fallback)
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

const toDesktopWsUrl = (value = '') => {
  const raw = toWsUrl(value, 'wss');
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (isLocalHost(url.hostname) || isIpAddress(url.hostname)) {
      if (!/^wss?:\/\//i.test(String(value || ''))) url.protocol = 'ws:';
    } else if (url.protocol === 'ws:') {
      url.protocol = 'wss:';
    }
    return trimTrailingSlash(url.toString());
  } catch {
    return raw;
  }
};

const buildWsEndpoint = (baseUrl = '', path = DEFAULT_WS_PATH) => {
  const base = trimTrailingSlash(baseUrl);
  const wsPath = path || DEFAULT_WS_PATH;
  if (!base) return wsPath;
  if (!wsPath) return base;

  try {
    const url = new URL(base);
    const desiredPath = wsPath.startsWith('/') ? wsPath : `/${wsPath}`;
    const currentPath = trimTrailingSlash(url.pathname);

    if (!currentPath || currentPath === '/') {
      url.pathname = desiredPath;
      return trimTrailingSlash(url.toString());
    }
    if (currentPath === desiredPath) return trimTrailingSlash(url.toString());
    if (/\/ws\/v2$/i.test(currentPath)) {
      url.pathname = desiredPath;
      url.search = '';
      url.hash = '';
      return trimTrailingSlash(url.toString());
    }
    return trimTrailingSlash(url.toString());
  } catch {
    if (base.endsWith(wsPath)) return base;
  }

  return `${base}${wsPath.startsWith('/') ? '' : '/'}${wsPath}`;
};

const sanitizeWebWsCandidate = (candidate = '', brokerInfo = {}, fallbackUrl = '') => {
  if (!candidate) return '';
  if (isGtaBrokerInfo(brokerInfo, fallbackUrl) || hasGtaMarker(candidate)) {
    return 'wss://fxtrustbrokerbackend.orrnn.com';
  }

  const wsUrl = toWsUrl(candidate, 'wss');
  const host = hostnameFromUrl(wsUrl);
  if (!host) return '';
  if (isIpAddress(host)) return '';
  if (isUiOnlyHost(host)) return '';

  try {
    const url = new URL(wsUrl);
    if (url.protocol === 'ws:' && !isLocalHost(url.hostname)) {
      url.protocol = 'wss:';
    }
    if ((url.protocol === 'wss:' && url.port === '443') || (url.protocol === 'ws:' && url.port === '80')) {
      url.port = '';
    }
    return trimTrailingSlash(url.toString());
  } catch {
    return wsUrl.replace(/^ws:\/\//i, 'wss://');
  }
};

export const resolveBrokerWsUrl = (brokerInfo = {}, fallbackUrl = '', path = DEFAULT_WS_PATH) => {
  if (getDeploymentRuntimeConfig()) {
    const configured = getRuntimeConfigValue(['FEED_WS_URL', 'VITE_FEED_WS_URL'])
      || getRuntimeConfigValue(['WS_HOST', 'VITE_WS_HOST'])
      || getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']);
    return configured ? buildWsEndpoint(toWsUrl(configured, 'wss'), path) : '';
  }
  const explicitKeys = isDesktopBackendTarget()
    ? [
        'desktop_feed_ws_url',
        'desktopFeedWsUrl',
        'desktop_ws_url',
        'desktopWsUrl',
        'feed_ws_url',
        'feedWsUrl',
        'feed_url',
        'feedUrl',
        'ws_url',
        'wsUrl',
      ]
    : [
        'web_feed_wss_url',
        'webFeedWssUrl',
        'feed_wss_url',
        'feedWssUrl',
        'wss_url',
        'wssUrl',
        'web_feed_ws_url',
        'webFeedWsUrl',
        'web_ws_url',
        'webWsUrl',
        'feed_ws_url',
        'feedWsUrl',
        'feed_url',
        'feedUrl',
        'env.WS_HOST',
        'env.VITE_WS_HOST',
        'ws_url',
        'wsUrl',
      ];

  const runtimeFeedOverride = getRuntimeConfigValue(['FEED_WS_URL', 'VITE_FEED_WS_URL']);
  const explicit = runtimeFeedOverride || getValue(brokerInfo, explicitKeys) || getRuntimeConfigValue(['WS_HOST', 'VITE_WS_HOST']);
  if (explicit) {
    const resolvedExplicit = isDesktopBackendTarget()
      ? toDesktopWsUrl(hasGtaMarker(explicit) ? GTA_PUBLIC_BACKEND_URL : explicit)
      : sanitizeWebWsCandidate(explicit, brokerInfo, fallbackUrl);
    if (resolvedExplicit) return buildWsEndpoint(resolvedExplicit, path);
  }

  if (isTestBrokerInfo(brokerInfo, fallbackUrl)) {
    return buildWsEndpoint(TEST_BROKER_WS_URL, path);
  }

  const backendUrl = resolveBrokerBackendUrl(brokerInfo, fallbackUrl);
  const defaultProtocol = backendUrl.startsWith('https://') ? 'wss' : 'ws';
  return buildWsEndpoint(toWsUrl(backendUrl || fallbackUrl, defaultProtocol), path);
};

export const isDirectBrokerBackendUrl = (backendUrl = '', brokerInfo = {}) => {
  const host = hostnameFromUrl(backendUrl);
  if (!host) return false;
  if (isIpAddress(host) || isLocalHost(host)) return true;
  if (!isDesktopBackendTarget()) return false;

  const directHosts = [
    getValue(brokerInfo, DIRECT_HOST_KEYS),
    hostnameFromUrl(getValue(brokerInfo, DESKTOP_BACKEND_KEYS)),
    hostnameFromUrl(getValue(brokerInfo, ['local_backend_url', 'ip_backend_url'])),
  ].filter(Boolean);

  return directHosts.some((directHost) => host.toLowerCase() === directHost.toLowerCase());
};

export const resolveBrokerDefaultMt5Server = (brokerInfo = {}, backendUrl = '') => (
  getDeploymentRuntimeConfig()
    ? getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER'])
      || hostnameFromUrl(getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']))
    : (isConfiguredRuntimeBroker(brokerInfo)
      ? getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER'])
      : '') ||
  getValue(brokerInfo, ['env.DEFAULT_MT5_SERVER', 'env.VITE_DEFAULT_MT5_SERVER', 'default_mt5_server', 'mt5_server']) ||
  getValue(brokerInfo, ['server_ip', 'host', 'ip']) ||
  (isTestBrokerInfo(brokerInfo, backendUrl) ? TEST_BROKER_DEFAULT_MT5_SERVER : '') ||
  hostnameFromUrl(backendUrl) ||
  getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER'])
);

export const normalizeBrokerInfo = (brokerInfo = {}, fallbackUrl = '') => {
  const isLocalConfigured = isConfiguredLocalBroker(brokerInfo);
  const isWebConfigured = !isDesktopBackendTarget() && isConfiguredRuntimeBroker(brokerInfo);
  const configuredApiHost = getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']);
  const configuredApiHostExt = getRuntimeConfigValue(['API_HOST_EXT', 'VITE_API_HOST_EXT']);
  const configuredFeedWsUrl = getRuntimeConfigValue(['FEED_WS_URL', 'VITE_FEED_WS_URL']);
  const configuredFeedStatusUrl = getRuntimeConfigValue(['FEED_STATUS_URL', 'VITE_FEED_STATUS_URL']);
  const configuredDefaultMt5Server = getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER']);
  const configuredBrokerName = getRuntimeConfigValue(['BROKER_NAME', 'VITE_BROKER_NAME']);

  const source = isLocalConfigured ? {
    ...brokerInfo,
    backend_url: configuredApiHost,
    desktop_backend_url: configuredApiHost,
    ext_api_url: configuredApiHostExt,
    ws_url: configuredFeedWsUrl,
    feed_ws_url: configuredFeedWsUrl,
    feed_status_url: configuredFeedStatusUrl,
    default_mt5_server: configuredDefaultMt5Server,
  } : isWebConfigured ? {
    ...brokerInfo,
    ...(configuredApiHost ? { backend_url: configuredApiHost, web_backend_url: configuredApiHost } : {}),
    ...(configuredApiHostExt ? { ext_api_url: configuredApiHostExt, web_ext_api_url: configuredApiHostExt } : {}),
    ...(configuredFeedWsUrl ? { ws_url: configuredFeedWsUrl, feed_ws_url: configuredFeedWsUrl } : {}),
    ...(configuredFeedStatusUrl ? { feed_status_url: configuredFeedStatusUrl } : {}),
    ...(configuredDefaultMt5Server ? { default_mt5_server: configuredDefaultMt5Server } : {}),
    ...(configuredBrokerName ? { name: configuredBrokerName, broker_name: configuredBrokerName } : {}),
  } : brokerInfo || {};
  const isTest = isTestBrokerInfo(source, fallbackUrl);
  const isGta = isGtaBrokerInfo(source, fallbackUrl);

  const fallbackBackend = isTest
    ? TEST_BROKER_PUBLIC_BACKEND_URL
    : (isGta ? GTA_PUBLIC_BACKEND_URL : fallbackUrl);

  const backendUrl = resolveBrokerBackendUrl(source, fallbackBackend);
  const desktopUrl = resolveDesktopBackendUrl(source, fallbackBackend);
  const serverIp =
    (isTest ? (getValue(source, DIRECT_HOST_KEYS) || TEST_BROKER_DIRECT_HOST) : (isGta ? GTA_DIRECT_HOST : getValue(source, DIRECT_HOST_KEYS))) ||
    hostnameFromUrl(desktopUrl || backendUrl);
  const serverPort =
    (isTest ? (getValue(source, DIRECT_PORT_KEYS) || String(TEST_BROKER_DIRECT_PORT)) : (isGta ? String(GTA_DIRECT_PORT) : getValue(source, DIRECT_PORT_KEYS))) ||
    portFromUrl(desktopUrl || backendUrl) ||
    String(DEFAULT_DIRECT_BACKEND_PORT);

  const normalized = {
    ...source,
    broker_id: source.broker_id || source.id || (isTest ? 'TEST' : undefined),
    name: source.name || source.broker_name || (isTest ? 'FXTrust / Test Broker' : source.broker_id || source.id),
    status: source.status || 'active',
    backend_url: backendUrl,
    api_url: backendUrl || source.api_url,
    server_ip: serverIp,
    server_port: Number(serverPort),
  };

  if (isTest) {
    if (!normalized.ws_url) normalized.ws_url = TEST_BROKER_WS_URL;
    if (!normalized.feed_ws_url) normalized.feed_ws_url = TEST_BROKER_WS_URL;
    if (!normalized.feed_status_url) normalized.feed_status_url = TEST_BROKER_FEED_STATUS_URL;
    if (!normalized.default_mt5_server) normalized.default_mt5_server = TEST_BROKER_DEFAULT_MT5_SERVER;
  }

  if (backendUrl && !isDesktopBackendTarget()) normalized.web_backend_url = backendUrl;
  if (desktopUrl) normalized.desktop_backend_url = desktopUrl;

  return normalized;
};

export const normalizeBrokerInfoForTarget = normalizeBrokerInfo;
