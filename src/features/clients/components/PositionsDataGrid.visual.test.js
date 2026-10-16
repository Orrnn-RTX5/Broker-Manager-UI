import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./PositionsDataGrid.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../../index.css', import.meta.url), 'utf8');

test('Open Positions renders Action as plain semantic text', () => {
  const actionCell = source.match(/<td className="open-position-action-cell"[\s\S]*?<\/td>/)?.[0] ?? '';

  assert.match(actionCell, /open-position-action/);
  assert.match(actionCell, /isBuy \? 'is-buy' : 'is-sell'/);
  assert.doesNotMatch(actionCell, /ui-badge/);
  assert.match(styles, /--open-position-buy-color:\s*rgb\(88, 174, 104\)/);
  assert.match(styles, /--open-position-sell-color:\s*#f06464/);
  assert.match(styles, /\.open-position-action\s*\{[\s\S]*?background:\s*transparent/);
});

test('Open Positions keeps neutral values on the white ink in dark mode and Profit semantic', () => {
  const neutralValueCells = source.match(/className="open-position-value/g) ?? [];

  assert.equal(neutralValueCells.length, 12);
  assert.match(styles, /\.dark #root \.open-positions-page \.open-positions-grid\s*\{[\s\S]*?--open-position-value-color:\s*var\(--ink-1\)/);
  assert.match(source, /className="open-position-profit tabular font-mono"/);
  assert.match(source, /const profitTone = row\.profit < 0[\s\S]*?'var\(--open-position-loss-color\)'[\s\S]*?'var\(--open-position-profit-color\)'/);
  assert.doesNotMatch(source, /const swapTone/);
});
