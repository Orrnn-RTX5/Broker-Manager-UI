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

import Dashboard from './features/dashboard/Dashboard';

// Keep the dashboard and workspace shell in the initial bundle. Every other
// workspace view is loaded only when it is opened, so its data/UI code cannot
// delay the first dashboard render.
const TradingAccountsDashboard = lazy(() => import('./features/analytics/TradingAccountsDashboard'));
const OnlineUsersDashboard = lazy(() => import('./features/analytics/OnlineUsersDashboard'));
const AdvertisingCampaignsDashboard = lazy(() => import('./features/analytics/AdvertisingCampaignsDashboard'));
const ByCountryDashboard = lazy(() => import('./features/analytics/ByCountryDashboard'));
const OpenOrdersDashboard = lazy(() => import('./features/analytics/OpenOrdersDashboard'));
const ClientsDashboard = lazy(() => import('./features/clients/ClientsDashboard'));
const OnlineUsersPage = lazy(() => import('./features/clients/OnlineUsersPage'));
const TradingAccountsPage = lazy(() => import('./features/clients/TradingAccountsPage'));
const PositionsPage = lazy(() => import('./features/clients/PositionsPage'));
const OpenPositionsPage = lazy(() => import('./features/clients/OpenPositionsPage'));
const OrdersPage = lazy(() => import('./features/clients/OrdersPage'));
const DealsPage = lazy(() => import('./features/clients/DealsPage'));
const GroupsPage = lazy(() => import('./features/groups/GroupsPage'));
const GroupDetailsPage = lazy(() => import('./features/groups/GroupDetailsPage'));
const DealerQueuePage = lazy(() => import('./features/dealer/DealerQueuePage'));
const RestrictedAccountsPage = lazy(() => import('./features/dealer/RestrictedAccountsPage'));
const IBListPage = lazy(() => import('./features/ib/IBListPage'));
const IBTreePage = lazy(() => import('./features/ib/IBTreePage'));
const SymbolsOverviewPage = lazy(() => import('./features/symbols/SymbolsOverviewPage'));
const SymbolListPage = lazy(() => import('./features/symbols/SymbolListPage'));
const SymbolManagementPage = lazy(() => import('./features/symbols/SymbolManagementPage'));

const AUTH_STORAGE_POLL_MS = 2000;
const PUBLIC_AUTH_PATHS = new Set(['/manager-login', '/admin-login']);

const WorkspaceRouteFallback = () => (
  <div
    role="status"
    aria-live="polite"
    className="flex min-h-full items-center justify-center p-6 text-sm"
    style={{ color: 'var(--muted)' }}
  >
    Loading workspace…
  </div>
);

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
    <Router>
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
