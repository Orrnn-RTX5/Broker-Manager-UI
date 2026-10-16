import { getDataAccessScope } from '../../services/dataAccessScope.js';
export const TRADE_COLUMNS = [
  'Ticket', 'Login', 'User Name', 'Email', 'Symbol', 'Action', 'Lots',
  'Open', 'Current', 'S/L', 'T/P', 'Storage', 'Profit / Loss', 'Comment',
];

export const TERMINAL_POSITIONS_QUERY_KEY = Object.freeze(['terminal-positions']);
export const TERMINAL_POSITIONS_PARAMS = Object.freeze({ sort_by: 'position', sort_dir: 'desc' });
export const TERMINAL_STORAGE_KEY = 'rtx5:terminal-positions:v2';
const LEGACY_TERMINAL_STORAGE_KEY = 'rtx5:terminal-positions:v1';
const TERMINAL_STORAGE_MAX_AGE_MS = 60_000;

let memoryTerminalCache = null;

const isRecent = (timestamp) => Number.isFinite(timestamp)
  && timestamp > 0
  && Date.now() >= timestamp
  && Date.now() - timestamp <= TERMINAL_STORAGE_MAX_AGE_MS;

const isCompleteTrade = (row) => String(row?.position ?? '').trim() !== ''
  && String(row.position) !== '0'
  && String(row.login ?? '').trim() !== ''
  && String(row.login) !== '0'
  && String(row.symbol || '').trim() !== ''
  && Number(row.volume) > 0
  && Number(row.priceOpen) > 0;

const clearLegacyStorage = () => {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(LEGACY_TERMINAL_STORAGE_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_TERMINAL_STORAGE_KEY);
  } catch {
    // Storage may be unavailable.
  }
};

export const readStoredTerminalPage = (scope = getDataAccessScope()) => {
  clearLegacyStorage();
  if (!scope) return undefined;
  const cacheScope = `${scope}|${getDataAccessScope()}`;
  if (memoryTerminalCache?.scope === cacheScope && isRecent(memoryTerminalCache.timestamp)) return memoryTerminalCache;
  memoryTerminalCache = null;
  try {
    if (typeof sessionStorage === 'undefined') return undefined;
    const raw = sessionStorage.getItem(TERMINAL_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed?.scope === cacheScope && isRecent(Number(parsed.timestamp))
      && Array.isArray(parsed.rows) && parsed.rows.every(isCompleteTrade)) {
      memoryTerminalCache = parsed;
      return parsed;
    }
    sessionStorage.removeItem(TERMINAL_STORAGE_KEY);
  } catch {
    // Ignore storage parse errors
  }
  return undefined;
};

export const writeStoredTerminalPage = (page, scope = getDataAccessScope()) => {
  clearLegacyStorage();
  try {
    if (!scope || !page || !Array.isArray(page.rows) || !page.rows.every(isCompleteTrade)) return;
    const timestamp = Number(page.timestamp) || Date.now();
    if (!isRecent(timestamp)) return;
    const cacheScope = `${scope}|${getDataAccessScope()}`;
    const stored = {
      rows: page.rows,
      total: page.total ?? page.rows.length,
      hasMore: Boolean(page.hasMore),
      timestamp,
      scope: cacheScope,
    };
    memoryTerminalCache = stored;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TERMINAL_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or private mode
  }
};

export const clearStoredTerminalPage = () => {
  memoryTerminalCache = null;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TERMINAL_STORAGE_KEY);
  } catch {
    // ignore
  }
  clearLegacyStorage();
};

const value = (input) => input === undefined || input === null || input === '' ? '—' : input;
const decimal = (input, digits) => {
  if (input === undefined || input === null || input === '' || !Number.isFinite(Number(input))) return '—';
  return Number(input).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const fixedPrice = (input) => {
  if (input === undefined || input === null || String(input).trim() === '') return '—';
  const price = Number(input);
  return Number.isFinite(price) ? price.toFixed(9) : '—';
};

// Only the Open and Current cells use a fixed nine-decimal display. The source
// price remains numeric for calculations and live updates.
export const tradeCells = (row) => [
  value(row.position), value(row.login), value(row.name), value(row.email),
  value(row.symbol), row.type ? row.type.toUpperCase() : '—', decimal(row.volume, 2),
  fixedPrice(row.priceOpen), fixedPrice(row.priceCurrent), value(row.priceSl), value(row.priceTp),
  decimal(row.swap, 2), decimal(row.profit, 2), value(row.comment),
];
