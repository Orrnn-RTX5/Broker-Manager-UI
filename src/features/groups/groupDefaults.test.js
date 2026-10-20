// Run with: node --test src/features/groups/groupDefaults.test.js
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Broker group-defaults read used to pre-fill the group-create leverage.
// The REAL groupDefaults.js is bundled with only the manager transport
// (managerFetch) replaced by a recorder, so the exact request path, method
// and every response shape go through production code.
//
// Contract: GET /api/v1/manager/broker/group-defaults (manager session, no
// broker_id from tenant sessions) answers
//   200 {"broker_id": "...", "group_default_leverage": <int 1..10000> | null}
// or a JSON error {"message","code","stackTrace"} (403/404/503). Any miss is
// fail-closed to null: the form stays blank and the operator must enter a
// value. Generic fixtures only (no tenant, broker, or host values).
const runtime = { calls: [], respond: null };
globalThis.__groupDefaultsTest = runtime;

const entry = fileURLToPath(new URL('./groupDefaults.js', import.meta.url));
let mod = {};
if (existsSync(entry)) {
  const bundle = await build({
    entryPoints: [entry],
    bundle: true, write: false, format: 'esm', platform: 'browser', logLevel: 'silent',
    plugins: [{ name: 'group-defaults-transport', setup(builder) {
      builder.onResolve({ filter: /\/managerFetch(\.js)?$/ }, ({ path }) => ({ path, namespace: 'group-defaults-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'group-defaults-test' }, () => ({ loader: 'js', contents:
        'export const fetchManagerApi = (...args) => globalThis.__groupDefaultsTest.request(...args);',
      }));
    } }],
  });
  mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
}
const { GROUP_DEFAULTS_PATH, fetchBrokerDefaultLeverage } = mod;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const errorBody = (code) => ({ message: `${code}: fixture refusal`, code, stackTrace: null });

beforeEach(() => {
  runtime.calls = [];
  runtime.request = async (url, options = {}) => {
    runtime.calls.push({ url, options });
    return runtime.respond();
  };
});
after(() => { delete globalThis.__groupDefaultsTest; });

test('requests exactly GET /api/v1/manager/broker/group-defaults through the manager client', async () => {
  runtime.respond = () => json(200, { broker_id: 'fixture-broker', group_default_leverage: 250 });
  await fetchBrokerDefaultLeverage();
  assert.equal(GROUP_DEFAULTS_PATH, '/api/v1/manager/broker/group-defaults');
  assert.equal(runtime.calls.length, 1);
  const [{ url, options }] = runtime.calls;
  assert.equal(url, '/api/v1/manager/broker/group-defaults');
  assert.doesNotMatch(url, /broker_id|\?|^GET\s/i, 'no method text, query, or broker_id in the path');
  assert.equal(String(options.method ?? 'GET').toUpperCase(), 'GET');
  assert.equal(options.body, undefined, 'a GET carries no body (and so no broker_id)');
});

test('an integer default in 1..10000 is returned as that integer', async () => {
  for (const value of [1, 250, 10000]) {
    runtime.respond = () => json(200, { broker_id: 'fixture-broker', group_default_leverage: value });
    assert.equal(await fetchBrokerDefaultLeverage(), value);
  }
});

test('null default (broker set none) returns null', async () => {
  runtime.respond = () => json(200, { broker_id: 'fixture-broker', group_default_leverage: null });
  assert.equal(await fetchBrokerDefaultLeverage(), null);
  runtime.respond = () => json(200, { broker_id: 'fixture-broker' });
  assert.equal(await fetchBrokerDefaultLeverage(), null);
});

test('out-of-contract default values are never used', async () => {
  for (const value of [0, -1, 1.5, 10001, '250', true]) {
    runtime.respond = () => json(200, { broker_id: 'fixture-broker', group_default_leverage: value });
    assert.equal(await fetchBrokerDefaultLeverage(), null, `value ${JSON.stringify(value)} must not pre-fill`);
  }
});

test('403/404/503 errors, bad JSON and network failures resolve to null (never throw)', async () => {
  for (const [status, code] of [
    [403, 'MT_RET_ERR_PERMISSIONS'],
    [404, 'GROUP_DEFAULTS_BROKER_UNKNOWN'],
    [503, 'GROUP_DEFAULTS_MIGRATION_MISSING'],
    [503, 'GROUP_DEFAULTS_UNAVAILABLE'],
  ]) {
    runtime.respond = () => json(status, errorBody(code));
    assert.equal(await fetchBrokerDefaultLeverage(), null, `${status} ${code} must resolve to null`);
  }
  runtime.respond = () => new Response('not json', { status: 200 });
  assert.equal(await fetchBrokerDefaultLeverage(), null);
  runtime.respond = () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await fetchBrokerDefaultLeverage(), null);
});
