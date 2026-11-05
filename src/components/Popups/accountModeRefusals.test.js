import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_MODE_REFUSAL_MESSAGES,
  extractRefusalCode,
  extractRefusalMessage,
  resolveAccountModeRefusal,
} from './accountModeRefusals.js';

// Unit tests for account/group mode refusal mapping (§3 handoff table).
// Verifies all 8 backend codes, engine_code precedence, and fallback preservation.

test('ACCOUNT_MODE_REFUSAL_MESSAGES contains all confirmed backend codes including engine BBK06', () => {
  const expectedCodes = [
    'ACCOUNT_MODE_UNSUPPORTED',
    'ENGINE_ACCOUNT_MODE_UNSUPPORTED',
    'NETTING_REQUIRES_B_BOOK',
    'ACCOUNT_MODE_GROUP_MISMATCH',
    'GROUP_MARGIN_MODE_IN_USE',
    'GROUP_MARGIN_MODE_MIXED',
    'GROUP_MARGIN_MODE_ENGINE_OWNED',
    'GROUP_MARGIN_MODE_MISMATCH',
    'GROUP_MODE_WRITER_GRANT_MISSING',
    'GROUP_MARGIN_MODE_IMMUTABLE',
  ];
  assert.deepEqual(Object.keys(ACCOUNT_MODE_REFUSAL_MESSAGES).sort(), expectedCodes.sort());
});

test('Test 6: ACCOUNT_MODE_UNSUPPORTED is read via engine_code with MT_RET_ERR_DATA code', () => {
  // Real backend shape: group_contract.go:302-307, engine_register.go:330-337
  const responseBody = {
    message: 'Netting accounts are not supported yet',
    code: 'MT_RET_ERR_DATA',
    engine_code: 'ACCOUNT_MODE_UNSUPPORTED',
    stackTrace: null,
  };
  assert.equal(extractRefusalCode(responseBody), 'ACCOUNT_MODE_UNSUPPORTED');
  assert.equal(
    resolveAccountModeRefusal(responseBody),
    'Netting is not enabled on this server yet.',
  );

  // Engine BBK06 code: engine_register.go:102-103 maps BBK06 to ENGINE_ACCOUNT_MODE_UNSUPPORTED
  const engineBbk06Body = {
    message: 'account mode not supported by engine',
    code: 'MT_RET_ERR_DATA',
    engine_code: 'ENGINE_ACCOUNT_MODE_UNSUPPORTED',
    stackTrace: null,
  };
  assert.equal(extractRefusalCode(engineBbk06Body), 'ENGINE_ACCOUNT_MODE_UNSUPPORTED');
  assert.equal(
    resolveAccountModeRefusal(engineBbk06Body),
    'Netting is not enabled on this server yet.',
  );
});

test('Test 6: each 409 code in section 3 maps to its exact readable text', () => {
  // NETTING_REQUIRES_B_BOOK (group_contract.go:282, :346-353)
  assert.equal(
    resolveAccountModeRefusal({
      code: 'NETTING_REQUIRES_B_BOOK',
      error_code: 'NETTING_REQUIRES_B_BOOK',
      message: 'Netting groups require routingMode b_book',
    }),
    'Netting groups must use B-book routing.',
  );

  // ACCOUNT_MODE_GROUP_MISMATCH (group_contract.go:280, :355-364)
  assert.equal(
    resolveAccountModeRefusal({
      code: 'ACCOUNT_MODE_GROUP_MISMATCH',
      error_code: 'ACCOUNT_MODE_GROUP_MISMATCH',
      message: 'Account mode "netting" does not match group margin mode "hedging"',
    }),
    'Account mode must match the group (Netting).',
  );

  // GROUP_MARGIN_MODE_IN_USE (group_contract.go:283, :346-353)
  assert.equal(
    resolveAccountModeRefusal({
      code: 'GROUP_MARGIN_MODE_IN_USE',
      error_code: 'GROUP_MARGIN_MODE_IN_USE',
      message: 'A member of the group has an open position; the margin mode cannot change',
    }),
    'Close all positions in this group before changing its account mode.',
  );

  // GROUP_MARGIN_MODE_MIXED (group_contract.go:284, :346-353)
  assert.equal(
    resolveAccountModeRefusal({
      code: 'GROUP_MARGIN_MODE_MIXED',
      error_code: 'GROUP_MARGIN_MODE_MIXED',
      message: 'Mixed margin modes in group hierarchy',
    }),
    'This group (or its subgroups) has accounts in the other mode.',
  );

  // GROUP_MARGIN_MODE_ENGINE_OWNED (group_contract.go:285, :346-353)
  assert.equal(
    resolveAccountModeRefusal({
      code: 'GROUP_MARGIN_MODE_ENGINE_OWNED',
      error_code: 'GROUP_MARGIN_MODE_ENGINE_OWNED',
      message: 'Engine owns the group accounts',
    }),
    'The trading engine owns these accounts; contact support.',
  );

  // GROUP_MARGIN_MODE_MISMATCH (group_contract.go:281, :346-353)
  assert.equal(
    resolveAccountModeRefusal({
      code: 'GROUP_MARGIN_MODE_MISMATCH',
      error_code: 'GROUP_MARGIN_MODE_MISMATCH',
      message: 'Account mode does not match destination group margin mode',
    }),
    'An account can only move to a group with the same account mode.',
  );

  // GROUP_MODE_WRITER_GRANT_MISSING (group_margin_modes.go:70, group_contract.go:346-353)
  assert.equal(
    resolveAccountModeRefusal({
      code: 'GROUP_MODE_WRITER_GRANT_MISSING',
      error_code: 'GROUP_MODE_WRITER_GRANT_MISSING',
      message: 'Group writer lacks margin_mode grant',
    }),
    'The server is not set up to change account modes yet (admin action needed).',
  );

  // GROUP_MARGIN_MODE_IMMUTABLE (POST /GroupUpdate 409, rtx-s1 contract 2026-11-05): the typed group-conflict body.
  assert.equal(
    resolveAccountModeRefusal({
      code: 'GROUP_MARGIN_MODE_IMMUTABLE',
      error_code: 'GROUP_MARGIN_MODE_IMMUTABLE',
      error: 'The margin mode of group "G1" is hedging and cannot be changed; hedging or netting is chosen when a group is created',
      message: 'The margin mode of group "G1" is hedging and cannot be changed; hedging or netting is chosen when a group is created',
    }),
    'The account mode is fixed after the group is created. This change would alter it, so nothing was saved.',
  );
});

test('Test 6: unknown codes keep today’s behaviour (the backend message, never a raw code-only toast)', () => {
  const unknownError = {
    code: 'UNKNOWN_REFUSAL_CODE',
    error_code: 'UNKNOWN_REFUSAL_CODE',
    message: 'Backend specific failure explanation from upstream service',
  };
  assert.equal(
    resolveAccountModeRefusal(unknownError),
    'Backend specific failure explanation from upstream service',
  );
  assert.notEqual(resolveAccountModeRefusal(unknownError), 'UNKNOWN_REFUSAL_CODE');

  // Error instance with unknown code property
  const err = new Error('Upstream database error');
  err.code = 'SOME_SQL_ERROR';
  assert.equal(resolveAccountModeRefusal(err), 'Upstream database error');
});

test('extractRefusalCode handles various formats and string inputs', () => {
  assert.equal(extractRefusalCode('NETTING_REQUIRES_B_BOOK'), 'NETTING_REQUIRES_B_BOOK');
  assert.equal(extractRefusalCode('NOT_A_REAL_CODE'), '');
  assert.equal(extractRefusalCode(null), '');
  assert.equal(extractRefusalCode(undefined), '');
  assert.equal(extractRefusalCode({}), '');
});

test('extractRefusalMessage extracts nested error messages', () => {
  assert.equal(extractRefusalMessage({ message: 'msg1' }), 'msg1');
  assert.equal(extractRefusalMessage({ error: 'msg2' }), 'msg2');
  assert.equal(extractRefusalMessage({ error: { message: 'msg3' } }), 'msg3');
  assert.equal(extractRefusalMessage('plain string'), 'plain string');
});

test('resolveAccountModeRefusal detects known code embedded in error message', () => {
  const err = new Error('Refusal occurred: ACCOUNT_MODE_GROUP_MISMATCH while creating account');
  assert.equal(
    resolveAccountModeRefusal(err),
    'Account mode must match the group (Netting).',
  );
});

test('resolveAccountModeRefusal falls back when neither code nor message is provided', () => {
  assert.equal(resolveAccountModeRefusal(null), 'An error occurred.');
  assert.equal(resolveAccountModeRefusal({}, 'Custom fallback'), 'Custom fallback');
});
