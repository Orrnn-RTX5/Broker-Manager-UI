import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { preloadWorkspaceRoute } from '../utils/workspaceRouteModules';
import { startAnalyticsNavigationTiming } from '../utils/analyticsPerformance.js';
import { preloadWorkspaceDestination } from '../features/workspaceQueries.js';
import { preloadAnalyticsDestination } from '../features/analytics/analyticsQueries.js';

export const useWorkspaceNavigation = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const preload = useCallback((path) => {
    if (!path) return;
    preloadWorkspaceDestination(queryClient, path);
    preloadAnalyticsDestination(queryClient, path);
  }, [queryClient]);

  const navFn = useCallback((path, options) => {
    if (!path) return;
    startAnalyticsNavigationTiming(path);
    preloadWorkspaceRoute(path);
    navigate(path, options);
  }, [navigate]);

  navFn.preload = preload;
  navFn.prefetch = preload;

  return navFn;
};

export default useWorkspaceNavigation;
