// Run with: node --test src/features/groups/groupSymbolTerms.test.js
// Per-symbol financial terms are a post-create concern only. The new-group
// wizard sends symbol name lists; per-symbol money uses the existing
// canonical GroupSymbolsSave collection contract, never a new backend API.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUP_SYMBOLS_GET_ENDPOINT,
  GROUP_SYMBOLS_SAVE_ENDPOINT,
  GROUP_SYMBOL_OVERRIDES_GET_ENDPOINT,
  GROUP_SYMBOL_OVERRIDES_SAVE_ENDPOINT,
  NEW_GROUP_SYMBOL_TERMS_GAP,
  buildGroupSymbolsSavePayload,
  isCanonicalGroupSymbolsSavePayload,
} from './groupSymbolTerms.js';

test('the gap is explicit and names only the existing canonical collection endpoint', () => {
  assert.ok(String(NEW_GROUP_SYMBOL_TERMS_GAP).length > 0);
  assert.ok(String(NEW_GROUP_SYMBOL_TERMS_GAP).includes('GroupSymbolsSave'));
  assert.ok(!String(NEW_GROUP_SYMBOL_TERMS_GAP).includes('parentGroup'));
  assert.equal(GROUP_SYMBOLS_GET_ENDPOINT, '/GroupSymbolsGet');
  assert.equal(GROUP_SYMBOLS_SAVE_ENDPOINT, '/GroupSymbolsSave');
  assert.equal(GROUP_SYMBOL_OVERRIDES_GET_ENDPOINT, '/GroupSymbolOverridesGet');
  assert.equal(GROUP_SYMBOL_OVERRIDES_SAVE_ENDPOINT, '/GroupSymbolOverridesSave');
});

test('the save builder emits only canonical keys and omits unset terms', () => {
  assert.deepEqual(buildGroupSymbolsSavePayload('Main/alpha', []), { group: 'Main/alpha', symbols: [] });
  assert.deepEqual(
    buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'eurusd' }]),
    { group: 'Main/alpha', symbols: [{ symbol: 'EURUSD' }] },
  );
  const full = buildGroupSymbolsSavePayload('Main/alpha', [
    { symbol: 'EURUSD', spread_markup: 0, commission: 0, swap_multiplier: 1, trade_allowed: false },
  ]);
  assert.deepEqual(full.symbols[0], {
    symbol: 'EURUSD', spread_markup: 0, commission: 0, swap_multiplier: 1, trade_allowed: false,
  });
  assert.equal(isCanonicalGroupSymbolsSavePayload(full), true);
});

test('invalid groups, symbols, and terms are refused without tenant defaults', () => {
  assert.throws(() => buildGroupSymbolsSavePayload('  ', [{ symbol: 'EURUSD' }]), /Group name is required/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: '' }]), /Invalid symbol/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'EURUSD', spread_markup: 1.5 }]), /spread_markup/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'EURUSD', commission: -1 }]), /commission/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'EURUSD', trade_allowed: 'yes' }]), /trade_allowed/);
  assert.equal(isCanonicalGroupSymbolsSavePayload({ group: '', symbols: [] }), false);
  assert.equal(isCanonicalGroupSymbolsSavePayload({ group: 'Main/alpha', symbols: [{ symbol: 'EURUSD', rate: 1 }] }), false);
});
