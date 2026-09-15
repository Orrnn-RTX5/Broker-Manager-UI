import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSymbolCatalog } from './symbolCatalog.js';

test('full catalog preserves more than five symbols and deduplicates names', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => `SYMBOL${i}`);
  const result = normalizeSymbolCatalog([...rows, 'SYMBOL0', '', null]);
  assert.equal(result.length, 1000);
  assert.ok(result.some(row => row.symbol === 'SYMBOL999'));
});
test('supports named objects and rejects invalid responses instead of showing false empty lists', () => {
  assert.deepEqual(normalizeSymbolCatalog({ data: { symbols: [{ Symbol: 'XAUUSD', Description: 'Gold' }] } }), [{ symbol: 'XAUUSD', description: 'Gold' }]);
  assert.deepEqual(normalizeSymbolCatalog([]), []);
  assert.throws(() => normalizeSymbolCatalog({ error: 'Denied' }), /invalid symbol list/);
});
