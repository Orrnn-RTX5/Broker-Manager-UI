import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const shell = process.platform === 'win32'
  ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe')
  : '/bin/sh';
const shellAvailable = existsSync(shell);
const script = readFileSync(new URL('../../docker-entrypoint.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const generatedProfile = (input) => {
  const directory = mkdtempSync(join(tmpdir(), 'manager-runtime-test-'));
  try {
    const scriptPath = join(directory, 'entrypoint.sh');
    writeFileSync(scriptPath, script);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      !/^(VITE_|BACKEND_|API_|WS_|BROKER_|FEED_|MANAGER_|MARKET_DATA_|POSITION_|DEFAULT_MT5_|DISCOVERY_|USE_MOCK_|GROUP_OPERATIONS_)/.test(key)
    ));
    const result = spawnSync(shell, [scriptPath.replaceAll('\\', '/'), 'true'], {
      env: { ...env, ...input, NGINX_HTML_DIR: directory.replaceAll('\\', '/') }, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const source = readFileSync(join(directory, 'runtime-config.js'), 'utf8');
    const context = { window: {} };
    runInNewContext(source, context);
    assert.equal(context.window.RUNTIME_CONFIG, context.window.__RTX_RUNTIME_CONFIG__);
    return { config: JSON.parse(JSON.stringify(context.window.RUNTIME_CONFIG)), source };
  } finally {
    // Only remove the unique test directory created under the resolved temp root.
    assert.equal(resolve(directory, '..'), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
};
const input = {
  BACKEND_TARGET: 'web', BROKER_ID: 'achiever', FEED_BROKER_ID: 'achiever',
  API_HOST: 'https://service.achiever.orrnn.com', API_HOST_EXT: 'https://service.achiever.orrnn.com',
  WS_HOST: 'wss://service.achiever.orrnn.com', WS_FEED_PATH: '/bridge/ws/feed',
  MANAGER_WS_HOST: 'wss://service.achiever.orrnn.com', MARKET_DATA_SOURCE: 'manager',
  MANAGER_PROXY_STRIP_MANAGER_PREFIX: 'false', POSITION_UPDATES_WS_PATH: '/manager/OnPositionUpdate',
  FEED_WS_URL: 'wss://service.achiever.orrnn.com/bridge/ws/feed',
  FEED_STATUS_URL: 'https://service.achiever.orrnn.com/bridge/ws/feed/status',
  DEFAULT_MT5_SERVER: 'Server "A" \\ primary', DISCOVERY_BASE_URL: 'https://directory.example',
  USE_MOCK_DISCOVERY: 'false', GROUP_OPERATIONS_BROKERS: 'achiever',
};

test('container entrypoint exports the complete public routing profile and executes its command', { skip: !shellAvailable }, () => {
  const { config, source } = generatedProfile({ ...input, JWT_SECRET: 'must-not-be-exported', DATABASE_URL: 'private-database' });
  assert.deepEqual(config, { CONFIG_SOURCE: 'deployment', ...input });
  assert.doesNotMatch(source, /must-not-be-exported|private-database|JWT_SECRET|DATABASE_URL/);
});

test('container supports VITE aliases for existing deployment pipelines', { skip: !shellAvailable }, () => {
  const aliases = Object.fromEntries(Object.entries(input).map(([key, value]) => [`VITE_${key}`, value]));
  assert.deepEqual(generatedProfile(aliases).config, { CONFIG_SOURCE: 'deployment', ...input });
});

test('empty optional container overrides stay empty instead of selecting old aliases', { skip: !shellAvailable }, () => {
  const env = { ...input };
  for (const key of ['MANAGER_WS_HOST', 'FEED_WS_URL', 'FEED_STATUS_URL', 'POSITION_UPDATES_WS_PATH']) {
    env[key] = '';
    env[`VITE_${key}`] = 'old-broker-setting';
  }
  const { config } = generatedProfile(env);
  for (const key of ['MANAGER_WS_HOST', 'FEED_WS_URL', 'FEED_STATUS_URL', 'POSITION_UPDATES_WS_PATH']) {
    assert.equal(config[key], '');
  }
});
