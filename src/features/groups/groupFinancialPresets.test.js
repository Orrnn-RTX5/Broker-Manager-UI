// Run with: node --test src/features/groups/groupFinancialPresets.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVERAGE_PRESETS,
  MARGIN_CALL_PRESETS,
  NEW_GROUP_FINANCIAL_DEFAULTS,
  SPREAD_MARKUP_PRESETS,
  STOP_OUT_PRESETS,
  isPresetValue,
} from './groupFinancialPresets.js';

test('leverage presets are labelled as 1:x ratios and keep the numeric value', () => {
  assert.deepEqual(LEVERAGE_PRESETS.find((preset) => preset.value === 100), { value: 100, label: '1:100' });
  assert.equal(LEVERAGE_PRESETS[0].label, '1:1');
  assert.equal(LEVERAGE_PRESETS.at(-1).label, '1:2000');
});

test('margin levels are percentages and spread markup starts at no markup', () => {
  assert.equal(MARGIN_CALL_PRESETS.find((preset) => preset.value === 100).label, '100%');
  assert.equal(STOP_OUT_PRESETS.find((preset) => preset.value === 50).label, '50%');
  assert.deepEqual(SPREAD_MARKUP_PRESETS[0], { value: 0, label: 'No markup' });
  assert.equal(SPREAD_MARKUP_PRESETS.find((preset) => preset.value === 1).label, '1 point');
});

test('new-group defaults are presets, and stop out does not exceed margin call', () => {
  const { marginCallLevel, stopOutLevel, spreadMarkup } = NEW_GROUP_FINANCIAL_DEFAULTS;
  // Leverage has no client-side default: a fresh create pre-fills it from the
  // broker's group defaults or requires the operator to enter one.
  assert.ok(!('leverage' in NEW_GROUP_FINANCIAL_DEFAULTS), 'no leverage literal default for new groups');
  assert.ok(isPresetValue(MARGIN_CALL_PRESETS, marginCallLevel));
  assert.ok(isPresetValue(STOP_OUT_PRESETS, stopOutLevel));
  assert.ok(isPresetValue(SPREAD_MARKUP_PRESETS, spreadMarkup));
  assert.ok(stopOutLevel <= marginCallLevel);
});

test('isPresetValue compares numerically and rejects empty values', () => {
  assert.equal(isPresetValue(LEVERAGE_PRESETS, '500'), true);
  assert.equal(isPresetValue(LEVERAGE_PRESETS, 150), false);
  assert.equal(isPresetValue(SPREAD_MARKUP_PRESETS, ''), false);
  assert.equal(isPresetValue(SPREAD_MARKUP_PRESETS, undefined), false);
});
