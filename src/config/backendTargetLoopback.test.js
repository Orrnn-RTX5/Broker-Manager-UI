import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBrokerBackendUrl, resolveBrokerWsUrl } from './backendTarget.js';

// Deploy-blocker regression (ds-22 M1 on :5223): with a discovery record that
// carries no backend URL fields, login resolves the backend from the runtime
// API_HOST. A blanket IP rejection turned loopback API_HOST into '' and the
// Sign-in submit failed with 'Broker backend URL is not configured.'
// Loopback stays accepted; every other IP stays rejected. Generic fixtures
// only — no tenant, broker, or host literals beyond loopback/reserved ranges.
test('loopback API_HOST resolves when the broker record carries no backend URL', () => {
  assert.equal(
    resolveBrokerBackendUrl({ broker_id: 'qa-broker', server: 'qa-server' }, 'http://127.0.0.1:5223'),
    'http://127.0.0.1:5223',
  );
  assert.equal(
    resolveBrokerBackendUrl({ broker_id: 'qa-broker', server: 'qa-server' }, 'http://localhost:8091'),
    'http://localhost:8091',
  );
  assert.equal(
    resolveBrokerBackendUrl({ broker_id: 'qa-broker', server: 'qa-server' }, 'http://[::1]:5223'),
    'http://[::1]:5223',
  );
});

test('non-loopback IPs are still rejected', () => {
  assert.equal(resolveBrokerBackendUrl({ broker_id: 'qa-broker' }, 'http://192.168.1.38:8091'), '');
  assert.equal(resolveBrokerBackendUrl({ broker_id: 'qa-broker' }, 'http://10.0.0.5:8091'), '');
  assert.equal(resolveBrokerBackendUrl({ broker_id: 'qa-broker' }, 'http://203.0.113.7:8091'), '');
  assert.equal(resolveBrokerBackendUrl({}, ''), '');
});

test('unspecified addresses are rejected, never valid backends', () => {
  assert.equal(resolveBrokerBackendUrl({ broker_id: 'qa-broker' }, 'http://0.0.0.0:8091'), '');
  assert.equal(resolveBrokerBackendUrl({ broker_id: 'qa-broker' }, 'http://[::]:8091'), '');
});

test('loopback WS_HOST resolves for the live stack', () => {
  const url = resolveBrokerWsUrl({ broker_id: 'qa-broker' }, 'ws://127.0.0.1:5223');
  assert.ok(String(url).includes('127.0.0.1'), 'loopback WS host must survive sanitizing');
  const v6 = resolveBrokerWsUrl({ broker_id: 'qa-broker' }, 'ws://[::1]:5223');
  assert.ok(String(v6).includes('::1'), 'IPv6 loopback WS host must survive sanitizing');
  assert.equal(resolveBrokerWsUrl({ broker_id: 'qa-broker' }, 'ws://0.0.0.0:8091'), '');
  assert.equal(resolveBrokerWsUrl({ broker_id: 'qa-broker' }, 'ws://[::]:8091'), '');
  assert.equal(resolveBrokerWsUrl({ broker_id: 'qa-broker' }, 'ws://192.168.1.38:8091'), '');
});
