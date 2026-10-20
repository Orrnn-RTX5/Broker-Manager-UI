import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_POLICY_DEFAULT_INVALID,
  GROUP_POLICY_DEFAULT_MISSING,
  mapGroupPolicyError,
  parseGroupPolicyField,
} from './groupPolicyErrors.js';

const RAW_CODES = [GROUP_POLICY_DEFAULT_MISSING, GROUP_POLICY_DEFAULT_INVALID];

const missingServerMessage = (field) =>
  `${GROUP_POLICY_DEFAULT_MISSING}: ${field} is omitted and this broker has no tenant or environment default for it; send ${field} explicitly`;

const invalidServerMessage = (detail) => `${GROUP_POLICY_DEFAULT_INVALID}: ${detail}`;

const FIELDS = ['executionMode', 'bookType', 'marginCallLevel', 'stopOutLevel', 'tradeAllowed', 'demo'];

test('GROUP_POLICY_DEFAULT_MISSING maps per field to a plain no-default message', () => {
  for (const field of FIELDS) {
    const mapped = mapGroupPolicyError(missingServerMessage(field));
    assert.match(mapped, /this broker has no default\./);
    for (const code of RAW_CODES) assert.doesNotMatch(mapped, new RegExp(code));
  }
  assert.equal(
    mapGroupPolicyError(missingServerMessage('executionMode')),
    'Choose an execution mode — this broker has no default.',
  );
});

test('GROUP_POLICY_DEFAULT_INVALID maps per field to a message naming the constraint', () => {
  const cases = [
    ['executionMode must be 1 to 20 characters', /1 to 20 characters/],
    ['bookType must be 1 to 10 characters', /1 to 10 characters/],
    ['marginCallLevel and stopOutLevel must be positive finite numbers', /positive finite/],
    ['stopOutLevel (10) must not exceed marginCallLevel (100)', /must not exceed the margin call level/],
    ['tradeAllowed must be true or false', /true or false/],
    ['demo must be true or false', /true or false/],
  ];
  for (const [detail, constraint] of cases) {
    const mapped = mapGroupPolicyError(invalidServerMessage(detail));
    assert.match(mapped, constraint);
    for (const code of RAW_CODES) assert.doesNotMatch(mapped, new RegExp(code));
  }
});

test('field parsing handles Error objects, code objects, and snake_case spellings', () => {
  assert.equal(parseGroupPolicyField(missingServerMessage('stopOutLevel')), 'stopOutLevel');
  assert.equal(parseGroupPolicyField('GROUP_POLICY_DEFAULT_MISSING: stop_out_level is omitted'), 'stopOutLevel');
  assert.equal(
    mapGroupPolicyError(new Error(missingServerMessage('demo'))),
    'Choose whether this is a demo group — this broker has no default.',
  );
  assert.equal(
    mapGroupPolicyError({ code: GROUP_POLICY_DEFAULT_MISSING, error: missingServerMessage('bookType') }),
    'Choose a book type — this broker has no default.',
  );
});

test('unknown errors pass through untouched and mapped output never leaks raw codes', () => {
  for (const unknown of [
    'Failed to create group',
    'SOME_OTHER_CODE: something went wrong',
    new Error('network failure'),
    { code: 'UNKNOWN', error: 'Tenant limits are temporarily unavailable' },
  ]) {
    const original = typeof unknown === 'string' ? unknown : (unknown.message ?? unknown.error);
    assert.equal(mapGroupPolicyError(unknown), original);
  }
  // Recognized code with no parseable field still hides the raw code.
  for (const message of [
    `${GROUP_POLICY_DEFAULT_MISSING}: something is omitted`,
    `${GROUP_POLICY_DEFAULT_INVALID}: something is wrong`,
  ]) {
    const mapped = mapGroupPolicyError(message);
    for (const code of RAW_CODES) assert.doesNotMatch(mapped, new RegExp(code));
  }
});

// Leverage refusals from POST /GroupCreate: a top-level create without
// leverage (and no broker default) answers 400 MT_RET_ERR_PARAMS with
// `GROUP_POLICY_DEFAULT_MISSING: leverage is omitted ...`, and an explicit
// leverage outside 1..10000 answers `GROUP_LEVERAGE_INVALID ...`. Both map to
// an inline error on the leverage field; the raw code never renders. The
// namespace import keeps each test reporting by name if an export is missing.
import * as policyErrors from './groupPolicyErrors.js';

const LEVERAGE_MISSING = `${GROUP_POLICY_DEFAULT_MISSING}: leverage is omitted and this broker has no default group leverage; send leverage explicitly`;
const LEVERAGE_INVALID = 'GROUP_LEVERAGE_INVALID: leverage 0 is outside 1..10000';

test('GROUP_POLICY_DEFAULT_MISSING: leverage maps to the leverage field', () => {
  assert.ok(policyErrors.GROUP_POLICY_FIELDS.includes('leverage'));
  assert.equal(policyErrors.groupPolicyErrorField(LEVERAGE_MISSING), 'leverage');
  assert.equal(policyErrors.groupPolicyErrorField(new Error(LEVERAGE_MISSING)), 'leverage');
  assert.equal(policyErrors.groupPolicyErrorField({ message: LEVERAGE_MISSING, code: 'MT_RET_ERR_PARAMS', stackTrace: null }), 'leverage');
  const mapped = mapGroupPolicyError(LEVERAGE_MISSING);
  assert.match(mapped, /leverage/i);
  assert.match(mapped, /this broker has no default\./);
  for (const code of RAW_CODES) assert.doesNotMatch(mapped, new RegExp(code));
});

test('GROUP_LEVERAGE_INVALID maps to the leverage field with the range message', () => {
  assert.equal(policyErrors.GROUP_LEVERAGE_INVALID, 'GROUP_LEVERAGE_INVALID');
  assert.equal(policyErrors.groupPolicyErrorField(LEVERAGE_INVALID), 'leverage');
  assert.equal(policyErrors.groupPolicyErrorField(new Error(LEVERAGE_INVALID)), 'leverage');
  assert.equal(policyErrors.groupPolicyErrorField({ message: 'out of range', code: 'GROUP_LEVERAGE_INVALID' }), 'leverage');
  const mapped = mapGroupPolicyError(LEVERAGE_INVALID);
  assert.match(mapped, /1 to 10000/);
  assert.doesNotMatch(mapped, /GROUP_LEVERAGE_INVALID/);
});

test('groupPolicyErrorField keeps existing fields and ignores unknown errors', () => {
  assert.equal(policyErrors.groupPolicyErrorField(missingServerMessage('executionMode')), 'executionMode');
  assert.equal(policyErrors.groupPolicyErrorField(`${GROUP_POLICY_DEFAULT_MISSING}: something is omitted`), null);
  assert.equal(policyErrors.groupPolicyErrorField('Failed to create group'), null);
  assert.equal(policyErrors.groupPolicyErrorField(new Error('leverage could not be saved')), null);
});
