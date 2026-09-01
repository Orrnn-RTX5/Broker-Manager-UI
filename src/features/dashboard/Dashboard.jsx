import { AlertTriangle, BarChart3, DollarSign, RefreshCw, Users, Wallet } from 'lucide-react';
import ComingSoon from '../../components/ComingSoon';
import { DASHBOARD_PLACEHOLDER_MODE } from './dashboardState';
import useDashboardMetrics, { useDashboardAccountLimits } from './useDashboardMetrics';

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

  const displayedValue = loading ? '—' : value ?? '—';
  const helperText = loading ? 'Loading live metrics…' : hint || 'Metric unavailable';

  return (
    <article className="dashboard-kpi ui-card ui-card-hover">
      <div className="dashboard-kpi-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
        {icon}
      </div>
      <div className="dashboard-kpi-content">
        <div className="dashboard-kpi-label" style={{ color: 'var(--text-3)' }}>{label}</div>
        <div className="dashboard-kpi-value tabular" style={{ color: valueColor }}>{displayedValue}</div>
        <div className="dashboard-kpi-hint" style={{ color: 'var(--muted)' }}>{helperText}</div>
      </div>
    </article>
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
  const {
    data: accountLimitData,
    isLoading: isAccountLimitLoading,
    isFetching: isAccountLimitFetching,
    refetch: refetchAccountLimits,
  } = useDashboardAccountLimits();

  const metrics = data?.metrics;
  const accountLimitMetrics = accountLimitData?.metrics;
  const realAccounts = accountLimitMetrics?.realAccounts ?? metrics?.realAccounts;
  const demoAccounts = accountLimitMetrics?.demoAccounts ?? metrics?.demoAccounts;
  const sourceMode = data?.sourceMode || 'summary';
  const isSummarySource = sourceMode === 'summary';
  const sources = data?.sources || {};
  const errors = data?.errors || [];
  const asOf = formatTime(data?.asOf);
  const accountAsOf = formatTime(accountLimitData?.asOf ?? data?.asOf);
  const summaryHint = isSummarySource
    ? `From DashboardSummary${asOf ? ` at ${asOf}` : ''}`
    : '';
  const accountHint = accountLimitMetrics
    ? `From AccountLimitStatus${accountAsOf ? ` at ${accountAsOf}` : ''}`
    : isSummarySource
    ? summaryHint
    : `${sources.accountLimit?.ok ? 'From AccountLimitStatus' : 'From AccountDetailsMany'}${asOf ? ` at ${asOf}` : ''}`;
  const positionHint = isSummarySource
    ? summaryHint
    : `From PositionsAll${asOf ? ` at ${asOf}` : ''}`;
  const equityHint = isSummarySource
    ? summaryHint
    : `Computed from AccountDetailsMany${asOf ? ` at ${asOf}` : ''}`;
  const isRefreshing = isFetching || isAccountLimitFetching;
  const refreshDashboard = () => {
    refetchAccountLimits();
    refetch();
  };

  return (
    <div
      className="dashboard-page p-6 pb-4 w-full min-h-full flex flex-col gap-4"
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
          onClick={refreshDashboard}
          disabled={isRefreshing}
          className="ui-btn ui-btn-secondary ui-btn-sm flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <DashboardNotice errors={errors} />

      <div className="dashboard-kpi-grid">
        <Kpi
          icon={<Users size={18} />}
          label="Real Accounts"
          value={realAccounts != null ? formatInteger(realAccounts) : null}
          loading={realAccounts == null && (isAccountLimitLoading || isLoading)}
          unavailable={realAccounts == null && !isAccountLimitLoading && !isLoading}
          hint={realAccounts != null ? accountHint : 'Account total unavailable'}
        />
        <Kpi
          icon={<Users size={18} />}
          label="Demo Accounts"
          value={demoAccounts != null ? formatInteger(demoAccounts) : null}
          loading={demoAccounts == null && (isAccountLimitLoading || isLoading)}
          unavailable={demoAccounts == null && !isAccountLimitLoading && !isLoading}
          hint={demoAccounts != null ? accountHint : 'Demo account total unavailable'}
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

      <div className="dashboard-insights-grid">
        <ComingSoon title="Real Accounts" description="Account-registration trends need the aggregation endpoint." />
        <ComingSoon title="Deposits & Withdrawals" description="Cashflow trends need the 24-hour aggregation endpoint." />
        <ComingSoon title="Accounts by Source" description="Source allocation needs its dedicated manager endpoint." />
      </div>

      <ComingSoon
        title="Liquidity Providers"
        description="Routing health will be shown when the liquidity aggregation endpoint is connected."
        height={112}
        compact
      />
    </div>
  );
};

export default Dashboard;
