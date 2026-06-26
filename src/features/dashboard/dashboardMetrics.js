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

export const normalizeAccountLimitStatus = (status = {}) => {
  if (!status || typeof status !== 'object') return null;

  const realAccounts = toFiniteNumber(status.real_account_count) ??
    toFiniteNumber(status.realAccountCount) ??
    toFiniteNumber(status.real_accounts) ??
    toFiniteNumber(status.realAccounts);
  const demoAccounts = toFiniteNumber(status.demo_account_count) ??
    toFiniteNumber(status.demoAccountCount) ??
    toFiniteNumber(status.demo_accounts) ??
    toFiniteNumber(status.demoAccounts);

  if (realAccounts === null && demoAccounts === null) return null;

  return {
    realAccounts,
    demoAccounts,
  };
};

export const pagedTotal = (page = {}) => {
  if (page?.total === undefined || page?.total === null || page?.total === '') return null;
  const total = Number(page?.total);
  return Number.isFinite(total) && total >= 0 ? total : null;
};

const hasCompleteRows = (page = {}) => (
  Array.isArray(page?.rows) && page.hasMore === false
);

export const buildDashboardFallbackMetrics = ({ accountLimitStatus, accountsPage, positionsPage } = {}) => {
  const accountLimit = normalizeAccountLimitStatus(accountLimitStatus);
  const accountsComplete = hasCompleteRows(accountsPage);
  const positionsComplete = hasCompleteRows(positionsPage);
  const rowMetrics = buildDashboardMetrics({
    accounts: accountsComplete ? accountsPage.rows : [],
    positions: positionsComplete ? positionsPage.rows : [],
  });

  const realAccounts =
    accountLimit?.realAccounts ??
    pagedTotal(accountsPage) ??
    (accountsComplete ? rowMetrics.realAccounts : null);
  const openPositions =
    pagedTotal(positionsPage) ??
    (positionsComplete ? rowMetrics.openPositions : null);
  const equity = accountsComplete ? rowMetrics.equity : null;

  if (realAccounts === null && openPositions === null && equity === null) return null;

  return {
    realAccounts,
    openPositions,
    equity,
    deposits24h: null,
  };
};
