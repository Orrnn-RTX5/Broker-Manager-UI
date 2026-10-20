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

export const RELEASE_CHANNEL_UNAVAILABLE_MESSAGE = 'Desktop update check is not configured for this broker.';

const asChannelUrl = (value = '') => {
  if (typeof value !== 'string') return '';
  return value.trim();
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
// infrastructure.
export const resolveReleaseChannel = (config = {}) => {
  if (!config || typeof config !== 'object') return null;
  for (const key of RELEASE_CHANNEL_KEYS) {
    const value = readChannelKey(config, key);
    if (value) return value;
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
  if (!channelUrl) {
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
