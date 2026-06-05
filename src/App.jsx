import { useCallback, useRef, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import { AdminLogin, BrokerSelector, ManagerLogin } from './features/auth/BrokerAuthScreens';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import authService from './services/authService';
import { clearBrokerInfo, getBrokerInfo } from './services/brokerAuth';

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

  const getUnauthenticatedRedirect = () => (getBrokerInfo() ? '/manager-login' : '/');

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
  }, [rememberValidSession]);

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
    clearBrokerInfo();
    sessionSnapshotRef.current = null;
    setSessionVersion((value) => value + 1);
    setIsAuthenticated(false);
  };

  const unauthenticatedRedirect = getUnauthenticatedRedirect();

  return (
    <Router>
      <GlobalErrorBoundary>
        {!isAuthenticated ? (
          <Routes>
            <Route path="/" element={<BrokerSelector />} />
            <Route path="/manager-login" element={<ManagerLogin onLoginSuccess={handleLogin} />} />
            <Route path="/admin-login" element={<AdminLogin onLoginSuccess={handleLogin} />} />
            <Route path="*" element={<Navigate to={unauthenticatedRedirect} replace />} />
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
              <Route path="/dealer/queue" element={<DealerQueuePage />} />
              <Route path="/dealer/restrictions" element={<RestrictedAccountsPage />} />
              <Route path="/ib" element={<IBListPage />} />
              <Route path="/ib/tree" element={<IBTreePage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/groups/:groupName" element={<GroupDetailsPage />} />
              <Route path="/symbols" element={<SymbolsOverviewPage />} />
              <Route path="/symbols/:group" element={<SymbolListPage />} />
              <Route path="/symbol-management" element={<SymbolManagementPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AdminLayout>
        )}
      </GlobalErrorBoundary>
    </Router>
  );
}

export default App;
