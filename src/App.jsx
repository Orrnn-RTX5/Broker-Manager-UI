import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import { AdminLogin, BrokerSelector, ManagerLogin } from './features/auth/BrokerAuthScreens';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
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


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionVersion, setSessionVersion] = useState(0);

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
    const token = authService.getAuthToken();
    if (token && !authService.isTokenExpired()) {
      setIsAuthenticated(true);
    } else if (token) {
      authService.expireSession('token_expired');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      authService.clearSession();
      clearBrokerInfo();
      setIsAuthenticated(false);
      setSessionVersion((value) => value + 1);
    };
    const handleTokenUpdated = () => {
      setSessionVersion((value) => value + 1);
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    window.addEventListener('auth:token-updated', handleTokenUpdated);
    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
      window.removeEventListener('auth:token-updated', handleTokenUpdated);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

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
  }, [isAuthenticated, sessionVersion]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1115]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const handleLogin = () => {
    if (authService.isTokenExpired()) {
      authService.expireSession('token_expired');
      return;
    }
    setSessionVersion((value) => value + 1);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    authService.clearSession();
    clearBrokerInfo();
    setSessionVersion((value) => value + 1);
    setIsAuthenticated(false);
  };

  return (
    <Router>
      <GlobalErrorBoundary>
        {!isAuthenticated ? (
          <Routes>
            <Route path="/" element={<BrokerSelector />} />
            <Route path="/manager-login" element={<ManagerLogin onLoginSuccess={handleLogin} />} />
            <Route path="/admin-login" element={<AdminLogin onLoginSuccess={handleLogin} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
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
