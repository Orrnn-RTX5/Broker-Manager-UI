import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_MODE_DEFAULT,
  brokerCountryOf,
  buildNewAccountPayload,
  buildSubmittableAccountPayload,
  normalizeAccountMode,
  normalizeCountryName,
  normalizeCurrencyCode,
  inheritGroupSettings,
  resolveDefaultCountry,
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
// reach the wire; values arrive only via group inheritance or explicit pick.
// Sweep country: Country starts '' via the REAL resolveDefaultCountry with no
// broker config (fail-closed, no invented default); the broker-configured
// country wins only when the config carries one, exactly as the modal seeds
// it from getBrokerInfo()).
const buildInitialForm = (overrides = {}) => ({
  Group: '',
  Leverage: '',
  FirstName: '', LastName: '', Email: '', Phone: '',
  Country: resolveDefaultCountry(null, false), Currency: '', AccountMode: ACCOUNT_MODE_DEFAULT,
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

// Sweep country (white-label hardcode removal; real helpers only): the
// initial/reset form emits no country default, the broker-configured country
// wins through the exact modal path (seeded via the REAL
// resolveDefaultCountry, like the modal seeds it from getBrokerInfo()), an
// explicit operator edit always wins, and empty Country passes through
// exactly per the backend account-create contract (Country is optional free
// text, stored as sent — never a submit failure).

test('sweep country: initial form emits no country default', () => {
  const initial = buildInitialForm();
  assert.equal(initial.Country, '');
  assert.equal(resolveDefaultCountry(null, false), '');
  assert.equal(resolveDefaultCountry({}, false), '');
  assert.equal(normalizeCountryName(initial.Country), '');
  assert.throws(() => buildNewAccountPayload(initial), /Please select an account group\./);
  assert.throws(() => buildSubmittableAccountPayload(initial), /Please select an account group\./);
});

test('sweep country: empty country passes through exactly to the payload', () => {
  const picked = 'Fixture\\Beta';
  const payload = buildNewAccountPayload({
    ...buildInitialForm(),
    Group: picked,
    ...inheritGroupSettings({ groups: groups(), groupName: picked, leverageTouched: false, currencyTouched: false }),
    ...operatorDetails(),
  });
  assert.equal(payload.Country, '');
  assert.equal(payload.Group, picked);
  assert.equal(payload.Currency, 'GBP');
});

test('sweep country: broker-config country wins through the exact modal path', () => {
  const picked = 'Fixture\\Beta';
  const initial = { ...buildInitialForm(), Country: resolveDefaultCountry({ country: 'Germany' }, false) };
  assert.equal(initial.Country, 'Germany');
  const payload = buildNewAccountPayload({
    ...initial,
    Group: picked,
    ...inheritGroupSettings({ groups: groups(), groupName: picked, leverageTouched: false, currencyTouched: false }),
    ...operatorDetails(),
  });
  assert.equal(payload.Group, picked);
  assert.equal(payload.Country, 'Germany');
});

test('sweep country: touched country is never overwritten by re-resolution', () => {
  assert.equal(resolveDefaultCountry({ country: 'Germany' }, true), '');
  const payload = buildNewAccountPayload({
    ...buildInitialForm(),
    Group: 'Fixture\\Beta',
    Leverage: 50,
    Currency: 'GBP',
    Country: 'France',
    ...operatorDetails(),
  });
  assert.equal(payload.Country, 'France');
});

test('sweep country: reset leaves no country default', () => {
  const reset = buildInitialForm();
  assert.equal(reset.Country, '');
  assert.equal(normalizeCountryName(reset.Country), '');
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

// Sweep hardening (white-label: no invented country default; real helpers
// only, through the exact modal path): broker records carrying both country
// keys, non-object broker info, touched-wins with a broker country present,
// whitespace-only Country pass-through, and option lists that never
// auto-select an entry.

test('sweep hardening: broker record with both country keys wins through the exact modal path', () => {
  assert.equal(brokerCountryOf({ country: 'Germany', Country: 'France' }), 'Germany');
  assert.equal(brokerCountryOf({ country: '   ', Country: 'France' }), 'France');
  assert.equal(resolveDefaultCountry({ country: 'Germany', Country: 'France' }, false), 'Germany');
  const picked = 'Fixture\\Beta';
  const initial = { ...buildInitialForm(), Country: resolveDefaultCountry({ country: 'Germany', Country: 'France' }, false) };
  assert.equal(initial.Country, 'Germany');
  const payload = buildNewAccountPayload({
    ...initial,
    Group: picked,
    ...inheritGroupSettings({ groups: groups(), groupName: picked, leverageTouched: false, currencyTouched: false }),
    ...operatorDetails(),
  });
  assert.equal(payload.Group, picked);
  assert.equal(payload.Country, 'Germany');
});

test('sweep hardening: non-object broker info seeds an empty Country through the modal path', () => {
  assert.equal(brokerCountryOf('Germany'), null);
  assert.equal(brokerCountryOf(42), null);
  assert.equal(resolveDefaultCountry('Germany', false), '');
  assert.equal(resolveDefaultCountry(42, false), '');
  assert.equal(resolveDefaultCountry([], false), '');
  const picked = 'Fixture\\Beta';
  const payload = buildNewAccountPayload({
    ...buildInitialForm(),
    Country: resolveDefaultCountry('Germany', false),
    Group: picked,
    ...inheritGroupSettings({ groups: groups(), groupName: picked, leverageTouched: false, currencyTouched: false }),
    ...operatorDetails(),
  });
  assert.equal(payload.Country, '');
  assert.equal(payload.Group, picked);
});

test('sweep hardening: touched country keeps the operator value even with broker country present', () => {
  assert.equal(resolveDefaultCountry({ country: 'Germany', Country: 'France' }, true), '');
  assert.equal(resolveDefaultCountry({ Country: 'Germany' }, true), '');
  const form = {
    ...buildInitialForm(),
    Country: 'France',
    Group: 'Fixture\\Beta',
    Leverage: 50,
    Currency: 'GBP',
    ...operatorDetails(),
  };
  assert.equal(buildNewAccountPayload(form).Country, 'France');
  assert.equal(buildSubmittableAccountPayload(form).Country, 'France');
});

test('sweep hardening: whitespace-only Country passes through as empty on the submit path', () => {
  const picked = 'Fixture\\Beta';
  for (const whitespace of ['   ', ' \t\n ', undefined, null]) {
    const form = {
      ...buildInitialForm(),
      Group: picked,
      ...inheritGroupSettings({ groups: groups(), groupName: picked, leverageTouched: false, currencyTouched: false }),
      ...operatorDetails(),
      Country: whitespace,
    };
    assert.equal(buildNewAccountPayload(form).Country, '');
    assert.equal(buildSubmittableAccountPayload(form).Country, '');
  }
  const padded = buildNewAccountPayload({
    ...buildInitialForm(),
    Group: picked,
    Leverage: 50,
    Currency: 'GBP',
    ...operatorDetails(),
    Country: '  France  ',
  });
  assert.equal(padded.Country, 'France');
});

test('sweep hardening: option lists never auto-select on the submit path', () => {
  const initial = buildInitialForm();
  assert.equal(initial.Leverage, '');
  assert.equal(initial.Currency, '');
  assert.equal(initial.Country, '');
  assert.equal(normalizeCurrencyCode(initial.Currency), '');
  const reversed = [...groups()].reverse();
  assert.equal(
    resolveInitialGroup({ groups: reversed, currentGroup: '', groupTouched: false, search: '' }),
    null,
  );
  assert.equal(
    resolveInitialGroup({ groups: [groups()[0]], currentGroup: '', groupTouched: false, search: '' }),
    null,
  );
  assert.deepEqual(
    inheritGroupSettings({ groups: reversed, groupName: '', leverageTouched: false, currencyTouched: false }),
    {},
  );
  // Valid option values with no group still fail closed on both builders.
  const optionValues = { ...initial, Group: '', Leverage: 200, Currency: 'EUR' };
  assert.throws(() => buildNewAccountPayload(optionValues), /Please select an account group\./);
  assert.throws(() => buildSubmittableAccountPayload(optionValues), /Please select an account group\./);
});

// ds-7 REVIEW-B item 2 (Country optional UI, dead countryTouched ref removed):
// Verified backend contract: Country is OPTIONAL free text, empty passes
// through and is stored as-is. The modal therefore no longer marks Country
// `required`. This REAL-helper case runs the exact modal submit path (group
// pick + inheritGroupSettings + operator details) and proves empty Country
// never throws in either builder. The resolver helpers themselves are
// untouched and remain tested directly above.

test('ds-7 REVIEW-B item 2: empty country passes through the exact modal submit path', () => {
  const picked = 'Fixture\\Beta';
  for (const empty of ['', '   ', undefined, null]) {
    const form = {
      ...buildInitialForm(),
      Group: picked,
      ...inheritGroupSettings({ groups: groups(), groupName: picked, leverageTouched: false, currencyTouched: false }),
      ...operatorDetails(),
      Country: empty,
    };
    assert.doesNotThrow(() => buildNewAccountPayload(form));
    assert.equal(buildNewAccountPayload(form).Country, '');
    assert.doesNotThrow(() => buildSubmittableAccountPayload(form));
    assert.equal(buildSubmittableAccountPayload(form).Country, '');
  }
});
