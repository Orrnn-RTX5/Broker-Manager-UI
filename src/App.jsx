import { useCallback, useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import { AdminLogin, ManagerLogin } from './features/auth/BrokerAuthScreens';
import DesktopWindowControls from './components/DesktopWindowControls';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import RequirePermission from './components/RequirePermission';
import authService from './services/authService';
import { clearBrokerInfo } from './services/brokerAuth';

import Dashboard from './features/dashboard/Dashboard';
import TradingAccountsDashboard from './features/analytics/TradingAccountsDashboard';
import OnlineUsersDashboard from './features/analytics/OnlineUsersDashboard';
import OpenPositionsDashboard from './features/analytics/OpenPositionsDashboard';
import AdvertisingCampaignsDashboard from './features/analytics/AdvertisingCampaignsDashboard';
import ByCountryDashboard from './features/analytics/ByCountryDashboard';
import OpenOrdersDashboard from './features/analytics/OpenOrdersDashboard';
import ClientsDashboard from './features/clients/ClientsDashboard';
import OnlineUsersPage from './features/clients/OnlineUsersPage';
import TradingAccountsPage from './features/clients/TradingAccountsPage';
import PositionsPage from './features/clients/PositionsPage';
import OpenPositionsPage from './features/clients/OpenPositionsPage';
import OrdersPage from './features/clients/OrdersPage';
import DealsPage from './features/clients/DealsPage';
import GroupsPage from './features/groups/GroupsPage';
import GroupDetailsPage from './features/groups/GroupDetailsPage';
import DealerQueuePage from './features/dealer/DealerQueuePage';
import RestrictedAccountsPage from './features/dealer/RestrictedAccountsPage';
import IBListPage from './features/ib/IBListPage';
import IBTreePage from './features/ib/IBTreePage';
import SymbolsOverviewPage from './features/symbols/SymbolsOverviewPage';
import SymbolListPage from './features/symbols/SymbolListPage';
import SymbolManagementPage from './features/symbols/SymbolManagementPage';

const AUTH_STORAGE_POLL_MS = 2000;

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
    const handleKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        document.documentElement.classList.toggle('light');
        document.documentElement.classList.toggle('dark');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        {!isAuthenticated ? (
          <Routes>
            <Route path="/" element={<Navigate to="/manager-login" replace />} />
            <Route path="/manager-login" element={<ManagerLogin onLoginSuccess={handleLogin} />} />
            <Route path="/admin-login" element={<AdminLogin onLoginSuccess={handleLogin} />} />
            <Route path="*" element={<Navigate to="/manager-login" replace />} />
          </Routes>
        ) : (
          <AdminLayout isAuthenticated={isAuthenticated} onLogin={handleLogin} onLogout={handleLogout}>
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
              <Route path="/groups" element={<RequirePermission permission="manage_groups"><GroupsPage /></RequirePermission>} />
              <Route path="/groups/:groupName" element={<RequirePermission permission="manage_groups"><GroupDetailsPage /></RequirePermission>} />
              <Route path="/symbols" element={<RequirePermission permission="manage_groups"><SymbolsOverviewPage /></RequirePermission>} />
              <Route path="/symbols/:group" element={<RequirePermission permission="manage_groups"><SymbolListPage /></RequirePermission>} />
              <Route path="/symbol-management" element={<RequirePermission permission="manage_groups"><SymbolManagementPage /></RequirePermission>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AdminLayout>
        )}
      </GlobalErrorBoundary>
    </Router>
  );
}

export default App;
