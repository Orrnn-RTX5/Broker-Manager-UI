// Per-symbol financial terms for groups: explicit creation-path gap.
//
// The new-group wizard sends only symbol NAME lists (symbolsAllowed /
// symbolsBlocked) on POST /GroupCreate. It never sends per-symbol financial
// terms (spread markup, commission, swap multiplier, per-symbol trade gate)
// at create time, and it never sends `symbolSettings` in the creation
// payload: the backend stores per-symbol terms through its canonical
// group-symbol collection endpoints, not through GroupCreate/GroupUpdate.
//
// Canonical post-create path (existing backend contract, no new API):
//   GET  /GroupSymbolsGet?group=<name>          -> { group, symbols[], blocked[] }
//   POST /GroupSymbolsSave { group, symbols[] } -> whole-list atomic replace
// Each symbols[] entry uses only these canonical keys:
//   { symbol, spread_markup, commission, swap_multiplier, trade_allowed }
// Omitted numeric/gate keys take the no-override defaults on the server.
// The enable/disable-only override endpoints used by the properties modal
// (/GroupSymbolOverridesGet/Save with { group, changes: [{ symbol,
// trade_allowed }] }) cannot carry financial terms and must not be extended
// with invented keys.
//
// This module only builds/shapes that existing contract for safe post-create
// use and documents the gap. It introduces no new backend endpoint, no
// tenant/broker/symbol/rate defaults, and is never called by the create
// payload itself (see groupPayload.buildNewGroupPayload, which excludes
// symbolSettings).

export const GROUP_SYMBOLS_GET_ENDPOINT = '/GroupSymbolsGet';
export const GROUP_SYMBOLS_SAVE_ENDPOINT = '/GroupSymbolsSave';
export const GROUP_SYMBOL_OVERRIDES_GET_ENDPOINT = '/GroupSymbolOverridesGet';
export const GROUP_SYMBOL_OVERRIDES_SAVE_ENDPOINT = '/GroupSymbolOverridesSave';

export const NEW_GROUP_SYMBOL_TERMS_GAP =
  'The new-group wizard does not set per-symbol financial terms at create time. '
  + 'It sends only symbol name lists (symbolsAllowed/symbolsBlocked). '
  + 'Configure per-symbol spread, commission, swap, or trade terms after creation '
  + 'through the existing canonical GroupSymbolsSave collection endpoint. '
  + 'No new backend contract is introduced here.';

const SYMBOL_PATTERN = /^[A-Z0-9._#-]{1,20}$/;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const normalizeSymbol = (value) => String(value ?? '').trim().toUpperCase();

/**
 * Build a canonical POST /GroupSymbolsSave body for post-create use.
 * Only canonical keys are emitted; undefined terms are omitted so server
 * no-override defaults apply. Throws on a blank group or an invalid symbol.
 * No tenant, broker, symbol, rate, host, or ID defaults are hardcoded.
 */
export const buildGroupSymbolsSavePayload = (group, entries = []) => {
  const name = String(group ?? '').trim();
  if (!name) throw new Error('Group name is required.');
  if (!Array.isArray(entries)) throw new Error('Symbols must be an array.');
  const seen = new Set();
  const symbols = [];
  for (const entry of entries) {
    const symbol = normalizeSymbol(entry?.symbol);
    if (!SYMBOL_PATTERN.test(symbol)) {
      throw new Error(`Invalid symbol ${String(entry?.symbol ?? '')} (1-20 characters of A-Z 0-9 . _ # -).`);
    }
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    const item = { symbol };
    if (entry?.spread_markup !== undefined) {
      if (!isFiniteNumber(entry.spread_markup) || entry.spread_markup < 0 || !Number.isInteger(entry.spread_markup)) {
        throw new Error(`${symbol}: spread_markup must be a non-negative integer.`);
      }
      item.spread_markup = entry.spread_markup;
    }
    if (entry?.commission !== undefined) {
      if (!isFiniteNumber(entry.commission) || entry.commission < 0) {
        throw new Error(`${symbol}: commission must be a non-negative finite number.`);
      }
      item.commission = entry.commission;
    }
    if (entry?.swap_multiplier !== undefined) {
      if (!isFiniteNumber(entry.swap_multiplier) || entry.swap_multiplier < 0) {
        throw new Error(`${symbol}: swap_multiplier must be a non-negative finite number.`);
      }
      item.swap_multiplier = entry.swap_multiplier;
    }
    if (entry?.trade_allowed !== undefined) {
      if (typeof entry.trade_allowed !== 'boolean') throw new Error(`${symbol}: trade_allowed must be a boolean.`);
      item.trade_allowed = entry.trade_allowed;
    }
    symbols.push(item);
  }
  return { group: name, symbols };
};

/** True when a payload uses only the canonical GroupSymbolsSave keys. */
export const isCanonicalGroupSymbolsSavePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  if (String(payload.group ?? '').trim() === '') return false;
  if (!Array.isArray(payload.symbols)) return false;
  const allowed = new Set(['symbol', 'spread_markup', 'commission', 'swap_multiplier', 'trade_allowed']);
  return payload.symbols.every((item) =>
    item && typeof item === 'object'
    && typeof item.symbol === 'string' && SYMBOL_PATTERN.test(item.symbol)
    && Object.keys(item).every((key) => allowed.has(key)));
};
