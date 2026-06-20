const DEMO_GROUP_PATTERN = /demo/i;

const asArray = (value) => (Array.isArray(value) ? value : []);

export const toFiniteNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().replace(/[\s,]/g, '');
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isDemoAccount = (account = {}) => {
  const group = String(account.group ?? account.Group ?? account.accountGroup ?? account.AccountGroup ?? '');
  return DEMO_GROUP_PATTERN.test(group);
};

export const isRealAccount = (account = {}) => !isDemoAccount(account);

const getAccountEquity = (account = {}) => (
  toFiniteNumber(account.equity) ??
  toFiniteNumber(account.Equity)
);

export const buildDashboardMetrics = ({ accounts = [], positions = [] } = {}) => {
  const accountRows = asArray(accounts);
  const positionRows = asArray(positions);
  const realAccounts = accountRows.filter(isRealAccount);
  const equity = realAccounts.reduce((total, account) => {
    const value = getAccountEquity(account);
    return value === null ? total : total + value;
  }, 0);

  return {
    realAccounts: realAccounts.length,
    openPositions: positionRows.length,
    equity,
  };
};
