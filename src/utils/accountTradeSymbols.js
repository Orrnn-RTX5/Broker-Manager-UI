// Tenant-catalog trade symbols (pure helpers, zero imports).
//
// Symbol sources for the Trade tab, in priority order:
//   1. the selected position row,
//   2. the account's open positions,
//   3. the tenant symbol catalog (passed in by the caller, never fetched here),
//   4. empty string (fail-closed: an empty symbol stays empty and gates
//      modify/close/place actions downstream; no symbol is ever invented).
//
// White-label: no broker/tenant/group/account identifiers and no symbol
// literals live here. Every returned symbol is drawn verbatim (trimmed) from
// the inputs. Case is preserved: symbols are matched exactly against the
// live feed store keys elsewhere, so no case normalization happens here.

const cleanSymbol = (value) => String(value ?? '').trim();

// A catalog entry is either a bare symbol string or an object carrying one.
const catalogSymbol = (entry) =>
  cleanSymbol(typeof entry === 'string' ? entry : entry?.symbol);

// Initial symbol for the Trade tab: row symbol, else the first non-empty
// open-position symbol, else the first non-empty catalog entry, else ''.
// With an empty catalog this reduces exactly to the legacy inline chain
// (row symbol, else first position symbol, else ''), except that
// whitespace-only values are treated as empty and later positions are
// scanned instead of reading only index 0 -- both fail-safe, both invent
// nothing.
export const resolveTradeSymbol = ({ selectedTicketRow, positions = [], catalog = [] } = {}) => {
  const row = cleanSymbol(selectedTicketRow?.symbol);
  if (row) return row;
  for (const position of positions ?? []) {
    const symbol = cleanSymbol(position?.symbol);
    if (symbol) return symbol;
  }
  for (const entry of catalog ?? []) {
    const symbol = catalogSymbol(entry);
    if (symbol) return symbol;
  }
  return '';
};

// De-duplicated, sorted symbol list from catalog + positions + the active
// symbol only. The live feed store is merged by the caller on top of this
// list; this helper performs no I/O and invents no symbols.
export const buildTradeSymbolList = ({ catalog = [], positions = [], activeSymbol = '' } = {}) => {
  const seeds = new Set();
  for (const entry of catalog ?? []) {
    const symbol = catalogSymbol(entry);
    if (symbol) seeds.add(symbol);
  }
  for (const position of positions ?? []) {
    const symbol = cleanSymbol(position?.symbol);
    if (symbol) seeds.add(symbol);
  }
  const active = cleanSymbol(activeSymbol);
  if (active) seeds.add(active);
  return [...seeds].sort();
};
