import { useState } from 'react';
import { TrendingUp, TrendingDown, Users, DollarSign, BarChart3, Wallet } from 'lucide-react';
import RealAccountsChart from './components/RealAccountsChart';
import RealDepositsChart from './components/RealDepositsChart';
import AccountsBySourceChart from './components/AccountsBySourceChart';
import LiquidityProviders from './components/LiquidityProviders';
import Widechart from './components/Widechart';

const Kpi = ({ icon: Icon, label, value, delta, deltaTone = 'pos', hint }) => (
  <div className="ui-card ui-card-hover p-5 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        <Icon size={18} />
      </div>
      {delta != null && (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: deltaTone === 'pos' ? 'var(--ok-soft)' : 'var(--danger-soft)',
            color:      deltaTone === 'pos' ? 'var(--ok-text)' : 'var(--danger-text)',
            border: `1px solid ${deltaTone === 'pos' ? 'var(--ok-border)' : 'var(--danger-border)'}`,
          }}
        >
          {deltaTone === 'pos' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {delta}
        </span>
      )}
    </div>
    <div>
      <div className="text-xs uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="text-2xl font-semibold tabular" style={{ color: 'var(--text)' }}>
        {value}
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
  const [showWidechart, setShowWidechart] = useState(false);

  return (
    <div className="p-6 w-full h-full flex flex-col gap-6">
      {/* Page header */}
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

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Users}     label="Real Accounts" value="12,487" delta="+2.4%" deltaTone="pos" hint="vs. last 24h" />
        <Kpi icon={DollarSign} label="Deposits 24h"  value="$1.82M" delta="+5.1%" deltaTone="pos" hint="vs. last 24h" />
        <Kpi icon={BarChart3}  label="Open Positions" value="3,214"  delta="-0.8%" deltaTone="neg" hint="vs. last 24h" />
        <Kpi icon={Wallet}     label="Equity"        value="$48.3M" delta="+1.2%" deltaTone="pos" hint="across all groups" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <RealAccountsChart />
        <RealDepositsChart />
        <AccountsBySourceChart onClick={() => setShowWidechart(true)} />
      </div>

      {/* Widechart (conditional) */}
      {showWidechart && <Widechart onClose={() => setShowWidechart(false)} />}

      {/* Liquidity providers */}
      <div className="ui-card p-5">
        <LiquidityProviders />
      </div>
    </div>
  );
};

export default Dashboard;
