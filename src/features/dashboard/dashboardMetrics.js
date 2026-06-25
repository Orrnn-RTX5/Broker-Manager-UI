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

export const normalizeDashboardSummary = (summary = {}) => {
  if (!summary || typeof summary !== 'object') return null;

  const realAccounts = toFiniteNumber(summary.realAccounts) ??
    toFiniteNumber(summary.real_accounts) ??
    toFiniteNumber(summary.realAccountCount) ??
    toFiniteNumber(summary.account_count);
  const openPositions = toFiniteNumber(summary.openPositions) ??
    toFiniteNumber(summary.open_positions) ??
    toFiniteNumber(summary.openPositionCount) ??
    toFiniteNumber(summary.position_count);
  const equity = toFiniteNumber(summary.equity) ??
    toFiniteNumber(summary.totalEquity) ??
    toFiniteNumber(summary.total_equity);
  const deposits24h = toFiniteNumber(summary.deposits24h) ??
    toFiniteNumber(summary.deposits_24h) ??
    toFiniteNumber(summary.cashflow24h);

  if (realAccounts === null && openPositions === null && equity === null && deposits24h === null) {
    return null;
  }

  return {
    realAccounts,
    openPositions,
    equity,
    deposits24h,
  };
};

export const pagedTotal = (page = {}) => {
  if (page?.total === undefined || page?.total === null || page?.total === '') return null;
  const total = Number(page?.total);
  return Number.isFinite(total) && total >= 0 ? total : null;
};

export const buildDashboardFallbackMetrics = ({ accountsPage, positionsPage } = {}) => {
  const realAccounts = pagedTotal(accountsPage);
  const openPositions = pagedTotal(positionsPage);

  if (realAccounts === null && openPositions === null) return null;

  return {
    realAccounts,
    openPositions,
    equity: null,
    deposits24h: null,
  };
};
