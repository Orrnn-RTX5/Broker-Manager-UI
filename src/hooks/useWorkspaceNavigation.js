import { startTransition, useCallback, useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { startAnalyticsNavigationTiming } from '../utils/analyticsPerformance.js';
import { preloadWorkspaceDestination } from '../features/workspaceQueries.js';
import { preloadAnalyticsDestination } from '../features/analytics/analyticsQueries.js';
import { usePermissions } from './usePermissions.js';
import { PERMISSIONS } from '../utils/permissions.js';

const POSITION_ONLY_PATHS = new Set(['/analytics/open-positions', '/clients/positions']);

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
  const { canAct } = usePermissions();
  const canViewPositions = canAct(PERMISSIONS.VIEW_POSITIONS);

  const preload = useCallback((path) => {
    if (!path) return;
    if (!canViewPositions && POSITION_ONLY_PATHS.has(String(path).split(/[?#]/)[0])) return;
    preloadWorkspaceDestination(queryClient, path);
    preloadAnalyticsDestination(queryClient, path);
  }, [canViewPositions, queryClient]);

  return useMemo(() => Object.assign((path, options) => {
    if (!path) return;
    startAnalyticsNavigationTiming(path);
    // Clicks and keyboard navigation warm data as well as UI code. A transition
    // keeps the current view painted while an auxiliary route module loads.
    preload(path);
    startTransition(() => navigateTo(path, options));
  }, { preload, prefetch: preload }), [preload]);
};

export default useWorkspaceNavigation;
