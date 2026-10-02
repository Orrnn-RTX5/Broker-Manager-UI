import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bakedBroker = {
  VITE_BACKEND_TARGET: 'web', VITE_BROKER_ID: 'orrnn', VITE_FEED_BROKER_ID: 'orrnn',
  VITE_API_HOST: 'https://service.orrnn.com', VITE_API_HOST_EXT: 'https://service.orrnn.com',
  VITE_WS_HOST: 'wss://service.orrnn.com', VITE_WS_FEED_PATH: '/ws/feed',
  VITE_MANAGER_WS_HOST: 'wss://service.orrnn.com', VITE_MARKET_DATA_SOURCE: 'manager',
  VITE_FEED_WS_URL: 'wss://service.orrnn.com/ws/feed',
  VITE_FEED_STATUS_URL: 'https://service.orrnn.com/ws/feed/status',
  VITE_POSITION_UPDATES_WS_PATH: '/OnPositionUpdate',
  VITE_MANAGER_PROXY_STRIP_MANAGER_PREFIX: 'true', VITE_DEFAULT_MT5_SERVER: 'Orrnn',
  VITE_REPORTS_SUMMARY_ENABLED: 'false',
};
const backendSource = readFileSync(new URL('./backendTarget.js', import.meta.url), 'utf8');
const endpointSource = readFileSync(new URL('./endpoints.js', import.meta.url), 'utf8');
let moduleVersion = 0;
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

// Model Vite's static env replacement so these regressions exercise the same
// source with another broker's settings compiled into it, not a mocked getter.
const loadBakedModules = async () => {
  const replaceEnv = (source) => source.replaceAll('import.meta.env', `(${JSON.stringify(bakedBroker)})`);
  const backendUrl = moduleUrl(`${replaceEnv(backendSource)}\n// instance ${moduleVersion++}`);
  const endpointsUrl = moduleUrl(replaceEnv(endpointSource).replace("'./backendTarget.js'", JSON.stringify(backendUrl)));
  return { backend: await import(backendUrl), endpoints: await import(endpointsUrl) };
};

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const reset = () => {
  for (const key of ['__RTX_RUNTIME_CONFIG__', 'RUNTIME_CONFIG', '__RUNTIME_CONFIG__', '__APP_CONFIG__', '_env_', 'env']) {
    delete globalThis[key];
  }
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
};
beforeEach(reset);
afterEach(reset);

const profile = (broker = 'achiever', origin = 'https://service.achiever.orrnn.com') => ({
  CONFIG_SOURCE: 'deployment', BACKEND_TARGET: 'web', BROKER_ID: broker, FEED_BROKER_ID: broker,
  API_HOST: origin, API_HOST_EXT: origin, WS_HOST: origin.replace(/^https:/, 'wss:'),
  WS_FEED_PATH: '/bridge/ws/feed', MARKET_DATA_SOURCE: 'manager',
  MANAGER_PROXY_STRIP_MANAGER_PREFIX: 'false', DEFAULT_MT5_SERVER: `${broker}-Live`,
});
const staleSession = (broker) => ({
  broker_id: broker, feed_broker_id: 'old-broker',
  web_backend_url: 'https://service.orrnn.com', backend_url: 'https://service.orrnn.com',
  web_feed_wss_url: 'wss://service.orrnn.com/ws/feed',
  feed_status_https_url: 'https://service.orrnn.com/ws/feed/status',
  env: { API_HOST: 'https://service.orrnn.com', DEFAULT_MT5_SERVER: 'Orrnn' },
});

for (const [broker, origin] of [
  ['achiever', 'https://service.achiever.orrnn.com'],
  ['orrnn', 'https://service.orrnn.com'],
  ['independent', 'https://api.independent.example:8443'],
  ['gta_broker', 'https://services.growtradingacademy.com'],
]) {
  test(`deployment routes ${broker} without compiled or saved broker overrides`, async () => {
    const wsOrigin = origin.replace(/^https:/, 'wss:');
    globalThis.__RTX_RUNTIME_CONFIG__ = profile(broker, origin);
    globalThis.RUNTIME_CONFIG = { ...bakedBroker };
    const stale = staleSession(broker);
    sessionStorage.setItem('broker_info', JSON.stringify(stale));
    const { backend, endpoints } = await loadBakedModules();
    assert.equal(endpoints.buildBrokerApiUrl('/api/v2/instruments'), `${origin}/api/v2/instruments`);
    assert.equal(endpoints.buildManagerMarketWsUrl('one-use'), `${wsOrigin}/manager/OnTick?ticket=one-use`);
    assert.equal(endpoints.buildAccountMetricsWsUrl('one-use'), `${wsOrigin}/manager/OnAccountMetrics?ticket=one-use`);
    assert.equal(endpoints.buildPositionUpdatesWsUrl('one-use'), `${wsOrigin}/manager/OnPositionUpdate?ticket=one-use`);
    assert.equal(endpoints.buildFeedWsUrl(), `${wsOrigin}/bridge/ws/feed?broker_id=${broker}`);
    assert.equal(endpoints.buildFeedStatusUrl(), `${origin}/bridge/ws/feed/status`);
    assert.equal(endpoints.isManagerMarketFeed(), true);
    assert.equal(backend.resolveBrokerBackendUrl(stale), origin);
    assert.equal(backend.resolveBrokerExtApiUrl(stale), origin);
    assert.equal(backend.resolveBrokerWsUrl(stale, '', '/bridge/ws/feed'), `${wsOrigin}/bridge/ws/feed`);
    assert.equal(backend.resolveBrokerDefaultMt5Server(stale), `${broker}-Live`);
  });
}

test('empty optional values derive from current API host and suppress VITE aliases', async () => {
  const config = profile('independent', 'https://api.independent.example:8443');
  for (const key of ['API_HOST_EXT', 'WS_HOST', 'MANAGER_WS_HOST', 'FEED_WS_URL', 'FEED_STATUS_URL',
    'POSITION_UPDATES_WS_PATH', 'MARKET_DATA_SOURCE', 'MANAGER_PROXY_STRIP_MANAGER_PREFIX']) {
    config[key] = '';
    config[`VITE_${key}`] = bakedBroker[`VITE_${key}`];
  }
  globalThis.__RTX_RUNTIME_CONFIG__ = config;
  const { endpoints } = await loadBakedModules();
  assert.equal(endpoints.buildFeedWsUrl(), 'wss://api.independent.example:8443/bridge/ws/feed?broker_id=independent');
  assert.equal(endpoints.buildFeedStatusUrl(), 'https://api.independent.example:8443/bridge/ws/feed/status');
  assert.equal(endpoints.buildPositionUpdatesWsUrl('one-use'), 'wss://api.independent.example:8443/manager/OnPositionUpdate?ticket=one-use');
  assert.equal(endpoints.isManagerMarketFeed(), false);
});

test('explicit manager and feed URLs and a custom position path remain supported', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    ...profile(), MANAGER_WS_HOST: 'https://manager-api.achiever.example:8443',
    MANAGER_PROXY_STRIP_MANAGER_PREFIX: 'true', POSITION_UPDATES_WS_PATH: '/custom/positions',
    FEED_WS_URL: 'wss://quotes.achiever.example/live', FEED_STATUS_URL: 'https://quotes.achiever.example/live/status',
  };
  const { endpoints } = await loadBakedModules();
  assert.equal(endpoints.buildManagerMarketWsUrl('one-use'), 'wss://manager-api.achiever.example:8443/OnTick?ticket=one-use');
  assert.equal(endpoints.buildAccountMetricsWsUrl('one-use'), 'wss://manager-api.achiever.example:8443/OnAccountMetrics?ticket=one-use');
  assert.equal(endpoints.buildPositionUpdatesWsUrl('one-use'), 'wss://manager-api.achiever.example:8443/custom/positions?ticket=one-use');
  assert.equal(endpoints.buildFeedWsUrl(), 'wss://quotes.achiever.example/live?broker_id=achiever');
  assert.equal(endpoints.buildFeedStatusUrl(), 'https://quotes.achiever.example/live/status');
  delete globalThis.__RTX_RUNTIME_CONFIG__.POSITION_UPDATES_WS_PATH;
  assert.equal(endpoints.buildPositionUpdatesWsUrl('one-use'), 'wss://manager-api.achiever.example:8443/OnPositionUpdate?ticket=one-use');
});

test('an incomplete deployment never revives compiled or session URLs', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = { CONFIG_SOURCE: 'deployment', BACKEND_TARGET: 'web' };
  sessionStorage.setItem('broker_info', JSON.stringify(staleSession('orrnn')));
  const { backend, endpoints } = await loadBakedModules();
  assert.equal(backend.resolveBrokerBackendUrl(staleSession('orrnn')), '');
  assert.equal(backend.resolveBrokerWsUrl(staleSession('orrnn')), '');
  assert.equal(endpoints.buildFeedStatusUrl(), '');
  assert.throws(() => endpoints.buildManagerMarketWsUrl('one-use'), /Invalid URL/);
});

test('non-routing build flags and nondeployment build profiles retain their behavior', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = profile();
  const { backend } = await loadBakedModules();
  assert.equal(backend.getRuntimeConfigValue(['REPORTS_SUMMARY_ENABLED', 'VITE_REPORTS_SUMMARY_ENABLED']), 'false');
  delete globalThis.__RTX_RUNTIME_CONFIG__;
  const { endpoints } = await loadBakedModules();
  assert.equal(endpoints.buildFeedStatusUrl(), 'https://service.orrnn.com/ws/feed/status');
  assert.equal(endpoints.buildManagerMarketWsUrl('one-use'), 'wss://service.orrnn.com/OnTick?ticket=one-use');
});
