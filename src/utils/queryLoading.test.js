import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowInGlobalLoader } from './queryLoading.js';

test('background analytics queries do not activate the global loader', () => {
  assert.equal(shouldShowInGlobalLoader({ meta: { suppressGlobalLoader: true } }), false);
  assert.equal(shouldShowInGlobalLoader({ meta: {} }), true);
  assert.equal(shouldShowInGlobalLoader({}), true);
});

test('queries left running after their screen unmounts do not activate the global loader', () => {
  assert.equal(shouldShowInGlobalLoader({ meta: {}, getObserversCount: () => 0 }), false);
  assert.equal(shouldShowInGlobalLoader({ meta: {}, getObserversCount: () => 1 }), true);
});
