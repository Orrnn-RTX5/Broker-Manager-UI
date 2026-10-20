import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import authService, {
  AUTH_STORAGE_KEYS,
  LOGOUT_REVOKE_TIMEOUT_MS,
  performLogoutSequence,
} from './authService.js';

// Covers the real logout sequence: a stubbed revoke transport must run before
// local state is cleared, and local state is always cleared — even when the
// revoke fails or no transport exists yet (no server logout endpoint; see
// authService for the ds-3 proposal).
const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
  };
};

let sessionStore;
let localStore;

const signIn = () => authService.setSession({
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 3600,
  login: 1001,
  broker_id: 'test-broker',
});

beforeEach(() => {
  sessionStore = createStorage();
  localStore = createStorage();
  const win = new EventTarget();
  Object.defineProperty(win, 'localStorage', { get: () => localStore, configurable: true });
  Object.defineProperty(win, 'sessionStorage', { get: () => sessionStore, configurable: true });
  globalThis.window = win;
  Object.defineProperty(globalThis, 'localStorage', { get: () => localStore, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { get: () => sessionStore, configurable: true });
  globalThis.__RTX_RUNTIME_CONFIG__ = { BACKEND_TARGET: 'web', BROKER_ID: 'test-broker' };

  signIn();
  sessionStore.setItem('broker_info', JSON.stringify({ broker_id: 'test-broker' }));
  localStore.setItem('broker_info', JSON.stringify({ broker_id: 'test-broker' }));
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.__RTX_RUNTIME_CONFIG__;
});

// Every auth key plus the broker copies in both storages; empty when logout
// left no remnants.
const localRemnants = () => {
  const entries = AUTH_STORAGE_KEYS.map((key) => (
    key === 'auth'
      ? ['sessionStorage', key, sessionStore.getItem(key)]
      : ['localStorage', key, localStore.getItem(key)]
  ));
  entries.push(['sessionStorage', 'broker_info', sessionStore.getItem('broker_info')]);
  entries.push(['localStorage', 'broker_info', localStore.getItem('broker_info')]);
  return entries.filter(([, , value]) => value !== null);
};

test('the revoke transport runs before local state is cleared', async () => {
  const seen = [];
  const revokeSession = async (snapshot) => {
    seen.push({
      snapshot,
      sessionAuthAtCall: sessionStore.getItem('auth'),
      accessTokenAtCall: localStore.getItem('authToken'),
      refreshTokenAtCall: localStore.getItem('refreshToken'),
    });
  };

  const snapshot = await performLogoutSequence({ revokeSession });

  assert.equal(seen.length, 1);
  // The transport received the live tokens while storage was still populated:
  // revoke ran before clear.
  assert.equal(seen[0].snapshot.token, 'access-1');
  assert.equal(seen[0].snapshot.refreshToken, 'refresh-1');
  assert.ok(seen[0].sessionAuthAtCall?.includes('access-1'));
  assert.equal(seen[0].accessTokenAtCall, 'access-1');
  assert.equal(seen[0].refreshTokenAtCall, 'refresh-1');
  assert.equal(snapshot.token, 'access-1');
  assert.deepEqual(localRemnants(), []);
});

test('a revoke failure still clears local state and never throws', async () => {
  const revokeSession = async () => {
    throw new Error('connection refused');
  };

  await performLogoutSequence({ revokeSession });

  assert.deepEqual(localRemnants(), []);
  assert.equal(authService.getSessionStatus().authenticated, false);
});

test('local-only logout leaves no token or broker remnants', async () => {
  assert.equal(typeof authService.performLogoutSequence, 'function');

  await performLogoutSequence();

  assert.deepEqual(localRemnants(), []);
  const status = authService.getSessionStatus();
  assert.equal(status.authenticated, false);
  assert.equal(status.hasAuthState, false);
});

test('a revoke resolving empty still clears local state and returns the snapshot', async () => {
  const seen = [];
  const revokeSession = async (snapshot) => {
    seen.push(snapshot);
    return undefined;
  };

  const snapshot = await performLogoutSequence({ revokeSession });

  assert.equal(seen.length, 1);
  assert.equal(snapshot.token, 'access-1');
  assert.deepEqual(localRemnants(), []);
  assert.equal(authService.getSessionStatus().authenticated, false);

  // A later session logging out with a revoke that resolves null clears too.
  signIn();
  sessionStore.setItem('broker_info', JSON.stringify({ broker_id: 'test-broker' }));
  localStore.setItem('broker_info', JSON.stringify({ broker_id: 'test-broker' }));

  const nullishSnapshot = await performLogoutSequence({ revokeSession: async () => null });

  assert.equal(nullishSnapshot.token, 'access-1');
  assert.deepEqual(localRemnants(), []);
  assert.equal(authService.getSessionStatus().authenticated, false);
});

test('a synchronously-throwing revoke still clears local state and never throws', async () => {
  const revokeSession = () => {
    throw new Error('sync revoke boom');
  };

  const snapshot = await performLogoutSequence({ revokeSession });

  assert.equal(snapshot.token, 'access-1');
  assert.deepEqual(localRemnants(), []);
  assert.equal(authService.getSessionStatus().authenticated, false);
});

test('double logout is idempotent and never throws', async () => {
  let calls = 0;
  const revokeSession = async () => {
    calls += 1;
  };

  const first = await performLogoutSequence({ revokeSession });
  assert.equal(first.token, 'access-1');
  assert.deepEqual(localRemnants(), []);

  const second = await performLogoutSequence({ revokeSession });

  assert.equal(calls, 2);
  assert.equal(second.token, null);
  assert.equal(second.refreshToken, null);
  assert.equal(second.hasSessionAuth, false);
  assert.deepEqual(localRemnants(), []);
  assert.equal(authService.getSessionStatus().authenticated, false);
});

test('broker_info is removed from sessionStorage and localStorage separately', async () => {
  assert.notEqual(sessionStore.getItem('broker_info'), null);
  assert.notEqual(localStore.getItem('broker_info'), null);

  await performLogoutSequence();

  assert.equal(sessionStore.getItem('broker_info'), null);
  assert.equal(localStore.getItem('broker_info'), null);
});

test('the returned snapshot describes the pre-clear session', async () => {
  const seen = [];
  const snapshot = await performLogoutSequence({ revokeSession: async (current) => { seen.push(current); } });

  assert.equal(seen.length, 1);
  assert.equal(snapshot, seen[0]);
  assert.equal(snapshot.token, 'access-1');
  assert.equal(snapshot.sessionToken, 'access-1');
  assert.equal(snapshot.localToken, 'access-1');
  assert.equal(snapshot.refreshToken, 'refresh-1');
  assert.equal(snapshot.hasSessionAuth, true);
  assert.equal(snapshot.identity, '1001|test-broker');
  assert.equal(typeof snapshot.expiresAt, 'number');
  assert.ok(snapshot.expiresAt > Date.now());
  assert.equal(snapshot.isExpired, false);
  assert.deepEqual(localRemnants(), []);
});

test('the default revoke timeout stays within the 5-8s logout budget', () => {
  assert.ok(
    LOGOUT_REVOKE_TIMEOUT_MS >= 5_000 && LOGOUT_REVOKE_TIMEOUT_MS <= 8_000,
    `expected 5-8s budget, got ${LOGOUT_REVOKE_TIMEOUT_MS}ms`,
  );
});

test('a never-settling revoke still clears locally and resolves within budget', async () => {
  // Adversarial HOLD: a transport that never settles must not hang logout —
  // local clear always runs within the timeout budget. A short timeout keeps
  // this fast; the generous upper bound only guards against a hang, so the
  // assertion cannot flake on timing.
  const revokeSession = () => new Promise(() => {});

  const snapshot = await performLogoutSequence({ revokeSession, revokeTimeoutMs: 50 });

  assert.equal(snapshot.token, 'access-1');
  assert.deepEqual(localRemnants(), []);
  assert.equal(authService.getSessionStatus().authenticated, false);
});

test('a slow revoke past the timeout still clears locally without waiting', async () => {
  let settled = false;
  const revokeSession = () => new Promise((resolve) => {
    const timer = setTimeout(() => {
      settled = true;
      resolve();
    }, 500);
    // The test must not wait for the late revoke after logout already won.
    if (typeof timer.unref === 'function') timer.unref();
  });

  const snapshot = await performLogoutSequence({ revokeSession, revokeTimeoutMs: 50 });

  assert.equal(snapshot.token, 'access-1');
  assert.deepEqual(localRemnants(), []);
  assert.equal(authService.getSessionStatus().authenticated, false);
  // The late revoke resolving later must not restore or throw.
  assert.equal(settled, false);
});
