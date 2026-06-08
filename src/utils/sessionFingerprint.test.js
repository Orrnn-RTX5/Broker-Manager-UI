import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPermissionSessionFingerprint,
  getPermissionSessionQueryKey,
  PERMISSION_SESSION_QUERY_ROOT,
} from './sessionFingerprint.js';

test('permission session fingerprint is stable for the same session tuple', () => {
  const session = { token: 'token-a', login: 'manager1', brokerId: 'broker-a' };
  assert.equal(
    buildPermissionSessionFingerprint(session),
    buildPermissionSessionFingerprint({ ...session })
  );
});

test('permission session fingerprint changes when token or user context changes', () => {
  const base = buildPermissionSessionFingerprint({ token: 'token-a', login: 'manager1', brokerId: 'broker-a' });

  assert.notEqual(base, buildPermissionSessionFingerprint({ token: 'token-b', login: 'manager1', brokerId: 'broker-a' }));
  assert.notEqual(base, buildPermissionSessionFingerprint({ token: 'token-a', login: 'manager2', brokerId: 'broker-a' }));
  assert.notEqual(base, buildPermissionSessionFingerprint({ token: 'token-a', login: 'manager1', brokerId: 'broker-b' }));
});

test('permission session query key does not expose raw token material', () => {
  const token = 'secret-token-value-that-must-not-appear';
  const key = getPermissionSessionQueryKey({ token, login: 'manager1', brokerId: 'broker-a' });
  const serialized = JSON.stringify(key);

  assert.equal(key[0], PERMISSION_SESSION_QUERY_ROOT);
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes('secret-token-value'), false);
});

test('permission session query key has a stable anonymous bucket without session data', () => {
  assert.deepEqual(getPermissionSessionQueryKey(), [PERMISSION_SESSION_QUERY_ROOT, 'anonymous']);
  assert.deepEqual(getPermissionSessionQueryKey({}), [PERMISSION_SESSION_QUERY_ROOT, 'anonymous']);
});
