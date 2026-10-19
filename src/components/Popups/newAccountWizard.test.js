import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_MODES,
  ACCOUNT_MODE_DEFAULT,
  buildNewAccountPayload,
  groupCurrencyOf,
  groupLeverageOf,
  inheritGroupSettings,
  isAccountMode,
  normalizeAccountMode,
  normalizeCurrencyCode,
  normalizeGroupName,
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

test('missing group currency never clears an untouched empty field with invented state', () => {
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Gamma',
      leverageTouched: false,
      currencyTouched: false,
    }),
    { Leverage: 100 },
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
  const payload = buildNewAccountPayload(baseForm({
    Group: '  Fixture\\Beta  ',
    Currency: 'gbp',
    AccountMode: 'Netting',
  }));
  assert.equal(payload.Group, 'Fixture\\Beta');
  assert.equal(payload.Currency, 'GBP');
  assert.equal(payload.AccountMode, 'netting');
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
  // A group without currency inherits leverage only and never clears Currency.
  assert.deepEqual(
    inheritGroupSettings({
      groups: groups(),
      groupName: 'Fixture\\Gamma',
      leverageTouched: false,
      currencyTouched: false,
    }),
    { Leverage: 100 },
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
