import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDesktopInstallerAsset } from './desktopRelease.js';

test('selectDesktopInstallerAsset picks the installer from the latest release assets', () => {
  const installer = selectDesktopInstallerAsset({
    tag_name: 'v1.0.7',
    assets: [
      { name: 'latest.yml', browser_download_url: 'https://example.test/latest.yml' },
      { name: 'RTX-5-Broker-Manager-Setup-1.0.7.exe.blockmap', browser_download_url: 'https://example.test/app.blockmap' },
      { name: 'RTX-5-Broker-Manager-Setup-1.0.7.exe', browser_download_url: 'https://example.test/app.exe' },
    ],
  });

  assert.deepEqual(installer, {
    name: 'RTX-5-Broker-Manager-Setup-1.0.7.exe',
    url: 'https://example.test/app.exe',
    version: '1.0.7',
    publishedAt: '',
  });
});

test('selectDesktopInstallerAsset fails when release has no installer asset', () => {
  assert.throws(
    () => selectDesktopInstallerAsset({ tag_name: 'v1.0.7', assets: [] }),
    /Latest desktop installer is not available yet/
  );
});
