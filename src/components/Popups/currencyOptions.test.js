import test from 'node:test';
import assert from 'node:assert/strict';
import * as wizard from './newAccountWizard.js';

// UI-3b CURRENCY LIST (FAIL-FIRST, added before the implementation):
// the Currency <select> offers the UNION of the groups' allowed/deposit
// currencies (existing groups API rows as returned by useGroupList, read via
// groupCurrencyOf) — distinct values, stable (first-seen) order. The literal
// CURRENCIES list is used ONLY when that union is empty, and NOTHING is
// preselected unless a default is set. The country list stays literal and
// universal (untouched by this slice).
//
// Generic fixtures only: synthetic group names and ISO-style codes. No
// tenant, broker, host, or account identifiers.
//
// Each case below starts with a typeof guard so it FAILS BY ASSERTION on the
// base revision (where the helpers do not exist yet) instead of failing at
// import time.

// UI-3b (a): with group currencies the options are EXACTLY the union
// (distinct, first-seen order, normalized) — the literal fallback is never
// mixed in.
test('ui-3b currency list: with group currencies expects exactly the union', () => {
  assert.equal(typeof wizard.currencyOptions, 'function', 'currencyOptions helper exists');
  assert.deepEqual(
    wizard.currencyOptions([
      { name: 'Fixture\\Alpha', currency: 'EUR' },
      { name: 'Fixture\\Beta', currency: 'GBP' },
      { name: 'Fixture\\Gamma', currency: 'eur' },
      { name: 'Fixture\\Delta' },
    ]),
    ['EUR', 'GBP'],
  );
  // Alternate single-currency keys (deposit_currency / Currency) join the
  // same union in row order.
  assert.deepEqual(
    wizard.currencyOptions([
      { name: 'Fixture\\Alpha', deposit_currency: 'CHF' },
      { name: 'Fixture\\Beta', Currency: 'JPY' },
    ]),
    ['CHF', 'JPY'],
  );
  // A group row carrying its own allowed-currency list contributes each entry.
  assert.deepEqual(
    wizard.currencyOptions([
      { name: 'Fixture\\Alpha', currency: 'EUR' },
      { name: 'Fixture\\Epsilon', currencies: ['JPY', 'CHF'] },
    ]),
    ['EUR', 'JPY', 'CHF'],
  );
  // Non-string entries are ignored, never coerced; padding/case is
  // normalized; objects contribute their code key.
  assert.deepEqual(
    wizard.currencyOptions([
      { name: 'Fixture\\Odd', currency: true },
      { name: 'Fixture\\Num', currency: 123 },
      { name: 'Fixture\\List', currencies: [123, true, null, ['EUR'], { code: 'JPY' }, '  eur  '] },
    ]),
    ['EUR', 'JPY'],
  );
  // No literal-fallback entry (USD here) is ever invented alongside
  // group data.
  const union = wizard.currencyOptions([{ name: 'Fixture\\Alpha', currency: 'EUR' }]);
  assert.deepEqual(union, ['EUR']);
  assert.ok(!union.includes('USD'));
});

// UI-3b (b): with an empty union the options are the fallback literal list
// (the same codes the modal renders today).
test('ui-3b currency list: with an empty union expects the fallback literal list', () => {
  assert.equal(typeof wizard.currencyOptions, 'function', 'currencyOptions helper exists');
  assert.equal(typeof wizard.CURRENCY_FALLBACK_OPTIONS, 'object', 'CURRENCY_FALLBACK_OPTIONS exists');
  const fallback = [...wizard.CURRENCY_FALLBACK_OPTIONS];
  assert.deepEqual(wizard.currencyOptions([]), fallback);
  assert.deepEqual(wizard.currencyOptions(), fallback);
  assert.deepEqual(wizard.currencyOptions([{ name: 'Fixture\\Alpha' }]), fallback);
  assert.deepEqual(wizard.currencyOptions([{ name: 'Fixture\\Alpha', currency: '   ' }]), fallback);
  assert.deepEqual(wizard.currencyOptions([{ name: 'Fixture\\Alpha', currency: true }]), fallback);
  // A non-array under a list key yields the fallback (fail-closed, never
  // invented entries from a scalar).
  assert.deepEqual(wizard.currencyOptions([{ name: 'Fixture\\Alpha', currencies: 'EUR' }]), fallback);
});

// UI-3b (c): NOTHING is preselected unless a default is set. With no group
// selected (wizard open/reset) the default resolver emits '' so the Currency
// placeholder stays until an explicit pick or group inheritance; a touched
// field keeps the operator value.
test('ui-3b currency list: no preselect without a default', () => {
  assert.equal(typeof wizard.resolveDefaultCurrency, 'function', 'resolveDefaultCurrency helper exists');
  const groups = () => ([
    { name: 'Fixture\\Alpha', currency: 'EUR' },
    { name: 'Fixture\\Beta', currency: 'GBP' },
  ]);
  assert.equal(wizard.resolveDefaultCurrency({ groups: groups(), groupName: '' }), '');
  assert.equal(wizard.resolveDefaultCurrency({ groups: groups() }), '');
  assert.equal(wizard.resolveDefaultCurrency({ groups: [], groupName: '' }), '');
  assert.equal(wizard.resolveDefaultCurrency(), '');
  assert.equal(wizard.resolveDefaultCurrency({ groups: groups(), groupName: 'No\\SuchGroup' }), '');
  // An explicit operator edit always wins over re-resolution.
  assert.equal(wizard.resolveDefaultCurrency({ groups: groups(), groupName: 'Fixture\\Alpha', currencyTouched: true }), '');
  assert.equal(wizard.resolveDefaultCurrency({ currencyTouched: true }), '');
  // Unless-clause: a selected group carrying a deposit currency sets the
  // default (uppercased); a group without one leaves '' (no invention).
  assert.equal(wizard.resolveDefaultCurrency({ groups: groups(), groupName: 'Fixture\\Alpha' }), 'EUR');
  assert.equal(wizard.resolveDefaultCurrency({ groups: groups(), groupName: 'Fixture\\Beta' }), 'GBP');
  assert.equal(wizard.resolveDefaultCurrency({ groups: [{ name: 'Fixture\\Gamma' }], groupName: 'Fixture\\Gamma' }), '');
});
