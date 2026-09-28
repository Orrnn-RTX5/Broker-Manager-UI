import { getAccountDetailsManyPage, getClientsPage, getTradingAccountsPage, getBrokerDealsPage, getPositionsPage, getGroupsPage, getOrdersPage, normalizeClientRow, normalizeTradingAccountRow, preloadSymbolManagementData } from '../services/api.js';
import { preloadWorkspaceRoute } from '../utils/workspaceRouteModules.js';
import { normalizeAccount } from '../utils/sidebarAccountRows.js';
import {
  DASHBOARD_ACCOUNT_LIMITS_QUERY_KEY,
  loadDashboardAccountLimits,
} from './dashboard/useDashboardMetrics.js';
import {
  WORKSPACE_DATA_PATHS,
  CLIENTS_INITIAL_PARAMS,
  TRADING_ACCOUNTS_INITIAL_PARAMS,
  createClientsInitialQueryOptions,
  createTradingAccountsInitialQueryOptions,
  createDealsInitialQueryOptions,
  createPositionsInitialQueryOptions,
  createGroupsInitialQueryOptions,
  createOrdersInitialQueryOptions,
} from '../utils/workspaceQueryOptions.js';

const CLIENTS_QUERY_KEY = ['clients', 'page', CLIENTS_INITIAL_PARAMS];
const TRADING_ACCOUNTS_QUERY_KEY = ['trading-accounts', 'page', TRADING_ACCOUNTS_INITIAL_PARAMS];
const SIDEBAR_ACCOUNTS_QUERY_KEY = ['sidebar-accounts', ''];

const toPagedShape = (page, rows) => ({
  rows,
  total: page?.total ?? null,
  hasMore: Boolean(page?.hasMore),
  nextOffset: page?.nextOffset ?? rows.length,
});

const sourceAccountRows = (page) => (
  Array.isArray(page?.rows) ? page.rows.map((row) => row?.raw || row) : []
);

export const seedSharedAccountPages = (queryClient, page) => {
  if (!queryClient) return;
  const rawRows = sourceAccountRows(page);
  if (rawRows.length === 0) return;

  const paged = (normalize) => toPagedShape(page, rawRows.map(normalize));

  if (!queryClient.getQueryData(CLIENTS_QUERY_KEY)?.rows?.length) {
    queryClient.setQueryData(CLIENTS_QUERY_KEY, paged(normalizeClientRow));
  }
  if (!queryClient.getQueryData(TRADING_ACCOUNTS_QUERY_KEY)?.rows?.length) {
    queryClient.setQueryData(TRADING_ACCOUNTS_QUERY_KEY, paged(normalizeTradingAccountRow));
  }
  if (!queryClient.getQueryData(SIDEBAR_ACCOUNTS_QUERY_KEY)?.rows?.length) {
    queryClient.setQueryData(SIDEBAR_ACCOUNTS_QUERY_KEY, paged(normalizeAccount));
  }
};

const firstCachedAccountPage = (queryClient) => {
  const trading = queryClient.getQueryData(TRADING_ACCOUNTS_QUERY_KEY);
  if (trading?.rows?.length) return trading;
  const sidebar = queryClient.getQueryData(SIDEBAR_ACCOUNTS_QUERY_KEY);
  if (sidebar?.rows?.length) return sidebar;
  const clients = queryClient.getQueryData(CLIENTS_QUERY_KEY);
  if (clients?.rows?.length) return clients;
  return null;
};

export const getClientsInitialQueryOptions = () => (
  createClientsInitialQueryOptions({ request: getClientsPage })
);

export const getTradingAccountsInitialQueryOptions = () => (
  createTradingAccountsInitialQueryOptions({ request: getTradingAccountsPage })
);

export const getOrdersInitialQueryOptions = () => (
  createOrdersInitialQueryOptions({ request: getOrdersPage })
);

export const getDealsInitialQueryOptions = () => (
  createDealsInitialQueryOptions({ request: getBrokerDealsPage })
);

export const getPositionsInitialQueryOptions = () => (
  createPositionsInitialQueryOptions({ request: getPositionsPage })
);

export const getGroupsInitialQueryOptions = () => (
  createGroupsInitialQueryOptions({ request: getGroupsPage })
);

const initialQueryForPath = (path) => {
  if (path === WORKSPACE_DATA_PATHS.clients) return getClientsInitialQueryOptions();
  if (path === WORKSPACE_DATA_PATHS.tradingAccounts) return getTradingAccountsInitialQueryOptions();
  if (path === WORKSPACE_DATA_PATHS.orders) return getOrdersInitialQueryOptions();
  if (path === WORKSPACE_DATA_PATHS.deals) return getDealsInitialQueryOptions();
  if (path === WORKSPACE_DATA_PATHS.positions) return getPositionsInitialQueryOptions();
  if (path === WORKSPACE_DATA_PATHS.groups) return getGroupsInitialQueryOptions();
  return null;
};

export const prefetchWorkspaceData = (queryClient, path) => {
  if (path === '/symbol-management') {
    return preloadSymbolManagementData();
  }

  const options = initialQueryForPath(path);
  if (!queryClient || !options) return Promise.resolve();

  if (
    path === WORKSPACE_DATA_PATHS.clients
    || path === WORKSPACE_DATA_PATHS.tradingAccounts
  ) {
    const cached = firstCachedAccountPage(queryClient);
    if (cached) {
      seedSharedAccountPages(queryClient, cached);
      if (queryClient.getQueryData(options.queryKey)?.rows?.length) {
        return Promise.resolve();
      }
    }
  }

  return queryClient.prefetchQuery({ ...options, retry: false })
    .then(() => {
      seedSharedAccountPages(queryClient, queryClient.getQueryData(options.queryKey));
    })
    .catch(() => undefined);
};

export const preloadWorkspaceDestination = (queryClient, path) => Promise.all([
  preloadWorkspaceRoute(path),
  prefetchWorkspaceData(queryClient, path),
]).then(() => undefined);

export const prefetchInitialWorkspaceData = async (queryClient) => {
  if (!queryClient) return;
  queryClient.prefetchQuery({ queryKey: DASHBOARD_ACCOUNT_LIMITS_QUERY_KEY, queryFn: loadDashboardAccountLimits }).catch(() => undefined);
  const accountsPromise = getAccountDetailsManyPage({ limit: 30, offset: 0 })
    .then((page) => seedSharedAccountPages(queryClient, page))
    .catch(() => undefined);

  return Promise.allSettled([
    accountsPromise,
    // Destination-specific intent warmers fetch online users, orders, groups,
    // deals and global positions when those screens are actually approached.
    // Starting all of them during login starves the account panel's interactive
    // positions request and recreates the multi-second delay this path avoids.
  ]);
};
