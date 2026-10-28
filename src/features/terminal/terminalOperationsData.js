// Position volumes are lots, except the documented extended-volume fields.
// Missing financial values remain unavailable; never sum different currencies.
export const readNumber = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value == null || typeof value === 'boolean' || String(value).trim() === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
};

export const readText = (row, keys) => {
  for (const key of keys) {
    if (row?.[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  }
  return '';
};
export const accountCurrency = (row) => readText(row, ['currency', 'Currency', 'accountCurrency', 'AccountCurrency']).toUpperCase();
export const positionLots = (row) => readNumber(row, ['lots', 'volume_lots', 'volume'])
  ?? (readNumber(row, ['volumeExt', 'Volume']) === null ? null : readNumber(row, ['volumeExt', 'Volume']) / 10000);
export const positionSide = (row) => {
  const side = readText(row, ['type', 'side', 'action', 'Action', 'Type', 'cmd', 'Cmd']).toLowerCase();
  if (['buy', 'deal_buy', '0'].includes(side)) return 'buy';
  if (['sell', 'deal_sell', '1'].includes(side)) return 'sell';
  return null;
};
const loginOf = (row) => readText(row, ['login', 'Login', 'account_login', 'accountLogin']);
const addKnown = (total, value) => total === null || value === null ? null : total + value;
const uniquePositions = (positions) => {
  const seen = new Set();
  return positions.filter((row) => {
    const ticket = readText(row, ['position', 'positionTicket', 'position_ticket', 'Position', 'ticket', 'Ticket']);
    if (!ticket || ticket === '0') return false;
    const key = `${loginOf(row)}:${ticket}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function buildAccountSummary({ accounts = [], positions = [], positionsLoaded = true } = {}) {
  const byLogin = new Map();
  const makeRow = (login, account = {}) => {
    const equity = readNumber(account, ['equity', 'Equity']);
    const margin = readNumber(account, ['margin', 'Margin', 'used_margin']);
    const suppliedLevel = readNumber(account, ['marginLevel', 'MarginLevel', 'margin_level']);
    return { login, name: readText(account, ['Name', 'name', 'accountName', 'account_name']),
      group: readText(account, ['group', 'Group', 'accountGroup']), currency: accountCurrency(account),
      balance: readNumber(account, ['balance', 'Balance']), equity, margin,
      marginFree: readNumber(account, ['marginFree', 'MarginFree', 'free_margin', 'freeMargin']),
      marginLevel: margin > 0 ? (suppliedLevel === null || suppliedLevel === 0 ? equity === null ? null : equity / margin * 100 : suppliedLevel) : null,
      positions: positionsLoaded ? 0 : null, lots: positionsLoaded ? 0 : null, profit: positionsLoaded ? 0 : null };
  };
  for (const account of accounts) {
    const login = loginOf(account);
    if (login) byLogin.set(login, makeRow(login, account));
  }
  if (positionsLoaded) for (const position of uniquePositions(positions)) {
    const login = loginOf(position);
    if (!login) continue;
    const row = byLogin.get(login) || makeRow(login, position);
    row.positions += 1;
    row.lots = addKnown(row.lots, positionLots(position));
    row.profit = addKnown(row.profit, readNumber(position, ['profit', 'Profit']));
    byLogin.set(login, row);
  }
  return [...byLogin.values()].sort((a, b) => a.login.localeCompare(b.login, undefined, { numeric: true }));
}

export function buildSymbolExposure(positions = [], accounts = []) {
  const accountCurrencies = new Map(accounts.map((row) => [loginOf(row), accountCurrency(row)]));
  const symbols = new Map();
  for (const position of uniquePositions(positions)) {
    const symbol = readText(position, ['symbol', 'Symbol']);
    if (!symbol) continue;
    const row = symbols.get(symbol) || { symbol, positions: 0, logins: new Set(), buyLots: 0, sellLots: 0,
      sidesComplete: true, profit: 0, currencies: new Set() };
    const login = loginOf(position);
    const side = positionSide(position);
    const lots = positionLots(position);
    row.positions += 1;
    if (login) row.logins.add(login);
    if (!side || lots === null || lots < 0) row.sidesComplete = false;
    else if (side === 'buy') row.buyLots += lots;
    else row.sellLots += lots;
    row.profit = addKnown(row.profit, readNumber(position, ['profit', 'Profit']));
    row.currencies.add(accountCurrencies.get(login) || accountCurrency(position));
    symbols.set(symbol, row);
  }
  return [...symbols.values()].map((row) => {
    const currency = row.currencies.size === 1 ? [...row.currencies][0] : '';
    return { symbol: row.symbol, positions: row.positions, accounts: row.logins.size,
      buyLots: row.sidesComplete ? row.buyLots : null, sellLots: row.sidesComplete ? row.sellLots : null,
      netLots: row.sidesComplete ? row.buyLots - row.sellLots : null,
      profit: currency ? row.profit : null, currency, mixedCurrencies: row.currencies.size > 1 };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

// Group thresholds require every page, not the Navigator's first page.
export async function collectTerminalGroups(fetchPage, { signal } = {}) {
  const groups = new Map();
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    signal?.throwIfAborted();
    const result = await fetchPage({ limit: 100, offset, search: '', sort_by: 'name', sort_dir: 'asc' }, { signal });
    if (!Array.isArray(result?.rows)) throw new Error('Group settings are unavailable.');
    const before = groups.size;
    for (const row of result.rows) {
      const name = readText(row, ['name', 'Name', 'group', 'Group']); // exact: group names are case-sensitive
      if (name) groups.set(name, row);
    }
    if (!result.hasMore) return [...groups.values()];
    const next = result.nextOffset ?? offset + result.rows.length;
    if (next <= offset || groups.size === before) throw new Error('Group settings are incomplete.');
    offset = next;
  }
  throw new Error('Group settings are incomplete.');
}
