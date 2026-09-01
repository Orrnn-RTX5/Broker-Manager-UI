import { lazy, Suspense, useCallback, useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import { AdminLogin, ManagerLogin } from './features/auth/BrokerAuthScreens';
import DesktopWindowControls from './components/DesktopWindowControls';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import RequirePermission from './components/RequirePermission';
import authService from './services/authService';
import { clearBrokerInfo } from './services/brokerAuth';
import { preloadFrequentWorkspaceRoutes, workspaceRouteLoaders } from './utils/workspaceRouteModules';
import { prefetchInitialAnalyticsData } from './features/analytics/analyticsQueries.js';
import { prefetchInitialWorkspaceData } from './features/workspaceQueries.js';

import Dashboard from './features/dashboard/Dashboard';
import OnlineUsersDashboard from './features/analytics/OnlineUsersDashboard';
import OpenOrdersDashboard from './features/analytics/OpenOrdersDashboard';
import OpenPositionsPage from './features/clients/OpenPositionsPage';
import ClientsDashboard from './features/clients/ClientsDashboard';
import OrdersPage from './features/clients/OrdersPage';
import GroupsPage from './features/groups/GroupsPage';

// Keep the dashboard and workspace shell in the initial bundle. Every other
// workspace view is loaded only when it is opened, so its data/UI code cannot
// delay the first dashboard render.
const TradingAccountsDashboard = lazy(workspaceRouteLoaders.tradingAccountsDashboard);
const AdvertisingCampaignsDashboard = lazy(workspaceRouteLoaders.advertisingCampaignsDashboard);
const ByCountryDashboard = lazy(workspaceRouteLoaders.byCountryDashboard);
const OnlineUsersPage = lazy(workspaceRouteLoaders.onlineUsersPage);
const TradingAccountsPage = lazy(workspaceRouteLoaders.tradingAccountsPage);
const PositionsPage = lazy(workspaceRouteLoaders.positionsPage);
const DealsPage = lazy(workspaceRouteLoaders.dealsPage);
const GroupDetailsPage = lazy(workspaceRouteLoaders.groupDetailsPage);
const DealerQueuePage = lazy(workspaceRouteLoaders.dealerQueuePage);
const RestrictedAccountsPage = lazy(workspaceRouteLoaders.restrictedAccountsPage);
const IBListPage = lazy(workspaceRouteLoaders.ibListPage);
const IBTreePage = lazy(workspaceRouteLoaders.ibTreePage);
const SymbolsOverviewPage = lazy(workspaceRouteLoaders.symbolsOverviewPage);
const SymbolListPage = lazy(workspaceRouteLoaders.symbolListPage);
const SymbolManagementPage = lazy(workspaceRouteLoaders.symbolManagementPage);

const AUTH_STORAGE_POLL_MS = 2000;
const PUBLIC_AUTH_PATHS = new Set(['/manager-login', '/admin-login']);

const ROUTE_LOADING_LABELS = Object.freeze({
  '/analytics/online-users': 'Online Users',
  '/analytics/open-positions': 'Open Positions',
  '/analytics/open-orders': 'Open Orders',
});

const WorkspaceRouteFallback = () => {
  const location = useLocation();
  const label = ROUTE_LOADING_LABELS[location.pathname] || 'Workspace';

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-full w-full flex-col gap-4 p-6"
      style={{ color: 'var(--muted)' }}
    >
      <div>
        <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{label}</div>
        <div className="mt-1 text-[10px]">Opening view…</div>
      </div>
      <div className="ui-card min-h-48 animate-pulse p-4">
        <div className="h-3 w-40 rounded" style={{ background: 'var(--surface-3)' }} />
        <div className="mt-4 h-8 w-full rounded" style={{ background: 'var(--surface-2)' }} />
        <div className="mt-3 h-8 w-full rounded" style={{ background: 'var(--surface-2)' }} />
        <div className="mt-3 h-8 w-4/5 rounded" style={{ background: 'var(--surface-2)' }} />
      </div>
    </div>
  );
};

const SessionExpiryRedirect = ({ isAuthenticated }) => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated || PUBLIC_AUTH_PATHS.has(location.pathname)) return;
    navigate('/manager-login', { replace: true });
  }, [isAuthenticated, location.pathname, navigate]);

  return null;
};

function App() {
  const queryClient = useQueryClient();
  const [initialSessionStatus] = useState(() => authService.getSessionStatus());
  const [isAuthenticated, setIsAuthenticated] = useState(() => initialSessionStatus.authenticated);
  const [sessionVersion, setSessionVersion] = useState(0);
  const sessionSnapshotRef = useRef(
    initialSessionStatus.authenticated ? initialSessionStatus.snapshot : null
  );

  const rememberValidSession = useCallback((status) => {
    sessionSnapshotRef.current = status.snapshot;
    return true;
  }, []);

  const validateCurrentSession = useCallback((fallbackReason = 'session_invalid') => {
    const status = authService.getSessionStatus({ baseline: sessionSnapshotRef.current });
    if (status.authenticated) return rememberValidSession(status);

    authService.expireSession(status.reason || fallbackReason);
    return false;
  }, [rememberValidSession]);

  useEffect(() => {
    if (!initialSessionStatus.authenticated && initialSessionStatus.hasAuthState) {
      authService.expireSession(initialSessionStatus.reason || 'session_invalid');
    }
  }, [initialSessionStatus]);

  useEffect(() => {
    // These three small chunks are safe to fetch before authentication. By
    // warming them while the user is on the login screen, the first possible
    // Navigator click cannot be blocked by module download/evaluation.
    preloadFrequentWorkspaceRoutes();
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      authService.clearSession();
      queryClient.clear();
      sessionSnapshotRef.current = null;
      setIsAuthenticated(false);
      setSessionVersion((value) => value + 1);
    };
    const handleTokenUpdated = () => {
      const status = authService.getSessionStatus();
      if (status.authenticated) {
        rememberValidSession(status);
        setIsAuthenticated(true);
      } else {
        authService.expireSession(status.reason || 'session_invalid');
      }
      setSessionVersion((value) => value + 1);
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    window.addEventListener('auth:token-updated', handleTokenUpdated);
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
      window.removeEventListener('auth:token-updated', handleTokenUpdated);
    };
  }, [queryClient, rememberValidSession]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const validate = (reason) => validateCurrentSession(reason);
    const handleStorage = (event) => {
      if (!event.key || authService.AUTH_STORAGE_KEYS.includes(event.key)) {
        validate('storage_changed');
      }
    };
    const handleFocus = () => validate('window_focus');
    const handlePageShow = () => validate('page_show');
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') validate('visibility_visible');
    };

    validate('auth_monitor_started');

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(() => validate('storage_poll'), AUTH_STORAGE_POLL_MS);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, validateCurrentSession]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    // Start warming as soon as the authenticated shell commits. A live market
    // feed means the main thread may never become truly idle, which used to
    // postpone requestIdleCallback until after the user had already clicked.
    preloadFrequentWorkspaceRoutes();
    prefetchInitialAnalyticsData(queryClient);
    prefetchInitialWorkspaceData(queryClient);
    return undefined;
  }, [isAuthenticated, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    if (!validateCurrentSession('expiry_timer_check')) return undefined;

    const expiresAt = authService.getTokenExpiresAt();
    if (!expiresAt) return undefined;

    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      authService.expireSession('token_expired');
      return undefined;
    }

    const timeoutId = window.setTimeout(
      () => authService.expireSession('token_expired'),
      Math.min(delay, 2147483647)
    );

    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated, sessionVersion, validateCurrentSession]);

  const handleLogin = () => {
    const status = authService.getSessionStatus();
    if (!status.authenticated) {
      authService.expireSession(status.reason || 'session_invalid');
      return;
    }
    rememberValidSession(status);
    // Start authenticated data warming before the dashboard transition. React
    // Query deduplicates this with the authenticated effect below.
    prefetchInitialAnalyticsData(queryClient);
    prefetchInitialWorkspaceData(queryClient);
    setSessionVersion((value) => value + 1);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    authService.clearSession();
    queryClient.clear();
    clearBrokerInfo();
    sessionSnapshotRef.current = null;
    setSessionVersion((value) => value + 1);
    setIsAuthenticated(false);
  };

  return (
    // Workspace navigation is direct user input and must outrank the continuous
    // market-feed updates. React Router otherwise wraps every location change
    // in a transition, which can be postponed repeatedly by quote-store work.
    <Router unstable_useTransitions={false}>
      <GlobalErrorBoundary>
        <DesktopWindowControls variant={isAuthenticated ? 'workspace' : 'auth'} />
        <SessionExpiryRedirect isAuthenticated={isAuthenticated} />
        {!isAuthenticated ? (
          <Routes>
            <Route path="/" element={<Navigate to="/manager-login" replace />} />
            <Route path="/manager-login" element={<ManagerLogin onLoginSuccess={handleLogin} />} />
            <Route path="/admin-login" element={<AdminLogin onLoginSuccess={handleLogin} />} />
            <Route path="*" element={<Navigate to="/manager-login" replace />} />
          </Routes>
        ) : (
          <AdminLayout isAuthenticated={isAuthenticated} onLogin={handleLogin} onLogout={handleLogout}>
            <Suspense fallback={<WorkspaceRouteFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/admin-dashboard" element={<Dashboard />} />
                <Route path="/analytics/trading-accounts" element={<TradingAccountsDashboard />} />
                <Route path="/analytics/online-users" element={<OnlineUsersDashboard />} />
                <Route path="/analytics/open-positions" element={<OpenPositionsPage />} />
                <Route path="/analytics/advertising-campaigns" element={<AdvertisingCampaignsDashboard />} />
                <Route path="/analytics/open-orders" element={<OpenOrdersDashboard />} />
                <Route path="/analytics/by-country" element={<ByCountryDashboard />} />
                <Route path="/clients" element={<ClientsDashboard />} />
                <Route path="/clients/online-users" element={<OnlineUsersPage />} />
                <Route path="/clients/trading-accounts" element={<TradingAccountsPage />} />
                <Route path="/clients/positions" element={<PositionsPage />} />
                <Route path="/clients/orders" element={<OrdersPage />} />
                <Route path="/dealing" element={<DealsPage />} />
                <Route path="/dealer/queue" element={<RequirePermission permission="dealer_queue"><DealerQueuePage /></RequirePermission>} />
                <Route path="/dealer/restrictions" element={<RequirePermission permission="view_accounts"><RestrictedAccountsPage /></RequirePermission>} />
                <Route path="/ib" element={<RequirePermission permission="manage_ib"><IBListPage /></RequirePermission>} />
                <Route path="/ib/tree" element={<RequirePermission permission="manage_ib"><IBTreePage /></RequirePermission>} />
                <Route path="/ib/:login/:tab?" element={<RequirePermission permission="manage_ib"><IBListPage /></RequirePermission>} />
                <Route path="/groups" element={<RequirePermission permission="manage_groups"><GroupsPage /></RequirePermission>} />
                <Route path="/groups/:groupName" element={<RequirePermission permission="manage_groups"><GroupDetailsPage /></RequirePermission>} />
                <Route path="/symbols" element={<RequirePermission permission="manage_groups"><SymbolsOverviewPage /></RequirePermission>} />
                <Route path="/symbols/:group" element={<RequirePermission permission="manage_groups"><SymbolListPage /></RequirePermission>} />
                <Route path="/symbol-management" element={<RequirePermission permission="manage_groups"><SymbolManagementPage /></RequirePermission>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AdminLayout>
        )}
      </GlobalErrorBoundary>
    </Router>
  );
}

export default App;
