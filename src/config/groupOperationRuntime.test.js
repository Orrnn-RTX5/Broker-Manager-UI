import test from 'node:test';
import assert from 'node:assert/strict';
import { getRuntimeConfigValue } from './backendTarget.js';

test('an explicit empty runtime rollout overrides a enabled fallback without changing other config lookups', () => {
  const previous = globalThis.__RTX_RUNTIME_CONFIG__;
  try {
    globalThis.__RTX_RUNTIME_CONFIG__ = { GROUP_OPERATIONS_BROKERS: '', VITE_GROUP_OPERATIONS_BROKERS: '*' };
    const keys = ['GROUP_OPERATIONS_BROKERS', 'VITE_GROUP_OPERATIONS_BROKERS'];
    assert.equal(getRuntimeConfigValue(keys, '', { allowEmpty: true }), '');
    assert.equal(getRuntimeConfigValue(keys), '*');
  } finally {
    if (previous === undefined) delete globalThis.__RTX_RUNTIME_CONFIG__;
    else globalThis.__RTX_RUNTIME_CONFIG__ = previous;
  }
});
