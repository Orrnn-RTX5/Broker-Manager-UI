import { useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Hash,
  Loader2,
  Search,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import OpenedOrderCard from './components/OpenedOrderCard';
import OrdersByReasonGrid from './components/OrdersByReasonPie';
import { getOpenedOrders } from '../../services/api';
import { buildOrderMetrics } from '../../utils/orderAnalytics';

const formatInteger = (value) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(value);

const formatDecimal = (value) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const MetricCard = ({ icon, label, value, description, tone = 'default' }) => {
  const color = tone === 'buy'
    ? 'var(--ok-text)'
    : tone === 'sell'
      ? 'var(--danger-text)'
      : tone === 'profit'
        ? 'var(--ok-text)'
        : tone === 'loss'
          ? 'var(--danger-text)'
          : 'var(--text)';

  return (
    <div className="ui-card ui-card-hover p-4 flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>
          {label}
        </div>
        <div className="text-2xl font-semibold tabular mt-1" style={{ color }}>
          {value}
        </div>
        <div className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--muted)' }}>
          {description}
        </div>
      </div>
    </div>
  );
};

const OpenOrdersDashboard = () => {
  const [loginId, setLoginId] = useState('');
  const [detailOrders, setDetailOrders] = useState([]);
  const [detailLogin, setDetailLogin] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const metrics = useMemo(() => buildOrderMetrics(detailOrders), [detailOrders]);
  const netTone = metrics.netProfit > 0 ? 'profit' : metrics.netProfit < 0 ? 'loss' : 'default';

  const handleFetchOrders = async (event) => {
    if (event) event.preventDefault();

    const login = loginId.trim();
    if (!login) return;

    setDetailLoading(true);
    setDetailError(null);
    setHasSearched(true);
    setDetailLogin(login);

    try {
      const data = await getOpenedOrders(login);
      setDetailOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      setDetailOrders([]);
      setDetailError(error instanceof Error ? error.message : 'Failed to fetch opened orders.');
    } finally {
      setDetailLoading(false);
    }
  };

  const clearSearch = () => {
    setHasSearched(false);
    setDetailOrders([]);
    setDetailError(null);
    setDetailLogin('');
    setLoginId('');
  };

  return (
    <div className="p-6 w-full h-full flex flex-col gap-5 overflow-y-auto">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
            Opened Orders
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            {hasSearched
              ? `Opened order details for login ${detailLogin}.`
              : 'Search a login to view active order exposure, entry prices, P/L, costs, and state.'}
          </p>
        </div>

        <form onSubmit={handleFetchOrders} className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto">
          <div className="relative w-full sm:w-80">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--muted)' }}
            />
            <input
              type="text"
              placeholder="Enter login ID..."
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              className="ui-input ui-input-sm"
              style={{ paddingLeft: 34 }}
            />
          </div>
          <button
            type="submit"
            disabled={detailLoading || !loginId.trim()}
            className="ui-btn ui-btn-primary ui-btn-sm flex items-center justify-center gap-1.5"
          >
            {detailLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Fetch Orders
          </button>
          {hasSearched && (
            <button
              type="button"
              onClick={clearSearch}
              className="ui-btn ui-btn-secondary ui-btn-sm flex items-center justify-center gap-1.5"
            >
              <X size={13} />
              Clear
            </button>
          )}
        </form>
      </div>

      {!hasSearched ? (
        <div className="ui-card min-h-[480px] flex flex-col items-center justify-center gap-5 text-center px-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <Search size={34} />
          </div>
          <div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
              Search users
            </h2>
            <p className="text-sm mt-2 max-w-lg" style={{ color: 'var(--text-3)' }}>
              Enter a trading account login to load that account's opened order details from the backend.
            </p>
          </div>
        </div>
      ) : detailLoading ? (
        <div className="ui-card min-h-[480px] flex flex-col items-center justify-center gap-3">
          <Loader2 size={30} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <div className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>
            Fetching opened orders from backend...
          </div>
        </div>
      ) : detailError ? (
        <div className="ui-card min-h-[480px] flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="p-4 rounded-full" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
            <AlertCircle size={34} />
          </div>
          <div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
              Search Failed
            </h2>
            <p className="text-sm mt-2 max-w-lg" style={{ color: 'var(--text-3)' }}>
              {detailError}
            </p>
          </div>
          <button type="button" onClick={handleFetchOrders} className="ui-btn ui-btn-primary ui-btn-sm">
            Retry
          </button>
        </div>
      ) : detailOrders.length === 0 ? (
        <div className="ui-card min-h-[480px] flex flex-col items-center justify-center gap-4 text-center px-6">
          <ShoppingBag size={42} style={{ color: 'var(--muted)' }} />
          <div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
              No Opened Orders
            </h2>
            <p className="text-sm mt-2 max-w-lg" style={{ color: 'var(--text-3)' }}>
              No opened orders were returned for login {detailLogin}.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <MetricCard
              icon={<Hash size={18} />}
              label="Opened Orders"
              value={formatInteger(metrics.totalOrders)}
              description="Active records returned for this login."
            />
            <MetricCard
              icon={<TrendingUp size={18} />}
              label="Buy"
              value={formatInteger(metrics.buyOrders)}
              description="Long-side opened orders."
              tone="buy"
            />
            <MetricCard
              icon={<TrendingDown size={18} />}
              label="Sell"
              value={formatInteger(metrics.sellOrders)}
              description="Short-side opened orders."
              tone="sell"
            />
            <MetricCard
              icon={<BarChart3 size={18} />}
              label="Lots"
              value={formatDecimal(metrics.totalVolume)}
              description={`${formatInteger(metrics.symbols)} symbols currently active.`}
            />
            <MetricCard
              icon={<Wallet size={18} />}
              label="Net P/L"
              value={formatDecimal(metrics.netProfit)}
              description="Profit minus visible order costs from backend rows."
              tone={netTone}
            />
          </div>

          <div className="flex flex-col gap-5">
            <OrdersByReasonGrid orders={detailOrders} />
            <div className="flex flex-col gap-4 min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full" style={{ background: 'var(--accent)' }} />
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
                  Important Order Details
                </h3>
              </div>
              {detailOrders.map((order, index) => (
                <OpenedOrderCard key={`${order.ticket}-${index}`} order={order} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OpenOrdersDashboard;
