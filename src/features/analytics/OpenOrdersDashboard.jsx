import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { buildOrderMetrics } from '../../utils/orderAnalytics';
import { getOpenedOrdersAnalyticsQueryOptions } from './analyticsQueries.js';
import { useAnalyticsDataTiming, useAnalyticsRouteTiming } from '../../hooks/useAnalyticsTiming.js';
import { ANALYTICS_VIEWS } from '../../utils/analyticsQueryOptions.js';
import { startAnalyticsTiming } from '../../utils/analyticsPerformance.js';

const EMPTY_ORDERS = Object.freeze([]);

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
    <div className="opened-orders-metric ui-card ui-card-hover p-4 flex items-start gap-3">
      <div
        className="opened-orders-metric-icon w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        {icon}
      </div>
      <div className="opened-orders-metric-content min-w-0">
        <div className="opened-orders-metric-label text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>
          {label}
        </div>
        <div className="opened-orders-metric-value text-2xl font-semibold tabular mt-1" style={{ color }}>
          {value}
        </div>
        <div className="opened-orders-metric-description text-[11px] mt-1 leading-snug" style={{ color: 'var(--muted)' }}>
          {description}
        </div>
      </div>
    </div>
  );
};

const OpenOrdersDashboard = () => {
  useAnalyticsRouteTiming(ANALYTICS_VIEWS.openOrders, { completeOnRoute: true });
  const [loginId, setLoginId] = useState('');
  const [detailLogin, setDetailLogin] = useState('');

  const queryOptions = useMemo(
    () => getOpenedOrdersAnalyticsQueryOptions(detailLogin),
    [detailLogin]
  );
  const detailQuery = useQuery(queryOptions);
  const detailOrders = Array.isArray(detailQuery.data) ? detailQuery.data : EMPTY_ORDERS;
  const hasSearched = Boolean(detailLogin);
  const detailLoading = hasSearched && detailQuery.isPending;
  const detailBusy = hasSearched && detailQuery.isFetching;
  const detailError = detailQuery.isError
    ? detailQuery.error instanceof Error
      ? detailQuery.error.message
      : 'Failed to fetch opened orders.'
    : null;

  const metrics = useMemo(() => buildOrderMetrics(detailOrders), [detailOrders]);
  const netTone = metrics.netProfit > 0 ? 'profit' : metrics.netProfit < 0 ? 'loss' : 'default';

  const timingMetadata = useMemo(() => ({
    rowCount: detailOrders.length,
    cacheAvailable: detailQuery.dataUpdatedAt > 0,
  }), [detailOrders.length, detailQuery.dataUpdatedAt]);
  useAnalyticsDataTiming(ANALYTICS_VIEWS.openOrders, {
    settled: hasSearched && !detailLoading && (detailQuery.dataUpdatedAt > 0 || detailQuery.isError),
    outcome: detailQuery.isError ? 'error' : detailOrders.length > 0 ? 'success' : 'empty',
    dataVersion: `${detailLogin}:${detailQuery.dataUpdatedAt}:${detailQuery.isError}`,
    metadata: timingMetadata,
  });

  const handleFetchOrders = (event) => {
    if (event) event.preventDefault();

    const login = loginId.trim();
    if (!login) return;

    startAnalyticsTiming(ANALYTICS_VIEWS.openOrders, 'data-fetch');
    if (login === detailLogin) detailQuery.refetch();
    else setDetailLogin(login);
  };

  const clearSearch = () => {
    setDetailLogin('');
    setLoginId('');
  };

  return (
    <div className="opened-orders-page p-6 w-full h-full min-h-0 flex flex-col gap-5 overflow-hidden">
      <div className="opened-orders-header flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shrink-0">
        <div>
          <h1 className="opened-orders-title text-2xl font-semibold" style={{ color: 'var(--text)' }}>
            Opened Orders
          </h1>
          <p className="opened-orders-subtitle text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            {hasSearched
              ? `Opened order details for login ${detailLogin}.`
              : 'Search a login to view active order exposure, entry prices, P/L, costs, and state.'}
          </p>
        </div>

        <form onSubmit={handleFetchOrders} className="opened-orders-search flex flex-col sm:flex-row sm:items-center gap-2 w-full xl:w-auto shrink-0">
          <div className="opened-orders-search-field relative w-full sm:w-80">
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
            disabled={detailBusy || !loginId.trim()}
            className="ui-btn ui-btn-primary ui-btn-sm flex items-center justify-center gap-1.5"
          >
            {detailBusy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
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

      <section className="opened-orders-content flex-1 min-h-0 overflow-y-auto">
      {!hasSearched ? (
        <div className="opened-orders-state ui-card h-full min-h-0 flex flex-col items-center justify-center gap-5 text-center px-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <Search size={34} />
          </div>
          <div>
            <h2 className="opened-orders-state-title text-xl font-semibold" style={{ color: 'var(--text)' }}>
              Search users
            </h2>
            <p className="opened-orders-state-copy text-sm mt-2 max-w-lg" style={{ color: 'var(--text-3)' }}>
              Enter a trading account login to load that account's opened order details from the backend.
            </p>
          </div>
        </div>
      ) : detailLoading ? (
        <div className="opened-orders-state ui-card h-full min-h-0 flex flex-col items-center justify-center gap-3">
          <Loader2 size={30} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <div className="opened-orders-loading-label text-sm font-medium" style={{ color: 'var(--text-3)' }}>
            Fetching opened orders from backend...
          </div>
        </div>
      ) : detailError ? (
        <div className="opened-orders-state ui-card h-full min-h-0 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="p-4 rounded-full" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
            <AlertCircle size={34} />
          </div>
          <div>
            <h2 className="opened-orders-state-title text-xl font-semibold" style={{ color: 'var(--text)' }}>
              Search Failed
            </h2>
            <p className="opened-orders-state-copy text-sm mt-2 max-w-lg" style={{ color: 'var(--text-3)' }}>
              {detailError}
            </p>
          </div>
          <button type="button" onClick={handleFetchOrders} className="ui-btn ui-btn-primary ui-btn-sm">
            Retry
          </button>
        </div>
      ) : detailOrders.length === 0 ? (
        <div className="opened-orders-state ui-card h-full min-h-0 flex flex-col items-center justify-center gap-4 text-center px-6">
          <ShoppingBag size={42} style={{ color: 'var(--muted)' }} />
          <div>
            <h2 className="opened-orders-state-title text-xl font-semibold" style={{ color: 'var(--text)' }}>
              No Opened Orders
            </h2>
            <p className="opened-orders-state-copy text-sm mt-2 max-w-lg" style={{ color: 'var(--text-3)' }}>
              No opened orders were returned for login {detailLogin}.
            </p>
          </div>
        </div>
      ) : (
        <div className="opened-orders-results flex flex-col gap-5">
          <div className="opened-orders-metrics grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <MetricCard
              icon={<Hash size={18} />}
              label="Opened Orders"
              value={formatInteger(metrics.totalOrders)}
              description="Active orders for this login."
            />
            <MetricCard
              icon={<TrendingUp size={18} />}
              label="Buy"
              value={formatInteger(metrics.buyOrders)}
              description="Long-side orders."
              tone="buy"
            />
            <MetricCard
              icon={<TrendingDown size={18} />}
              label="Sell"
              value={formatInteger(metrics.sellOrders)}
              description="Short-side orders."
              tone="sell"
            />
            <MetricCard
              icon={<BarChart3 size={18} />}
              label="Lots"
              value={formatDecimal(metrics.totalVolume)}
              description={`${formatInteger(metrics.symbols)} active symbols.`}
            />
            <MetricCard
              icon={<Wallet size={18} />}
              label="Net P/L"
              value={formatDecimal(metrics.netProfit)}
              description="Profit after visible costs."
              tone={netTone}
            />
          </div>

          <div className="flex flex-col gap-5">
            <OrdersByReasonGrid orders={detailOrders} />
            <div className="flex flex-col gap-4 min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full" style={{ background: 'var(--accent)' }} />
                <h3 className="opened-orders-section-title text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
                  Important Order Details
                </h3>
              </div>
              {detailOrders.map((order, index) => (
                <OpenedOrderCard key={`${order.ticket}-${index}`} order={order} />
              ))}
            </div>
          </div>
        </div>
      )}
      </section>
    </div>
  );
};

export default OpenOrdersDashboard;
