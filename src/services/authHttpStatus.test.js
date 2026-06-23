import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthExpiredStatus, isPermissionDeniedStatus } from './authHttpStatus.js';

test('401 is the only HTTP status that represents an expired auth session', () => {
  assert.equal(isAuthExpiredStatus(401), true);
  assert.equal(isAuthExpiredStatus(403), false);
});

test('403 is a permission denial, not a logout trigger', () => {
  assert.equal(isPermissionDeniedStatus(403), true);
  assert.equal(isPermissionDeniedStatus(401), false);
});
