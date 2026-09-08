export const TRADE_COLUMNS = [
  'Ticket', 'Login', 'User Name', 'Email', 'Symbol', 'Action', 'Lots',
  'Open', 'Current', 'S/L', 'T/P', 'Storage', 'Profit', 'Comment',
];

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
