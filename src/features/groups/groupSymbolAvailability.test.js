// Run with: node --test src/features/groups/groupSymbolAvailability.test.js
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

// Group symbol availability: the picker offers only symbols that have an
// enabled instrument for the session broker, and a failed save names every
// refused symbol. The REAL module is bundled with only the manager transport
// replaced by a recorder. Generic fixtures only (no tenant, broker or host
// values; symbol names are placeholders).
const runtime = { calls: [], respond: null };
globalThis.__groupSymbolAvailabilityTest = runtime;

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./groupSymbolAvailability.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser', logLevel: 'silent',
  plugins: [{ name: 'symbol-availability-transport', setup(builder) {
    builder.onResolve({ filter: /\/managerFetch(\.js)?$/ }, ({ path }) => ({ path, namespace: 'symbol-availability-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'symbol-availability-test' }, () => ({ loader: 'js', contents:
      'export const fetchManagerApi = (...args) => globalThis.__groupSymbolAvailabilityTest.request(...args);',
    }));
  } }],
});
const {
  ALLOW_ALL_SYMBOLS,
  EMPTY_ALLOWED_SYMBOLS_ERROR,
  emptyAllowedSymbolsError,
  isAllowAllSymbols,
  isNotConfiguredRefusal,
  SYMBOL_BASE_LIST_PATH,
  categoryCounts,
  fetchSelectableSymbols,
  isSymbolSelectable,
  mergeSymbolOptions,
  parseSelectableSymbols,
  parseUnavailableSymbols,
  toggleCategorySelection,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  runtime.calls = [];
  runtime.request = async (url, options = {}) => {
    runtime.calls.push({ url, options });
    return runtime.respond();
  };
});
after(() => { delete globalThis.__groupSymbolAvailabilityTest; });

test('reads the enabled instruments, derived included, with one GET', async () => {
  runtime.respond = () => json(200, { count: 2, symbols: [
    { symbol: 'AAA1', category: 'Cat1', enabled: true },
    { symbol: 'AAA1.x', category: 'Cat1', enabled: true, symbolType: 'derived', parentSymbol: 'AAA1' },
  ] });
  const result = await fetchSelectableSymbols();
  assert.equal(runtime.calls.length, 1);
  assert.equal(runtime.calls[0].url, SYMBOL_BASE_LIST_PATH);
  assert.equal(SYMBOL_BASE_LIST_PATH, '/SymbolBaseList?enabled_only=1&include_derived=1');
  assert.equal(String(runtime.calls[0].options.method).toUpperCase(), 'GET');
  assert.deepEqual([...result.keys].sort(), ['AAA1', 'AAA1.X']);
  assert.deepEqual(result.rows.map((row) => row.symbol), ['AAA1', 'AAA1.x']);
});

test('any failure resolves to null (picker unrestricted, backend still enforces)', async () => {
  for (const respond of [
    () => json(403, { message: 'denied' }),
    () => json(500, { message: 'boom' }),
    () => new Response('not json', { status: 200 }),
    () => json(200, { nothing: true }),
    () => { throw new Error('network'); },
  ]) {
    runtime.respond = respond;
    assert.equal(await fetchSelectableSymbols(), null);
  }
});

test('parseSelectableSymbols drops disabled, blank and duplicate rows and accepts list shapes', () => {
  const parsed = parseSelectableSymbols({ symbols: [
    { symbol: 'AAA1', enabled: true },
    { symbol: 'aaa1', enabled: true },
    { symbol: 'BBB2', enabled: false },
    { symbol: '  ' },
    { Symbol: 'CCC3', category: ' Cat3 ' },
  ] });
  assert.deepEqual(parsed.rows, [{ symbol: 'AAA1', category: '' }, { symbol: 'CCC3', category: 'Cat3' }]);
  assert.equal(parseSelectableSymbols([{ symbol: 'AAA1' }]).rows.length, 1);
  assert.equal(parseSelectableSymbols({ rows: [{ symbol: 'AAA1' }] }).rows.length, 1);
  assert.equal(parseSelectableSymbols(null), null);
});

test('mergeSymbolOptions keeps feed rows and adds instruments with no tick yet', () => {
  const feed = [{ symbol: 'AAA1', category: 'Cat1', bid: 1 }, { symbol: 'QUOTED', category: 'Cat1' }, { symbol: 'NOCAT' }];
  const options = mergeSymbolOptions(feed, [
    { symbol: 'aaa1', category: 'Other' },
    { symbol: 'QUIET', category: 'Cat2' },
    { symbol: 'NOCAT', category: 'Cat9' },
  ]);
  assert.deepEqual(options.map((o) => o.symbol), ['AAA1', 'QUOTED', 'NOCAT', 'QUIET']);
  assert.equal(options[0].category, 'Cat1', 'feed category wins');
  assert.equal(options[0].bid, 1, 'feed row is kept as is');
  assert.equal(options[2].category, 'Cat9', 'missing feed category falls back to the instrument category');
  assert.equal(options[3].category, 'Cat2');
  assert.deepEqual(mergeSymbolOptions(feed, undefined).map((o) => o.symbol), ['AAA1', 'QUOTED', 'NOCAT']);
});

test('isSymbolSelectable: list membership, refused symbols, and the no-list fallback', () => {
  const keys = new Set(['AAA1', 'BBB2']);
  assert.equal(isSymbolSelectable('aaa1', keys, new Set()), true);
  assert.equal(isSymbolSelectable('QUOTED', keys, new Set()), false);
  assert.equal(isSymbolSelectable('BBB2', keys, new Set(['BBB2'])), false, 'a refused symbol is never selectable');
  assert.equal(isSymbolSelectable('QUOTED', null, new Set()), true, 'no list: unrestricted');
  assert.equal(isSymbolSelectable('QUOTED', null, new Set(['QUOTED'])), false);
});

test('category toggle selects and clears only the selectable symbols', () => {
  const keys = new Set(['AAA1', 'BBB2']);
  const can = (symbol) => isSymbolSelectable(symbol, keys, new Set());
  const category = ['AAA1', 'BBB2', 'QUOTED'];

  const added = toggleCategorySelection([], category, can);
  assert.deepEqual(added, ['AAA1', 'BBB2'], 'the unconfigured symbol is never added');

  const cleared = toggleCategorySelection(['QUOTED', 'AAA1', 'BBB2', 'ZZZ9'], category, can);
  assert.deepEqual(cleared, ['QUOTED', 'ZZZ9'], 'clearing leaves the unconfigured selection for an explicit remove');

  const partial = toggleCategorySelection(['AAA1'], category, can);
  assert.deepEqual(partial, ['AAA1', 'BBB2']);

  const none = ['X'];
  assert.equal(toggleCategorySelection(none, ['QUOTED'], can), none, 'nothing selectable: unchanged');
});

test('category counts are over selectable symbols, with the not-configured rest', () => {
  const keys = new Set(['AAA1', 'BBB2']);
  const can = (symbol) => isSymbolSelectable(symbol, keys, new Set());
  assert.deepEqual(categoryCounts(['AAA1', 'QUOTED'], ['AAA1', 'BBB2', 'QUOTED'], can), { selected: 1, selectable: 2, notConfigured: 1 });
  assert.deepEqual(categoryCounts([], ['AAA1'], () => true), { selected: 0, selectable: 1, notConfigured: 0 });
});

test('parseUnavailableSymbols: structured field first, sorted and unique', () => {
  assert.deepEqual(parseUnavailableSymbols({ error: 'symbol X has no enabled internal instrument', unavailable_symbols: ['CCC3', 'AAA1', 'aaa1', ''] }), ['AAA1', 'CCC3']);
  assert.deepEqual(parseUnavailableSymbols({ unavailableSymbols: ['BBB2'] }), ['BBB2']);
});

test('parseUnavailableSymbols: text fallbacks for the single and the list message', () => {
  assert.deepEqual(parseUnavailableSymbols({ message: 'symbol AAA1 has no enabled internal instrument' }), ['AAA1']);
  assert.deepEqual(parseUnavailableSymbols({}, 'MT_RET_ERR_PARAMS: symbol AAA1.x has no enabled internal instrument'), ['AAA1.x']);
  assert.deepEqual(parseUnavailableSymbols({ error: 'symbols CCC3, AAA1 have no enabled internal instrument' }), ['AAA1', 'CCC3']);
  assert.deepEqual(parseUnavailableSymbols({ error: 'symbols CCC3 and AAA1 have no enabled internal instrument' }), ['AAA1', 'CCC3']);
});

test('parseUnavailableSymbols: other errors give an empty list', () => {
  assert.deepEqual(parseUnavailableSymbols({ error: 'Group configuration is in use' }), []);
  assert.deepEqual(parseUnavailableSymbols(null, ''), []);
  assert.deepEqual(parseUnavailableSymbols({ unavailable_symbols: 'AAA1' }, 'leverage invalid'), []);
});

test('allow-all marker: exactly ["*"] in CSV or array form', () => {
  assert.equal(ALLOW_ALL_SYMBOLS, '*');
  assert.equal(isAllowAllSymbols('*'), true);
  assert.equal(isAllowAllSymbols(' * '), true);
  assert.equal(isAllowAllSymbols(['*']), true);
  assert.equal(isAllowAllSymbols(''), false);
  assert.equal(isAllowAllSymbols([]), false);
  assert.equal(isAllowAllSymbols('*, AAA1'), false);
  assert.equal(isAllowAllSymbols(['AAA1']), false);
  assert.equal(isAllowAllSymbols(null), false);
});

test('an explicit allowed list is never saved empty by accident (empty = every instrument on the server)', () => {
  assert.equal(emptyAllowedSymbolsError({ value: '', isEditing: false }), EMPTY_ALLOWED_SYMBOLS_ERROR, 'new group needs a symbol or allow-all');
  assert.equal(emptyAllowedSymbolsError({ value: ' , ', isEditing: false }), EMPTY_ALLOWED_SYMBOLS_ERROR);
  assert.equal(emptyAllowedSymbolsError({ value: '*', isEditing: false }), null, 'allow-all is explicit');
  assert.equal(emptyAllowedSymbolsError({ value: 'AAA1', isEditing: false }), null);
  assert.equal(emptyAllowedSymbolsError({ value: '', initialValue: ['AAA1'], isEditing: true }), EMPTY_ALLOWED_SYMBOLS_ERROR, 'an edit may not clear a list');
  assert.equal(emptyAllowedSymbolsError({ value: '', initialValue: ['*'], isEditing: true }), EMPTY_ALLOWED_SYMBOLS_ERROR, 'turning allow-all off needs a selection');
  assert.equal(emptyAllowedSymbolsError({ value: '', initialValue: [], isEditing: true }), null, 'an untouched legacy empty list is kept');
  assert.equal(emptyAllowedSymbolsError({ value: '', initialValue: undefined, isEditing: true }), null);
});

test('only the no-enabled-instrument refusal counts as "not configured"', () => {
  assert.equal(isNotConfiguredRefusal({ message: 'symbols AAA1, BBB2 have no enabled internal instrument' }), true);
  assert.equal(isNotConfiguredRefusal({}, 'symbol AAA1 has no enabled internal instrument'), true);
  assert.equal(isNotConfiguredRefusal({ message: "symbol AAA1 is unavailable on the group's selected quote feed", unavailable_symbols: ['AAA1'] }), false);
  assert.equal(isNotConfiguredRefusal(null, ''), false);
});
