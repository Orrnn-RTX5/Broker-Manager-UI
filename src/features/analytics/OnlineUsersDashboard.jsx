import { useCallback, useMemo, useState } from 'react';
import { Monitor, Search, ShieldCheck, Users, Wallet } from 'lucide-react';
import OnlineUsersDataGrid from './components/OnlineUsersDataGrid';
import { buildOnlineUserMetrics } from '../../utils/onlineUsers';
import { useAnalyticsRouteTiming } from '../../hooks/useAnalyticsTiming.js';
import { ANALYTICS_VIEWS } from '../../utils/analyticsQueryOptions.js';

const formatInteger = (value) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(value);

const formatMoney = (value) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const MetricCard = ({ icon, label, value, hint }) => (
  <div title={hint} className="online-users-metric-card ui-card h-full px-3 py-2 flex items-center gap-2">
    <div
      className="online-users-metric-icon w-7 h-7 rounded flex items-center justify-center shrink-0"
      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
    >
      {icon}
    </div>
    <div className="online-users-metric-content min-w-0 flex-1 flex flex-col self-stretch">
      <div className="online-users-metric-label text-xs leading-4 uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="online-users-metric-value tabular" style={{ color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  </div>
);

const OnlineUsersDashboard = () => {
  useAnalyticsRouteTiming(ANALYTICS_VIEWS.onlineUsers);
  const [search, setSearch] = useState('');
  const [visibleRows, setVisibleRows] = useState([]);

  const handleRowsChange = useCallback((rows) => {
    setVisibleRows(rows);
  }, []);

  const metrics = useMemo(() => buildOnlineUserMetrics(visibleRows), [visibleRows]);

  return (
    <div className="online-users-page p-3 w-full h-full flex flex-col gap-3 overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="online-users-title" style={{ color: 'var(--text)' }}>
            Online Users
          </h1>
          <p className="online-users-subtitle text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Live connected users from the manager backend.
          </p>
        </div>

        <div className="online-users-search relative w-full max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--muted)' }}
          />
          <input
            type="text"
            placeholder="Search login, group, build, IP..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 34 }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        <MetricCard
          icon={<Users size={18} />}
          label="Online Users"
          value={formatInteger(metrics.activeUsers)}
          hint="Users on the current page"
        />
        <MetricCard
          icon={<ShieldCheck size={18} />}
          label="Admin Sessions"
          value={formatInteger(metrics.adminSessions)}
          hint="Backend role flag"
        />
        <MetricCard
          icon={<Monitor size={18} />}
          label="Groups"
          value={formatInteger(metrics.uniqueGroups)}
          hint="Unique account groups"
        />
        <MetricCard
          icon={<Wallet size={18} />}
          label="Visible Equity"
          value={formatMoney(metrics.totalEquity)}
          hint="Sum of displayed users"
        />
      </div>

      <OnlineUsersDataGrid search={search} onRowsChange={handleRowsChange} />
    </div>
  );
};

export default OnlineUsersDashboard;
