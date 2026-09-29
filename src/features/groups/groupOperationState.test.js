import test from 'node:test';
import assert from 'node:assert/strict';
import { canRefreshRejectedOperation, createGroupOperationKey, settingDifferences, validSavedOperation } from './groupOperationState.js';

test('a rejected preview can be replaced; ambiguous delivery keeps the original submission', () => {
  for (const code of ['stale_preview', 'invalid_preview', 'blocked', 'operation_conflict']) {
    assert.equal(canRefreshRejectedOperation({ status: 409, code }), true);
  }
  assert.equal(canRefreshRejectedOperation({ status: 503, code: 'feature_disabled' }), true);
  for (const error of [new Error('network failure'), { status: 503, code: 'unavailable' }, { status: 401, code: 'unauthorized' }, { status: 409, code: 'idempotency_conflict' }]) {
    assert.equal(canRefreshRejectedOperation(error), false);
  }
});

test('saved operations require a usable selection and a recoverable ID or submission', () => {
  const submission = { preview_token: 'a'.repeat(64), idempotency_key: 'b'.repeat(32) };
  assert.equal(validSavedOperation({ selection: { sources: ['live/account'] }, submission }), true);
  assert.equal(validSavedOperation({ selection: { folder: 'live' }, id: 'operation-id' }), true);
  for (const value of [null, {}, { selection: {} }, { selection: { sources: [] }, submission }, { selection: { folder: 'live', sources: ['live/a'] }, submission }, { selection: { folder: 'live' }, submission: {} }]) {
    assert.equal(validSavedOperation(value), false);
  }
});

test('LAN HTTP origins can generate a secure idempotency key without randomUUID', () => {
  assert.equal(createGroupOperationKey({ getRandomValues: bytes => bytes.fill(255) }), 'ff'.repeat(16));
  assert.throws(() => createGroupOperationKey({}), /HTTPS or localhost/);
});

test('closure and unselected destinations do not display fictitious settings changes', () => {
  const source = [{ name: 'live/a', currency: 'USD', leverage: 100 }];
  assert.deepEqual(settingDifferences(source, undefined), []);
  assert.deepEqual(settingDifferences(source, null), []);
  assert.deepEqual(settingDifferences(source, { currency: 'USD', leverage: 200 }), [
    { source: 'live/a', key: 'leverage', before: 100, after: 200 },
  ]);
});
