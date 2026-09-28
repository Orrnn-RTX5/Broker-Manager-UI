import { useQuery, useQueryClient } from '@tanstack/react-query';
import usePermissions from '../../hooks/usePermissions';
import {
  getAccountLimitStatus,
  getDashboardSummary,
  fetchAllPositionsDataset,
} from '../../services/api';
import { fetchAllSidebarAccounts, getSidebarAccountsQueryOptions } from '../../services/sidebarAccounts';
import {
  buildDashboardFallbackMetrics,
  normalizeAccountLimitStatus,
  normalizeDashboardSummary,
} from './dashboardMetrics';
import authService from '../../services/authService';
import { PERMISSIONS } from '../../utils/permissions';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';

// The account and position cards need complete snapshots when the manager API
// does not provide aggregate totals. Share the Accounts query and positions
// dataset with the rest of the workspace instead of counting a sample page.
const DASHBOARD_AGGREGATE_STALE_MS = 30_000;
export const DASHBOARD_ACCOUNT_LIMITS_QUERY_KEY = ['dashboard', 'metrics', 'account-limits'];
export const DASHBOARD_SUMMARY_QUERY_KEY = ['dashboard', 'metrics', 'summary'];

const DASHBOARD_METRICS_CACHE_KEY = 'rtx5_dashboard_metrics_cache_v3';
const DASHBOARD_ACCOUNT_LIMITS_CACHE_KEY = 'rtx5_dashboard_account_limits_cache_v1';

const getDashboardMetricsScope = () => {
  const claims = authService.getSessionClaims();
  return buildPermissionSessionFingerprint({
    token: authService.getSessionScopeKey(),
    login: claims.login,
    brokerId: claims.brokerId,
  });
};

const getDashboardMetricsCacheKey = (includePositions) =>
  `${DASHBOARD_METRICS_CACHE_KEY}:${getDashboardMetricsScope()}:${includePositions ? 'positions' : 'no-positions'}`;

const getInitialCachedDashboardMetrics = (includePositions) => {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(getDashboardMetricsCacheKey(includePositions)) : null;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.metrics) return parsed;
  } catch {
    // Ignore storage parse error
  }
  return undefined;
};

const saveCachedDashboardMetrics = (data, includePositions) => {
  if (!data || !data.metrics) return;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      // The live sources now include complete account and position books. Only
      // persist the small KPI snapshot needed for the next dashboard paint.
      window.sessionStorage.setItem(getDashboardMetricsCacheKey(includePositions), JSON.stringify({
        metrics: data.metrics,
        asOf: data.asOf,
      }));
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

const sourceStatus = ({ key, ok, error }) => ({ key, ok, error });

const isCompleteAccountPage = (page) => (
  Array.isArray(page?.rows)
  && page.hasMore === false
  && (page.total == null || Number(page.total) === page.rows.length)
);

const loadCompleteDashboardAccounts = async (signal, queryClient) => {
  let page;
  if (queryClient) {
    const options = getSidebarAccountsQueryOptions('');
    const cached = queryClient.getQueryData(options.queryKey);
    page = await queryClient.fetchQuery({
      ...options,
      staleTime: isCompleteAccountPage(cached) ? DASHBOARD_AGGREGATE_STALE_MS : 0,
    });
  } else {
    page = await fetchAllSidebarAccounts({ signal });
  }
  if (!isCompleteAccountPage(page)) throw new Error('The complete account list is unavailable.');
  return page;
};

const loadCompleteDashboardPositions = async () => {
  const rows = await fetchAllPositionsDataset();
  if (!Array.isArray(rows)) throw new Error('The complete positions list is unavailable.');
  return { rows, total: rows.length, hasMore: false };
};

const loadCompleteFallbackMetrics = async (summaryError, signal, includePositions, queryClient) => {
  const [accountLimit, accounts, positions] = await Promise.all([
    settleDashboardPage('accountLimit', () => getAccountLimitStatus({ signal })),
    settleDashboardPage('accounts', () => loadCompleteDashboardAccounts(signal, queryClient)),
    includePositions ? settleDashboardPage('positions', loadCompleteDashboardPositions) : null,
  ]);

  const metrics = buildDashboardFallbackMetrics({
    accountLimitStatus: accountLimit.data,
    accountsPage: accounts.data,
    positionsPage: positions?.data,
  });
  const summary = { key: 'summary', ok: false, data: null, error: getErrorMessage(summaryError) };
  const fallbackErrors = [accountLimit, accounts, positions].filter((source) => source && !source.ok);

  const result = {
    metrics,
    sourceMode: 'complete-fallback',
    sources: {
      summary,
      accountLimit: sourceStatus(accountLimit),
      accounts: sourceStatus(accounts),
      ...(positions ? { positions: sourceStatus(positions) } : {}),
    },
    errors: hasAnyMetric(metrics) ? fallbackErrors : [summary, ...fallbackErrors],
    asOf: Date.now(),
  };

  if (result.metrics && hasAnyMetric(result.metrics)) {
    saveCachedDashboardMetrics(result, includePositions);
  }

  return result;
};

export const loadDashboardMetrics = async ({ signal, reportDate, summaryOnly = false, includePositions = false, queryClient } = {}) => {
  // Start independent account/position requests alongside the report request.
  // Keep the settled promise reusable if the report endpoint is unavailable.
  const supportingRequest = summaryOnly ? null : loadCompleteFallbackMetrics(null, signal, includePositions, queryClient);
  try {
    const summary = await getDashboardSummary({ signal, date: reportDate });
    const normalizedReportMetrics = normalizeDashboardSummary(summary);
    if (!normalizedReportMetrics) throw new Error('Daily summary response did not include supported KPI fields');
    const reportMetrics = includePositions
      ? normalizedReportMetrics
      : { ...normalizedReportMetrics, openPositions: null };

    if (summaryOnly) {
      return {
        metrics: reportMetrics,
        sourceMode: 'reports-summary',
        sources: { summary: { key: 'summary', ok: true, data: summary, error: null } },
        errors: [],
        asOf: Date.now(),
      };
    }

    // The report owns cash-flow/activity totals; complete manager snapshots
    // provide the account, equity, and position KPIs that the report omits.
    const supporting = await supportingRequest;
    const metrics = { ...(supporting.metrics || {}) };
    Object.entries(reportMetrics).forEach(([key, value]) => {
      if ((key === 'equity' || key === 'openPositions') && metrics[key] != null) return;
      if (value !== null && value !== undefined) metrics[key] = value;
    });

    const result = {
      metrics,
      sourceMode: 'reports-with-complete-support',
      sources: {
        ...supporting.sources,
        summary: { key: 'summary', ok: true, data: summary, error: null },
      },
      errors: supporting.errors || [],
      asOf: Date.now(),
    };
    saveCachedDashboardMetrics(result, includePositions);
    return result;
  } catch (error) {
    if (summaryOnly) throw error;
    const supporting = await supportingRequest;
    const summary = { key: 'summary', ok: false, data: null, error: getErrorMessage(error) };
    const fallbackErrors = Object.values(supporting.sources).filter((source) => source.key !== 'summary' && !source.ok);
    return {
      ...supporting,
      sources: { ...supporting.sources, summary },
      errors: hasAnyMetric(supporting.metrics) ? fallbackErrors : [summary, ...fallbackErrors],
    };
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

export const useDashboardMetrics = ({ reportDate, summaryOnly = false } = {}) => {
  const queryClient = useQueryClient();
  const { resolved, hasPermission } = usePermissions();
  const includePositions = resolved && hasPermission(PERMISSIONS.VIEW_POSITIONS);
  const scope = getDashboardMetricsScope();
  return useQuery({
    queryKey: [...DASHBOARD_SUMMARY_QUERY_KEY, scope, reportDate || 'latest', summaryOnly ? 'summary-only' : 'full', includePositions ? 'positions' : 'no-positions'],
    queryFn: ({ signal }) => loadDashboardMetrics({ signal, reportDate, summaryOnly, includePositions, queryClient }),
    enabled: resolved,
    initialData: reportDate ? undefined : () => getInitialCachedDashboardMetrics(includePositions),
    placeholderData: reportDate ? undefined : () => getInitialCachedDashboardMetrics(includePositions),
    staleTime: 60_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
};

export default useDashboardMetrics;
