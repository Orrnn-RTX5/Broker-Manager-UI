import test from 'node:test';
import assert from 'node:assert/strict';
import * as wizard from './newAccountWizard.js';

// UI-3b CURRENCY LIST (FAIL-FIRST, added before the implementation):
// the Currency <select> must offer the broker / selected-group allowed
// currencies (existing backend group/broker currency data), falling back to
// the literal list ONLY when the API provides none, with NOTHING preselected
// unless the broker/group sets a default. The country list stays literal and
// universal (untouched by this slice).
//
// Generic fixtures only: synthetic group names and ISO-style codes. No
// tenant, broker, host, or account identifiers.
//
// Each case below starts with a typeof guard so it FAILS BY ASSERTION on the
// base revision (where the helpers do not exist yet) instead of failing at
// import time.

// UI-3b (a): with config/group currencies the options are EXACTLY those
// (sorted unique, normalized) — the literal fallback is never mixed in.
test('ui-3b currency list: with config/group currencies expects EXACTLY those options', () => {
  assert.equal(typeof wizard.currencyOptions, 'function', 'currencyOptions helper exists');
  assert.deepEqual(
    wizard.currencyOptions({
      brokerInfo: { currencies: ['EUR', 'gbp'] },
      groups: [
        { name: 'Fixture\\Alpha', currency: 'CHF' },
        { name: 'Fixture\\Beta', currency: 'eur' },
      ],
    }),
    ['CHF', 'EUR', 'GBP'],
  );
  // A broker single currency joins the broker list; duplicates collapse.
  assert.deepEqual(
    wizard.currencyOptions({ brokerInfo: { currency: 'AUD', currencies: ['EUR', 'AUD'] }, groups: [] }),
    ['AUD', 'EUR'],
  );
  // A selected group carrying its own allowed-currency list contributes it.
  assert.deepEqual(
    wizard.currencyOptions({
      brokerInfo: null,
      groups: [{ name: 'Fixture\\Gamma', currencies: ['JPY', 'CHF'] }],
      groupName: 'Fixture\\Gamma',
    }),
    ['CHF', 'JPY'],
  );
  // Non-string entries are ignored, never coerced; objects contribute their
  // code key; padding/case is normalized.
  assert.deepEqual(
    wizard.currencyOptions({
      brokerInfo: { currencies: [123, true, null, ['EUR'], { code: 'JPY' }, '  eur  '] },
      groups: [],
    }),
    ['EUR', 'JPY'],
  );
  // No literal-fallback entry (USD here) is ever invented alongside API data.
  assert.ok(!wizard.currencyOptions({
    brokerInfo: { currencies: ['EUR'] },
    groups: [{ name: 'Fixture\\Alpha', currency: 'CHF' }],
  }).includes('USD'));
});

// UI-3b (b): with no API currencies the options are the fallback literal
// list (the same codes the modal renders today).
test('ui-3b currency list: with no API currencies expects the fallback literal list', () => {
  assert.equal(typeof wizard.currencyOptions, 'function', 'currencyOptions helper exists');
  assert.equal(typeof wizard.CURRENCY_FALLBACK_OPTIONS, 'object', 'CURRENCY_FALLBACK_OPTIONS exists');
  const fallback = [...wizard.CURRENCY_FALLBACK_OPTIONS].sort();
  assert.deepEqual(wizard.currencyOptions({ brokerInfo: null, groups: [] }), fallback);
  assert.deepEqual(wizard.currencyOptions({ brokerInfo: {}, groups: [] }), fallback);
  assert.deepEqual(wizard.currencyOptions(), fallback);
  // A non-array under a list key yields the fallback (fail-closed, never
  // invented entries from a scalar).
  assert.deepEqual(wizard.currencyOptions({ brokerInfo: { currencies: 'EUR' }, groups: [] }), fallback);
  assert.deepEqual(
    wizard.currencyOptions({ brokerInfo: null, groups: [{ name: 'Fixture\\Alpha' }] }),
    fallback,
  );
});

// UI-3b (c): NOTHING is preselected unless the broker/group sets a default.
// Without broker currency data the default resolver emits '' (the modal seeds
// Currency from it, so the placeholder stays until an explicit pick or group
// inheritance); a touched field keeps the operator value.
test('ui-3b currency list: no preselect without a broker/group default', () => {
  assert.equal(typeof wizard.resolveDefaultCurrency, 'function', 'resolveDefaultCurrency helper exists');
  assert.equal(wizard.resolveDefaultCurrency(null, false), '');
  assert.equal(wizard.resolveDefaultCurrency(undefined, false), '');
  assert.equal(wizard.resolveDefaultCurrency({}, false), '');
  assert.equal(wizard.resolveDefaultCurrency({ broker_name: 'Fixture Broker' }, false), '');
  assert.equal(wizard.resolveDefaultCurrency({ currency: '   ' }, false), '');
  assert.equal(wizard.resolveDefaultCurrency({ currency: 123 }, false), '');
  assert.equal(wizard.resolveDefaultCurrency({ currency: true }, false), '');
  // An explicit operator edit always wins over re-resolution.
  assert.equal(wizard.resolveDefaultCurrency({ currency: 'EUR' }, true), '');
  assert.equal(wizard.resolveDefaultCurrency(null, true), '');
  // Unless-clause: a broker-set default resolves to that code (uppercased).
  assert.equal(wizard.resolveDefaultCurrency({ currency: 'eur' }, false), 'EUR');
  assert.equal(wizard.resolveDefaultCurrency({ Currency: '  gbp  ' }, false), 'GBP');
});
