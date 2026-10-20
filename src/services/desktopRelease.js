import { getRuntimeConfigValue } from '../config/backendTarget.js';

// Release channel configuration keys. The desktop release channel is
// configuration only: runtime config (deployment-provided) or per-broker
// broker config. There is intentionally no built-in default — a white-label
// build must never query vendor infrastructure on its own.
const RUNTIME_RELEASE_API_URL_KEYS = ['DESKTOP_RELEASE_API_URL', 'VITE_DESKTOP_RELEASE_API_URL'];

// Broker-provided release channel fields (generic, tenant-agnostic). The
// normalized broker object passes unknown fields through, so a platform
// operator can publish the channel per broker without code changes.
const BROKER_RELEASE_API_URL_KEYS = [
  'desktop_release_api_url',
  'desktopReleaseApiUrl',
  'release_api_url',
  'releaseApiUrl',
  'DESKTOP_RELEASE_API_URL',
  'VITE_DESKTOP_RELEASE_API_URL',
];

const RELEASE_CHANNEL_KEYS = [...BROKER_RELEASE_API_URL_KEYS, ...RUNTIME_RELEASE_API_URL_KEYS];

// Human release-notes page keys. Same precedence pattern as the channel
// resolver: broker-style keys first, deployment runtime keys last. There is
// intentionally no built-in default — a white-label build must never point at
// vendor infrastructure on its own.
const RUNTIME_RELEASES_PAGE_URL_KEYS = ['DESKTOP_RELEASES_URL', 'VITE_DESKTOP_RELEASES_URL'];

// Broker-provided human notes-page fields (generic, tenant-agnostic).
const BROKER_RELEASES_PAGE_URL_KEYS = [
  'releasesUrl',
  'desktopReleasesUrl',
  'releaseNotesUrl',
];

const RELEASES_PAGE_KEYS = [...BROKER_RELEASES_PAGE_URL_KEYS, ...RUNTIME_RELEASES_PAGE_URL_KEYS];

export const RELEASE_CHANNEL_UNAVAILABLE_MESSAGE = 'Desktop update check is not configured for this broker.';

const asChannelUrl = (value = '') => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

// Allowlist for release-channel URLs (stored-XSS hardening, tenant-agnostic).
// Only http(s) absolute URLs and relative (scheme-less) URLs are accepted.
// Any other scheme (javascript:, data:, vbscript:, file:, blob:, ftp:, and
// the rest) is treated as unconfigured (null) so a stored channel value can
// never become a clickable script URL. Scheme match is case-insensitive and
// the value is trimmed first, so padded or cased variants are rejected too.
const isAllowedChannelUrl = (value = '') => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const schemeMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(trimmed);
  if (!schemeMatch) return true;
  const scheme = schemeMatch[0].slice(0, -1).toLowerCase();
  return scheme === 'http' || scheme === 'https';
};

const readChannelKey = (source = {}, key) => {
  if (!source || typeof source !== 'object') return '';
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    const direct = asChannelUrl(source[key]);
    if (direct) return direct;
  }
  const env = source.env;
  if (env && typeof env === 'object' && Object.prototype.hasOwnProperty.call(env, key)) {
    const nested = asChannelUrl(env[key]);
    if (nested) return nested;
  }
  return '';
};

// Pure helper: resolve the configured release channel from a plain config
// object (runtime config snapshot and/or broker info). Returns the channel
// URL, or null when no channel is configured. Never falls back to vendor
// infrastructure. Disallowed URL schemes (javascript:, data:, and other
// non-http(s) schemes) are treated as unconfigured and skipped.
export const resolveReleaseChannel = (config = {}) => {
  if (!config || typeof config !== 'object') return null;
  for (const key of RELEASE_CHANNEL_KEYS) {
    const value = readChannelKey(config, key);
    if (value && isAllowedChannelUrl(value)) return value;
  }
  return null;
};

// Human-notes page (configured): the channel above is a JSON API endpoint,
// not a human page, and there is no reliable generic mapping from an
// arbitrary tenant-configured JSON channel to an HTML notes page without
// hardcoding vendor hosts (forbidden by the white-label rule). Callers
// therefore label the raw channel honestly (for example "Query update
// channel") instead of claiming "View release notes". The human page is a
// separate configured key resolved by resolveReleasesPageUrl below; only that
// URL may ever be labeled as release notes.

// Pure helper: resolve the configured human release-notes page URL from a
// plain config object (direct fields, nested broker object, and/or deployment
// runtime config). Direct config wins, then the nested broker object, then
// runtime — within each source, broker-style keys precede runtime keys, the
// same precedence pattern as resolveReleaseChannel. Returns the page URL, or
// null when no notes page is configured. Never falls back to vendor
// infrastructure. Disallowed URL schemes (javascript:, data:, and other
// non-http(s) schemes) are treated as unconfigured and skipped.
export const resolveReleasesPageUrl = (config = {}) => {
  const direct = config && typeof config === 'object' ? config : {};
  const nested = direct.broker && typeof direct.broker === 'object' ? direct.broker : {};
  const runtimeSnapshot = {};
  for (const key of RUNTIME_RELEASES_PAGE_URL_KEYS) {
    runtimeSnapshot[key] = getRuntimeConfigValue([key]);
  }
  for (const source of [direct, nested, runtimeSnapshot]) {
    for (const key of RELEASES_PAGE_KEYS) {
      const value = readChannelKey(source, key);
      if (value && isAllowedChannelUrl(value)) return value;
    }
  }
  return null;
};

// Impure wrapper: broker-provided channel wins when present, otherwise the
// runtime (deployment) configuration. Returns url-or-null.
export const getReleaseApiUrl = (brokerInfo = null) => {
  const fromBroker = resolveReleaseChannel(brokerInfo || {});
  if (fromBroker) return fromBroker;

  const runtimeSnapshot = {};
  for (const key of RUNTIME_RELEASE_API_URL_KEYS) {
    runtimeSnapshot[key] = getRuntimeConfigValue([key]);
  }
  return resolveReleaseChannel(runtimeSnapshot);
};

export const isReleaseChannelConfigured = (brokerInfo = null) => Boolean(getReleaseApiUrl(brokerInfo));

const INSTALLER_ASSET_PATTERN = /^RTX-5-Broker-Manager-Setup-.+\.exe$/i;

export const selectDesktopInstallerAsset = (release = {}) => {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const installer = assets.find((asset) => (
    asset?.browser_download_url &&
    INSTALLER_ASSET_PATTERN.test(String(asset.name || '')) &&
    !String(asset.name || '').toLowerCase().endsWith('.blockmap')
  ));

  if (!installer) {
    throw new Error('Latest desktop installer is not available yet.');
  }

  return {
    name: installer.name,
    url: installer.browser_download_url,
    version: String(release.tag_name || release.name || '').replace(/^v/i, ''),
    publishedAt: release.published_at || release.created_at || '',
  };
};

export const fetchLatestDesktopInstaller = async ({
  fetchImpl = globalThis.fetch, signal, brokerInfo = null, releaseApiUrl = '',
} = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Download service is not available in this browser.');
  }

  const channelUrl = asChannelUrl(releaseApiUrl) || getReleaseApiUrl(brokerInfo);
  if (!channelUrl || !isAllowedChannelUrl(channelUrl)) {
    throw new Error(RELEASE_CHANNEL_UNAVAILABLE_MESSAGE);
  }

  const response = await fetchImpl(channelUrl, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response?.ok) {
    throw new Error('Could not check the latest desktop release.');
  }

  return selectDesktopInstallerAsset(await response.json());
};

export const startLatestDesktopDownload = async (options = {}) => {
  const installer = await fetchLatestDesktopInstaller(options);

  if (typeof document === 'undefined') {
    return installer;
  }

  const link = document.createElement('a');
  link.href = installer.url;
  link.download = installer.name;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();

  return installer;
};
