import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Deploy-blocker regression coverage: the Manager Sign-in button is gated by
// `disabled={loading || listLoading || !!listError || !selectedBroker}` — the
// broker/server list comes from DISCOVERY_BASE_URL. These tests RENDER the
// real ManagerLogin (real React, real brokerAuth selection logic, real
// backendTarget config reads) in jsdom with react-dom/client, so the enable
// path actually executes. Only the network is stubbed (global fetch serves
// canned discovery/config payloads); sessionStorage/localStorage are jsdom's.
//
// Generic fixtures only: synthetic broker/server/login values. No tenant,
// broker, host, or account identifiers. No network leaves this process.

// ---- DOM (must exist before react-dom is evaluated) -----------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:4000/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['HTMLElement', 'HTMLDialogElement', 'Node', 'Element', 'MouseEvent', 'getComputedStyle', 'localStorage', 'sessionStorage']) {
  if (!(key in globalThis)) globalThis[key] = dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---- Live-shaped runtime config (mirrors the served dist keys) ------------
const LIVE_KEYS = {
  BACKEND_TARGET: 'web',
  LOCAL_BACKEND: 'true',
  MANAGER_USE_DEV_PROXY: 'false',
  API_HOST: 'http://localhost:8091',
  API_HOST_EXT: 'http://localhost:8091',
  WS_HOST: 'ws://localhost:8091',
  MANAGER_WS_HOST: 'ws://localhost:8091',
  WS_FEED_PATH: '/ws/feed',
  DISCOVERY_BASE_URL: 'http://localhost:8090',
  USE_MOCK_DISCOVERY: 'false',
  REPORTS_SUMMARY_ENABLED: 'true',
  GROUP_OPERATIONS_BROKERS: '',
};

// ---- Recorded network stub -------------------------------------------------
const net = { calls: [] };
const SERVERS = [
  { broker_id: 'qa-broker', name: 'QA Broker', server: 'qa-server', server_name: 'QA Server', status: 'active' },
];

const installFetchStub = () => {
  globalThis.fetch = async (url) => {
    const href = String(url);
    net.calls.push(href);
    // NOTE: brokerAuth's readJson parses response.text(), so text() must
    // carry the body (a stub returning '' reads as an empty payload).
    if (href.includes('/api/v2/broker/servers')) {
      const body = JSON.stringify({ servers: SERVERS.map((row) => ({ ...row })) });
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
    }
    if (href.includes('/api/v2/broker/config')) {
      const body = JSON.stringify({ broker_name: 'QA Broker', server_name: 'QA Server' });
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({ message: 'not found' }), text: async () => 'not found' };
  };
};

// Bundle only the login screen and its in-repo imports (JSX, CSS). Packages
// stay external and load through Node itself, resolved exactly as this file
// resolves them, so the screen and this test share one React instance.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./BrokerAuthScreens.jsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  logLevel: 'silent',
  // Plain node has no import.meta.env (Vite injects it): default it to {} so
  // every VITE_* read falls through to the runtime config under test.
  define: { 'import.meta.env': '{}' },
  plugins: [{
    name: 'broker-login-host',
    setup(builder) {
      builder.onResolve({ filter: /^[@a-z]/i }, ({ path }) => (
        /^[a-z]:[\\/]/i.test(path) ? undefined : { path: import.meta.resolve(path), external: true }
      ));
    },
  }],
});
const screens = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const { ManagerLogin } = screens;
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');

// ---- Render helpers ---------------------------------------------------------
let mounted = null;

const settle = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
  }
};

const renderLogin = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(ManagerLogin, { onLoginSuccess: () => {} })));
  });
  await settle();
  mounted = { container, root };
  return container;
};

const unmountLogin = async () => {
  if (!mounted) return;
  await act(async () => { mounted.root.unmount(); });
  mounted.container.remove();
  mounted = null;
};

const typeInto = async (element, value) => {
  // Drive React controlled inputs via the native value setter so onChange fires.
  const nativeSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    if (nativeSetter) nativeSetter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await settle();
};

const signInButton = () => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Sign in');

beforeEach(() => {
  // The bundled screen reads window.__RTX_RUNTIME_CONFIG__ (jsdom realm);
  // keep Node's global in sync for helpers that read globalThis instead.
  globalThis.__RTX_RUNTIME_CONFIG__ = { ...LIVE_KEYS };
  dom.window.__RTX_RUNTIME_CONFIG__ = globalThis.__RTX_RUNTIME_CONFIG__;
  dom.window.sessionStorage.clear();
  dom.window.localStorage.clear();
  net.calls.length = 0;
  installFetchStub();
});

afterEach(() => unmountLogin());

// jsdom keeps the event loop alive until its window is closed.
after(() => { dom.window.close(); });

// ---- Tests ------------------------------------------------------------------
test('Sign-in enables once a discovered server and credentials are present', async () => {
  const container = await renderLogin();

  await settle();
  const discoveryHits = net.calls.filter((href) => href.includes('/api/v2/broker/servers'));
  assert.ok(discoveryHits.length > 0, 'discovery must be attempted against the live key');
  assert.ok(discoveryHits.every((href) => href.startsWith('http://localhost:8090/')), 'discovery must use DISCOVERY_BASE_URL, never a hardcoded host');

  const loginInput = container.querySelector('#manager-login');
  const passwordInput = container.querySelector('#manager-password');
  assert.ok(loginInput && passwordInput, 'credential fields must render');
  await typeInto(loginInput, '9002');
  await typeInto(passwordInput, 'qa-password');

  const button = signInButton();
  assert.ok(button, 'Sign in button must render');
  assert.equal(button.disabled, false, 'Sign-in enables with a discovered server and typed credentials');
  assert.equal(net.calls.filter((href) => href.includes('trivanta') || href.includes('superbackend')).length, 0, 'no vendor host may be contacted');
});

test('empty DISCOVERY_BASE_URL shows a clear config error, not a silently disabled button', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = { ...LIVE_KEYS, DISCOVERY_BASE_URL: '', VITE_DISCOVERY_BASE_URL: '' };
  dom.window.__RTX_RUNTIME_CONFIG__ = globalThis.__RTX_RUNTIME_CONFIG__;
  await renderLogin();
  await settle();

  const alert = document.querySelector('[role="alert"]');
  assert.ok(alert, 'a visible error must render when discovery is unconfigured');
  assert.match(alert.textContent, /not configured/i, 'the error must name the missing configuration');
  assert.ok(
    [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Retry')),
    'a Retry action must be offered',
  );
});
