import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';

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
      <AdminLayout isAuthenticated={isAuthenticated} onLogin={handleLogin} onLogout={handleLogout}>
        {isAuthenticated ? (
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
            <Route path="/positions" element={<PlaceholderPage title="Live Positions Grid (Ag-Grid)" />} />
            <Route path="/orders" element={<PlaceholderPage title="Order Management System" />} />
            <Route path="/settings" element={<PlaceholderPage title="Global Server Configuration" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <div className="flex flex-col items-center justify-center h-full w-full opacity-60 pointer-events-none select-none">
             <div className="w-24 h-24 mb-6 opacity-30 invert dark:invert-0 filter grayscale">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                   <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                   <line x1="8" y1="21" x2="16" y2="21"></line>
                   <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
             </div>
             <h2 className="text-2xl font-light text-gray-500 tracking-wide">Not Connected to Server</h2>
             <p className="text-gray-600 mt-2 text-sm">Please go to File {'>'} Connect to log in.</p>
          </div>
        )}
      </AdminLayout>
    </Router>
  );
}

export default App;
