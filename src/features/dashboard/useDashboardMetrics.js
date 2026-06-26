import { useQuery } from '@tanstack/react-query';
import {
  getAccountLimitStatus,
  getDashboardSummary,
  getPositionsPage,
  getTradingAccountsPage,
} from '../../services/api';
import { buildDashboardFallbackMetrics, normalizeDashboardSummary } from './dashboardMetrics';

const DASHBOARD_SNAPSHOT_LIMIT = 100_000;

const getErrorMessage = (error) => (
  error instanceof Error ? error.message : String(error || 'Request failed')
);

const hasAnyMetric = (metrics) => (
  Boolean(metrics) &&
  [metrics.realAccounts, metrics.openPositions, metrics.equity, metrics.deposits24h]
    .some((value) => value !== null && value !== undefined)
);

const settleDashboardPage = async (key, request) => {
  try {
    const data = await request();
    return { key, ok: true, data, error: null };
  } catch (error) {
    return { key, ok: false, data: null, error: getErrorMessage(error) };
  }
};

const loadPagedFallbackMetrics = async (summaryError, signal) => {
  const [accountLimit, accounts, positions] = await Promise.all([
    settleDashboardPage('accountLimit', () => getAccountLimitStatus({ signal })),
    settleDashboardPage('accounts', () => getTradingAccountsPage({
      limit: DASHBOARD_SNAPSHOT_LIMIT,
      offset: 0,
    }, { signal })),
    settleDashboardPage('positions', () => getPositionsPage({
      limit: DASHBOARD_SNAPSHOT_LIMIT,
      offset: 0,
    }, { signal })),
  ]);

  const metrics = buildDashboardFallbackMetrics({
    accountLimitStatus: accountLimit.data,
    accountsPage: accounts.data,
    positionsPage: positions.data,
  });
  const summary = { key: 'summary', ok: false, data: null, error: getErrorMessage(summaryError) };
  const fallbackErrors = [accountLimit, accounts, positions].filter((source) => !source.ok);

  return {
    metrics,
    sourceMode: 'paged-fallback',
    sources: {
      summary,
      accountLimit,
      accounts,
      positions,
    },
    errors: hasAnyMetric(metrics) ? fallbackErrors : [summary, ...fallbackErrors],
    asOf: Date.now(),
  };
};

const loadDashboardMetrics = async ({ signal } = {}) => {
  try {
    const summary = await getDashboardSummary({ signal });
    const metrics = normalizeDashboardSummary(summary);
    if (!metrics) throw new Error('Dashboard summary response did not include supported KPI fields');

    return {
      metrics,
      sourceMode: 'summary',
      sources: {
        summary: { key: 'summary', ok: true, data: summary, error: null },
      },
      errors: [],
      asOf: Date.now(),
    };
  } catch (error) {
    return loadPagedFallbackMetrics(error, signal);
  }
};

export const useDashboardMetrics = () => useQuery({
  queryKey: ['dashboard', 'metrics', 'summary'],
  queryFn: loadDashboardMetrics,
  staleTime: 15_000,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
});

export default useDashboardMetrics;
