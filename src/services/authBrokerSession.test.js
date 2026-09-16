import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getSessionStatus } from './authService.js';

const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

beforeEach(() => {
  globalThis.window = { localStorage: storage(), sessionStorage: storage() };
  window.localStorage.setItem('authToken', 'test-session-token');
  window.sessionStorage.setItem('auth', JSON.stringify({ token: 'test-session-token', broker_id: 'TEST' }));
  globalThis.__RTX_RUNTIME_CONFIG__ = { BACKEND_TARGET: 'web', BROKER_ID: 'Nexa' };
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.__RTX_RUNTIME_CONFIG__;
});

test('web session for the previous broker is invalid after switching environment', () => {
  const status = getSessionStatus();
  assert.equal(status.authenticated, false);
  assert.equal(status.reason, 'broker_configuration_changed');
});

test('matching broker session remains valid regardless of case', () => {
  window.sessionStorage.setItem('auth', JSON.stringify({ token: 'test-session-token', broker_id: 'nexa' }));
  assert.equal(getSessionStatus().authenticated, true);
});

test('desktop keeps its interactive broker selection', () => {
  globalThis.__RTX_RUNTIME_CONFIG__.BACKEND_TARGET = 'desktop';
  assert.equal(getSessionStatus().authenticated, true);
});

test('web deployment without a pinned broker retains its current session', () => {
  delete globalThis.__RTX_RUNTIME_CONFIG__.BROKER_ID;
  assert.equal(getSessionStatus().authenticated, true);
});
