import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkSymbolNames } from '../utils/symbolParams.js';

test('chunkSymbolNames deduplicates and keeps symbol parameter URLs bounded', () => {
  const symbols = Array.from({ length: 145 }, (_, index) => ({ symbol: `SYM${index}` }));
  symbols.push('SYM3', { Symbol: 'SYM4' }, '', null);

  const batches = chunkSymbolNames(symbols, 60);

  assert.deepEqual(batches.map((batch) => batch.length), [60, 60, 25]);
  assert.equal(batches.flat().length, 145);
  assert.equal(new Set(batches.flat()).size, 145);
});

test('chunkSymbolNames handles invalid input and minimum batch size', () => {
  assert.deepEqual(chunkSymbolNames(null), []);
  assert.deepEqual(chunkSymbolNames(['EURUSD', 'GBPUSD'], 0), [['EURUSD', 'GBPUSD']]);
});
