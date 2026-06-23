import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAuthExpiredMessage,
  isAuthExpiredResponse,
  isAuthExpiredStatus,
  isPermissionDeniedStatus,
} from './authHttpStatus.js';

test('401 is the only HTTP status that represents an expired auth session', () => {
  assert.equal(isAuthExpiredStatus(401), true);
  assert.equal(isAuthExpiredStatus(403), false);
});

test('403 with an auth-expiry message represents an expired auth session', () => {
  assert.equal(isAuthExpiredResponse(403, { message: 'jwt expired' }), true);
  assert.equal(isAuthExpiredResponse(403, { error: { message: 'Token expired' } }), true);
  assert.equal(isAuthExpiredResponse(403, 'Unauthenticated request'), true);
});

test('403 permission denials do not represent expired auth sessions', () => {
  assert.equal(isAuthExpiredResponse(403, { message: 'Missing required permission: manage_ib' }), false);
  assert.equal(isAuthExpiredResponse(403, { error: 'Forbidden' }), false);
  assert.equal(isAuthExpiredMessage({ message: 'Permission denied' }), false);
});

test('403 is a permission denial, not a logout trigger', () => {
  assert.equal(isPermissionDeniedStatus(403), true);
  assert.equal(isPermissionDeniedStatus(401), false);
});
