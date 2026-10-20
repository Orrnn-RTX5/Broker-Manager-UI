import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_MODES,
  ACCOUNT_MODE_CREATE_OPTIONS,
  ACCOUNT_MODE_DEFAULT,
  brokerCountryOf,
  buildNewAccountPayload,
  buildSubmittableAccountPayload,
  countrySuggestions,
  groupCurrencyOf,
  groupLeverageOf,
  inheritGroupSettings,
  isAccountMode,
  isCreatableAccountMode,
  normalizeAccountMode,
  normalizeCountryName,
  normalizeCurrencyCode,
  normalizeGroupName,
  resolveDefaultCountry,
  resolveInitialGroup,
} from './newAccountWizard.js';

// Generic fixtures only: synthetic group records with placeholder names and
// ISO-style codes. No tenant, broker, host, or account identifiers.
const groups = () => ([
  { name: 'Fixture\\Alpha', leverage: 200, currency: 'eur' },
  { name: 'Fixture\\Beta', Leverage: 50, Currency: 'GBP' },
  { name: 'Fixture\\Gamma', leverage: 100 },
]);

const baseForm = (overrides = {}) => ({
  Group: 'Fixture\\Alpha',
  Leverage: 200,
  Currency: 'EUR',
  AccountMode: 'hedging',
  FirstName: 'Case',
  LastName: 'Subject',
  Email: 'case@example.invalid',
  Phone: '',
  Country: 'Nowhere',
  master_pass: 'secret-a',
  investor_pass: 'secret-b',
  ...overrides,
});

test('currency follows the selected group the same way leverage does', () => {
  assert.equal(groupCurrencyOf(groups(), 'Fixture\\Alpha'), 'EUR');
  assert.equal(groupCurrencyOf(groups(), 'Fixture\\Beta'), 'GBP');
  assert.equal(groupCurrencyOf(groups(), 'Fixture\\Gamma'), null);
  assert.equal(groupLeverageOf(groups(), 'Fixture\\Alpha'), 200);
  assert.equal(groupLeverageOf(groups(), 'Fixture\\Beta'), 50);
});

test('untouched currency and leverage inherit the newly selected group', () => {
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Beta',
      leverageTouched: false,
      currencyTouched: false,
    }),
    { Leverage: 50, Currency: 'GBP' },
  );
});

test('an explicit operator currency edit always wins over group changes', () => {
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Beta',
      leverageTouched: true,
      currencyTouched: true,
    }),
    {},
  );
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Beta',
      leverageTouched: false,
      currencyTouched: true,
    }),
    { Leverage: 50 },
  );
});

// CORRECTED (HOLD-1 stale inheritance): the old expectation below locked in
// add-only inheritance ({ Leverage: 100 } with no Currency key), which left a
// previously-inherited currency behind as STALE state when switching to a
// group without one. Untouched fields now always carry a key — the fresh
// group value, or '' when the new group has none — so spreading the result
// clears stale values. Explicit operator picks (touched) are still omitted
// and therefore never cleared.
test('switching groups clears stale untouched values instead of keeping them', () => {
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Gamma',
      leverageTouched: false,
      currencyTouched: false,
    }),
    { Leverage: 100, Currency: '' },
  );
  assert.equal(normalizeCurrencyCode(''), '');
  assert.equal(normalizeCurrencyCode('  usd '), 'USD');
  assert.equal(normalizeCurrencyCode('USD!'), '');
});

test('account mode accepts only hedging or netting', () => {
  assert.deepEqual([...ACCOUNT_MODES], ['hedging', 'netting']);
  assert.equal(ACCOUNT_MODE_DEFAULT, 'hedging');
  assert.equal(normalizeAccountMode('Hedging'), 'hedging');
  assert.equal(normalizeAccountMode('NETTING'), 'netting');
  assert.equal(normalizeAccountMode('hedge'), '');
  assert.equal(normalizeAccountMode('demo'), '');
  assert.equal(isAccountMode('netting'), true);
  assert.equal(isAccountMode('single'), false);
});

test('canonical payload emits currency and account mode', () => {
  const payload = buildNewAccountPayload(baseForm());
  assert.equal(payload.Currency, 'EUR');
  assert.equal(payload.AccountMode, 'hedging');
  assert.equal(payload.Group, 'Fixture\\Alpha');
  assert.equal(payload.Leverage, 200);
  assert.equal(payload.master_pass, 'secret-a');
});

test('canonical payload normalizes case without changing the chosen values', () => {
  // CORRECTED (HOLD-4 engine constraint): this case previously submitted
  // AccountMode 'Netting' and asserted it passed through the CANONICAL
  // builder as 'netting'. The RAM engine cannot open netting accounts, so
  // the canonical builder now refuses netting exactly like the submit
  // wrapper — case normalization is proven with 'Hedging' instead, and
  // netting refusal is asserted in the HOLD-4 regression block below.
  const payload = buildNewAccountPayload(baseForm({
    Group: '  Fixture\\Beta  ',
    Currency: 'gbp',
    AccountMode: 'Hedging',
  }));
  assert.equal(payload.Group, 'Fixture\\Beta');
  assert.equal(payload.Currency, 'GBP');
  assert.equal(payload.AccountMode, 'hedging');
});

test('canonical payload rejects missing or unknown immutable fields', () => {
  assert.throws(() => buildNewAccountPayload(baseForm({ Currency: '' })), /currency/i);
  assert.throws(() => buildNewAccountPayload(baseForm({ AccountMode: '' })), /accounting mode/i);
  assert.throws(() => buildNewAccountPayload(baseForm({ AccountMode: 'hedge' })), /hedging or netting/i);
  assert.throws(() => buildNewAccountPayload(baseForm({ Group: '   ' })), /account group/i);
  assert.throws(() => buildNewAccountPayload(baseForm({ Leverage: 0 })), /leverage/i);
});

test('submitted group is the explicit visible selection, never a silent fallback', () => {
  const payload = buildNewAccountPayload(baseForm({ Group: 'Fixture\\Beta' }));
  assert.equal(payload.Group, 'Fixture\\Beta');
  assert.equal(normalizeGroupName('  Fixture\\Beta  '), 'Fixture\\Beta');
  assert.equal(normalizeGroupName(''), '');
});

test('never auto-fills: empty stays empty until an explicit pick', () => {
  assert.equal(
    resolveInitialGroup({ groups: groups(), currentGroup: '', groupTouched: false, search: '' }),
    null,
  );
  assert.equal(
    resolveInitialGroup({ groups: groups(), currentGroup: '', groupTouched: true, search: '' }),
    null,
  );
  assert.equal(
    resolveInitialGroup({ groups: groups(), currentGroup: '', groupTouched: false, search: 'alp' }),
    null,
  );
  // An explicit selection absent from the current page (pagination/search)
  // is preserved instead of being replaced by the first visible row.
  assert.equal(
    resolveInitialGroup({ groups: groups(), currentGroup: 'Fixture\\Beta', groupTouched: true, search: 'alp' }),
    null,
  );
  assert.equal(
    resolveInitialGroup({ groups: groups(), currentGroup: 'Fixture\\Beta', groupTouched: false, search: '' }),
    null,
  );
  assert.equal(
    resolveInitialGroup({ groups: [], currentGroup: '', groupTouched: false, search: '' }),
    null,
  );
});

// UI-4 follow-up (modal never auto-fills; new cases only, real helpers):
// the modal leaves Group '' on open/reset/refresh/search and only inherits
// leverage/currency after an explicit pick. These cases exercise that
// contract through inheritGroupSettings + buildNewAccountPayload without
// reimplementing helper logic.

test('empty stays empty across list load, refresh, and search (no silent inheritance)', () => {
  const loaded = groups();
  const refreshed = [...loaded].reverse();
  const searched = [{ name: 'Fixture\\Alpha', leverage: 200, currency: 'eur' }];
  for (const list of [loaded, refreshed, searched, []]) {
    assert.deepEqual(
      inheritGroupSettings({ groups: list, groupName: '', leverageTouched: false, currencyTouched: false }),
      {},
    );
    assert.deepEqual(
      inheritGroupSettings({ groups: list, groupName: '   ', leverageTouched: false, currencyTouched: false }),
      {},
    );
  }
  assert.equal(normalizeGroupName(''), '');
  assert.throws(() => buildNewAccountPayload(baseForm({ Group: '' })), /Please select an account group\./);
});

test('explicit pick is never overwritten by refresh, reorder, or search filtering', () => {
  const refreshed = [...groups()].reverse();
  // The explicit pick still resolves to its own record after a reorder/refresh.
  assert.equal(groupLeverageOf(refreshed, 'Fixture\\Beta'), 50);
  assert.equal(groupCurrencyOf(refreshed, 'Fixture\\Beta'), 'GBP');
  // The payload preserves the explicit visible selection (never the first row).
  const payload = buildNewAccountPayload(baseForm({ Group: 'Fixture\\Beta', Leverage: 50, Currency: 'GBP' }));
  assert.equal(payload.Group, 'Fixture\\Beta');
  assert.notEqual(payload.Group, normalizeGroupName(refreshed[0]?.name ?? ''));
  // Inheritance never carries a Group key, so it cannot overwrite the pick.
  const inherited = inheritGroupSettings({
    groups: refreshed,
    groupName: 'Fixture\\Beta',
    leverageTouched: false,
    currencyTouched: false,
  });
  assert.ok(!('Group' in inherited));
  assert.deepEqual(inherited, { Leverage: 50, Currency: 'GBP' });
});

test('inheritance fires immediately after an explicit pick (untouched fields only)', () => {
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Alpha',
      leverageTouched: false,
      currencyTouched: false,
    }),
    { Leverage: 200, Currency: 'EUR' },
  );
  // CORRECTED (HOLD-1): a group without currency now emits Currency: ''
  // so a previously-inherited currency is cleared on switch; a touched
  // currency is still omitted and never cleared.
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Gamma',
      leverageTouched: false,
      currencyTouched: false,
    }),
    { Leverage: 100, Currency: '' },
  );
  // An explicit currency edit still wins after a later explicit pick.
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Alpha',
      leverageTouched: true,
      currencyTouched: false,
    }),
    { Currency: 'EUR' },
  );
});

test('submit helper fails closed on empty group with no first-row fallback', () => {
  for (const empty of ['', '   ', undefined, null]) {
    assert.throws(
      () => buildNewAccountPayload(baseForm({ Group: empty })),
      /Please select an account group\./,
    );
  }
  // Typing a search filter without picking leaves Group empty: still rejects.
  assert.throws(
    () => buildNewAccountPayload(baseForm({ Group: normalizeGroupName('') })),
    /Please select an account group\./,
  );
});

test('reset leaves Group empty and fail-closed until the next explicit pick', () => {
  const resetForm = baseForm({ Group: '', Leverage: 100, Currency: '', AccountMode: 'hedging' });
  assert.equal(normalizeGroupName(resetForm.Group), '');
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: resetForm.Group,
      leverageTouched: false,
      currencyTouched: false,
    }),
    {},
  );
  assert.throws(() => buildNewAccountPayload(resetForm), /Please select an account group\./);
  // The next explicit pick immediately re-inherits untouched fields.
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Beta',
      leverageTouched: false,
      currencyTouched: false,
    }),
    { Leverage: 50, Currency: 'GBP' },
  );
});

test('netting option is shown disabled with a not-supported label; hedging is the enabled default', () => {
  assert.deepEqual(ACCOUNT_MODE_CREATE_OPTIONS, [
    { value: 'hedging', label: 'Hedging', disabled: false },
    { value: 'netting', label: 'Netting — not supported yet', disabled: true },
  ]);
  assert.equal(ACCOUNT_MODE_DEFAULT, 'hedging');
  const enabled = ACCOUNT_MODE_CREATE_OPTIONS.filter((option) => !option.disabled);
  assert.deepEqual(enabled.map((option) => option.value), ['hedging']);
});

test('submit path admits hedging and refuses netting before any payload is built', () => {
  assert.equal(isCreatableAccountMode('hedging'), true);
  assert.equal(isCreatableAccountMode('Hedging'), true);
  assert.equal(isCreatableAccountMode('netting'), false);
  assert.equal(isCreatableAccountMode('NETTING'), false);
  assert.equal(isCreatableAccountMode(''), false);
  assert.equal(isCreatableAccountMode('unknown'), false);
  const payload = buildSubmittableAccountPayload(baseForm({ AccountMode: 'hedging' }));
  assert.equal(payload.AccountMode, 'hedging');
  assert.throws(() => buildSubmittableAccountPayload(baseForm({ AccountMode: 'netting' })), /not supported yet/);
  assert.throws(() => buildSubmittableAccountPayload(baseForm({ AccountMode: '' })), /not supported yet/);
});

// Sweep white-label hardcode (no country default is ever invented; real
// helpers only): the resolver emits '' when the broker config carries no
// country, the broker-configured country wins when present, an explicit
// operator edit always wins over re-resolution, and empty Country passes
// through the payload exactly per the backend account-create contract
// (Country is optional free text, stored as sent).

test('sweep country: no country default is ever emitted without broker config', () => {
  assert.equal(resolveDefaultCountry(null, false), '');
  assert.equal(resolveDefaultCountry(undefined, false), '');
  assert.equal(resolveDefaultCountry({}, false), '');
  assert.equal(resolveDefaultCountry({ broker_name: 'Fixture Broker' }, false), '');
  assert.equal(brokerCountryOf(null), null);
  assert.equal(brokerCountryOf({}), null);
  assert.equal(brokerCountryOf({ country: '   ' }), null);
  assert.equal(normalizeCountryName(''), '');
  assert.equal(normalizeCountryName(null), '');
});

test('sweep country: broker-config country wins when present (same path the modal uses)', () => {
  assert.equal(resolveDefaultCountry({ country: 'Germany' }, false), 'Germany');
  assert.equal(resolveDefaultCountry({ Country: '  Germany  ' }, false), 'Germany');
  assert.equal(brokerCountryOf({ country: 'Germany' }), 'Germany');
  const payload = buildNewAccountPayload(baseForm({ Country: resolveDefaultCountry({ country: 'Germany' }, false) }));
  assert.equal(payload.Country, 'Germany');
  assert.equal(
    buildSubmittableAccountPayload(baseForm({ Country: resolveDefaultCountry({ country: 'Germany' }, false) })).Country,
    'Germany',
  );
});

test('sweep country: an explicit operator edit always wins over re-resolution', () => {
  assert.equal(resolveDefaultCountry({ country: 'Germany' }, true), '');
  assert.equal(resolveDefaultCountry({ Country: 'Germany' }, true), '');
  const payload = buildNewAccountPayload(baseForm({ Country: 'France' }));
  assert.equal(payload.Country, 'France');
});

test('sweep country: empty country passes through exactly per the backend contract', () => {
  for (const empty of ['', '   ', undefined, null]) {
    const payload = buildNewAccountPayload(baseForm({ Country: empty }));
    assert.equal(payload.Country, '');
    assert.equal(buildSubmittableAccountPayload(baseForm({ Country: empty })).Country, '');
  }
});

// Sweep W5/W4 (no hardcoded tenant defaults reach the wire; real helpers
// only): USD is never emitted as a default, group currency (including a
// non-USD fixture) wins after an explicit pick, a stale Leverage 100 with no
// group still fails closed on group-required, and reset leaves no currency
// default. The CURRENCIES/LEVERAGES option lists stay generic option sets
// with no entry auto-selected.

test('sweep W5/W4: no USD default is ever emitted; empty currency fails closed', () => {
  assert.equal(normalizeCurrencyCode(''), '');
  assert.equal(groupCurrencyOf(groups(), 'No\\SuchGroup'), null);
  assert.equal(groupCurrencyOf([], 'Fixture\\Alpha'), null);
  // CORRECTED (HOLD-1): a group row with no currency data now emits
  // Currency: '' (in particular never USD) so a stale inherited currency is
  // cleared when switching to it.
  const inherited = inheritGroupSettings({
    groups: groups(),
    groupName: 'Fixture\\Gamma',
    leverageTouched: false,
    currencyTouched: false,
  });
  assert.equal(inherited.Currency, '');
  assert.throws(() => buildNewAccountPayload(baseForm({ Currency: '' })), /currency/i);
  assert.throws(() => buildSubmittableAccountPayload(baseForm({ Currency: '' })), /currency/i);
});

test('sweep W5/W4: group currency wins after an explicit pick (non-USD fixture)', () => {
  const inherited = inheritGroupSettings({
    groups: groups(),
    groupName: 'Fixture\\Alpha',
    leverageTouched: false,
    currencyTouched: false,
  });
  assert.deepEqual(inherited, { Leverage: 200, Currency: 'EUR' });
  assert.notEqual(inherited.Currency, 'USD');
  const payload = buildNewAccountPayload({
    ...baseForm({ Group: 'Fixture\\Alpha', Leverage: '', Currency: '' }),
    ...inherited,
  });
  assert.equal(payload.Currency, 'EUR');
  assert.equal(payload.Leverage, 200);
  assert.notEqual(payload.Currency, 'USD');
});

test('sweep W5/W4: stale Leverage 100 with no group still fails closed; group wins after a pick', () => {
  for (const empty of ['', '   ', undefined, null]) {
    assert.throws(
      () => buildNewAccountPayload(baseForm({ Group: empty, Leverage: 100, Currency: 'EUR' })),
      /Please select an account group\./,
    );
    assert.throws(
      () => buildSubmittableAccountPayload(baseForm({ Group: empty, Leverage: 100, Currency: 'EUR' })),
      /Please select an account group\./,
    );
  }
  // The same stale 100 is overwritten by the group value after an explicit pick.
  const inherited = inheritGroupSettings({
    groups: groups(),
    groupName: 'Fixture\\Beta',
    leverageTouched: false,
    currencyTouched: false,
  });
  const payload = buildNewAccountPayload({
    ...baseForm({ Group: 'Fixture\\Beta', Leverage: 100, Currency: '' }),
    ...inherited,
  });
  assert.equal(payload.Leverage, 50);
  assert.equal(payload.Currency, 'GBP');
});

test('sweep W5/W4: reset leaves no currency default and fails closed', () => {
  const resetForm = baseForm({ Group: '', Leverage: '', Currency: '', AccountMode: 'hedging' });
  assert.equal(resetForm.Currency, '');
  assert.notEqual(resetForm.Currency, 'USD');
  assert.equal(normalizeCurrencyCode(resetForm.Currency), '');
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: resetForm.Group,
      leverageTouched: false,
      currencyTouched: false,
    }),
    {},
  );
  assert.throws(() => buildNewAccountPayload(resetForm), /Please select an account group\./);
});

// Sweep hardening (white-label: no invented country default; real helpers
// only): broker records carrying both country keys, non-object broker info,
// touched-wins with a broker country present, whitespace-only Country
// pass-through, and option lists that never auto-select an entry.

test('sweep hardening: broker record with both country keys resolves first-wins with empty-first fallback', () => {
  assert.equal(brokerCountryOf({ country: 'Germany', Country: 'France' }), 'Germany');
  assert.equal(brokerCountryOf({ country: '', Country: 'France' }), 'France');
  assert.equal(brokerCountryOf({ country: '   ', Country: 'France' }), 'France');
  assert.equal(resolveDefaultCountry({ country: 'Germany', Country: 'France' }, false), 'Germany');
  assert.equal(resolveDefaultCountry({ country: '   ', Country: 'France' }, false), 'France');
  const payload = buildNewAccountPayload(baseForm({
    Country: resolveDefaultCountry({ country: 'Germany', Country: 'France' }, false),
  }));
  assert.equal(payload.Country, 'Germany');
});

test('sweep hardening: non-object broker info never yields a country default', () => {
  assert.equal(brokerCountryOf('Germany'), null);
  assert.equal(brokerCountryOf(42), null);
  assert.equal(brokerCountryOf(true), null);
  assert.equal(brokerCountryOf([]), null);
  assert.equal(resolveDefaultCountry('Germany', false), '');
  assert.equal(resolveDefaultCountry(42, false), '');
  assert.equal(resolveDefaultCountry([], false), '');
  assert.equal(resolveDefaultCountry('Germany', true), '');
});

test('sweep hardening: touched country is never overwritten even when broker config carries one', () => {
  assert.equal(resolveDefaultCountry({ country: 'Germany', Country: 'France' }, true), '');
  assert.equal(resolveDefaultCountry({ Country: 'Germany' }, true), '');
  assert.equal(resolveDefaultCountry(undefined, true), '');
  const payload = buildNewAccountPayload(baseForm({ Country: 'France' }));
  assert.equal(payload.Country, 'France');
  assert.equal(buildSubmittableAccountPayload(baseForm({ Country: 'France' })).Country, 'France');
});

test('sweep hardening: whitespace-only Country passes through as empty without failing submit', () => {
  for (const whitespace of ['   ', ' \t\n ']) {
    assert.equal(normalizeCountryName(whitespace), '');
    assert.equal(buildNewAccountPayload(baseForm({ Country: whitespace })).Country, '');
    assert.equal(buildSubmittableAccountPayload(baseForm({ Country: whitespace })).Country, '');
  }
  assert.equal(buildNewAccountPayload(baseForm({ Country: '  France  ' })).Country, 'France');
});

test('sweep hardening: option lists never auto-select without an explicit pick', () => {
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
  assert.equal(groupCurrencyOf(groups(), ''), null);
  assert.equal(groupCurrencyOf(groups(), '   '), null);
  assert.equal(groupLeverageOf(groups(), ''), null);
  // Valid option values with no group still fail closed: option entries alone
  // never stand in for an explicit group pick.
  assert.throws(
    () => buildNewAccountPayload(baseForm({ Group: '', Leverage: 200, Currency: 'EUR' })),
    /Please select an account group\./,
  );
});

// ds-7 REVIEW-B item 2 (Country optional UI, dead countryTouched ref removed):
// Verified backend contract: Country is OPTIONAL free text, empty passes
// through and is stored as-is. The modal therefore no longer marks the
// Country <Field> `required` (no `required` on the <select> either). These
// REAL-helper cases prove empty Country never gates either builder. The
// resolver helpers themselves are untouched and remain tested directly above.

test('ds-7 REVIEW-B item 2: empty country never gates either builder (optional, stored as-is)', () => {
  for (const empty of ['', '   ', undefined, null]) {
    assert.doesNotThrow(() => buildNewAccountPayload(baseForm({ Country: empty })));
    assert.equal(buildNewAccountPayload(baseForm({ Country: empty })).Country, '');
    assert.doesNotThrow(() => buildSubmittableAccountPayload(baseForm({ Country: empty })));
    assert.equal(buildSubmittableAccountPayload(baseForm({ Country: empty })).Country, '');
  }
  // A present value (e.g. broker-seeded) still passes through untouched.
  assert.equal(buildNewAccountPayload(baseForm({ Country: 'Germany' })).Country, 'Germany');
  assert.equal(buildSubmittableAccountPayload(baseForm({ Country: 'Germany' })).Country, 'Germany');
});

// HOLD adversarial fixes (REAL helpers only, one regression block per hole;
// generic fixtures, no tenant/broker/account identifiers).

test('HOLD-1: switching groups clears stale untouched leverage/currency; explicit picks survive', () => {
  // The operator inherited 1:200/EUR from Alpha; the modal spreads the fresh
  // inheritGroupSettings result over the form exactly as syncGroupDefaults
  // does, so switching to Gamma (leverage only) must clear the stale EUR.
  const stale = { Leverage: 200, Currency: 'EUR' };
  const repick = inheritGroupSettings({
    groups: groups(),
    groupName: 'Fixture\\Gamma',
    leverageTouched: false,
    currencyTouched: false,
  });
  assert.deepEqual({ ...stale, ...repick }, { Leverage: 100, Currency: '' });
  // Switching to an unknown group clears both untouched fields.
  const unknown = inheritGroupSettings({
    groups: groups(),
    groupName: 'No\\SuchGroup',
    leverageTouched: false,
    currencyTouched: false,
  });
  assert.deepEqual({ ...stale, ...unknown }, { Leverage: '', Currency: '' });
  // Explicit operator picks are never cleared: touched fields are omitted.
  const guarded = inheritGroupSettings({
    groups: groups(),
    groupName: 'Fixture\\Gamma',
    leverageTouched: true,
    currencyTouched: true,
  });
  assert.deepEqual({ ...stale, ...guarded }, stale);
  // Partial touch: the leverage pick survives while stale currency clears.
  const partial = inheritGroupSettings({
    groups: groups(),
    groupName: 'Fixture\\Gamma',
    leverageTouched: true,
    currencyTouched: false,
  });
  assert.deepEqual({ Leverage: 500, Currency: 'EUR', ...partial }, { Leverage: 500, Currency: '' });
});

test('HOLD-2 backend-requiredness: empty master_pass rejected; empty identities/investor_pass pass through', () => {
  // Verified read-only against the manager AccountCreate handler
  // (accounts.go): ONLY master_pass + Group are backend-required
  // ("master_pass and Group are required"); investor_pass, FirstName,
  // LastName, Email, and Country may be empty. The builder mirrors exactly.
  for (const empty of ['', undefined, null, 123, true]) {
    assert.throws(() => buildNewAccountPayload(baseForm({ master_pass: empty })), /master password/i);
    assert.throws(() => buildSubmittableAccountPayload(baseForm({ master_pass: empty })), /master password/i);
  }
  // Whatever the backend allows empty is never gated here.
  const payload = buildNewAccountPayload(baseForm({
    FirstName: '', LastName: '', Email: '', Phone: '', Country: '', investor_pass: '',
  }));
  assert.equal(payload.FirstName, '');
  assert.equal(payload.LastName, '');
  assert.equal(payload.Email, '');
  assert.equal(payload.investor_pass, '');
  assert.equal(payload.master_pass, 'secret-a');
  assert.equal(buildSubmittableAccountPayload(baseForm({ FirstName: '', investor_pass: '' })).FirstName, '');
  assert.equal(buildSubmittableAccountPayload(baseForm({ FirstName: '', investor_pass: '' })).investor_pass, '');
  // Password policy (length/letter+digit) and master!=investor distinctness
  // stay server-side: the builder passes passwords byte-exact, never judging
  // strength — a backend-weak value still builds here.
  assert.equal(buildNewAccountPayload(baseForm({ master_pass: 'short1' })).master_pass, 'short1');
});

test('HOLD-3 type confusion: non-strings rejected, never coerced', () => {
  // Names/codes accept strings only.
  assert.equal(normalizeCurrencyCode(true), '');
  assert.equal(normalizeCurrencyCode(123), '');
  assert.equal(normalizeCurrencyCode({}), '');
  assert.equal(normalizeCurrencyCode(['USD']), '');
  assert.equal(normalizeAccountMode(true), '');
  assert.equal(normalizeAccountMode(1), '');
  assert.equal(normalizeCountryName(123), '');
  assert.equal(normalizeCountryName(true), '');
  assert.equal(normalizeCountryName({}), '');
  assert.equal(normalizeGroupName(123), '');
  assert.equal(normalizeGroupName(true), '');
  assert.equal(normalizeGroupName(null), '');
  assert.equal(normalizeGroupName(undefined), '');
  // Group {currency:true} must NOT become 'TRUE'; numbers must not leak in.
  assert.equal(groupCurrencyOf([{ name: 'Fixture\\Odd', currency: true }], 'Fixture\\Odd'), null);
  assert.equal(groupCurrencyOf([{ name: 'Fixture\\Odd', currency: 123 }], 'Fixture\\Odd'), null);
  // Group {leverage:true} must NOT become 1; only safe integers pass.
  assert.equal(groupLeverageOf([{ name: 'Fixture\\Odd', leverage: true }], 'Fixture\\Odd'), null);
  assert.equal(groupLeverageOf([{ name: 'Fixture\\Odd', leverage: {} }], 'Fixture\\Odd'), null);
  assert.equal(groupLeverageOf([{ name: 'Fixture\\Odd', leverage: 1.5 }], 'Fixture\\Odd'), null);
  assert.equal(groupLeverageOf([{ name: 'Fixture\\Odd', leverage: 200 }], 'Fixture\\Odd'), 200);
  assert.equal(groupLeverageOf([{ name: 'Fixture\\Odd', leverage: '200' }], 'Fixture\\Odd'), 200);
  // Broker {country:123/true} must NOT become a default.
  assert.equal(brokerCountryOf({ country: 123 }), null);
  assert.equal(brokerCountryOf({ country: true }), null);
  assert.equal(resolveDefaultCountry({ country: 123 }, false), '');
  assert.equal(resolveDefaultCountry({ country: true }, false), '');
  // Builder leverage rejects booleans/containers instead of Number()-coercing
  // them (true must not become 1); numeric strings stay tolerated.
  assert.throws(() => buildNewAccountPayload(baseForm({ Leverage: true })), /leverage/i);
  assert.throws(() => buildNewAccountPayload(baseForm({ Leverage: false })), /leverage/i);
  assert.throws(() => buildNewAccountPayload(baseForm({ Leverage: [200] })), /leverage/i);
  assert.throws(() => buildNewAccountPayload(baseForm({ Leverage: {} })), /leverage/i);
  assert.equal(buildNewAccountPayload(baseForm({ Leverage: '200' })).Leverage, 200);
});

test('HOLD-4 engine constraint: canonical builder refuses netting instead of passing it through', () => {
  // The RAM engine has no netting (global product decision, already gated in
  // the submit wrapper + UI). The CANONICAL builder gates it too, so netting
  // can never reach the wire through either path.
  assert.throws(() => buildNewAccountPayload(baseForm({ AccountMode: 'netting' })), /not supported yet/);
  assert.throws(() => buildNewAccountPayload(baseForm({ AccountMode: 'Netting' })), /not supported yet/);
  assert.throws(() => buildSubmittableAccountPayload(baseForm({ AccountMode: 'netting' })), /not supported yet/);
  // Hedging still passes both builders; unknown modes still fail closed.
  assert.equal(buildNewAccountPayload(baseForm({ AccountMode: 'hedging' })).AccountMode, 'hedging');
  assert.equal(buildSubmittableAccountPayload(baseForm({ AccountMode: 'hedging' })).AccountMode, 'hedging');
  assert.throws(() => buildNewAccountPayload(baseForm({ AccountMode: 'hedge' })), /hedging or netting/);
});

test('HOLD-5/H8 country: free text passes through, suggestions merge, seeded value stays clearable', () => {
  // Country is backend-optional free text: the text input accepts anything,
  // so values outside every preset list pass through exactly.
  assert.equal(buildNewAccountPayload(baseForm({ Country: 'New Atlantis' })).Country, 'New Atlantis');
  assert.equal(buildSubmittableAccountPayload(baseForm({ Country: 'New Atlantis' })).Country, 'New Atlantis');
  // Suggestions merge presets + broker value + current value, sorted unique.
  assert.deepEqual(
    countrySuggestions({ presets: ['India', 'Germany'], brokerInfo: { country: 'France' }, current: '' }),
    ['France', 'Germany', 'India'],
  );
  assert.deepEqual(
    countrySuggestions({ presets: ['India'], brokerInfo: { country: 'India' }, current: '  India  ' }),
    ['India'],
  );
  assert.deepEqual(countrySuggestions({ presets: [], brokerInfo: null, current: '' }), []);
  assert.deepEqual(
    countrySuggestions({ presets: ['India'], brokerInfo: { country: 123 }, current: '' }),
    ['India'],
  );
  // H8: a broker-seeded country can always be cleared back to empty — the
  // free-text input has no disabled placeholder blocking ''. Builders accept
  // the cleared value (optional, stored as-is).
  assert.equal(resolveDefaultCountry({ country: 'Germany' }, false), 'Germany');
  assert.equal(buildNewAccountPayload(baseForm({ Country: '' })).Country, '');
  assert.equal(buildSubmittableAccountPayload(baseForm({ Country: '' })).Country, '');
});
