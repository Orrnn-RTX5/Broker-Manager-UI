export const TRADE_COLUMNS = [
  'Ticket', 'Login', 'User Name', 'Email', 'Symbol', 'Action', 'Lots',
  'Open', 'Current', 'S/L', 'T/P', 'Storage', 'Profit', 'Comment',
];

export const TERMINAL_POSITIONS_QUERY_KEY = Object.freeze(['terminal-positions']);
export const TERMINAL_POSITIONS_PARAMS = Object.freeze({ sort_by: 'position', sort_dir: 'desc' });
export const TERMINAL_STORAGE_KEY = 'rtx5:terminal-positions:v1';

let memoryTerminalCache = null;

export const readStoredTerminalPage = () => {
  if (memoryTerminalCache) return memoryTerminalCache;
  try {
    if (typeof sessionStorage === 'undefined') return undefined;
    const raw = sessionStorage.getItem(TERMINAL_STORAGE_KEY)
      || (typeof localStorage !== 'undefined' ? localStorage.getItem(TERMINAL_STORAGE_KEY) : null);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows)) {
      memoryTerminalCache = parsed;
      return parsed;
    }
  } catch {
    // Ignore storage parse errors
  }
  return undefined;
};

export const writeStoredTerminalPage = (page) => {
  try {
    if (!page || !Array.isArray(page.rows)) return;
    memoryTerminalCache = page;
    const payload = JSON.stringify({
      rows: page.rows,
      total: page.total ?? page.rows.length,
      hasMore: Boolean(page.hasMore),
      timestamp: Date.now(),
    });
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TERMINAL_STORAGE_KEY, payload);
    if (typeof localStorage !== 'undefined') localStorage.setItem(TERMINAL_STORAGE_KEY, payload);
  } catch {
    // Storage full or private mode
  }
};

export const clearStoredTerminalPage = () => {
  memoryTerminalCache = null;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TERMINAL_STORAGE_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(TERMINAL_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const value = (input) => input === undefined || input === null || input === '' ? '—' : input;
const decimal = (input, digits) => {
  if (input === undefined || input === null || input === '' || !Number.isFinite(Number(input))) return '—';
  return Number(input).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

// Preserve server price precision; storage is the normalized swap/rollover value.
export const tradeCells = (row) => [
  value(row.position), value(row.login), value(row.name), value(row.email),
  value(row.symbol), row.type ? row.type.toUpperCase() : '—', decimal(row.volume, 2),
  value(row.priceOpen), value(row.priceCurrent), value(row.priceSl), value(row.priceTp),
  decimal(row.swap, 2), decimal(row.profit, 2), value(row.comment),
];
