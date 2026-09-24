import test from 'node:test';
import assert from 'node:assert/strict';
import { getResultPresentation, normalizeResult, splitResultMessage } from './resultMessage.js';

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

test('result presentation separates the operation while preserving every diagnostic paragraph', () => {
  const details = 'status: MT_RET_ERR_TRADE\nmessage: Request rejected\n\nDatabase detail: policy "runtime_scope"';
  assert.deepEqual(splitResultMessage(`Close Position #1777628 failed\n\n${details}`), {
    summary: 'Close Position #1777628 failed',
    details,
  });
});

test('result presentation leaves plain messages, colons and single newlines intact', () => {
  for (const message of ['Updated successfully.', 'Error: request rejected', 'Line one\nLine two', '', '\n\nOnly detail', 'Only summary\n\n']) {
    assert.deepEqual(splitResultMessage(message), { summary: message, details: null });
  }
});

test('result presentation accepts Windows blank lines without changing diagnostic indentation', () => {
  assert.deepEqual(splitResultMessage('Operation failed\r\n \t\r\n  detail one\r\n  detail two'), {
    summary: 'Operation failed',
    details: '  detail one\r\n  detail two',
  });
});

test('wrapped trade SQL errors use cautious copy and preserve the complete diagnostic message', () => {
  const original = 'Close Position #1777635 failed\n\nstatus: MT_RET_ERR_TRADE\nmessage: new row violates row-level security policy for table "orders"\n\nSQLSTATE: 42501';
  assert.deepEqual(getResultPresentation(normalizeResult(original)), {
    message: 'Could not confirm closure of position #1777635.',
    guidance: 'Check the position’s current status before trying again.',
    technicalMessage: original,
  });
});

test('ambiguous network trade errors never claim the position is still open or order still active', () => {
  for (const [operation, entity, action] of [
    ['Close Position', 'position', 'closure'],
    ['Cancel Order', 'order', 'cancellation'],
  ]) {
    const original = `${operation} #19325 failed\n\nFailed to fetch`;
    assert.deepEqual(getResultPresentation(normalizeResult(original)), {
      message: `Could not confirm ${action} of ${entity} #19325.`,
      guidance: `Check the ${entity}’s current status before trying again.`,
      technicalMessage: original,
    });
  }
});

test('confirmed wrapped trade successes use closed or cancelled copy', () => {
  for (const [operation, entity, action] of [
    ['Close Position', 'Position', 'closed'],
    ['Cancel Order', 'Order', 'cancelled'],
  ]) {
    const original = `${operation} #19325\n\nRequest completed`;
    assert.deepEqual(getResultPresentation(normalizeResult({ retcode: 'MT_RET_OK', message: original })), {
      message: `${entity} #19325 ${action} successfully.`,
      guidance: null,
      technicalMessage: original,
    });
  }
});

test('unconfirmed trade responses do not imply closure or cancellation completed', () => {
  const original = 'Close Position #19325\n\nAwaiting processing';
  const result = normalizeResult({ status: 'queued', message: original });
  assert.equal(result.type, 'info');
  assert.deepEqual(getResultPresentation(result), {
    message: 'Closure of position #19325 is not confirmed.',
    guidance: 'Awaiting processing\n\nCheck the position’s current status for the latest update.',
    technicalMessage: original,
  });
});

test('ordinary permissions, successes and informational messages remain readable', () => {
  for (const [message, type] of [
    ['Your role does not have permission to manage groups.', 'error'],
    ['Market is closed.', 'error'],
    ['Group created successfully!', 'success'],
    ['Please enter a password to check.', 'info'],
  ]) {
    assert.deepEqual(getResultPresentation(normalizeResult(message, { type })), {
      message,
      guidance: null,
      technicalMessage: null,
    });
  }
});

test('raw single-line SQL and JSON errors are explained without blaming the user', () => {
  for (const original of [
    'Error: SQLSTATE 42501: permission denied for table orders',
    'new row violates row-level security policy for table "orders"',
    '{"error":{"code":"DB_POLICY","query":"insert into orders"}}',
  ]) {
    assert.deepEqual(getResultPresentation({ type: 'error', message: original, code: null }), {
      message: 'We couldn’t confirm that the request completed.',
      guidance: 'Check the latest status before trying again. If you need help, share the technical details with support.',
      technicalMessage: original,
    });
  }
});

test('structured status codes preserve diagnostics without hiding actionable messages', () => {
  const original = 'Market is closed.';
  assert.deepEqual(getResultPresentation({ type: 'error', message: original, code: 'MT_RET_ERR_MARKET_CLOSED' }), {
    message: original,
    guidance: null,
    technicalMessage: original,
  });
});

test('human-readable multiline continuations stay visible as guidance', () => {
  for (const separator of ['\n', '\n\n', '\r\n', '\r\n\r\n']) {
    assert.deepEqual(getResultPresentation({ type: 'info', message: `Awaiting approval.${separator}Check back after the review.`, code: null }), {
      message: 'Awaiting approval.',
      guidance: 'Check back after the review.',
      technicalMessage: null,
    });
  }
});
