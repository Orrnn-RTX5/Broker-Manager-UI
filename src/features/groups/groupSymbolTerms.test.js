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
import {
  applyStagedOverride,
  buildGroupSymbolOverrideChanges,
  normalizeGroupSymbolOverrides,
  stageGroupSymbolStopsOverride,
  toggleStagedOverride,
  validateStopsLevelOverride,
} from './groupSymbolOverrides.js';

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
    { symbol: 'EURUSD', spread_markup: 0, commission: 0, swap_multiplier: 1, trade_allowed: false, stops_level_points: 20 },
    { symbol: 'GBPUSD', stops_level_points: null },
  ]);
  assert.deepEqual(full.symbols[0], {
    symbol: 'EURUSD', spread_markup: 0, commission: 0, swap_multiplier: 1, trade_allowed: false, stops_level_points: 20,
  });
  assert.deepEqual(full.symbols[1], {
    symbol: 'GBPUSD', stops_level_points: null,
  });
  assert.equal(isCanonicalGroupSymbolsSavePayload(full), true);
});

test('invalid groups, symbols, and terms are refused without tenant defaults', () => {
  assert.throws(() => buildGroupSymbolsSavePayload('  ', [{ symbol: 'EURUSD' }]), /Group name is required/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: '' }]), /Invalid symbol/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'EURUSD', spread_markup: 1.5 }]), /spread_markup/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'EURUSD', commission: -1 }]), /commission/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'EURUSD', trade_allowed: 'yes' }]), /trade_allowed/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'EURUSD', stops_level_points: -1 }]), /stops_level_points/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'EURUSD', stops_level_points: 1.5 }]), /stops_level_points/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'EURUSD', stops_level_points: 2147483648 }]), /stops_level_points/);
  assert.equal(isCanonicalGroupSymbolsSavePayload({ group: '', symbols: [] }), false);
  assert.equal(isCanonicalGroupSymbolsSavePayload({ group: 'Main/alpha', symbols: [{ symbol: 'EURUSD', rate: 1 }] }), false);
});

test('groupSymbolOverrides normalizes and stages stops_level_points overrides alongside trade overrides', () => {
  const view = normalizeGroupSymbolOverrides({
    group: 'Main/alpha',
    group_trading: true,
    symbols: [
      { symbol: 'EURUSD', category: 'forex', global_enabled: true, group_override: null, effective: true, status: 'global', stops_level_points: null, instrument_stops_level_points: 15 },
      { symbol: 'XAUUSD', category: 'metal', global_enabled: true, group_override: 'off', effective: false, status: 'override_off', stops_level_points: 40, instrument_stops_level_points: 20 },
    ],
  });
  assert.equal(view.rows[0].stopsLevelPoints, null);
  assert.equal(view.rows[0].instrumentStopsLevelPoints, 15);
  assert.equal(view.rows[1].stopsLevelPoints, 40);
  assert.equal(view.rows[1].instrumentStopsLevelPoints, 20);

  let staged = stageGroupSymbolStopsOverride(new Map(), view.rows[0], 30);
  assert.deepEqual(buildGroupSymbolOverrideChanges(staged), [
    { symbol: 'EURUSD', stops_level_points: 30 },
  ]);
  const shown = applyStagedOverride(view.rows[0], staged);
  assert.equal(shown.stopsLevelPoints, 30);
  assert.equal(shown.staged, true);

  staged = toggleStagedOverride(staged, shown);
  assert.deepEqual(buildGroupSymbolOverrideChanges(staged), [
    { symbol: 'EURUSD', trade_allowed: false, stops_level_points: 30 },
  ]);

  const resetXau = stageGroupSymbolStopsOverride(new Map(), view.rows[1], null);
  assert.deepEqual(buildGroupSymbolOverrideChanges(resetXau), [
    { symbol: 'XAUUSD', stops_level_points: null },
  ]);

  assert.deepEqual(validateStopsLevelOverride(''), { value: null, error: null });
  assert.deepEqual(validateStopsLevelOverride('0'), { value: 0, error: null });
  assert.ok(validateStopsLevelOverride('-5').error);
});
