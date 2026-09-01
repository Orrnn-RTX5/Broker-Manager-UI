import { getOnlineUsersPage, getOpenedOrders, getPositionsPage } from '../../services/api';
import { preloadWorkspaceRoute } from '../../utils/workspaceRouteModules.js';
import {
  ANALYTICS_PATHS,
  ANALYTICS_VIEWS,
  createOnlineUsersQueryOptions,
  createOpenedOrdersQueryOptions,
  createOpenPositionsQueryOptions,
} from '../../utils/analyticsQueryOptions.js';
import {
  getActiveAnalyticsTimingId,
  markAnalyticsTiming,
} from '../../utils/analyticsPerformance.js';

const trackedRequestOptions = (view, timingId, options = {}) => ({
  ...options,
  onResponseReceived: (metadata) => {
    options.onResponseReceived?.(metadata);
    markAnalyticsTiming(view, 'responseReceived', metadata, timingId);
  },
});

const runTrackedRequest = async (view, request) => {
  const timingId = getActiveAnalyticsTimingId(view);
  markAnalyticsTiming(view, 'requestStarted', {}, timingId);
  try {
    const data = await request(timingId);
    markAnalyticsTiming(view, 'dataProcessed', {}, timingId);
    return data;
  } catch (error) {
    markAnalyticsTiming(view, 'dataProcessed', { requestFailed: true }, timingId);
    throw error;
  }
};

export const fetchOnlineUsersAnalyticsPage = (params, options = {}) => (
  runTrackedRequest(
    ANALYTICS_VIEWS.onlineUsers,
    (timingId) => getOnlineUsersPage(
      params,
      trackedRequestOptions(ANALYTICS_VIEWS.onlineUsers, timingId, options)
    )
  )
);

export const fetchOpenPositionsAnalyticsPage = (params, options = {}) => (
  runTrackedRequest(
    ANALYTICS_VIEWS.openPositions,
    (timingId) => getPositionsPage(
      params,
      trackedRequestOptions(ANALYTICS_VIEWS.openPositions, timingId, options)
    )
  )
);

export const fetchOpenedOrdersAnalytics = (login, options = {}) => (
  runTrackedRequest(
    ANALYTICS_VIEWS.openOrders,
    (timingId) => getOpenedOrders(
      login,
      trackedRequestOptions(ANALYTICS_VIEWS.openOrders, timingId, options)
    )
  )
);

export const getOnlineUsersAnalyticsQueryOptions = (params) => (
  createOnlineUsersQueryOptions({ request: fetchOnlineUsersAnalyticsPage, params })
);

export const getOpenPositionsAnalyticsQueryOptions = (params) => (
  createOpenPositionsQueryOptions({ request: fetchOpenPositionsAnalyticsPage, params })
);

export const getOpenedOrdersAnalyticsQueryOptions = (login) => (
  createOpenedOrdersQueryOptions({ login, request: fetchOpenedOrdersAnalytics })
);

const initialQueryForPath = (path) => {
  if (path === ANALYTICS_PATHS.onlineUsers) return getOnlineUsersAnalyticsQueryOptions();
  if (path === ANALYTICS_PATHS.openPositions) return getOpenPositionsAnalyticsQueryOptions();
  return null;
};

export const prefetchAnalyticsData = (queryClient, path) => {
  const options = initialQueryForPath(path);
  if (!queryClient || !options) return Promise.resolve();
  const { queryFn, ...queryOptions } = options;
  return queryClient.prefetchQuery({
    ...queryOptions,
    // Login warmup is not owned by a route. Do not let the development
    // StrictMode remount abort a nearly-complete shared fetch when the user
    // opens its destination.
    queryFn: () => queryFn({}),
    retry: false,
  }).catch(() => undefined);
};

export const preloadAnalyticsDestination = (queryClient, path) => Promise.all([
  preloadWorkspaceRoute(path),
  prefetchAnalyticsData(queryClient, path),
]).then(() => undefined);

export const prefetchInitialAnalyticsData = (queryClient) => Promise.allSettled([
  prefetchAnalyticsData(queryClient, ANALYTICS_PATHS.onlineUsers),
  prefetchAnalyticsData(queryClient, ANALYTICS_PATHS.openPositions),
]);
