import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFeedBrokerIdToWsUrl,
  buildBrokerApiUrl,
  buildFeedStatusUrl,
  buildFeedWsUrl,
  buildManagerApiUrl,
  buildManagerMarketWsUrl,
  isManagerMarketFeed,
  buildManagerApiPath,
  resolveFeedBrokerId,
  shouldUseFeedDevProxy,
  shouldUseManagerDevProxy,
  shouldUseManagerProxyPrefix,
  toLocalDevFeedProxyUrl,
} from './endpoints.js';

const createStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
  };
};

const resetBrowserState = () => {
  globalThis.sessionStorage = createStorage();
  globalThis.localStorage = createStorage();
  delete globalThis.__RTX_RUNTIME_CONFIG__;
  delete globalThis.RUNTIME_CONFIG;
  delete globalThis.__RUNTIME_CONFIG__;
  delete globalThis.__APP_CONFIG__;
  delete globalThis._env_;
  delete globalThis.env;
};

beforeEach(resetBrowserState);
afterEach(resetBrowserState);

test('direct manager quotes use a single-use session ticket without bridge credentials', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    MARKET_DATA_SOURCE: 'manager', MANAGER_WS_HOST: 'wss://trivanta.orrnn.com',
  };
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'trivanta-markets', backend_url: 'https://trivanta.orrnn.com',
  }));
  assert.equal(isManagerMarketFeed(), true);
  assert.equal(buildManagerMarketWsUrl('one-use'), 'wss://trivanta.orrnn.com/manager/OnTick?ticket=one-use');
  assert.throws(() => buildManagerMarketWsUrl(''), /ticket/);
});

test('bridge mode remains the default and direct manager hosts can omit the proxy prefix', () => {
  assert.equal(isManagerMarketFeed(), false);
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    MANAGER_WS_HOST: 'ws://127.0.0.1:8091', MANAGER_PROXY_STRIP_MANAGER_PREFIX: 'true',
  };
  assert.equal(buildManagerMarketWsUrl('fresh-ticket'), 'ws://127.0.0.1:8091/OnTick?ticket=fresh-ticket');
});

test('manager API path keeps proxy prefix for web/public backend mode', () => {
  assert.equal(buildManagerApiPath('/AccountCreate', true), '/manager/AccountCreate');
  assert.equal(buildManagerApiPath('/manager/UserPasswordCheck', true), '/manager/UserPasswordCheck');
  assert.equal(buildManagerApiPath('/api/manager/IBUpdate', true), '/manager/IBUpdate');
});

test('native versioned API paths never receive the manager proxy prefix', () => {
  assert.equal(buildManagerApiPath('/api/v2/auth/login', true), '/api/v2/auth/login');
  assert.equal(buildManagerApiPath('/api/v2/admin/login', true), '/api/v2/admin/login');
  assert.equal(buildManagerApiPath('/api/v1/manager/auth/refresh', true), '/api/v1/manager/auth/refresh');
  assert.equal(buildManagerApiPath('/reports/v1/summary', true), '/reports/v1/summary');
  assert.equal(
    buildManagerApiPath('/api/v1/manager/transactions/deposit', true),
    '/api/v1/manager/transactions/deposit'
  );
});

test('manager API path removes proxy prefix for direct backend mode', () => {
  assert.equal(buildManagerApiPath('/AccountCreate', false), '/AccountCreate');
  assert.equal(buildManagerApiPath('/manager/UserPasswordCheck', false), '/UserPasswordCheck');
  assert.equal(buildManagerApiPath('/api/manager/IBUpdate', false), '/IBUpdate');
  assert.equal(buildManagerApiPath('/api/v1/manager/auth/refresh', false), '/api/v1/manager/auth/refresh');
  assert.equal(buildManagerApiPath('/reports/v1/summary', false), '/reports/v1/summary');
});

test('direct broker backend URLs bypass the /manager proxy prefix', () => {
  assert.equal(
    shouldUseManagerProxyPrefix('http://103.91.186.142:8091', { server_ip: '103.91.186.142' }),
    false
  );
  assert.equal(
    shouldUseManagerProxyPrefix('https://services.growtradingacademy.com', { server_ip: '103.91.186.142' }),
    true
  );
  assert.equal(
    shouldUseManagerProxyPrefix('https://testbrokerbackend.orrnn.com', { server_ip: 'testbrokerbackend.orrnn.com' }),
    true
  );
});

test('configured root-route backends bypass the /manager prefix', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    VITE_MANAGER_PROXY_STRIP_MANAGER_PREFIX: 'true',
  };

  assert.equal(
    shouldUseManagerProxyPrefix('https://fxtrustbrokerbackend.orrnn.com'),
    false
  );
  assert.equal(buildManagerApiPath('/ConnectionStatus', false), '/ConnectionStatus');
});

test('manager dev proxy is enabled only for local Vite development', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    VITE_MANAGER_USE_DEV_PROXY: 'true',
  };

  assert.equal(shouldUseManagerDevProxy(true, true), true);
  assert.equal(shouldUseManagerDevProxy(false, true), false);
  assert.equal(shouldUseManagerDevProxy(true, false), false);
});

test('manager dev proxy is enabled for VS Code / Dev Tunnels origins', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    VITE_MANAGER_USE_DEV_PROXY: 'true',
  };
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: {
      origin: 'https://9whxgxzq-5180.inc1.devtunnels.ms',
      hostname: '9whxgxzq-5180.inc1.devtunnels.ms',
    },
  };

  try {
    assert.equal(shouldUseManagerDevProxy(true), true);
    assert.equal(shouldUseFeedDevProxy(true), true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('manager dev proxy is enabled for LAN IP and tunnel origins served by Vite', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    VITE_MANAGER_USE_DEV_PROXY: 'true',
  };
  const previousWindow = globalThis.window;
  const origins = [
    'http://192.168.1.38:5180',
    'https://rtx5-manager.example-tunnel.com',
    'https://abc-123.trycloudflare.com',
  ];

  try {
    for (const origin of origins) {
      globalThis.window = { location: { origin, hostname: new URL(origin).hostname } };
      assert.equal(shouldUseManagerDevProxy(true), true, origin);
      assert.equal(shouldUseFeedDevProxy(true), true, origin);
    }
    globalThis.window = { location: { origin: 'file://', hostname: '' } };
    assert.equal(shouldUseManagerDevProxy(true), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('manager dev proxy remains opt-in', () => {
  assert.equal(shouldUseManagerDevProxy(true, true), false);
});

test('broker v2 API paths never receive the legacy /manager prefix', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'test',
    backend_url: 'https://fxtrustbrokerbackend.orrnn.com',
  }));

  assert.equal(
    buildBrokerApiUrl('/api/v2/positions/history'),
    'https://fxtrustbrokerbackend.orrnn.com/api/v2/positions/history'
  );
});

test('a pinned env profile routes APIs and feed to its broker despite saved Nex endpoints', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    BROKER_ID: 'orrnn',
    API_HOST: 'https://service.orrnn.com',
    API_HOST_EXT: 'https://service.orrnn.com',
    WS_HOST: 'wss://service.orrnn.com',
    WS_FEED_PATH: '/ws/feed',
    FEED_BROKER_ID: 'orrnn',
    FEED_SEND_TOKEN: 'false',
    DEFAULT_MT5_SERVER: '51.195.188.172',
  };
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'Nexa',
    backend_url: 'https://nexa.orrnn.com',
    feed_ws_url: 'wss://nexa.orrnn.com/ws/feed',
    feed_broker_token: 'old-token',
  }));

  assert.equal(buildBrokerApiUrl('/api/v2/positions/history'), 'https://service.orrnn.com/api/v2/positions/history');
  assert.equal(buildFeedStatusUrl(), 'https://service.orrnn.com/ws/feed/status');
  const feedUrl = new URL(buildFeedWsUrl());
  assert.equal(feedUrl.origin, 'wss://service.orrnn.com');
  assert.equal(feedUrl.pathname, '/ws/feed');
  assert.equal(feedUrl.searchParams.get('broker_id'), 'orrnn');
  assert.equal(feedUrl.searchParams.has('token'), false);
});

test('manager client keeps versioned transaction routes at the broker root', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'test',
    backend_url: 'https://fxtrustbrokerbackend.orrnn.com',
  }));

  assert.equal(
    buildManagerApiUrl('/api/v1/manager/transactions/deposit'),
    'https://fxtrustbrokerbackend.orrnn.com/api/v1/manager/transactions/deposit'
  );
});

test('desktop manager login prefers public HTTPS broker backend over direct server IP', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    VITE_BACKEND_TARGET: 'desktop',
  };
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'myprop-trade',
    name: 'MyProp',
    backend_url: 'https://services.myprop.trade',
    desktop_backend_url: 'http://185.204.168.202:443',
    server_ip: '185.204.168.202',
    server_port: 443,
  }));

  assert.equal(
    buildManagerApiUrl('/api/v2/auth/login'),
    'https://services.myprop.trade/api/v2/auth/login'
  );
});

test('feed websocket URL labels the connection with broker_id and never a token', () => {
  const out = appendFeedBrokerIdToWsUrl('wss://services.example/ws/feed', 'gta_broker');
  const url = new URL(out);
  assert.equal(url.searchParams.get('broker_id'), 'gta_broker');
  assert.equal(url.searchParams.has('token'), false);
});

test('feed websocket URL stays unchanged when no broker label is configured', () => {
  const out = appendFeedBrokerIdToWsUrl('wss://services.example/ws/feed', '');
  assert.equal(out, 'wss://services.example/ws/feed');
});

test('feed websocket URL preserves an explicit broker_id and strips any legacy token', () => {
  const out = appendFeedBrokerIdToWsUrl(
    'wss://services.example/ws/feed?broker_id=existing&token=legacy-secret',
    'gta_broker'
  );
  const url = new URL(out);
  assert.equal(url.searchParams.get('broker_id'), 'existing');
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(out.includes('legacy-secret'), false);
});

test('relative feed routes strip legacy tokens and keep broker labels and fragments', () => {
  assert.equal(
    appendFeedBrokerIdToWsUrl('/ws/feed?subscribe=all&token=legacy#updates', 'broker a'),
    '/ws/feed?subscribe=all&broker_id=broker+a#updates'
  );
  assert.equal(
    appendFeedBrokerIdToWsUrl('/ws/feed?token=legacy&broker_id=existing#updates', 'ignored'),
    '/ws/feed?broker_id=existing#updates'
  );
  assert.equal(appendFeedBrokerIdToWsUrl('/ws/feed?token=legacy', ''), '/ws/feed');
});

test('feed status URL uses explicit secure discovery status URL', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'myprop-trade',
    feed_status_https_url: 'https://services.myprop.trade/ws/feed/status',
    feed_wss_url: 'wss://services.myprop.trade/ws/feed',
  }));

  assert.equal(buildFeedStatusUrl(), 'https://services.myprop.trade/ws/feed/status');
});

test('feed status URL derives from feed websocket URL', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'myprop-trade',
    feed_wss_url: 'wss://services.myprop.trade/ws/feed',
  }));

  assert.equal(buildFeedStatusUrl(), 'https://services.myprop.trade/ws/feed/status');
});

test('feed development proxy keeps status and websocket requests same-origin', () => {
  const origin = 'http://localhost:5174';
  assert.equal(shouldUseFeedDevProxy(true, true), true);
  assert.equal(
    toLocalDevFeedProxyUrl('https://services.growtradingacademy.com/ws/feed/status', true, origin),
    'http://localhost:5174/ws/feed/status'
  );
  assert.equal(
    toLocalDevFeedProxyUrl('wss://services.growtradingacademy.com/ws/feed?broker_id=gta_broker', true, origin),
    'http://localhost:5174/ws/feed?broker_id=gta_broker'
  );
});

test('feed websocket URL carries only broker_id and ignores manager session tokens', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    FEED_BROKER_ID: 'broker_a',
  };
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'broker_a',
    web_ws_url: 'wss://services.example/ws/feed',
  }));
  sessionStorage.setItem('auth', JSON.stringify({
    token: 'manager-session-token',
    access_token: 'manager-access-token',
  }));
  localStorage.setItem('authToken', 'manager-local-token');

  const out = buildFeedWsUrl();
  const url = new URL(out);
  assert.equal(url.searchParams.get('broker_id'), 'broker_a');
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(out.includes('manager-session-token'), false);
  assert.equal(out.includes('manager-access-token'), false);
  assert.equal(out.includes('manager-local-token'), false);
});

test('feed websocket URL connects to the open bridge feed without credentials', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'testorrnn',
    feed_wss_url: 'wss://testbrokerbackend.orrnn.com/ws/feed',
  }));

  const out = buildFeedWsUrl();
  const url = new URL(out);
  assert.equal(url.protocol, 'wss:');
  assert.equal(url.hostname, 'testbrokerbackend.orrnn.com');
  assert.equal(url.pathname, '/ws/feed');
  assert.equal(url.searchParams.get('broker_id'), 'testorrnn');
  assert.equal(url.searchParams.has('token'), false);
});

test('runtime feed URL overrides stale discovery websocket routes', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    VITE_FEED_WS_URL: 'wss://fxtrustsuperbackned.orrnn.com/central-market-data/ws/feed?broker_id=TEST',
  };
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'TEST',
    feed_wss_url: 'wss://fxtrustbrokerbackend.orrnn.com/ws/feed',
  }));

  const url = new URL(buildFeedWsUrl());
  assert.equal(url.protocol, 'wss:');
  assert.equal(url.hostname, 'fxtrustsuperbackned.orrnn.com');
  assert.equal(url.pathname, '/central-market-data/ws/feed');
  assert.equal(url.searchParams.get('broker_id'), 'TEST');
  assert.equal(url.searchParams.has('token'), false);
});

test('feed websocket URL prefers secure discovery feed URLs over plain ws_url', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'testorrnn',
    ws_url: 'ws://testbrokerbackend.orrnn.com/ws/feed',
    feed_wss_url: 'wss://testbrokerbackend.orrnn.com/ws/feed',
  }));

  const out = buildFeedWsUrl();
  const url = new URL(out);
  assert.equal(url.protocol, 'wss:');
  assert.equal(url.hostname, 'testbrokerbackend.orrnn.com');
  assert.equal(url.pathname, '/ws/feed');
});

test('feed websocket URL upgrades public plain ws discovery URLs to wss', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'testorrnn',
    ws_url: 'ws://testbrokerbackend.orrnn.com/ws/feed',
  }));

  const out = buildFeedWsUrl();
  const url = new URL(out);
  assert.equal(url.protocol, 'wss:');
  assert.equal(url.hostname, 'testbrokerbackend.orrnn.com');
  assert.equal(url.pathname, '/ws/feed');
});

test('feed websocket URL drops any legacy feed token left in broker config', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'broker_a',
    web_ws_url: 'wss://services.example/ws/feed?token=legacy-feed-token',
    feed_broker_token: 'broker-config-feed-token',
  }));

  const out = buildFeedWsUrl();
  const url = new URL(out);
  assert.equal(url.searchParams.get('broker_id'), 'broker_a');
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(out.includes('legacy-feed-token'), false);
  assert.equal(out.includes('broker-config-feed-token'), false);
});

test('feed broker id resolves from broker info or runtime config as a plain label', () => {
  assert.equal(resolveFeedBrokerId({ broker_id: 'broker_a' }), 'broker_a');
  assert.equal(resolveFeedBrokerId({}), '');

  globalThis.__RTX_RUNTIME_CONFIG__ = { FEED_BROKER_ID: 'runtime_broker' };
  assert.equal(resolveFeedBrokerId({}), 'runtime_broker');
});

test('feed websocket URL never carries manager session credentials', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'broker_a',
    web_ws_url: 'wss://services.example/ws/feed',
  }));
  sessionStorage.setItem('auth', JSON.stringify({
    token: 'manager-session-token',
    feed_token: 'session-feed-token',
    access_token: 'manager-access-token',
  }));
  localStorage.setItem('authToken', 'manager-local-token');

  const out = buildFeedWsUrl();
  const url = new URL(out);
  assert.equal(url.searchParams.get('broker_id'), 'broker_a');
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(out.includes('manager-session-token'), false);
  assert.equal(out.includes('session-feed-token'), false);
  assert.equal(out.includes('manager-access-token'), false);
  assert.equal(out.includes('manager-local-token'), false);
});
