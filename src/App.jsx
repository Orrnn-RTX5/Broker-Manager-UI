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
import { invalidatePositionsCache, invalidateSymbolManagementData, preloadSymbolManagementData } from './services/api';
import { preloadAllWorkspaceRoutes, preloadFrequentWorkspaceRoutes, preloadWorkspaceRoute, workspaceRouteLoaders } from './utils/workspaceRouteModules';
import { prefetchInitialAnalyticsData } from './features/analytics/analyticsQueries.js';
import { prefetchInitialWorkspaceData } from './features/workspaceQueries.js';

import Dashboard from './features/dashboard/Dashboard';
import OnlineUsersDashboard from './features/analytics/OnlineUsersDashboard';
import OpenOrdersDashboard from './features/analytics/OpenOrdersDashboard';
import OpenPositionsPage from './features/clients/OpenPositionsPage';
import ClientsDashboard from './features/clients/ClientsDashboard';
import OrdersPage from './features/clients/OrdersPage';
import GroupsPage from './features/groups/GroupsPage';
import TradingAccountsPage from './features/clients/TradingAccountsPage';
import PositionsPage from './features/clients/PositionsPage';
import DealsPage from './features/clients/DealsPage';
import OnlineUsersPage from './features/clients/OnlineUsersPage';

// Pre-warm the active route module immediately on hard refresh before render
if (typeof window !== 'undefined' && window.location?.pathname) {
  preloadWorkspaceRoute(window.location.pathname);
}

// Keep primary navigation pages in the bundle for instant (<1s) zero-delay renders.
// Auxiliary or deep views are loaded on-demand.
const TradingAccountsDashboard = lazy(workspaceRouteLoaders.tradingAccountsDashboard);
const AdvertisingCampaignsDashboard = lazy(workspaceRouteLoaders.advertisingCampaignsDashboard);
const ByCountryDashboard = lazy(workspaceRouteLoaders.byCountryDashboard);
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
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/admin-dashboard': 'Dashboard',
  '/analytics/trading-accounts': 'Trading Accounts Analytics',
  '/analytics/online-users': 'Online Users',
  '/analytics/open-positions': 'Open Positions',
  '/analytics/advertising-campaigns': 'Advertising Campaigns',
  '/analytics/open-orders': 'Open Orders',
  '/analytics/by-country': 'By Country Analytics',
  '/clients': 'Clients Overview',
  '/clients/online-users': 'Active Sessions',
  '/clients/trading-accounts': 'Trading Accounts',
  '/clients/positions': 'Open Positions',
  '/clients/orders': 'Orders',
  '/dealing': 'Dealing & Executions',
  '/dealer/queue': 'Dealer Queue',
  '/dealer/restrictions': 'Restricted Accounts',
  '/ib': 'IB Accounts',
  '/ib/tree': 'IB Tree',
  '/groups': 'Account Groups',
  '/symbols': 'Symbols Browser',
  '/symbol-management': 'Symbol Management',
});

const getRouteLabel = (pathname) => {
  if (ROUTE_LOADING_LABELS[pathname]) return ROUTE_LOADING_LABELS[pathname];
  if (pathname.startsWith('/groups/')) return 'Group Details';
  if (pathname.startsWith('/ib/')) return 'IB Account Details';
  if (pathname.startsWith('/symbols/')) return 'Symbol Details';
  const segment = pathname.split('/').filter(Boolean).pop();
  return segment ? segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Workspace';
};

const WorkspaceRouteFallback = () => {
  const location = useLocation();
  const label = getRouteLabel(location.pathname);

  return (
    <div
      role="status"
      aria-live="polite"
      className="workspace-soft-landing flex min-h-full w-full flex-col gap-4 p-6 animate-fade-in"
    >
      {/* Header bar placeholder matching page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-md bg-[var(--surface-3)] animate-pulse" />
          <div>
            <h1 className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{label}</h1>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px]" style={{ color: 'var(--muted)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />
              <span>Connecting live data…</span>
            </div>
          </div>
        </div>

        {/* Action / search bar skeleton */}
        <div className="flex items-center gap-2">
          <div className="h-7 w-40 rounded-md bg-[var(--surface-2)] border border-[var(--border)] animate-pulse" />
          <div className="h-7 w-24 rounded-md bg-[var(--surface-2)] border border-[var(--border)] animate-pulse" />
        </div>
      </div>

      {/* Structured data table skeleton */}
      <div className="ui-card flex-1 min-h-[360px] flex flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
        {/* Table header skeleton */}
        <div
          className="flex items-center h-8 px-4 gap-4 border-b border-[var(--border)]"
          style={{ background: 'var(--surface-2)' }}
        >
          <div className="h-2.5 w-16 rounded bg-[var(--surface-3)] animate-pulse" />
          <div className="h-2.5 w-24 rounded bg-[var(--surface-3)] animate-pulse" />
          <div className="h-2.5 w-20 rounded bg-[var(--surface-3)] animate-pulse" />
          <div className="h-2.5 w-16 rounded bg-[var(--surface-3)] animate-pulse" />
          <div className="h-2.5 w-20 rounded bg-[var(--surface-3)] animate-pulse ml-auto" />
          <div className="h-2.5 w-20 rounded bg-[var(--surface-3)] animate-pulse" />
        </div>

        {/* Table row skeleton lines */}
        <div className="p-3 flex flex-col gap-2.5 flex-1">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-center h-7 px-2 gap-4 rounded"
              style={{
                background: i % 2 === 0 ? 'var(--surface-2)' : 'transparent',
                opacity: 1 - i * 0.08,
              }}
            >
              <div className="h-2 w-14 rounded bg-[var(--surface-3)] animate-pulse" />
              <div className="h-2 w-28 rounded bg-[var(--surface-3)] animate-pulse" />
              <div className="h-2 w-20 rounded bg-[var(--surface-3)] animate-pulse" />
              <div className="h-2 w-16 rounded bg-[var(--surface-3)] animate-pulse" />
              <div className="h-2 w-20 rounded bg-[var(--surface-3)] animate-pulse ml-auto" />
              <div className="h-2 w-16 rounded bg-[var(--surface-3)] animate-pulse" />
            </div>
          ))}
        </div>
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
      invalidatePositionsCache();
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

    // Prioritize the active route's data query first. Defer background route warming
    // and auxiliary prefetches so they never compete for network connections or CPU
    // during the critical initial page load and render.
    const warmTimeoutId = setTimeout(() => {
      const runWarming = () => {
        preloadSymbolManagementData();
        preloadFrequentWorkspaceRoutes();
        preloadAllWorkspaceRoutes();
        prefetchInitialAnalyticsData(queryClient);
        prefetchInitialWorkspaceData(queryClient);
      };

      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(runWarming, { timeout: 2000 });
      } else {
        runWarming();
      }
    }, 800);

    return () => clearTimeout(warmTimeoutId);
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
    // Module-level request caches outlive route trees. Reset them at every
    // authenticated boundary so another manager or broker never inherits rows
    // (or an in-flight response) from the previous session.
    invalidatePositionsCache();
    rememberValidSession(status);
    // Start authenticated data warming before the dashboard transition. React
    // Query deduplicates this with the authenticated effect below.
    prefetchInitialAnalyticsData(queryClient);
    prefetchInitialWorkspaceData(queryClient);
    setSessionVersion((value) => value + 1);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    invalidatePositionsCache();
    invalidateSymbolManagementData();
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
