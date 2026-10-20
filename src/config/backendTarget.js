const DEFAULT_BACKEND_TARGET = 'web';
const DEFAULT_DIRECT_BACKEND_PORT = 8091;
const DEFAULT_WS_PATH = '/ws/feed';

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
  'API_HOST', 'API_HOST_EXT', 'WS_HOST', 'WS_FEED_PATH',
  'MANAGER_WS_HOST', 'MARKET_DATA_SOURCE', 'MANAGER_PROXY_STRIP_MANAGER_PREFIX',
  'POSITION_UPDATES_WS_PATH', 'FEED_WS_URL', 'FEED_STATUS_URL',
  'DISCOVERY_BASE_URL', 'DEFAULT_MT5_SERVER', 'USE_MOCK_DISCOVERY', 'LOCAL_BACKEND',
  'TEST_BROKER_PUBLIC_BACKEND_URL', 'TEST_BROKER_DIRECT_HOST', 'TEST_BROKER_DIRECT_PORT',
  'TEST_BROKER_WS_URL', 'TEST_BROKER_FEED_STATUS_URL', 'TEST_BROKER_DEFAULT_MT5_SERVER',
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

const toBrokerPort = (value) => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : '';
};

const readTestBrokerRuntimeDefaults = () => ({
  publicBackendUrl: getRuntimeConfigValue([
    'TEST_BROKER_PUBLIC_BACKEND_URL', 'VITE_TEST_BROKER_PUBLIC_BACKEND_URL',
    'API_HOST', 'VITE_API_HOST',
  ], ''),
  directHost: getRuntimeConfigValue([
    'TEST_BROKER_DIRECT_HOST', 'VITE_TEST_BROKER_DIRECT_HOST',
  ], ''),
  directPort: getRuntimeConfigValue([
    'TEST_BROKER_DIRECT_PORT', 'VITE_TEST_BROKER_DIRECT_PORT',
  ], String(DEFAULT_DIRECT_BACKEND_PORT)),
  wsUrl: getRuntimeConfigValue([
    'TEST_BROKER_WS_URL', 'VITE_TEST_BROKER_WS_URL',
    'FEED_WS_URL', 'VITE_FEED_WS_URL',
  ], ''),
  feedStatusUrl: getRuntimeConfigValue([
    'TEST_BROKER_FEED_STATUS_URL', 'VITE_TEST_BROKER_FEED_STATUS_URL',
    'FEED_STATUS_URL', 'VITE_FEED_STATUS_URL',
  ], ''),
  defaultMt5Server: getRuntimeConfigValue([
    'TEST_BROKER_DEFAULT_MT5_SERVER', 'VITE_TEST_BROKER_DEFAULT_MT5_SERVER',
    'DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER',
  ], ''),
});

// TEST profiles are optional fixtures. Without explicit runtime config they
// carry no broker host, URL or MT5 endpoint and every resolver fails closed.
export const getTestBrokerRuntimeDefaults = () => {
  const defaults = readTestBrokerRuntimeDefaults();
  return { ...defaults, directPort: toBrokerPort(defaults.directPort) };
};

const initialTestBrokerDefaults = getTestBrokerRuntimeDefaults();
export const TEST_BROKER_PUBLIC_BACKEND_URL = initialTestBrokerDefaults.publicBackendUrl;
export const TEST_BROKER_DIRECT_HOST = initialTestBrokerDefaults.directHost;
export const TEST_BROKER_DIRECT_PORT = initialTestBrokerDefaults.directPort;
export const TEST_BROKER_WS_URL = initialTestBrokerDefaults.wsUrl;
export const TEST_BROKER_FEED_STATUS_URL = initialTestBrokerDefaults.feedStatusUrl;
export const TEST_BROKER_DEFAULT_MT5_SERVER = initialTestBrokerDefaults.defaultMt5Server;

export const getBackendTarget = () => normalizeTarget(
  getRuntimeConfigValue(['BACKEND_TARGET', 'VITE_BACKEND_TARGET', 'BACKEND_MODE', 'VITE_BACKEND_MODE'])
);

export const isDesktopBackendTarget = () => getBackendTarget() === 'desktop';

// Discovery intentionally hides backend addresses. Local development supplies
// the selected broker's addresses without activating the legacy TEST profile.
const isConfiguredLocalBroker = (brokerInfo = {}) => (
  getRuntimeConfigValue(['LOCAL_BACKEND', 'VITE_LOCAL_BACKEND']) === 'true'
  && String(brokerInfo.broker_id || '').toLowerCase() ===
    getRuntimeConfigValue(['BROKER_ID', 'VITE_BROKER_ID']).toLowerCase()
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
const isLocalHost = (host = '') => /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(String(host || '').trim());

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

export const hasTestBrokerMarker = (value = '') => {
  const text = String(value || '').toLowerCase().trim();
  if (!text) return false;
  return (
    text === 'test' ||
    text === 'test-broker' ||
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

const isUiOnlyHost = (host = '') => /^(admin|client|manager)\./i.test(host);

// Unspecified addresses are never valid backend targets.
const isUnspecifiedHost = (host = '') => /^(0\.0\.0\.0|\[?::\]?)$/i.test(String(host || '').trim());

const normalizeDomainCandidate = (candidate = '') => {
  const value = String(candidate || '').trim();
  if (!value) return '';
  return hasProtocol(value) ? value : `https://${value}`;
};

const sanitizeWebBackendCandidate = (candidate = '') => {
  if (!candidate) return '';

  const normalized = normalizeHttpUrl(candidate, 'https', true);
  const host = hostnameFromUrl(normalized);
  if (!host) return '';
  // No hardcoded host mappings: any host translation must come from
  // runtime-config, never a literal (white-label rule).
  // Loopback is accepted so local/dev/test stacks (discovery records without
  // backend URLs + loopback API_HOST) can sign in; unspecified addresses and
  // every other IP stay rejected exactly as before.
  if (isUnspecifiedHost(host)) return '';
  if (isIpAddress(host) && !isLocalHost(host)) return '';
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
      const resolved = sanitizeWebBackendCandidate(candidate);
      if (resolved) return resolved;
    }
    return getTestBrokerRuntimeDefaults().publicBackendUrl;
  }

  const candidates = [
    ...WEB_BACKEND_KEYS.map((key) => getValue(brokerInfo, [key])),
    ...WEB_BACKEND_DOMAIN_KEYS.map((key) => normalizeDomainCandidate(getValue(brokerInfo, [key]))),
    fallbackUrl,
    getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']),
  ];

  for (const candidate of candidates) {
    const resolved = sanitizeWebBackendCandidate(candidate);
    if (resolved) return resolved;
  }

  return '';
};

const resolveBrokerPublicBackendUrl = (brokerInfo = {}) => {
  for (const key of BROKER_PUBLIC_BACKEND_KEYS) {
    const candidate = WEB_BACKEND_DOMAIN_KEYS.includes(key)
      ? normalizeDomainCandidate(getValue(brokerInfo, [key]))
      : getValue(brokerInfo, [key]);
    const resolved = sanitizeWebBackendCandidate(candidate);
    if (resolved) return resolved;
  }

  return '';
};

const resolveDesktopBackendUrl = (brokerInfo = {}, fallbackUrl = '') => {
  const explicit = getValue(brokerInfo, DESKTOP_BACKEND_KEYS);
  const normalizedExplicit = explicit ? normalizeDesktopHttpUrl(explicit) : '';
  const explicitHost = hostnameFromUrl(normalizedExplicit);
  if (normalizedExplicit && explicitHost && !isIpAddress(explicitHost)) return normalizedExplicit;

  if (isTestBrokerInfo(brokerInfo, fallbackUrl)) {
    const testDefaults = getTestBrokerRuntimeDefaults();
    if (normalizedExplicit) return normalizedExplicit;
    const publicBackend = resolveBrokerPublicBackendUrl(brokerInfo);
    if (publicBackend) return publicBackend;
    const host = getValue(brokerInfo, DIRECT_HOST_KEYS) || testDefaults.directHost;
    const port = getValue(brokerInfo, DIRECT_PORT_KEYS, String(testDefaults.directPort));
    if (host) return buildDirectBackendUrl(host, port);
    return testDefaults.publicBackendUrl;
  }

  const publicBackend = resolveBrokerPublicBackendUrl(brokerInfo);
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
  const explicitKeys = isDesktopBackendTarget()
    ? ['desktop_ext_api_url', 'desktopExtApiUrl', 'ext_api_url', 'extApiUrl']
    : ['web_ext_api_url', 'webExtApiUrl', 'ext_api_url', 'extApiUrl', 'env.API_HOST_EXT', 'env.VITE_API_HOST_EXT'];

  const explicit = getValue(brokerInfo, explicitKeys);
  if (explicit) {
    return isDesktopBackendTarget()
      ? normalizeDesktopHttpUrl(explicit)
      : sanitizeWebBackendCandidate(explicit);
  }

  const fallback =
    backendUrl ||
    getRuntimeConfigValue(['API_HOST_EXT', 'VITE_API_HOST_EXT']) ||
    resolveBrokerBackendUrl(brokerInfo);

  return isDesktopBackendTarget()
    ? normalizeDesktopHttpUrl(fallback)
    : sanitizeWebBackendCandidate(fallback);
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

const sanitizeWebWsCandidate = (candidate = '') => {
  if (!candidate) return '';

  const wsUrl = toWsUrl(candidate, 'wss');
  const host = hostnameFromUrl(wsUrl);
  if (!host) return '';
  // Same loopback carve-out as the HTTP sanitizer above: local stacks only.
  if (isUnspecifiedHost(host)) return '';
  if (isIpAddress(host) && !isLocalHost(host)) return '';
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
      ? toDesktopWsUrl(explicit)
      : sanitizeWebWsCandidate(explicit);
    if (resolvedExplicit) return buildWsEndpoint(resolvedExplicit, path);
  }

  if (isTestBrokerInfo(brokerInfo, fallbackUrl)) {
    const testDefaults = getTestBrokerRuntimeDefaults();
    const testWs = testDefaults.wsUrl || testDefaults.publicBackendUrl;
    return testWs ? buildWsEndpoint(toWsUrl(testWs, 'wss'), path) : '';
  }

  const backendUrl = resolveBrokerBackendUrl(brokerInfo, fallbackUrl);
  const defaultProtocol = backendUrl.startsWith('https://') ? 'wss' : 'ws';
  // The raw fallback must pass the same sanitizer: an unspecified or
  // non-loopback-IP fallback is not a valid target either.
  const clean = sanitizeWebWsCandidate(backendUrl || fallbackUrl);
  if (!clean) return '';
  return buildWsEndpoint(toWsUrl(clean, defaultProtocol), path);
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

export const resolveBrokerDefaultMt5Server = (brokerInfo = {}, backendUrl = '') => {
  if (getDeploymentRuntimeConfig()) {
    return getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER'])
      || hostnameFromUrl(getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']));
  }

  const explicit = getValue(brokerInfo, [
    'env.DEFAULT_MT5_SERVER',
    'env.VITE_DEFAULT_MT5_SERVER',
    'default_mt5_server',
    'mt5_server',
  ]);
  if (explicit) return explicit;

  const directHost = getValue(brokerInfo, ['server_ip', 'host', 'ip']);
  if (directHost) return directHost;

  if (isTestBrokerInfo(brokerInfo, backendUrl)) {
    const testDefault = getTestBrokerRuntimeDefaults().defaultMt5Server;
    if (testDefault) return testDefault;
  }

  return hostnameFromUrl(backendUrl)
    || getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER']);
};

export const isPlaceholderBrokerLogoUrl = (value = '') =>
  /(?:^|\/)assets\/logo\.png(?:[?#].*)?$/i.test(String(value || '').trim());

export const buildBrokerDirectoryLogoUrl = (
  brokerId = '',
  discoveryBaseUrl = getRuntimeConfigValue(['DISCOVERY_BASE_URL', 'VITE_DISCOVERY_BASE_URL'], '')
) => {
  const normalizedBrokerId = String(brokerId || '').trim();
  if (!normalizedBrokerId) return '';
  const base = trimTrailingSlash(String(discoveryBaseUrl || '').trim());
  const path = `/api/v1/brokers/${encodeURIComponent(normalizedBrokerId)}/logo`;
  return base ? `${base}${path}` : path;
};

export const buildBrokerLogoCandidates = (
  brokerInfo = {},
  {
    discoveryBaseUrl = getRuntimeConfigValue(['DISCOVERY_BASE_URL', 'VITE_DISCOVERY_BASE_URL'], ''),
    appFallbackUrl = '',
  } = {}
) => {
  const candidates = [];
  const appendUnique = (value = '') => {
    const trimmed = String(value || '').trim();
    if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
  };

  if (brokerInfo && typeof brokerInfo === 'object') {
    const brokerId = String(brokerInfo.broker_id || brokerInfo.id || '').trim();
    const configuredBrokerId = String(getRuntimeConfigValue(['BROKER_ID', 'VITE_BROKER_ID'], '')).trim();
    const configuredLogoUrl = getRuntimeConfigValue(['BROKER_LOGO_URL', 'VITE_BROKER_LOGO_URL'], '');
    if (
      !isDesktopBackendTarget() &&
      configuredLogoUrl &&
      !isPlaceholderBrokerLogoUrl(configuredLogoUrl) &&
      (!configuredBrokerId || !brokerId || configuredBrokerId.toLowerCase() === brokerId.toLowerCase())
    ) {
      appendUnique(configuredLogoUrl);
    }

    const rawLogoUrl = String(brokerInfo.logo_url || '').trim();
    const backendUrl = resolveBrokerBackendUrl(brokerInfo);
    const baseCandidates = [
      rawLogoUrl.startsWith('/api/v1/brokers/') ? discoveryBaseUrl : '',
      backendUrl,
      brokerInfo.server_url,
      brokerInfo.backend_url,
      brokerInfo.market_api_url,
      getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST'], ''),
      discoveryBaseUrl,
    ]
      .map((base) => trimTrailingSlash(String(base || '').trim()))
      .filter(Boolean);

    if (rawLogoUrl && !isPlaceholderBrokerLogoUrl(rawLogoUrl)) {
      if (/^(?:https?:|data:|blob:)/i.test(rawLogoUrl)) {
        appendUnique(rawLogoUrl);
      } else if (rawLogoUrl.startsWith('//')) {
        appendUnique(`https:${rawLogoUrl}`);
      } else if (baseCandidates.length > 0) {
        const path = rawLogoUrl.startsWith('/') ? rawLogoUrl : `/${rawLogoUrl}`;
        for (const base of baseCandidates) {
          if (/^https?:\/\//i.test(base)) {
            appendUnique(`${base}${path}`);
          }
        }
      } else {
        appendUnique(rawLogoUrl);
      }
    }

    if (brokerId) {
      const logoPath = `/api/v1/brokers/${encodeURIComponent(brokerId)}/logo`;
      const directoryBases = [
        discoveryBaseUrl,
        backendUrl,
        brokerInfo.server_url,
        brokerInfo.backend_url,
        getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST'], ''),
      ]
        .map((base) => trimTrailingSlash(String(base || '').trim()))
        .filter((base) => /^https?:\/\//i.test(base));
      for (const base of directoryBases) {
        appendUnique(`${base}${logoPath}`);
      }
    }
  }

  appendUnique(appFallbackUrl);
  return candidates;
};

export const resolveBrokerLogoUrl = (brokerInfo = {}, options = {}) =>
  buildBrokerLogoCandidates(brokerInfo, options)[0] || '';

export const normalizeBrokerInfo = (brokerInfo = {}, fallbackUrl = '') => {
  const source = isConfiguredLocalBroker(brokerInfo) ? {
    ...brokerInfo,
    backend_url: getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']),
    desktop_backend_url: getRuntimeConfigValue(['API_HOST', 'VITE_API_HOST']),
    ext_api_url: getRuntimeConfigValue(['API_HOST_EXT', 'VITE_API_HOST_EXT']),
    ws_url: getRuntimeConfigValue(['FEED_WS_URL', 'VITE_FEED_WS_URL']),
    feed_ws_url: getRuntimeConfigValue(['FEED_WS_URL', 'VITE_FEED_WS_URL']),
    feed_status_url: getRuntimeConfigValue(['FEED_STATUS_URL', 'VITE_FEED_STATUS_URL']),
    default_mt5_server: getRuntimeConfigValue(['DEFAULT_MT5_SERVER', 'VITE_DEFAULT_MT5_SERVER']),
  } : brokerInfo || {};
  const isTest = isTestBrokerInfo(source, fallbackUrl);
  const testDefaults = isTest ? getTestBrokerRuntimeDefaults() : null;

  const fallbackBackend = isTest ? testDefaults.publicBackendUrl : fallbackUrl;

  const backendUrl = resolveBrokerBackendUrl(source, fallbackBackend);
  const desktopUrl = resolveDesktopBackendUrl(source, fallbackBackend);
  const serverIp =
    (isTest ? (getValue(source, DIRECT_HOST_KEYS) || testDefaults.directHost) : getValue(source, DIRECT_HOST_KEYS)) ||
    hostnameFromUrl(desktopUrl || backendUrl);
  const serverPort =
    (isTest ? (getValue(source, DIRECT_PORT_KEYS) || String(testDefaults.directPort)) : getValue(source, DIRECT_PORT_KEYS)) ||
    portFromUrl(desktopUrl || backendUrl) ||
    String(DEFAULT_DIRECT_BACKEND_PORT);

  const normalized = {
    ...source,
    broker_id: source.broker_id || source.id || (isTest ? 'TEST' : undefined),
    name: source.name || source.broker_name || (isTest ? 'Test Broker' : source.broker_id || source.id),
    status: source.status || 'active',
    backend_url: backendUrl,
    api_url: backendUrl || source.api_url,
    server_ip: serverIp,
    server_port: Number(serverPort),
  };

  if (isPlaceholderBrokerLogoUrl(normalized.logo_url)) {
    delete normalized.logo_url;
  }

  if (isTest) {
    if (!normalized.ws_url && testDefaults.wsUrl) normalized.ws_url = testDefaults.wsUrl;
    if (!normalized.feed_ws_url && testDefaults.wsUrl) normalized.feed_ws_url = testDefaults.wsUrl;
    if (!normalized.feed_status_url && testDefaults.feedStatusUrl) normalized.feed_status_url = testDefaults.feedStatusUrl;
    if (!normalized.default_mt5_server && testDefaults.defaultMt5Server) {
      normalized.default_mt5_server = testDefaults.defaultMt5Server;
    }
  }

  if (backendUrl && !isDesktopBackendTarget()) normalized.web_backend_url = backendUrl;
  if (desktopUrl) normalized.desktop_backend_url = desktopUrl;

  return normalized;
};

export const normalizeBrokerInfoForTarget = normalizeBrokerInfo;
