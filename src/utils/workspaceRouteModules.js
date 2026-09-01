/*
 * Keep route imports in one place so navigation can warm UI code without
 * starting any API request. Dynamic imports are cached by the browser/Electron
 * runtime, so the route renders immediately when the user opens it later.
 */
export const workspaceRouteLoaders = Object.freeze({
  tradingAccountsDashboard: () => import('../features/analytics/TradingAccountsDashboard'),
  onlineUsersDashboard: () => import('../features/analytics/OnlineUsersDashboard'),
  advertisingCampaignsDashboard: () => import('../features/analytics/AdvertisingCampaignsDashboard'),
  byCountryDashboard: () => import('../features/analytics/ByCountryDashboard'),
  openOrdersDashboard: () => import('../features/analytics/OpenOrdersDashboard'),
  onlineUsersPage: () => import('../features/clients/OnlineUsersPage'),
  tradingAccountsPage: () => import('../features/clients/TradingAccountsPage'),
  positionsPage: () => import('../features/clients/PositionsPage'),
  openPositionsPage: () => import('../features/clients/OpenPositionsPage'),
  dealsPage: () => import('../features/clients/DealsPage'),
  groupDetailsPage: () => import('../features/groups/GroupDetailsPage'),
  dealerQueuePage: () => import('../features/dealer/DealerQueuePage'),
  restrictedAccountsPage: () => import('../features/dealer/RestrictedAccountsPage'),
  ibListPage: () => import('../features/ib/IBListPage'),
  ibTreePage: () => import('../features/ib/IBTreePage'),
  symbolsOverviewPage: () => import('../features/symbols/SymbolsOverviewPage'),
  symbolListPage: () => import('../features/symbols/SymbolListPage'),
  symbolManagementPage: () => import('../features/symbols/SymbolManagementPage'),
});

const routeLoaderEntries = [
  ['/analytics/trading-accounts', 'tradingAccountsDashboard'],
  ['/analytics/online-users', 'onlineUsersDashboard'],
  ['/analytics/advertising-campaigns', 'advertisingCampaignsDashboard'],
  ['/analytics/open-orders', 'openOrdersDashboard'],
  ['/analytics/by-country', 'byCountryDashboard'],
  ['/clients/online-users', 'onlineUsersPage'],
  ['/clients/trading-accounts', 'tradingAccountsPage'],
  ['/clients/positions', 'positionsPage'],
  ['/analytics/open-positions', 'openPositionsPage'],
  ['/dealing', 'dealsPage'],
  ['/dealer/queue', 'dealerQueuePage'],
  ['/dealer/restrictions', 'restrictedAccountsPage'],
  ['/ib/tree', 'ibTreePage'],
  ['/ib', 'ibListPage'],
  ['/symbols', 'symbolsOverviewPage'],
  ['/symbol-management', 'symbolManagementPage'],
];

const loaderForPath = (path = '') => {
  const exactMatch = routeLoaderEntries.find(([route]) => route === path);
  if (exactMatch) return workspaceRouteLoaders[exactMatch[1]];
  if (path.startsWith('/groups/')) return workspaceRouteLoaders.groupDetailsPage;
  if (path.startsWith('/ib/')) return workspaceRouteLoaders.ibListPage;
  if (path.startsWith('/symbols/')) return workspaceRouteLoaders.symbolListPage;
  return null;
};

export const preloadWorkspaceRoute = (path) => {
  const loader = loaderForPath(path);
  return loader ? loader().catch(() => undefined) : Promise.resolve();
};

export const FREQUENT_WORKSPACE_ROUTE_KEYS = Object.freeze([
  'onlineUsersDashboard',
  'openPositionsPage',
  'openOrdersDashboard',
]);

export const preloadFrequentWorkspaceRoutes = () => Promise.allSettled(
  FREQUENT_WORKSPACE_ROUTE_KEYS.map((key) => workspaceRouteLoaders[key]())
);
