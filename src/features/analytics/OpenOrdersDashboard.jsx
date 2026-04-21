import React, { useState } from 'react';
import { Search, Loader2, AlertCircle, ShoppingBag } from 'lucide-react';
import DashboardHeader from './components/DashboardHeader';
import OpenedOrderCard from './components/OpenedOrderCard';
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
    <div className="relative h-full w-full flex flex-col overflow-hidden bg-[#0f1115]">
      {/* Header Area */}
      <div className="px-6 pt-6 pb-2 shrink-0">
        <DashboardHeader
          title="Opened Orders"
          subtitle="Real-time order monitoring by Account ID."
        />
      </div>

      {/* Main Content Area (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-6 pb-32">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
            <Loader2 size={32} className="animate-spin text-blue-500" />
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Fetching orders from backend...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 py-20 text-center max-w-md mx-auto">
            <div className="p-4 rounded-full bg-rose-500/10 text-rose-500">
              <AlertCircle size={40} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Search Failed</h3>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{error}</p>
            </div>
            <button 
              onClick={handleFetchOrders}
              className="mt-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-bold transition-all shadow-lg shadow-blue-600/20"
            >
              Retry Connection
            </button>
          </div>
        ) : !hasSearched ? (
          <div className="h-full flex flex-col items-center justify-center gap-6 py-20 opacity-60">
            <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10">
              <Search size={60} className="text-blue-500/40" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-2">Ready to Search</h3>
              <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>
                Enter a Login ID in the field below to monitor active and pending orders for that account.
              </p>
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
            <ShoppingBag size={48} className="text-gray-600" />
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>No opened orders found for Login ID: <span className="text-white font-bold">{loginId}</span></p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 max-w-4xl mx-auto py-2">
            {orders.map((order) => (
              <OpenedOrderCard key={order.ticket} order={order} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Search Bar (Fixed at bottom with glassmorphism) */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto">
          <form 
            onSubmit={handleFetchOrders}
            className="flex items-center gap-3 p-2 bg-[#1a1c23]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50"
          >
            <div className="flex-1 relative flex items-center">
              <div className="absolute left-3.5 text-blue-400">
                <Search size={18} />
              </div>
              <input
                type="text"
                placeholder="Enter Login ID to fetch orders..."
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full bg-white/5 border-none text-sm py-3 pl-11 pr-4 rounded-xl text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !loginId.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2 whitespace-nowrap"
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
    </div>
  );
};

export default OpenOrdersDashboard;
