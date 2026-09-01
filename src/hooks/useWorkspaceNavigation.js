import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { preloadWorkspaceRoute } from '../utils/workspaceRouteModules';
import { startAnalyticsNavigationTiming } from '../utils/analyticsPerformance.js';

export const useWorkspaceNavigation = () => {
  const navigate = useNavigate();

  return useCallback((path, options) => {
    if (!path) return;
    startAnalyticsNavigationTiming(path);
    preloadWorkspaceRoute(path);
    navigate(path, options);
  }, [navigate]);
};

export default useWorkspaceNavigation;
