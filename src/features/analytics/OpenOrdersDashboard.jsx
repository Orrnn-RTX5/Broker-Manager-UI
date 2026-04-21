import React, { useState } from 'react';
import { Search, Loader2, AlertCircle, ShoppingBag } from 'lucide-react';
import DashboardHeader from './components/DashboardHeader';
import OpenedOrderCard from './components/OpenedOrderCard';
import OrdersByReasonGrid from './components/OrdersByReasonPie';
import { getOpenedOrders } from '../../services/api';

const OpenOrdersDashboard = () => {
  const [loginId, setLoginId] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleFetchOrders = async (e) => {
    if (e) e.preventDefault();
    if (!loginId.trim()) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const data = await getOpenedOrders(loginId.trim());
      setOrders(data);
    } catch (err) {
      console.error('Fetch Opened Orders Error:', err);
      setError(err.message || 'Failed to fetch orders. Please check backend connection.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden bg-[var(--bg)]">
      {/* Header Area */}
      <div className="px-6 pt-6 pb-4 shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
        <DashboardHeader
          title="Opened Orders"
          subtitle="Real-time order monitoring by Account ID."
        />

        {/* Search Bar (Moved to top, square, smaller) */}
        <div className="mt-4 max-w-md">
          <form
            onSubmit={handleFetchOrders}
            className="flex items-center"
          >
            <div className="flex-1 relative flex items-center">
              <div className="absolute left-3 text-[var(--muted)]">
                <Search size={16} />
              </div>
              <input
                type="text"
                placeholder="Enter Login ID..."
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border-3)] text-sm py-2 pl-10 pr-4 rounded-none text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !loginId.trim()}
              className="px-6 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-none transition-all flex items-center gap-2 whitespace-nowrap border border-[var(--accent)]"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Fetching...
                </>
              ) : (
                'Fetch Orders'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Main Content Area (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>Fetching orders from backend...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 py-20 text-center max-w-md mx-auto">
            <div className="p-4 rounded-full" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
              <AlertCircle size={40} />
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Search Failed</h3>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>{error}</p>
            </div>
            <button
              onClick={handleFetchOrders}
              className="ui-btn ui-btn-primary"
            >
              Retry Connection
            </button>
          </div>
        ) : !hasSearched ? (
          <div className="h-full flex flex-col items-center justify-center gap-6 py-20 opacity-40">
            <div className="p-6 rounded-full" style={{ background: 'var(--surface-3)' }}>
              <Search size={60} style={{ color: 'var(--muted)' }} />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Ready to Search</h3>
              <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--text-3)' }}>
                Enter a Login ID in the field above to monitor active and pending orders for that account.
              </p>
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
            <ShoppingBag size={48} style={{ color: 'var(--muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>No opened orders found for Login ID: <span className="font-bold" style={{ color: 'var(--text)' }}>{loginId}</span></p>
          </div>
        ) : (
          <div className="flex flex-col gap-8 max-w-5xl mx-auto py-2">
            {/* Analytics Summary Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <OrdersByReasonGrid />
              {/* Future analytics components can go here */}
            </div>

            {/* Individual Records */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-4 w-1 bg-[var(--accent)] rounded-full"></div>
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>Individual Order Records</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {orders.map((order) => (
                  <OpenedOrderCard key={order.ticket} order={order} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OpenOrdersDashboard;
