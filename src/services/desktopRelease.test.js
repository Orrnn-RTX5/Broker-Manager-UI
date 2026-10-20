import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RELEASE_CHANNEL_UNAVAILABLE_MESSAGE,
  fetchLatestDesktopInstaller,
  getReleaseApiUrl,
  isReleaseChannelConfigured,
  resolveReleaseChannel,
  selectDesktopInstallerAsset,
} from './desktopRelease.js';

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

test('resolveReleaseChannel returns the configured channel', () => {
  assert.equal(
    resolveReleaseChannel({ DESKTOP_RELEASE_API_URL: 'https://releases.example.test/api/latest' }),
    'https://releases.example.test/api/latest'
  );
  assert.equal(
    resolveReleaseChannel({ VITE_DESKTOP_RELEASE_API_URL: 'https://releases.example.test/vite/latest' }),
    'https://releases.example.test/vite/latest'
  );
  assert.equal(
    resolveReleaseChannel({ desktop_release_api_url: 'https://releases.example.test/broker/latest' }),
    'https://releases.example.test/broker/latest'
  );
  assert.equal(
    resolveReleaseChannel({ env: { DESKTOP_RELEASE_API_URL: 'https://releases.example.test/nested/latest' } }),
    'https://releases.example.test/nested/latest'
  );
});

test('resolveReleaseChannel returns null when no channel is configured', () => {
  assert.equal(resolveReleaseChannel({}), null);
  assert.equal(resolveReleaseChannel(null), null);
  assert.equal(resolveReleaseChannel(undefined), null);
  assert.equal(resolveReleaseChannel('https://releases.example.test/api/latest'), null);
  assert.equal(resolveReleaseChannel({ DESKTOP_RELEASE_API_URL: '' }), null);
  assert.equal(resolveReleaseChannel({ DESKTOP_RELEASE_API_URL: '   ' }), null);
  assert.equal(resolveReleaseChannel({ unrelated_key: 'https://releases.example.test/api/latest' }), null);
});

const withRuntimeChannel = async (url, fn) => {
  const key = '__RTX_RUNTIME_CONFIG__';
  const hadPrior = Object.prototype.hasOwnProperty.call(globalThis, key);
  const prior = globalThis[key];
  try {
    if (url === undefined) {
      delete globalThis[key];
    } else {
      globalThis[key] = { DESKTOP_RELEASE_API_URL: url };
    }
    await fn();
  } finally {
    if (hadPrior) {
      globalThis[key] = prior;
    } else {
      delete globalThis[key];
    }
  }
};

test('getReleaseApiUrl uses the runtime channel when present', async () => {
  await withRuntimeChannel('https://releases.example.test/runtime/latest', () => {
    assert.equal(getReleaseApiUrl(), 'https://releases.example.test/runtime/latest');
    assert.equal(isReleaseChannelConfigured(), true);
  });
});

test('getReleaseApiUrl returns null when absent and emits no vendor URL', async () => {
  await withRuntimeChannel(undefined, () => {
    const channel = getReleaseApiUrl();
    assert.equal(channel, null);
    assert.equal(isReleaseChannelConfigured(), false);
    assert.ok(!String(channel || '').includes('://'));
  });
});

test('getReleaseApiUrl prefers the broker-provided channel', async () => {
  await withRuntimeChannel('https://releases.example.test/runtime/latest', () => {
    assert.equal(
      getReleaseApiUrl({ desktop_release_api_url: 'https://releases.example.test/broker/latest' }),
      'https://releases.example.test/broker/latest'
    );
  });
});

test('fetchLatestDesktopInstaller skips the network when no channel is configured', async () => {
  await withRuntimeChannel(undefined, async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true, json: async () => ({}) };
    };
    await assert.rejects(
      fetchLatestDesktopInstaller({ fetchImpl, brokerInfo: null }),
      new RegExp(RELEASE_CHANNEL_UNAVAILABLE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    assert.equal(calls, 0);
  });
});

test('fetchLatestDesktopInstaller queries the configured channel', async () => {
  await withRuntimeChannel('https://releases.example.test/runtime/latest', async () => {
    const seen = [];
    const fetchImpl = async (url, options = {}) => {
      seen.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          tag_name: 'v2.0.0',
          assets: [
            { name: 'RTX-5-Broker-Manager-Setup-2.0.0.exe', browser_download_url: 'https://releases.example.test/app.exe' },
          ],
        }),
      };
    };
    const installer = await fetchLatestDesktopInstaller({ fetchImpl });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://releases.example.test/runtime/latest');
    assert.equal(seen[0].options.headers.Accept, 'application/json');
    assert.equal(installer.version, '2.0.0');
  });
});

test('fetchLatestDesktopInstaller honors an explicit channel override', async () => {
  await withRuntimeChannel(undefined, async () => {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return {
        ok: true,
        json: async () => ({
          tag_name: 'v2.0.1',
          assets: [
            { name: 'RTX-5-Broker-Manager-Setup-2.0.1.exe', browser_download_url: 'https://releases.example.test/app.exe' },
          ],
        }),
      };
    };
    const installer = await fetchLatestDesktopInstaller({
      fetchImpl,
      releaseApiUrl: 'https://releases.example.test/explicit/latest',
    });
    assert.deepEqual(seen, ['https://releases.example.test/explicit/latest']);
    assert.equal(installer.version, '2.0.1');
  });
});

test('release channel sources hardcode no external URLs and Help wiring stays intact', () => {
  const releaseSource = readFileSync(new URL('./desktopRelease.js', import.meta.url), 'utf8');
  assert.ok(!/https?:\/\//.test(releaseSource), 'desktopRelease must not hardcode an external URL');

  // HelpCenter.jsx is stored in a legacy single-byte encoding; read it as
  // latin1 so the check does not depend on decoding.
  const helpSource = readFileSync(new URL('../components/HelpCenter.jsx', import.meta.url), 'latin1');
  assert.ok(!/https?:\/\//.test(helpSource), 'HelpCenter must not hardcode an external URL');
  assert.ok(helpSource.includes('Build version: {packageInfo.version}'), 'Help Updates version display stays intact');
  assert.ok(helpSource.includes('Version {packageInfo.version}'), 'Help About version display stays intact');
  assert.ok(helpSource.includes('getReleaseApiUrl'), 'HelpCenter resolves the channel from configuration');
  assert.ok(helpSource.includes('helpReleaseChannelUrl'), 'HelpCenter renders the link only when a channel exists');
});
