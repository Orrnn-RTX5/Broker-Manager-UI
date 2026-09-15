import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResult } from './resultMessage.js';

test('server failures override success flags and preserve details', () => {
  const result = normalizeResult({ success: true, retcode: 'MT_RET_ERR_PARAMS', message: 'client_order_id is required exactly once for an engine command' });
  assert.equal(result.type, 'error');
  assert.equal(result.code, 'MT_RET_ERR_PARAMS');
  assert.match(result.message, /client_order_id/);
});
test('confirmed successes, JSON responses and failed password checks', () => {
  assert.equal(normalizeResult({ retcode: 'MT_RET_OK', message: 'Position closed' }).type, 'success');
  assert.equal(normalizeResult('{"success":false,"message":"Rejected"}').type, 'error');
  assert.equal(normalizeResult('false').type, 'error');
  assert.equal(normalizeResult('true').type, 'success');
  assert.equal(normalizeResult('Restrictions updated for login 123').type, 'success');
});
test('unknown responses and empty bodies do not claim success', () => {
  assert.equal(normalizeResult({ status: 'queued', message: 'Awaiting processing' }).type, 'info');
  assert.equal(normalizeResult('').type, 'info');
  assert.equal(normalizeResult('Some response', { type: 'error' }).type, 'error');
});
