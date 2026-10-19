import { getRuntimeConfigValue } from '../config/backendTarget.js';

const DEFAULT_RELEASE_API_URL = 'https://api.github.com/repos/rtx5-orrnn/rtx5-broker-manager-releases/releases/latest';
const getReleaseApiUrl = () => getRuntimeConfigValue(
  ['DESKTOP_RELEASE_API_URL', 'VITE_DESKTOP_RELEASE_API_URL'],
  DEFAULT_RELEASE_API_URL
);
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

export const fetchLatestDesktopInstaller = async ({ fetchImpl = globalThis.fetch, signal } = {}) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Download service is not available in this browser.');
  }

  const response = await fetchImpl(getReleaseApiUrl(), {
    headers: {
      Accept: 'application/vnd.github+json',
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
