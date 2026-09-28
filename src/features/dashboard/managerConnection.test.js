import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeManagerConnection } from './managerConnection.js';

test('uses explicit manager connection states from the confirmed response shape', () => {
  assert.deepEqual(normalizeManagerConnection({ status: 'Connected', login: 9001 }), {
    state: 'connected', login: 9001,
  });
  assert.deepEqual(normalizeManagerConnection([{ status: 'Disconnected' }]), {
    state: 'disconnected', login: null,
  });
});

test('never treats unknown or missing backend status as connected', () => {
  assert.deepEqual(normalizeManagerConnection({ status: 'Healthy' }), {
    state: 'unavailable', login: null,
  });
  assert.deepEqual(normalizeManagerConnection([]), {
    state: 'unavailable', login: null,
  });
});
