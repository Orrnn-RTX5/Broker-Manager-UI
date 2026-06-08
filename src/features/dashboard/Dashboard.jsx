import { Users, DollarSign, BarChart3, Wallet } from 'lucide-react';
import ComingSoon from '../../components/ComingSoon';
import { DASHBOARD_PLACEHOLDER_MODE } from './dashboardState';

const Kpi = ({ icon, label, value, hint }) => (
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
      <div className="text-2xl font-semibold tabular" style={{ color: 'var(--text)' }}>
        {value ?? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>—</span>}
      </div>
      {hint && (
        <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
          {hint}
        </div>
      )}
    </div>
  </div>
);

const Dashboard = () => {
  return (
    <div className="p-6 w-full h-full flex flex-col gap-6" data-dashboard-mode={DASHBOARD_PLACEHOLDER_MODE ? 'placeholder' : 'live'}>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
            Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Real-time overview of accounts, deposits, and trading activity.
          </p>
        </div>
      </div>

      {/* KPI row — live values pending backend aggregation endpoints */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={<Users size={18} />}      label="Real Accounts"   hint="Live metric pending" />
        <Kpi icon={<DollarSign size={18} />} label="Deposits 24h"    hint="Live metric pending" />
        <Kpi icon={<BarChart3 size={18} />}  label="Open Positions"  hint="Live metric pending" />
        <Kpi icon={<Wallet size={18} />}     label="Equity"          hint="Live metric pending" />
      </div>

      {/* Charts row — rendered when the backend aggregation endpoints ship */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ComingSoon title="Real Accounts" description="Time-series of active account registrations." />
        <ComingSoon title="Deposits & Withdrawals" description="Aggregated USD flow over time." />
        <ComingSoon title="Accounts by Source" description="Traffic source breakdown (pie)." />
      </div>

      <ComingSoon title="Liquidity Providers" description="Configured LPs and routing health." height={140} />
    </div>
  );
};

export default Dashboard;
