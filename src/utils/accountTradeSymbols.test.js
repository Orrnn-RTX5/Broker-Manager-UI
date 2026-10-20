import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolveTradeSymbol,
  buildTradeSymbolList,
} from './accountTradeSymbols.js';

// Tenant-catalog symbol helpers: pure functions, no I/O, no new deps.
// Fixtures are obviously synthetic tokens (never real-world symbols, never
// tenant/broker identifiers) so the white-label rule holds by construction.

// --- resolveTradeSymbol: resolution order (row > position > catalog > '') ---

test('resolution prefers the selected row symbol over positions and catalog', () => {
  assert.equal(
    resolveTradeSymbol({
      selectedTicketRow: { symbol: 'ROW_A' },
      positions: [{ symbol: 'POS_B' }],
      catalog: ['CAT_C'],
    }),
    'ROW_A'
  );
});

test('resolution falls back to the first open-position symbol without a row', () => {
  assert.equal(
    resolveTradeSymbol({
      selectedTicketRow: null,
      positions: [{ symbol: 'POS_B' }, { symbol: 'POS_D' }],
      catalog: ['CAT_C'],
    }),
    'POS_B'
  );
});

test('resolution skips empty position symbols instead of stopping at index 0', () => {
  assert.equal(
    resolveTradeSymbol({
      selectedTicketRow: {},
      positions: [{ symbol: '' }, { symbol: '  ' }, { symbol: 'POS_D' }],
      catalog: ['CAT_C'],
    }),
    'POS_D'
  );
});

test('resolution falls back to the first catalog entry without row or positions', () => {
  assert.equal(resolveTradeSymbol({ catalog: ['CAT_C', 'CAT_E'] }), 'CAT_C');
  assert.equal(
    resolveTradeSymbol({ positions: [], catalog: [{ symbol: 'CAT_F' }] }),
    'CAT_F'
  );
});

test('resolution skips empty catalog entries (strings and objects)', () => {
  assert.equal(
    resolveTradeSymbol({
      catalog: ['', '   ', {}, { symbol: '' }, null, 'CAT_G'],
    }),
    'CAT_G'
  );
});

test('resolution returns empty string and invents nothing for empty inputs', () => {
  assert.equal(resolveTradeSymbol(), '');
  assert.equal(resolveTradeSymbol({}), '');
  assert.equal(
    resolveTradeSymbol({ selectedTicketRow: null, positions: [], catalog: [] }),
    ''
  );
  assert.equal(
    resolveTradeSymbol({
      selectedTicketRow: { symbol: '   ' },
      positions: [{ symbol: null }, {}],
      catalog: [null, '  '],
    }),
    ''
  );
  assert.equal(
    resolveTradeSymbol({ selectedTicketRow: undefined, positions: null, catalog: null }),
    ''
  );
});

test('resolution trims but never re-cases the winning symbol', () => {
  assert.equal(
    resolveTradeSymbol({ selectedTicketRow: { symbol: '  MixEd_Tok  ' } }),
    'MixEd_Tok'
  );
});

// --- buildTradeSymbolList: merging / dedupe / sort ---

test('list merges catalog, positions and the active symbol', () => {
  assert.deepEqual(
    buildTradeSymbolList({
      catalog: ['CAT_C'],
      positions: [{ symbol: 'POS_B' }],
      activeSymbol: 'ACT_A',
    }),
    ['ACT_A', 'CAT_C', 'POS_B']
  );
});

test('list de-duplicates across sources and sorts', () => {
  assert.deepEqual(
    buildTradeSymbolList({
      catalog: ['TOK_B', { symbol: 'TOK_A' }, 'TOK_B'],
      positions: [{ symbol: 'TOK_A' }, { symbol: 'TOK_C' }],
      activeSymbol: 'TOK_B',
    }),
    ['TOK_A', 'TOK_B', 'TOK_C']
  );
});

test('list ignores empty, whitespace-only and missing entries', () => {
  assert.deepEqual(
    buildTradeSymbolList({
      catalog: ['', '   ', {}, { symbol: '' }, null, 'TOK_A'],
      positions: [{ symbol: '' }, {}, { symbol: '  ' }, null],
      activeSymbol: '   ',
    }),
    ['TOK_A']
  );
});

test('list returns an empty array and invents nothing for empty inputs', () => {
  assert.deepEqual(buildTradeSymbolList(), []);
  assert.deepEqual(buildTradeSymbolList({}), []);
  assert.deepEqual(
    buildTradeSymbolList({ catalog: [], positions: [], activeSymbol: '' }),
    []
  );
  assert.deepEqual(
    buildTradeSymbolList({ catalog: null, positions: null, activeSymbol: null }),
    []
  );
});

test('list output is drawn only from its inputs (no invented symbols)', () => {
  const catalog = ['ZZ_TOK', { symbol: 'MM_TOK' }];
  const positions = [{ symbol: 'AA_TOK' }];
  const activeSymbol = 'QQ_TOK';
  const allowed = new Set(['ZZ_TOK', 'MM_TOK', 'AA_TOK', 'QQ_TOK']);
  const list = buildTradeSymbolList({ catalog, positions, activeSymbol });
  assert.equal(list.length, allowed.size);
  for (const symbol of list) {
    assert.ok(allowed.has(symbol), `invented symbol in list: ${symbol}`);
  }
});

// --- no literals: the helper embeds no hardcoded symbol-like tokens ---

test('helper embeds no hardcoded symbol literals', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./accountTradeSymbols.js', import.meta.url)),
    'utf8'
  );
  assert.ok(!/'[A-Z]+'/.test(source), 'helper must not embed single-quoted uppercase literals');
  assert.ok(!/"[A-Z]+"/.test(source), 'helper must not embed double-quoted uppercase literals');
  assert.ok(!source.includes('EURUSD'), 'helper must not name a real-world symbol');
});
