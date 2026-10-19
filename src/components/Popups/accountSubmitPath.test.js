import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_MODE_DEFAULT,
  buildNewAccountPayload,
  buildSubmittableAccountPayload,
  normalizeAccountMode,
  normalizeCurrencyCode,
  inheritGroupSettings,
  resolveInitialGroup,
} from './newAccountWizard.js';

// Submit-path test for the new-account wizard (ds-18).
//
// ds-20 lesson: tests must execute the REAL helpers against REAL production
// data shapes, never re-implemented logic or mirrored literals. Everything
// below runs through the real production code imported from
// newAccountWizard.js:
//   - the form is built with EXACTLY the initial keys NewAccountModal.jsx
//     uses in its useState initializer (Group/Leverage/FirstName/LastName/
//     Email/Phone/Country/Currency/AccountMode/master_pass/investor_pass),
//     with AccountMode seeded from the REAL ACCOUNT_MODE_DEFAULT;
//   - the group pick applies the REAL inheritGroupSettings (untouched leverage
//     and currency follow the selected group, explicit edits win);
//   - submit runs the REAL buildNewAccountPayload, exactly as the modal's
//     handleSubmit does (no group fallback: empty fails closed).
// Groups fixtures are shaped like useGroupList rows ({name, leverage,
// currency} keys). Generic fixtures only: synthetic group names, ISO-style
// codes, example.invalid contacts. No tenant, broker, host, or account
// identifiers.

// EXACT initial keys of NewAccountModal.jsx's useState initializer (sweep
// W5/W4: Leverage and Currency both start '' so no hardcoded default can
// reach the wire; values arrive only via group inheritance or explicit pick).
const buildInitialForm = (overrides = {}) => ({
  Group: '',
  Leverage: '',
  FirstName: '', LastName: '', Email: '', Phone: '',
  Country: 'India', Currency: '', AccountMode: ACCOUNT_MODE_DEFAULT,
  master_pass: '', investor_pass: '',
  ...overrides,
});

// Realistic groups page rows: lowercase echo currency on one record,
// capitalized key variants on the other, both shaped like useGroupList rows.
const groups = () => ([
  { name: 'Fixture\\Alpha', leverage: 200, currency: 'eur' },
  { name: 'Fixture\\Beta', leverage: 50, currency: 'GBP' },
]);

const operatorDetails = () => ({
  FirstName: 'Case',
  LastName: 'Subject',
  Email: 'case@example.invalid',
  Phone: '',
  master_pass: 'secret-a',
  investor_pass: 'secret-b',
});

test('explicit group pick inherits leverage+currency and builds the exact payload', () => {
  const picked = 'Fixture\\Beta'; // GroupCombobox handleSelect writes form.Group
  let form = { ...buildInitialForm(), Group: picked };
  const inherited = inheritGroupSettings({
    groups: groups(),
    groupName: picked,
    leverageTouched: false,
    currencyTouched: false,
  });
  assert.deepEqual(inherited, { Leverage: 50, Currency: 'GBP' });
  form = { ...form, ...inherited, ...operatorDetails(), AccountMode: 'netting' };

  const payload = buildNewAccountPayload(form);

  assert.equal(payload.Group, picked);
  assert.equal(payload.Leverage, 50);
  assert.ok(Number.isInteger(payload.Leverage));
  assert.equal(payload.Currency, 'GBP');
  assert.ok(['hedging', 'netting'].includes(payload.AccountMode));
  assert.equal(payload.AccountMode, 'netting');
  // Search-box state is never part of the submitted payload.
  assert.ok(!('groupSearch' in payload));
  assert.ok(!('search' in payload));
});

test('lowercase group currency is uppercased; mixed-case mode is normalized', () => {
  assert.equal(normalizeCurrencyCode('eur'), 'EUR');
  assert.equal(normalizeAccountMode('Hedging'), 'hedging');
  let form = { ...buildInitialForm(), Group: 'Fixture\\Alpha' };
  form = {
    ...form,
    ...inheritGroupSettings({ groups: groups(), groupName: form.Group, leverageTouched: false, currencyTouched: false }),
    ...operatorDetails(),
    AccountMode: 'Netting',
  };
  const payload = buildNewAccountPayload(form);
  assert.equal(payload.Group, 'Fixture\\Alpha');
  assert.equal(payload.Currency, 'EUR');
  assert.equal(payload.Leverage, 200);
  assert.ok(Number.isInteger(payload.Leverage));
  assert.equal(payload.AccountMode, 'netting');
});

test('default accounting mode is hedging and passes the submit path', () => {
  assert.equal(ACCOUNT_MODE_DEFAULT, 'hedging');
  const form = {
    ...buildInitialForm(),
    Group: 'Fixture\\Alpha',
    ...inheritGroupSettings({ groups: groups(), groupName: 'Fixture\\Alpha', leverageTouched: false, currencyTouched: false }),
    ...operatorDetails(),
  };
  const payload = buildNewAccountPayload(form);
  assert.equal(payload.AccountMode, 'hedging');
});

test('empty group throws: submit fails closed with no fallback group', () => {
  assert.throws(() => buildNewAccountPayload(buildInitialForm()), /Please select an account group\./);
  assert.throws(
    () => buildNewAccountPayload(buildInitialForm({ Group: '   ', Currency: 'USD', Leverage: 100 })),
    /Please select an account group\./,
  );
});

test('unknown accounting mode throws', () => {
  const form = {
    ...buildInitialForm(),
    Group: 'Fixture\\Alpha',
    Currency: 'USD',
    Leverage: 100,
    AccountMode: 'margin',
    ...operatorDetails(),
  };
  assert.equal(normalizeAccountMode('margin'), '');
  assert.throws(
    () => buildNewAccountPayload(form),
    /accounting mode \(hedging or netting\)/,
  );
});

test('search text is never accepted as the group', () => {
  // Operator types in the combobox search box but picks nothing: the
  // component keeps that text in groupSearch state, never in form.Group, so
  // auto-fill stays off and submit fails closed.
  const form = buildInitialForm();
  const groupSearch = 'Fixture';
  assert.equal(
    resolveInitialGroup({ groups: groups(), currentGroup: form.Group, groupTouched: false, search: groupSearch }),
    null,
  );
  assert.equal(form.Group, '');
  assert.throws(() => buildNewAccountPayload(form), /Please select an account group\./);

  // Explicit pick writes ONLY the picked name and clears the search text.
  const picked = 'Fixture\\Beta';
  const afterPick = { ...form, Group: picked };
  const clearedSearch = '';
  assert.equal(clearedSearch, '');
  const payload = buildNewAccountPayload({
    ...afterPick,
    ...inheritGroupSettings({ groups: groups(), groupName: afterPick.Group, leverageTouched: false, currencyTouched: false }),
    ...operatorDetails(),
  });
  assert.equal(payload.Group, picked);
  assert.notEqual(payload.Group, groupSearch);
});

test('explicit operator leverage/currency edits always win over group inheritance', () => {
  const inherited = inheritGroupSettings({
    groups: groups(),
    groupName: 'Fixture\\Beta',
    leverageTouched: true,
    currencyTouched: true,
  });
  assert.deepEqual(inherited, {});
  const form = {
    ...buildInitialForm(),
    Group: 'Fixture\\Beta',
    Leverage: 100,
    Currency: 'USD',
    ...operatorDetails(),
  };
  const payload = buildNewAccountPayload(form);
  assert.equal(payload.Leverage, 100);
  assert.equal(payload.Currency, 'USD');
});

test('padded group pick is submitted trimmed to the exact picked name', () => {
  const form = {
    ...buildInitialForm(),
    Group: '  Fixture\\Beta  ',
    Leverage: 50,
    Currency: 'GBP',
    ...operatorDetails(),
  };
  assert.equal(buildNewAccountPayload(form).Group, 'Fixture\\Beta');
});

test('leverage must be an integer in range; string numbers from selects are tolerated', () => {
  const base = { ...buildInitialForm(), Group: 'Fixture\\Alpha', Currency: 'EUR', ...operatorDetails() };
  assert.throws(() => buildNewAccountPayload({ ...base, Leverage: 0 }), /valid leverage/);
  assert.throws(() => buildNewAccountPayload({ ...base, Leverage: 1.5 }), /valid leverage/);
  assert.equal(buildNewAccountPayload({ ...base, Leverage: '200' }).Leverage, 200);
});

test('initial group is never auto-filled; empty fails closed in every state', () => {
  assert.equal(
    resolveInitialGroup({ groups: groups(), currentGroup: '', groupTouched: false, search: '' }),
    null,
  );
  assert.equal(
    resolveInitialGroup({ groups: groups(), currentGroup: '', groupTouched: true, search: '' }),
    null,
  );
  assert.equal(
    resolveInitialGroup({ groups: groups(), currentGroup: 'Fixture\\Beta', groupTouched: false, search: '' }),
    null,
  );
  assert.equal(resolveInitialGroup({ groups: [], currentGroup: '', groupTouched: false, search: '' }), null);
});

// Sweep W5/W4 (no hardcoded tenant defaults reach the wire; real helpers
// only): the initial/reset form carries no USD or leverage default, a stale
// Leverage 100 with no group still fails closed on group-required through the
// exact modal submit path, and the group value wins after an explicit pick.

test('sweep W5/W4: initial form carries no USD default and no leverage default', () => {
  const initial = buildInitialForm();
  assert.equal(initial.Currency, '');
  assert.notEqual(initial.Currency, 'USD');
  assert.equal(initial.Leverage, '');
  assert.equal(normalizeCurrencyCode(initial.Currency), '');
  assert.throws(() => buildNewAccountPayload(initial), /Please select an account group\./);
  assert.throws(() => buildSubmittableAccountPayload(initial), /Please select an account group\./);
});

test('sweep W5/W4: stale Leverage 100 with no group still throws group-required', () => {
  for (const empty of ['', '   ', undefined, null]) {
    const form = { ...buildInitialForm(), Group: empty, Leverage: 100, Currency: 'EUR' };
    assert.throws(() => buildNewAccountPayload(form), /Please select an account group\./);
    assert.throws(() => buildSubmittableAccountPayload(form), /Please select an account group\./);
  }
});

test('sweep W5/W4: group currency (non-USD fixture) wins after an explicit pick', () => {
  const picked = 'Fixture\\Alpha';
  const inherited = inheritGroupSettings({
    groups: groups(),
    groupName: picked,
    leverageTouched: false,
    currencyTouched: false,
  });
  assert.deepEqual(inherited, { Leverage: 200, Currency: 'EUR' });
  assert.notEqual(inherited.Currency, 'USD');
  const payload = buildNewAccountPayload({
    ...buildInitialForm(),
    Group: picked,
    ...inherited,
    ...operatorDetails(),
  });
  assert.equal(payload.Group, picked);
  assert.equal(payload.Leverage, 200);
  assert.equal(payload.Currency, 'EUR');
  assert.notEqual(payload.Currency, 'USD');
});

test('sweep W5/W4: stale Leverage 100 never survives an explicit pick (group wins)', () => {
  const picked = 'Fixture\\Beta';
  const stale = { ...buildInitialForm(), Group: picked, Leverage: 100 };
  const inherited = inheritGroupSettings({
    groups: groups(),
    groupName: picked,
    leverageTouched: false,
    currencyTouched: false,
  });
  const payload = buildNewAccountPayload({ ...stale, ...inherited, ...operatorDetails() });
  assert.equal(payload.Leverage, 50);
  assert.equal(payload.Currency, 'GBP');
});

test('sweep W5/W4: reset leaves no currency default and fails closed', () => {
  const reset = buildInitialForm();
  assert.equal(reset.Group, '');
  assert.equal(reset.Currency, '');
  assert.notEqual(reset.Currency, 'USD');
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: reset.Group,
      leverageTouched: false,
      currencyTouched: false,
    }),
    {},
  );
  assert.throws(() => buildNewAccountPayload(reset), /Please select an account group\./);
});
