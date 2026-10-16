import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import authService from '../../services/authService';
import { getBrokerDealsPage } from '../../services/api';
import { getSidebarAccountsQueryOptions } from '../../services/sidebarAccounts';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';
import usePermissions from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';
import { isRealAccount } from './dashboardMetrics';
import {
  appendEquityObservation,
  buildActivitySeries,
  buildSymbolActivity,
} from './dashboardActivityData';
import {
  createActivitySnapshot,
  readActivitySnapshot,
  writeActivitySnapshot,
} from './dashboardActivitySnapshot';
import { collectDashboardDealPages } from './dashboardDealPages';

const EQUITY_HISTORY_KEY = 'rtx5_dashboard_equity_observations_v1';
// The manager API exposes deal history and current account equity here, but no
// verified broker-wide equity history. Keep only genuine successful readings.
const DEAL_PAGE_SIZE = 1_000;
const REFRESH_MS = 60_000;

const getScope = () => {
  const claims = authService.getSessionClaims();
  return buildPermissionSessionFingerprint({
    token: authService.getSessionScopeKey(),
    login: claims.login,
    brokerId: claims.brokerId,
  });
};

const historyKey = (scope) => `${EQUITY_HISTORY_KEY}:${scope}`;

const readEquityHistory = (scope) => {
  try {
    const raw = window.sessionStorage?.getItem(historyKey(scope));
    const stored = raw ? JSON.parse(raw) : [];
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const saveEquityHistory = (scope, history) => {
  try {
    window.sessionStorage?.setItem(historyKey(scope), JSON.stringify(history));
  } catch {
    // The in-memory history still works when browser storage is unavailable.
  }
};

const readCachedActivity = (scope, now) => {
  try {
    return typeof window === 'undefined' ? null : readActivitySnapshot(window.sessionStorage, scope, now);
  } catch {
    return null;
  }
};

export const loadDashboardDealHistory = async ({ signal, queryClient, now = Date.now() }) => {
  const accountOptions = getSidebarAccountsQueryOptions('');
  const accountsPromise = queryClient.fetchQuery({ ...accountOptions, staleTime: 30_000 });
  const dealsPromise = getBrokerDealsPage({
    limit: DEAL_PAGE_SIZE,
    offset: 0,
    sort_by: 'ticket',
    sort_dir: 'desc',
  }, { signal }).then((firstPage) => collectDashboardDealPages({
    firstPage,
    signal,
    pageSize: DEAL_PAGE_SIZE,
    fetchPage: ({ offset, limit, signal: pageSignal }) => getBrokerDealsPage({
      limit,
      offset,
      sort_by: 'ticket',
      sort_dir: 'desc',
    }, { signal: pageSignal }),
  }));
  const [accountPage, { deals, complete }] = await Promise.all([
    accountsPromise,
    dealsPromise,
  ]);
  if (!Array.isArray(accountPage?.rows) || accountPage.hasMore ||
      (accountPage.total != null && Number(accountPage.total) !== accountPage.rows.length)) {
    throw new Error('Complete real-account scope is unavailable.');
  }
  const realLogins = new Set(accountPage.rows
    .filter(isRealAccount)
    .map((account) => String(account.login ?? account.Login ?? '').trim())
    .filter(Boolean));

  return {
    deals,
    realLogins,
    volumeCoverageFrom: complete ? 0 : null,
    partial: !complete,
    asOf: now,
  };
};

export default function useDashboardActivity(range, metricsData) {
  const queryClient = useQueryClient();
  const { resolved, hasPermission } = usePermissions();
  const canViewAccounts = resolved && hasPermission(PERMISSIONS.VIEW_ACCOUNTS);
  const scope = getScope();
  const [now, setNow] = useState(Date.now);
  const [equityHistory, setEquityHistory] = useState(() => readEquityHistory(scope));
  const currentEquity = metricsData?.metrics?.equity;
  const metricsAsOf = metricsData?.asOf;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setEquityHistory(readEquityHistory(scope));
  }, [scope]);

  useEffect(() => {
    if (currentEquity === null || currentEquity === undefined || !Number.isFinite(Number(currentEquity)) ||
        !Number.isFinite(Number(metricsAsOf))) return;
    setEquityHistory((history) => {
      const next = appendEquityObservation(history, {
        timestamp: metricsAsOf,
        equity: currentEquity,
      });
      saveEquityHistory(scope, next);
      return next;
    });
  }, [currentEquity, metricsAsOf, scope]);

  const dealsQuery = useQuery({
    queryKey: ['dashboard', 'activity', 'deals', scope],
    queryFn: ({ signal }) => loadDashboardDealHistory({ signal, queryClient }),
    enabled: canViewAccounts,
    retry: false,
    staleTime: range === '30D' ? 10 * REFRESH_MS : range === '7D' ? 5 * REFRESH_MS : REFRESH_MS,
    refetchInterval: range === '30D' ? 10 * REFRESH_MS : range === '7D' ? 5 * REFRESH_MS : REFRESH_MS,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalLoader: true },
  });

  // The compact snapshot gives a hard refresh an immediate verified chart.
  // React Query still fetches the current deal book in the background.
  const cacheCheckTime = Math.max(now, dealsQuery.dataUpdatedAt || 0);
  const cachedSnapshot = useMemo(() => canViewAccounts
    ? readCachedActivity(scope, cacheCheckTime)
    : null, [canViewAccounts, scope, cacheCheckTime]);
  const liveDeals = dealsQuery.data && !dealsQuery.data.partial ? dealsQuery.data : null;
  const usingCached = !liveDeals && Boolean(cachedSnapshot);

  useEffect(() => {
    const fresh = dealsQuery.data;
    if (!canViewAccounts || !fresh || fresh.partial || fresh.volumeCoverageFrom === null) return;
    const snapshot = createActivitySnapshot({
      scope,
      asOf: fresh.asOf,
      deals: fresh.deals,
      realLogins: fresh.realLogins,
      equityHistory: readEquityHistory(scope),
      volumeCoverageFrom: fresh.volumeCoverageFrom,
      partial: false,
    });
    if (!snapshot) return;
    try {
      writeActivitySnapshot(window.sessionStorage, snapshot);
    } catch {
      // The live query remains available when storage is blocked.
    }
  }, [canViewAccounts, dealsQuery.data, scope]);

  const series = useMemo(() => {
    const chartNow = Math.max(now, Number(metricsAsOf) || 0, liveDeals?.asOf || 0);
    if (liveDeals) return buildActivitySeries({
      range,
      now: chartNow,
      deals: liveDeals.deals,
      equityHistory,
      volumeCoverageFrom: liveDeals.volumeCoverageFrom,
      volumeCoverageTo: liveDeals.asOf,
      realLogins: liveDeals.realLogins,
    });

    const current = buildActivitySeries({ range, now: chartNow, equityHistory });
    if (!usingCached) return current;
    const saved = new Map(cachedSnapshot.seriesByRange[range].map((point) => [point.timestamp, point]));
    return current.map((point) => {
      const previous = saved.get(point.timestamp);
      return previous ? {
        ...point,
        volume: previous.volume,
        volumePartial: previous.volumePartial,
        equity: point.equity ?? previous.equity,
        equityAsOf: point.equityAsOf ?? previous.equityAsOf,
      } : point;
    });
  }, [range, now, metricsAsOf, liveDeals, equityHistory, usingCached, cachedSnapshot]);

  const symbolActivity = useMemo(() => canViewAccounts && liveDeals
    ? buildSymbolActivity({
      range,
      now: Math.max(now, Number(metricsAsOf) || 0, liveDeals.asOf),
      deals: liveDeals.deals,
      realLogins: liveDeals.realLogins,
    })
    : null, [canViewAccounts, liveDeals, range, now, metricsAsOf]);

  return {
    series,
    symbolActivity,
    symbolsLoading: !resolved || (canViewAccounts && dealsQuery.isPending),
    symbolsRefreshing: canViewAccounts && dealsQuery.isFetching,
    symbolsPartial: Boolean(dealsQuery.data?.partial),
    symbolsAsOf: symbolActivity ? liveDeals.asOf : null,
    isLoading: !resolved || (canViewAccounts && !usingCached &&
      (dealsQuery.isPending || dealsQuery.isFetching && !dealsQuery.data)),
    restricted: resolved && !canViewAccounts,
    error: dealsQuery.error,
    partial: Boolean(dealsQuery.data?.partial) && !usingCached,
    cached: usingCached,
    refreshing: usingCached && dealsQuery.isFetching,
    refreshIncomplete: usingCached && Boolean(dealsQuery.data?.partial),
    asOf: usingCached ? cachedSnapshot.asOf : liveDeals?.asOf ?? null,
    firstEquityAt: equityHistory[0]?.timestamp ?? null,
    hasEquity: series.some((point) => point.equity !== null),
    hasVolume: series.some((point) => point.volume !== null),
    hasTradeActivity: series.some((point) => point.volume > 0),
    volumeAsOf: usingCached ? cachedSnapshot.asOf : liveDeals?.asOf ?? null,
  };
}
