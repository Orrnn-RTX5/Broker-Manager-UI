import test from 'node:test';
import assert from 'node:assert/strict';
import { getSymbolTableWindow, SYMBOL_TABLE_ROW_HEIGHT } from './symbolTableWindow.js';

test('large symbol lists render a bounded window while retaining total scroll height', () => {
  for (const scroll of [0, 3200, 40000, 999999]) {
    const w = getSymbolTableWindow(1324, scroll, 160);
    assert.ok(w.start >= 0 && w.end <= 1324);
    assert.ok(w.end - w.start <= 13);
    assert.equal(w.top + w.bottom + (w.end - w.start) * SYMBOL_TABLE_ROW_HEIGHT, 1324 * SYMBOL_TABLE_ROW_HEIGHT);
  }
});

test('filtering at the bottom never leaves an empty window for nonempty results', () => {
  assert.deepEqual(getSymbolTableWindow(2, 99999, 160), { start: 0, end: 2, top: 0, bottom: 0 });
  assert.deepEqual(getSymbolTableWindow(0, 99999, 160), { start: 0, end: 0, top: 0, bottom: 0 });
});
