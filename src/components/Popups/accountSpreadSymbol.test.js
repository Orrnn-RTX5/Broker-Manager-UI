import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSpreadSymbol, normalizeSpreadSymbol } from './accountSpreadSymbol.js';

// The per-symbol spread override must never invent a symbol: blank stays
// blank and the submit path refuses it. No tenant/broker/symbol literals.
test('blank values normalize to empty and fail the gate', () => {
  assert.equal(normalizeSpreadSymbol(''), '');
  assert.equal(normalizeSpreadSymbol('   '), '');
  assert.equal(normalizeSpreadSymbol(null), '');
  assert.equal(normalizeSpreadSymbol(undefined), '');
  assert.equal(hasSpreadSymbol(''), false);
  assert.equal(hasSpreadSymbol('   '), false);
  assert.equal(hasSpreadSymbol(null), false);
});

test('explicit symbols pass through untouched', () => {
  assert.equal(normalizeSpreadSymbol('EURUSD'), 'EURUSD');
  assert.equal(normalizeSpreadSymbol('  XAUUSD  '), 'XAUUSD');
  assert.equal(hasSpreadSymbol('EURUSD'), true);
  assert.equal(hasSpreadSymbol('xauusd'), true);
});
