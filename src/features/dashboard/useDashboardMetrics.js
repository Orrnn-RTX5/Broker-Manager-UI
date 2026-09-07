import { useQuery } from '@tanstack/react-query';
import {
  getAccountLimitStatus,
  getDashboardSummary,
  getPositionsPage,
  getTradingAccountsPage,
} from '../../services/api';
import {
  buildDashboardFallbackMetrics,
  normalizeAccountLimitStatus,
  normalizeDashboardSummary,
} from './dashboardMetrics';

// The dashboard must never download an entire account/position history just to
// calculate a card. If an endpoint provides a total, one row is enough to read
// it; otherwise the KPI stays unavailable until a dedicated aggregate exists.
const DASHBOARD_FALLBACK_PAGE_LIMIT = 1;
export const DASHBOARD_ACCOUNT_LIMITS_QUERY_KEY = ['dashboard', 'metrics', 'account-limits'];
export const DASHBOARD_SUMMARY_QUERY_KEY = ['dashboard', 'metrics', 'summary'];

const DASHBOARD_METRICS_CACHE_KEY = 'rtx5_dashboard_metrics_cache_v1';
const DASHBOARD_ACCOUNT_LIMITS_CACHE_KEY = 'rtx5_dashboard_account_limits_cache_v1';

const getInitialCachedDashboardMetrics = () => {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(DASHBOARD_METRICS_CACHE_KEY) : null;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.metrics) return parsed;
  } catch {
    // Ignore storage parse error
  }
  return undefined;
};

const saveCachedDashboardMetrics = (data) => {
  if (!data || !data.metrics) return;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(DASHBOARD_METRICS_CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // Storage full or private mode
  }
};

const getInitialCachedAccountLimits = () => {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(DASHBOARD_ACCOUNT_LIMITS_CACHE_KEY) : null;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.metrics) return parsed;
  } catch {
    // Ignore storage parse error
  }
  return undefined;
};

const saveCachedAccountLimits = (data) => {
  if (!data || !data.metrics) return;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(DASHBOARD_ACCOUNT_LIMITS_CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // Storage full or private mode
  }
};

const getErrorMessage = (error) => (
  error instanceof Error ? error.message : String(error || 'Request failed')
);

const hasAnyMetric = (metrics) => (
  Boolean(metrics) &&
  [
    metrics.realAccounts,
    metrics.demoAccounts,
    metrics.openPositions,
    metrics.equity,
    metrics.deposits24h,
    metrics.withdrawals24h,
    metrics.activeAccounts,
    metrics.totalDeals,
    metrics.totalVolume,
  ]
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
      limit: DASHBOARD_FALLBACK_PAGE_LIMIT,
      offset: 0,
    }, { signal })),
    settleDashboardPage('positions', () => getPositionsPage({
      limit: DASHBOARD_FALLBACK_PAGE_LIMIT,
      offset: 0,
    }, { signal, stream: true })),
  ]);

  const metrics = buildDashboardFallbackMetrics({
    accountLimitStatus: accountLimit.data,
    accountsPage: accounts.data,
    positionsPage: positions.data,
  });
  const summary = { key: 'summary', ok: false, data: null, error: getErrorMessage(summaryError) };
  const fallbackErrors = [accountLimit, accounts, positions].filter((source) => !source.ok);

  const result = {
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

  if (result.metrics && hasAnyMetric(result.metrics)) {
    saveCachedDashboardMetrics(result);
  }

  return result;
};

export const loadDashboardMetrics = async ({ signal, reportDate, summaryOnly = false } = {}) => {
  try {
    const summary = await getDashboardSummary({ signal, date: reportDate });
    const reportMetrics = normalizeDashboardSummary(summary);
    if (!reportMetrics) throw new Error('Daily summary response did not include supported KPI fields');

    if (summaryOnly) {
      return {
        metrics: reportMetrics,
        sourceMode: 'reports-summary',
        sources: { summary: { key: 'summary', ok: true, data: summary, error: null } },
        errors: [],
        asOf: Date.now(),
      };
    }

    // The report owns cash-flow/activity totals; the paged manager endpoints
    // still provide account, equity, and position KPIs that the report omits.
    const supporting = await loadPagedFallbackMetrics(null, signal);
    const metrics = { ...(supporting.metrics || {}) };
    Object.entries(reportMetrics).forEach(([key, value]) => {
      if (value !== null && value !== undefined) metrics[key] = value;
    });

    const result = {
      metrics,
      sourceMode: 'reports-with-paged-support',
      sources: {
        ...supporting.sources,
        summary: { key: 'summary', ok: true, data: summary, error: null },
      },
      errors: supporting.errors || [],
      asOf: Date.now(),
    };
    saveCachedDashboardMetrics(result);
    return result;
  } catch (error) {
    if (summaryOnly) throw error;
    return loadPagedFallbackMetrics(error, signal);
  }
};

export const loadDashboardAccountLimits = async ({ signal } = {}) => {
  const status = await getAccountLimitStatus({ signal });
  const metrics = normalizeAccountLimitStatus(status);

  if (!metrics) {
    throw new Error('AccountLimitStatus response did not include account totals');
  }

  const result = {
    metrics,
    asOf: Date.now(),
  };
  saveCachedAccountLimits(result);
  return result;
};

export const useDashboardAccountLimits = () => useQuery({
  queryKey: DASHBOARD_ACCOUNT_LIMITS_QUERY_KEY,
  queryFn: loadDashboardAccountLimits,
  initialData: getInitialCachedAccountLimits,
  placeholderData: (previousData) => previousData || getInitialCachedAccountLimits(),
  staleTime: 60_000,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
});

export const useDashboardMetrics = ({ reportDate, summaryOnly = false } = {}) => useQuery({
  queryKey: reportDate
    ? [...DASHBOARD_SUMMARY_QUERY_KEY, reportDate, summaryOnly ? 'summary-only' : 'full']
    : DASHBOARD_SUMMARY_QUERY_KEY,
  queryFn: ({ signal }) => loadDashboardMetrics({ signal, reportDate, summaryOnly }),
  initialData: reportDate ? undefined : getInitialCachedDashboardMetrics,
  placeholderData: reportDate
    ? undefined
    : (previousData) => previousData || getInitialCachedDashboardMetrics(),
  staleTime: 60_000,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
});

export default useDashboardMetrics;
