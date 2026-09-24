import { useCallback, useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { preloadWorkspaceRoute } from '../utils/workspaceRouteModules';
import { startAnalyticsNavigationTiming } from '../utils/analyticsPerformance.js';
import { preloadWorkspaceDestination } from '../features/workspaceQueries.js';
import { preloadAnalyticsDestination } from '../features/analytics/analyticsQueries.js';

// React Router's useNavigate subscribes its caller to every location change.
// The workspace shell only needs to *trigger* navigation, so one bridge inside
// the router holds navigate and every caller gets a stable function. The shell
// then no longer re-renders on each route change; views that highlight the
// current route read useLocation themselves.
let routerNavigate = null;

export function WorkspaceNavigationBridge() {
  const navigate = useNavigate();
  useLayoutEffect(() => {
    routerNavigate = navigate;
  }, [navigate]);
  return null;
}

const navigateTo = (path, options) => {
  if (routerNavigate) {
    routerNavigate(path, options);
    return;
  }
  // Bridge not mounted (outside the router): fall back to history navigation.
  const method = options?.replace ? 'replaceState' : 'pushState';
  window.history[method](options?.state ?? null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const useWorkspaceNavigation = () => {
  const queryClient = useQueryClient();

  const preload = useCallback((path) => {
    if (!path) return;
    preloadWorkspaceDestination(queryClient, path);
    preloadAnalyticsDestination(queryClient, path);
  }, [queryClient]);

  return useMemo(() => Object.assign((path, options) => {
    if (!path) return;
    startAnalyticsNavigationTiming(path);
    preloadWorkspaceRoute(path);
    navigateTo(path, options);
  }, { preload, prefetch: preload }), [preload]);
};

export default useWorkspaceNavigation;
