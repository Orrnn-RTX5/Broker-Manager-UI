import { fetchManagerApi } from '../../services/managerFetch.js';

// Which symbols a group save can accept.
//
// GroupCreate/GroupUpdate refuse every allowed symbol that has no enabled
// internal instrument for the session broker (400 MT_RET_ERR_PARAMS). The live
// feed quotes a wider catalogue, so the group picker asks the backend once for
// the broker's enabled instruments and offers only those:
//   GET /SymbolBaseList?enabled_only=1&include_derived=1
//   -> { count, symbols: [{ symbol, category, enabled, symbolType?, parentSymbol? }] }
// Older backends ignore include_derived and return base symbols only. The
// backend scopes the list to the session broker; nothing tenant-specific is
// sent from here. Any failure resolves to null: the picker then stays
// unrestricted and the backend keeps enforcing the rule (fail-closed there).
export const SYMBOL_BASE_LIST_PATH = '/SymbolBaseList?enabled_only=1&include_derived=1';

export const NOT_CONFIGURED_HINT = 'Not configured — enable it in Admin → Symbol Management';

export const symbolKey = (symbol) => String(symbol ?? '').trim().toUpperCase();

// "Allow all symbols": symbolsAllowed ["*"] on GroupCreate/GroupUpdate, echoed
// by GroupGet. The server resolves it at read time to every enabled instrument
// in the broker's feed scope, now and later; symbolsBlocked still applies.
export const ALLOW_ALL_SYMBOLS = '*';

const symbolListOf = (value) => (Array.isArray(value) ? value : String(value ?? '').split(','))
  .map((symbol) => String(symbol ?? '').trim())
  .filter(Boolean);

// The server reads an EMPTY allowed list as "every instrument" too, so an
// explicit list must never be saved empty by accident: a new group needs at
// least one symbol or "Allow all symbols", and an edit may not clear a list.
// An existing group that already has an empty list and is saved unchanged
// keeps it (the operator did not touch it).
export const EMPTY_ALLOWED_SYMBOLS_ERROR = 'Select at least one allowed symbol, or tick "Allow all symbols".';
export const emptyAllowedSymbolsError = ({ value, initialValue, isEditing }) => {
  if (symbolListOf(value).length > 0) return null;
  if (isEditing && symbolListOf(initialValue).length === 0) return null;
  return EMPTY_ALLOWED_SYMBOLS_ERROR;
};

/** True when an allowed-symbols value (CSV string or array) is the allow-all marker. */
export const isAllowAllSymbols = (value) => {
  const list = symbolListOf(value);
  return list.length === 1 && list[0] === ALLOW_ALL_SYMBOLS;
};

const rowsOf = (body) => {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.symbols)) return body.symbols;
  if (Array.isArray(body?.rows)) return body.rows;
  if (Array.isArray(body?.data)) return body.data;
  return null;
};

/**
 * Normalizes a SymbolBaseList body into { rows, keys }, or null when the body
 * has no symbol list. Rows with enabled === false are not selectable.
 */
export const parseSelectableSymbols = (body) => {
  const list = rowsOf(body);
  if (!list) return null;
  const rows = [];
  const keys = new Set();
  for (const raw of list) {
    const symbol = String(raw?.symbol ?? raw?.Symbol ?? '').trim();
    if (!symbol || raw?.enabled === false) continue;
    const key = symbolKey(symbol);
    if (keys.has(key)) continue;
    keys.add(key);
    rows.push({ symbol, category: String(raw?.category ?? '').trim() });
  }
  return { rows, keys };
};

/** The broker's selectable symbols as { rows, keys }, or null. Never throws. */
export const fetchSelectableSymbols = async () => {
  try {
    const response = await fetchManagerApi(SYMBOL_BASE_LIST_PATH, { method: 'GET' });
    if (!response?.ok) return null;
    return parseSelectableSymbols(await response.json());
  } catch {
    return null;
  }
};

/**
 * The picker's option list: every feed symbol plus every selectable symbol
 * that has no tick yet (a quiet market must not hide it). Feed metadata wins
 * for the category; a missing category falls back to the API category.
 */
export const mergeSymbolOptions = (feedSymbols = [], selectableRows = []) => {
  const byKey = new Map();
  for (const entry of feedSymbols) {
    const key = symbolKey(entry?.symbol);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, entry);
  }
  for (const row of selectableRows) {
    const key = symbolKey(row.symbol);
    if (!key) continue;
    const current = byKey.get(key);
    if (!current) byKey.set(key, { symbol: row.symbol, category: row.category || undefined, fromInstrumentList: true });
    else if (!current.category && row.category) byKey.set(key, { ...current, category: row.category });
  }
  return [...byKey.values()];
};

/**
 * True when the symbol can be saved in a group. With no instrument list
 * (null, e.g. the call failed) every symbol counts as selectable, and the
 * backend stays the authority. Symbols the last save refused are never
 * selectable, whatever the list says.
 */
export const isSymbolSelectable = (symbol, selectableKeys, refusedKeys) => {
  const key = symbolKey(symbol);
  if (refusedKeys?.has(key)) return false;
  return !selectableKeys || selectableKeys.has(key);
};

/**
 * Category checkbox: acts on the selectable symbols of the category only.
 * When all of them are selected it clears them; otherwise it adds the
 * missing ones. Selected symbols that are not selectable are left untouched,
 * so the operator removes them explicitly.
 */
export const toggleCategorySelection = (selectedList, categorySymbols, isSelectable) => {
  const selectable = categorySymbols.filter(isSelectable);
  if (selectable.length === 0) return selectedList;
  const selectedKeys = new Set(selectedList.map(symbolKey));
  const allSelected = selectable.every((symbol) => selectedKeys.has(symbolKey(symbol)));
  if (allSelected) {
    const remove = new Set(selectable.map(symbolKey));
    return selectedList.filter((symbol) => !remove.has(symbolKey(symbol)));
  }
  return [...selectedList, ...selectable.filter((symbol) => !selectedKeys.has(symbolKey(symbol)))];
};

/** Counts for a category header: selected and total over selectable symbols, plus the rest. */
export const categoryCounts = (selectedList, categorySymbols, isSelectable) => {
  const selectedKeys = new Set(selectedList.map(symbolKey));
  const selectable = categorySymbols.filter(isSelectable);
  return {
    selected: selectable.filter((symbol) => selectedKeys.has(symbolKey(symbol))).length,
    selectable: selectable.length,
    notConfigured: categorySymbols.length - selectable.length,
  };
};

/** True for the refusal "symbol(s) … no enabled internal instrument" (not, e.g., the feed-scope refusal). */
export const isNotConfiguredRefusal = (body, message = '') => /no enabled internal instrument/i
  .test([message, body?.error, body?.message].filter((part) => typeof part === 'string').join('\n'));

const SINGLE_REFUSAL = /symbol\s+(\S+?)\s+has no enabled internal instrument/i;
const MULTI_REFUSAL = /symbols\s+(.+?)\s+have no enabled internal instrument/i;

/**
 * Every symbol a failed GroupCreate/GroupUpdate refused for missing an enabled
 * instrument: the structured `unavailable_symbols` field when the backend sends
 * it, else the symbols named in the message text. Sorted, de-duplicated.
 */
export const parseUnavailableSymbols = (body, message = '') => {
  const found = [];
  const structured = body?.unavailable_symbols ?? body?.unavailableSymbols;
  if (Array.isArray(structured)) {
    structured.forEach((symbol) => { if (String(symbol ?? '').trim()) found.push(String(symbol).trim()); });
  }
  if (found.length === 0) {
    const text = [message, body?.error, body?.message].filter((part) => typeof part === 'string').join('\n');
    const multi = text.match(MULTI_REFUSAL);
    if (multi) multi[1].split(/\s*,\s*|\s+and\s+/).forEach((symbol) => { if (symbol.trim()) found.push(symbol.trim()); });
    else {
      const single = text.match(SINGLE_REFUSAL);
      if (single) found.push(single[1]);
    }
  }
  const byKey = new Map();
  found.forEach((symbol) => { if (!byKey.has(symbolKey(symbol))) byKey.set(symbolKey(symbol), symbol); });
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
};
