import test, { afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import authService from './authService.js';
import apiClient from './apiClient.js';
import { startSessionRefreshScheduler, TOKEN_REFRESH_LEAD_MS } from './sessionRefreshScheduler.js';

// Each simulated browser tab has its own sessionStorage; localStorage is shared.
const tabContext = new AsyncLocalStorage();
const inTab = (tab, fn) => tabContext.run({ tab }, fn);

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
  };
};

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Mirrors the manager backend: 1 h access tokens, single-use refresh tokens,
// and 403 "Not authenticated" for an expired or unknown access token.
const createServer = () => {
  const server = {
    generation: 1,
    validAccess: 'access-1',
    validRefresh: 'refresh-1',
    refreshCalls: 0,
    apiCalls: [],
    apiResponse: null,
  };
  server.handle = async ({ path, options }) => {
    if (path.endsWith('/auth/refresh')) {
      server.refreshCalls += 1;
      if (server.refreshFailure) throw server.refreshFailure;
      await delay(10);
      const { refresh_token: refreshToken } = JSON.parse(options.body);
      if (refreshToken !== server.validRefresh) {
        return json(401, { error: 'invalid or expired refresh token', success: false });
      }
      server.generation += 1;
      server.validAccess = `access-${server.generation}`;
      server.validRefresh = `refresh-${server.generation}`;
      return json(200, {
        access_token: server.validAccess,
        refresh_token: server.validRefresh,
        expires_in: 3600,
        token_type: 'Bearer',
      });
    }

    const authorization = options.headers?.Authorization;
    server.apiCalls.push(authorization);
    if (server.apiResponse) return server.apiResponse();
    if (authorization !== `Bearer ${server.validAccess}`) {
      return json(403, { code: 'MT_RET_ERR_PERMISSIONS', message: 'Not authenticated' });
    }
    return json(200, { answer: [{ login: 1001 }] });
  };
  return server;
};

let server;
let sharedLocal;
let tabStorage;
let expiredReasons;

const signIn = (overrides = {}) => authService.setSession({
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 3600,
  login: 1001,
  broker_id: 'nexa',
  is_admin: true,
  ...overrides,
});

beforeEach(() => {
  server = createServer();
  sharedLocal = createStorage();
  tabStorage = { a: createStorage(), b: createStorage() };
  const currentSessionStorage = () => tabStorage[tabContext.getStore()?.tab || 'a'];

  const win = new EventTarget();
  win.location = { origin: 'http://localhost:5173' };
  Object.defineProperty(win, 'localStorage', { get: () => sharedLocal, configurable: true });
  Object.defineProperty(win, 'sessionStorage', { get: currentSessionStorage, configurable: true });
  globalThis.window = win;
  Object.defineProperty(globalThis, 'localStorage', { get: () => sharedLocal, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { get: currentSessionStorage, configurable: true });
  globalThis.__RTX_RUNTIME_CONFIG__ = { BACKEND_TARGET: 'web', BROKER_ID: 'nexa' };

  expiredReasons = [];
  win.addEventListener('auth:session-expired', (event) => expiredReasons.push(event.detail?.reason));

  globalThis.fetch = (url, options = {}) => server.handle({
    path: new URL(String(url), 'http://localhost').pathname,
    options,
  });
});

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
  delete globalThis.fetch;
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.__RTX_RUNTIME_CONFIG__;
});

test('an active user is kept signed in past 1 h: the token is refreshed before it expires', async () => {
  const start = Date.parse('2026-09-25T09:00:00Z');
  mock.timers.enable({ apis: ['Date'], now: start });
  signIn();

  const timers = [];
  const scheduler = startSessionRefreshScheduler({
    setTimeoutFn: (fn, ms) => timers.push({ fn, ms }),
    clearTimeoutFn: () => {},
  });

  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 3_600_000 - TOKEN_REFRESH_LEAD_MS);
  assert.equal(server.refreshCalls, 0);

  mock.timers.tick(timers[0].ms);
  await timers[0].fn();

  assert.equal(server.refreshCalls, 1);
  assert.equal(authService.getAuthToken(), 'access-2');
  assert.equal(localStorage.getItem('refreshToken'), 'refresh-2');
  assert.equal(authService.getTokenExpiresAt(), Date.now() + 3_600_000);
  // The next refresh is scheduled for the new token.
  assert.equal(timers.length, 2);
  assert.equal(timers[1].ms, 3_600_000 - TOKEN_REFRESH_LEAD_MS);

  // 1 h 5 min after login the session still works.
  mock.timers.tick(7 * 60_000);
  assert.equal(authService.getSessionStatus().authenticated, true);
  const rows = await apiClient.get('/api/v1/manager/accounts');
  assert.deepEqual(rows, { answer: [{ login: 1001 }] });
  assert.deepEqual(expiredReasons, []);
  // Login claims survive the refresh (the refresh response has no login/broker).
  assert.deepEqual(authService.getSessionClaims(), { isAdmin: true, login: 1001, brokerId: 'nexa' });
  scheduler.stop();
});

test('a network failure during the scheduled refresh retries with backoff and never logs out', async () => {
  mock.method(console, 'error', () => {});
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-25T09:00:00Z') });
  signIn();
  server.refreshFailure = new TypeError('fetch failed');

  const timers = [];
  const scheduler = startSessionRefreshScheduler({
    setTimeoutFn: (fn, ms) => timers.push({ fn, ms }),
    clearTimeoutFn: () => {},
  });
  mock.timers.tick(timers[0].ms);
  await timers[0].fn();

  assert.equal(authService.getSessionStatus().authenticated, true);
  assert.deepEqual(expiredReasons, []);
  assert.equal(timers[1].ms, 5_000);

  server.refreshFailure = null;
  await timers[1].fn();
  assert.equal(authService.getAuthToken(), 'access-2');
  scheduler.stop();
});

test('403 "Not authenticated" triggers one refresh, the request is retried and the user stays signed in', async () => {
  signIn();
  server.validAccess = 'server-side-expired';

  const rows = await apiClient.get('/api/v1/manager/accounts');

  assert.deepEqual(rows, { answer: [{ login: 1001 }] });
  assert.equal(server.refreshCalls, 1);
  assert.deepEqual(server.apiCalls, ['Bearer access-1', 'Bearer access-2']);
  assert.equal(authService.getSessionStatus().authenticated, true);
  assert.deepEqual(expiredReasons, []);
});

test('a refused refresh token logs the user out once, even with several requests in flight', async () => {
  signIn();
  server.validAccess = 'server-side-expired';
  server.validRefresh = 'refresh-token-expired';
  mock.method(console, 'error', () => {});

  const results = await Promise.allSettled([
    apiClient.get('/api/v1/manager/accounts'),
    apiClient.get('/api/v1/manager/positions'),
  ]);

  assert.deepEqual(results.map((result) => result.status), ['rejected', 'rejected']);
  results.forEach((result) => assert.equal(result.reason.message, 'Session expired. Please log in again.'));
  assert.equal(server.refreshCalls, 1);
  assert.deepEqual(expiredReasons, ['refresh_rejected']);
  assert.equal(localStorage.getItem('authToken'), null);
  assert.equal(sessionStorage.getItem('auth'), null);
});

test('a real permission denial (403 "Access authority denied") neither refreshes nor logs out', async () => {
  signIn();
  server.apiResponse = () => json(403, { code: 'MT_RET_ERR_PERMISSIONS', message: 'Access authority denied this entrypoint' });
  mock.method(console, 'error', () => {});

  await assert.rejects(apiClient.get('/api/v1/manager/ib'), (error) => error.status === 403);

  assert.equal(server.refreshCalls, 0);
  assert.equal(authService.getSessionStatus().authenticated, true);
  assert.deepEqual(expiredReasons, []);
});

test('a passed local expiry refreshes first and then sends the request instead of rejecting it', async () => {
  signIn({ expires_in: undefined, expires_at: Date.now() - 1_000 });
  server.validAccess = 'server-side-expired';

  const status = authService.getSessionStatus();
  assert.equal(status.authenticated, true);
  assert.equal(status.needsRefresh, true);

  await apiClient.get('/api/v1/manager/accounts');

  assert.equal(server.refreshCalls, 1);
  assert.deepEqual(server.apiCalls, ['Bearer access-2']);
});

test('two tabs refreshing at expiry make exactly one refresh request and both keep working', async () => {
  const tabB = (await import('./authService.js?tab=b')).default;
  inTab('a', () => signIn({ expires_in: 60 }));
  // Tab B holds the same manager session (e.g. a duplicated tab).
  tabStorage.b.setItem('auth', tabStorage.a.getItem('auth'));

  const [tokenA, tokenB] = await Promise.all([
    inTab('a', () => authService.refreshSession({ minValidityMs: TOKEN_REFRESH_LEAD_MS })),
    inTab('b', () => tabB.refreshSession({ minValidityMs: TOKEN_REFRESH_LEAD_MS })),
  ]);

  assert.equal(server.refreshCalls, 1);
  assert.equal(tokenA, 'access-2');
  assert.equal(tokenB, 'access-2');

  for (const tab of ['a', 'b']) {
    await inTab(tab, async () => {
      assert.equal(authService.getSessionStatus().authenticated, true);
      await apiClient.get('/api/v1/manager/accounts');
    });
  }
  assert.deepEqual(server.apiCalls, ['Bearer access-2', 'Bearer access-2']);
  assert.deepEqual(expiredReasons, []);
});

test('a tab adopts a refresh done by another tab instead of logging out on the token change', async () => {
  inTab('a', () => signIn());
  tabStorage.b.setItem('auth', tabStorage.a.getItem('auth'));
  const baseline = inTab('b', () => authService.getSessionStatus().snapshot);

  await inTab('a', () => authService.refreshSession());

  const status = inTab('b', () => authService.getSessionStatus({ baseline }));
  assert.equal(status.authenticated, true);
  assert.equal(status.snapshot.token, 'access-2');
  assert.equal(JSON.parse(tabStorage.b.getItem('auth')).refresh_token, 'refresh-2');
  assert.equal(server.refreshCalls, 1);
});

test('opening a new tab without its own session does not log out the existing tab', () => {
  inTab('a', () => signIn());

  const newTab = inTab('b', () => authService.getSessionStatus());
  assert.equal(newTab.authenticated, false);
  assert.equal(newTab.reason, 'session_storage_auth_missing');
  inTab('b', () => authService.expireSession(newTab.reason));

  assert.equal(localStorage.getItem('authToken'), 'access-1');
  assert.equal(inTab('a', () => authService.getSessionStatus().authenticated), true);
});

test('a different manager signing in from another tab ends only the older tab', () => {
  inTab('a', () => signIn());
  inTab('b', () => signIn({ access_token: 'other-access', refresh_token: 'other-refresh', login: 2002 }));

  const older = inTab('a', () => authService.getSessionStatus());
  assert.equal(older.reason, 'token_storage_mismatch');
  inTab('a', () => authService.expireSession(older.reason));

  assert.equal(inTab('b', () => authService.getSessionStatus().authenticated), true);
  assert.equal(localStorage.getItem('authToken'), 'other-access');
});
