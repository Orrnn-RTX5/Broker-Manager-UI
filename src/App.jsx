import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import Login from './features/auth/Login';

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
import OrdersPage from './features/clients/OrdersPage';
import DealsPage from './features/clients/DealsPage';
import GroupsPage from './features/groups/GroupsPage';
import GroupDetailsPage from './features/groups/GroupDetailsPage';


const PlaceholderPage = ({ title }) => (
  <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
    <h2 className="text-2xl font-bold text-gray-400 mb-2">{title}</h2>
    <p className="text-gray-500">Feature modular structure loading...</p>
  </div>
);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1115]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const handleLogin = (token) => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setIsAuthenticated(false);
  };

  return (
    <Router>
      {!isAuthenticated ? (
        <Routes>
          <Route path="*" element={<Login onLoginSuccess={handleLogin} />} />
        </Routes>
      ) : (
        <AdminLayout isAuthenticated={isAuthenticated} onLogin={handleLogin} onLogout={handleLogout}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics/trading-accounts" element={<TradingAccountsDashboard />} />
            <Route path="/analytics/online-users" element={<OnlineUsersDashboard />} />
            <Route path="/analytics/open-positions" element={<OpenPositionsDashboard />} />
            <Route path="/analytics/advertising-campaigns" element={<AdvertisingCampaignsDashboard />} />
            <Route path="/analytics/open-orders" element={<OpenOrdersDashboard />} />
            <Route path="/analytics/by-country" element={<ByCountryDashboard />} />
            <Route path="/clients" element={<ClientsDashboard />} />
            <Route path="/clients/online-users" element={<OnlineUsersPage />} />
            <Route path="/clients/trading-accounts" element={<TradingAccountsPage />} />
            <Route path="/clients/positions" element={<PositionsPage />} />
            <Route path="/clients/orders" element={<OrdersPage />} />
            <Route path="/dealing" element={<DealsPage />} />
            <Route path="/groups" element={<GroupsPage />} />
              <Route path="/groups/:groupName" element={<GroupDetailsPage />} />
            <Route path="/positions" element={<PlaceholderPage title="Live Positions Grid (Ag-Grid)" />} />
            <Route path="/settings" element={<PlaceholderPage title="Global Server Configuration" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AdminLayout>
      )}
    </Router>
  );
}

export default App;
