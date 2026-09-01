import { getClientsPage, getGroupsPage, getOrdersPage } from '../services/api.js';
import { preloadWorkspaceRoute } from '../utils/workspaceRouteModules.js';
import {
  WORKSPACE_DATA_PATHS,
  createClientsInitialQueryOptions,
  createGroupsInitialQueryOptions,
  createOrdersInitialQueryOptions,
} from '../utils/workspaceQueryOptions.js';

export const getClientsInitialQueryOptions = () => (
  createClientsInitialQueryOptions({ request: getClientsPage })
);

export const getOrdersInitialQueryOptions = () => (
  createOrdersInitialQueryOptions({ request: getOrdersPage })
);

export const getGroupsInitialQueryOptions = () => (
  createGroupsInitialQueryOptions({ request: getGroupsPage })
);

const initialQueryForPath = (path) => {
  if (path === WORKSPACE_DATA_PATHS.clients) return getClientsInitialQueryOptions();
  if (path === WORKSPACE_DATA_PATHS.orders) return getOrdersInitialQueryOptions();
  if (path === WORKSPACE_DATA_PATHS.groups) return getGroupsInitialQueryOptions();
  return null;
};

export const prefetchWorkspaceData = (queryClient, path) => {
  const options = initialQueryForPath(path);
  if (!queryClient || !options) return Promise.resolve();
  return queryClient.prefetchQuery({ ...options, retry: false }).catch(() => undefined);
};

export const preloadWorkspaceDestination = (queryClient, path) => Promise.all([
  preloadWorkspaceRoute(path),
  prefetchWorkspaceData(queryClient, path),
]).then(() => undefined);

export const prefetchInitialWorkspaceData = async (queryClient) => {
  // AccountDetailsMany is the slowest endpoint. Give it the first available
  // connection, then warm the two smaller lists without making five manager
  // requests compete at once with the existing analytics warmup.
  await prefetchWorkspaceData(queryClient, WORKSPACE_DATA_PATHS.clients);
  return Promise.allSettled([
    prefetchWorkspaceData(queryClient, WORKSPACE_DATA_PATHS.orders),
    prefetchWorkspaceData(queryClient, WORKSPACE_DATA_PATHS.groups),
  ]);
};
