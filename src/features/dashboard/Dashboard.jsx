import { AlertTriangle, BarChart3, DollarSign, RefreshCw, Users, Wallet } from 'lucide-react';
import ComingSoon from '../../components/ComingSoon';
import { DASHBOARD_PLACEHOLDER_MODE } from './dashboardState';
import useDashboardMetrics from './useDashboardMetrics';

const formatInteger = (value) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(value);

const formatMoney = (value) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
};

const Kpi = ({ icon, label, value, hint, loading, unavailable, tone = 'default' }) => {
  const valueColor = unavailable
    ? 'var(--muted)'
    : tone === 'danger'
      ? 'var(--danger-text)'
      : 'var(--text)';

  return (
    <div className="ui-card ui-card-hover p-5 flex flex-col gap-3">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        {icon}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--text-3)' }}>
          {label}
        </div>
        <div className="text-2xl font-semibold tabular" style={{ color: valueColor }}>
          {loading ? (
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Loading...</span>
          ) : value ?? (
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Unavailable</span>
          )}
        </div>
        {hint && (
          <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  );
};

const DashboardNotice = ({ errors }) => {
  if (!errors.length) return null;

  const isFullFailure = errors.some((error) => error.key === 'summary');
  const message = isFullFailure
    ? 'Dashboard data unavailable. DashboardSummary failed.'
    : `Partial dashboard data. ${errors.map((error) => error.key).join(', ')} endpoint failed.`;

  return (
    <div
      className="ui-card px-4 py-3 flex items-start gap-3 text-sm"
      style={{
        background: isFullFailure ? 'var(--danger-soft)' : 'var(--warn-soft)',
        borderColor: isFullFailure ? 'var(--danger-border)' : 'var(--warn-border)',
        color: isFullFailure ? 'var(--danger-text)' : 'var(--warn-text)',
      }}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div>
        <div className="font-medium">{message}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
          {errors.map((error) => `${error.key}: ${error.error}`).join(' | ')}
        </div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useDashboardMetrics();

  const metrics = data?.metrics;
  const sourceMode = data?.sourceMode || 'summary';
  const isSummarySource = sourceMode === 'summary';
  const sources = data?.sources || {};
  const errors = data?.errors || [];
  const asOf = formatTime(data?.asOf);
  const summaryHint = isSummarySource
    ? `From DashboardSummary${asOf ? ` at ${asOf}` : ''}`
    : '';
  const accountHint = isSummarySource
    ? summaryHint
    : `${sources.accountLimit?.ok ? 'From AccountLimitStatus' : 'From AccountDetailsMany'}${asOf ? ` at ${asOf}` : ''}`;
  const positionHint = isSummarySource
    ? summaryHint
    : `From PositionsAll${asOf ? ` at ${asOf}` : ''}`;
  const equityHint = isSummarySource
    ? summaryHint
    : `Computed from AccountDetailsMany${asOf ? ` at ${asOf}` : ''}`;

  return (
    <div
      className="p-6 w-full h-full flex flex-col gap-6"
      data-dashboard-mode={DASHBOARD_PLACEHOLDER_MODE ? 'placeholder' : 'live'}
    >
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
            Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Live account and trading metrics from manager APIs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="ui-btn ui-btn-secondary ui-btn-sm flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <DashboardNotice errors={errors} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={<Users size={18} />}
          label="Real Accounts"
          value={metrics?.realAccounts != null ? formatInteger(metrics.realAccounts) : null}
          loading={isLoading}
          unavailable={!isLoading && metrics?.realAccounts == null}
          hint={metrics?.realAccounts != null ? accountHint : 'Account total unavailable'}
        />
        <Kpi
          icon={<DollarSign size={18} />}
          label="Deposits 24h"
          value={metrics?.deposits24h != null ? formatMoney(metrics.deposits24h) : null}
          loading={isLoading}
          unavailable={!isLoading && metrics?.deposits24h == null}
          hint={metrics?.deposits24h != null ? summaryHint : 'Backend cashflow metric required'}
        />
        <Kpi
          icon={<BarChart3 size={18} />}
          label="Open Positions"
          value={metrics?.openPositions != null ? formatInteger(metrics.openPositions) : null}
          loading={isLoading}
          unavailable={!isLoading && metrics?.openPositions == null}
          hint={metrics?.openPositions != null ? positionHint : 'Position total unavailable'}
        />
        <Kpi
          icon={<Wallet size={18} />}
          label="Equity"
          value={metrics?.equity != null ? formatMoney(metrics.equity) : null}
          loading={isLoading}
          unavailable={!isLoading && metrics?.equity == null}
          hint={metrics?.equity != null ? equityHint : 'Account equity unavailable'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ComingSoon title="Real Accounts" description="Backend aggregation required for account registration series." />
        <ComingSoon title="Deposits & Withdrawals" description="Backend aggregation required for 24h cashflow series." />
        <ComingSoon title="Accounts by Source" description="Backend aggregation required for source breakdown." />
      </div>

      <ComingSoon title="Liquidity Providers" description="Backend aggregation required for LP routing health." height={140} />
    </div>
  );
};

export default Dashboard;
