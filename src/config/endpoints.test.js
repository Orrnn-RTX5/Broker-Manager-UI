import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFeedAuthToWsUrl,
  buildFeedWsUrl,
  FEED_WS_AUTH_NOT_CONFIGURED,
  buildManagerApiPath,
  resolveFeedAuthRequired,
  resolveFeedWsAuth,
  shouldUseManagerProxyPrefix,
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

test('manager API path keeps proxy prefix for web/public backend mode', () => {
  assert.equal(buildManagerApiPath('/AccountCreate', true), '/manager/AccountCreate');
  assert.equal(buildManagerApiPath('/manager/UserPasswordCheck', true), '/manager/UserPasswordCheck');
  assert.equal(buildManagerApiPath('/api/manager/IBUpdate', true), '/manager/IBUpdate');
});

test('manager API path removes proxy prefix for direct backend mode', () => {
  assert.equal(buildManagerApiPath('/AccountCreate', false), '/AccountCreate');
  assert.equal(buildManagerApiPath('/manager/UserPasswordCheck', false), '/UserPasswordCheck');
  assert.equal(buildManagerApiPath('/api/manager/IBUpdate', false), '/IBUpdate');
  assert.equal(buildManagerApiPath('/api/v1/auth/refresh', false), '/api/v1/auth/refresh');
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

test('feed websocket URL appends broker query auth when token is available', () => {
  const out = appendFeedAuthToWsUrl('wss://services.example/ws/feed', {
    brokerID: 'gta_broker',
    token: 'secret token',
  });
  const url = new URL(out);
  assert.equal(url.searchParams.get('broker_id'), 'gta_broker');
  assert.equal(url.searchParams.get('token'), 'secret token');
});

test('feed websocket URL appends broker query without requiring a token', () => {
  const out = appendFeedAuthToWsUrl('wss://services.example/ws/feed', {
    brokerID: 'testorrnn',
  });
  const url = new URL(out);
  assert.equal(url.searchParams.get('broker_id'), 'testorrnn');
  assert.equal(url.searchParams.has('token'), false);
});

test('feed websocket URL preserves explicit query auth', () => {
  const out = appendFeedAuthToWsUrl('wss://services.example/ws/feed?broker_id=existing&token=provided', {
    brokerID: 'gta_broker',
    token: 'secret token',
  });
  const url = new URL(out);
  assert.equal(url.searchParams.get('broker_id'), 'existing');
  assert.equal(url.searchParams.get('token'), 'provided');
});

test('feed websocket URL uses explicit runtime feed token and ignores manager session tokens', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = {
    FEED_BROKER_ID: 'broker_a',
    FEED_BROKER_TOKEN: 'runtime-feed-token',
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
  assert.equal(url.searchParams.get('token'), 'runtime-feed-token');
  assert.equal(out.includes('manager-session-token'), false);
  assert.equal(out.includes('manager-access-token'), false);
  assert.equal(out.includes('manager-local-token'), false);
});

test('feed websocket URL allows tokenless feeds when auth is not required', () => {
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

test('feed websocket URL uses explicit broker config feed token', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'broker_a',
    web_ws_url: 'wss://services.example/ws/feed',
    feed_broker_token: 'broker-config-feed-token',
  }));

  const out = buildFeedWsUrl();
  const url = new URL(out);
  assert.equal(url.searchParams.get('broker_id'), 'broker_a');
  assert.equal(url.searchParams.get('token'), 'broker-config-feed-token');
});

test('feed auth required flag is parsed from broker info or runtime config', () => {
  assert.equal(resolveFeedAuthRequired({ feed_auth_required: true }), true);
  assert.equal(resolveFeedAuthRequired({ feed_auth_required: 'required' }), true);
  assert.equal(resolveFeedAuthRequired({ feed_auth_required: false }), false);

  globalThis.__RTX_RUNTIME_CONFIG__ = { FEED_AUTH_REQUIRED: 'true' };
  assert.equal(resolveFeedAuthRequired({}), true);
});

test('feed websocket URL fails closed when auth is required and only manager session tokens are present', () => {
  sessionStorage.setItem('broker_info', JSON.stringify({
    broker_id: 'broker_a',
    web_ws_url: 'wss://services.example/ws/feed',
    feed_auth_required: true,
  }));
  sessionStorage.setItem('auth', JSON.stringify({
    token: 'manager-session-token',
    feed_token: 'session-feed-token',
    access_token: 'manager-access-token',
  }));
  localStorage.setItem('authToken', 'manager-local-token');

  assert.deepEqual(resolveFeedWsAuth({ broker_id: 'broker_a' }), { brokerID: 'broker_a', token: '' });
  let err;
  try {
    buildFeedWsUrl();
  } catch (caught) {
    err = caught;
  }
  assert.ok(err);
  assert.equal(err.name, 'FeedWsAuthConfigError');
  assert.equal(err.code, FEED_WS_AUTH_NOT_CONFIGURED);
  assert.match(err.message, /FEED_BROKER_TOKEN|VITE_FEED_BROKER_TOKEN/);
});
