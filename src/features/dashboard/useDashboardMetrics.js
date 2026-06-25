import { useQuery } from '@tanstack/react-query';
import { getDashboardSummary, getPositionsPage, getTradingAccountsPage } from '../../services/api';
import { buildDashboardFallbackMetrics, normalizeDashboardSummary } from './dashboardMetrics';

const getErrorMessage = (error) => (
  error instanceof Error ? error.message : String(error || 'Request failed')
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
  const [accounts, positions] = await Promise.all([
    settleDashboardPage('accounts', () => getTradingAccountsPage({
      limit: 1,
      offset: 0,
      sort_by: 'login',
      sort_dir: 'asc',
    }, { signal })),
    settleDashboardPage('positions', () => getPositionsPage({
      limit: 1,
      offset: 0,
      sort_by: 'position',
      sort_dir: 'desc',
    }, { signal })),
  ]);

  const metrics = buildDashboardFallbackMetrics({
    accountsPage: accounts.data,
    positionsPage: positions.data,
  });

  return {
    metrics,
    sourceMode: 'paged-fallback',
    sources: {
      summary: { key: 'summary', ok: false, data: null, error: getErrorMessage(summaryError) },
      accounts,
      positions,
    },
    errors: [accounts, positions].filter((source) => !source.ok),
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
