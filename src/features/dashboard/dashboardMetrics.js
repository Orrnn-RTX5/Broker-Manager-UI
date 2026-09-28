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
  const demoAccounts = accountRows.filter(isDemoAccount);
  const equity = realAccounts.reduce((total, account) => {
    const value = getAccountEquity(account);
    return value === null ? total : total + value;
  }, 0);

  return {
    realAccounts: realAccounts.length,
    demoAccounts: demoAccounts.length,
    openPositions: positionRows.length,
    equity,
  };
};

export const normalizeDashboardSummary = (summary = {}) => {
  if (!summary || typeof summary !== 'object') return null;

  // ReportsSummaryEnvelope is one row per currency. Never add rows together:
  // doing so would mix unlike currencies. Prefer USD for this USD dashboard,
  // otherwise accept a single-currency response and retain its currency label.
  const reportRows = Array.isArray(summary.data) ? summary.data : [];
  const reportRow = reportRows.find((row) => String(row?.currency || '').toUpperCase() === 'USD') ||
    (reportRows.length === 1 ? reportRows[0] : null);

  if (reportRow) {
    const deposits24h = toFiniteNumber(reportRow.total_deposits);
    const rawWithdrawals = toFiniteNumber(reportRow.total_withdrawals);
    const withdrawals24h = rawWithdrawals === null ? null : Math.abs(rawWithdrawals);
    const activeAccounts = toFiniteNumber(reportRow.active_accounts);
    const totalAccounts = toFiniteNumber(reportRow.total_accounts);
    const totalDeals = toFiniteNumber(reportRow.total_deals);
    const totalVolume = toFiniteNumber(reportRow.total_volume);
    const totalProfit = toFiniteNumber(reportRow.total_profit);

    if ([deposits24h, withdrawals24h, activeAccounts, totalAccounts, totalDeals, totalVolume, totalProfit]
      .every((value) => value === null)) return null;

    return {
      realAccounts: null,
      demoAccounts: null,
      openPositions: null,
      equity: null,
      deposits24h,
      withdrawals24h,
      netFlow24h: deposits24h === null || withdrawals24h === null
        ? null
        : Math.round((deposits24h - withdrawals24h) * 100) / 100,
      activeAccounts,
      totalAccounts,
      totalDeals,
      totalVolume,
      totalProfit,
      reportCurrency: String(reportRow.currency || summary.meta?.currency || '').toUpperCase() || null,
      reportDate: reportRow.date || null,
      reportFinalized: reportRow.finalized ?? summary.meta?.finalized ?? null,
    };
  }

  const realAccounts = toFiniteNumber(summary.realAccounts) ??
    toFiniteNumber(summary.real_accounts) ??
    toFiniteNumber(summary.realAccountCount) ??
    toFiniteNumber(summary.account_count);
  const demoAccounts = toFiniteNumber(summary.demoAccounts) ??
    toFiniteNumber(summary.demo_accounts) ??
    toFiniteNumber(summary.demoAccountCount);
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

  const withdrawals24h = toFiniteNumber(summary.withdrawals24h) ??
    toFiniteNumber(summary.withdrawals_24h);

  if (realAccounts === null && demoAccounts === null && openPositions === null && equity === null && deposits24h === null && withdrawals24h === null) {
    return null;
  }

  return {
    realAccounts,
    demoAccounts,
    openPositions,
    equity,
    deposits24h,
    withdrawals24h,
    netFlow24h: deposits24h === null || withdrawals24h === null
      ? null
      : Math.round((deposits24h - Math.abs(withdrawals24h)) * 100) / 100,
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
  Array.isArray(page?.rows)
  && page.hasMore === false
  && (pagedTotal(page) === null || pagedTotal(page) === page.rows.length)
);

export const buildDashboardFallbackMetrics = ({ accountLimitStatus, accountsPage, positionsPage } = {}) => {
  const accountLimit = normalizeAccountLimitStatus(accountLimitStatus);
  const accountsComplete = hasCompleteRows(accountsPage);
  const positionsComplete = hasCompleteRows(positionsPage);
  const rowMetrics = buildDashboardMetrics({
    accounts: accountsComplete ? accountsPage.rows : [],
    positions: positionsComplete ? positionsPage.rows : [],
  });
  const hasCompleteEquity = accountsComplete
    && accountsPage.rows.filter(isRealAccount).every((account) => getAccountEquity(account) !== null);

  const realAccounts =
    accountLimit?.realAccounts ??
    (accountsComplete ? rowMetrics.realAccounts : null);
  const demoAccounts =
    accountLimit?.demoAccounts ??
    (accountsComplete ? rowMetrics.demoAccounts : null);
  const openPositions =
    pagedTotal(positionsPage) ??
    (positionsComplete ? rowMetrics.openPositions : null);
  const equity = hasCompleteEquity ? rowMetrics.equity : null;

  if (realAccounts === null && demoAccounts === null && openPositions === null && equity === null) return null;

  return {
    realAccounts,
    demoAccounts,
    openPositions,
    equity,
    deposits24h: null,
    withdrawals24h: null,
    netFlow24h: null,
  };
};
