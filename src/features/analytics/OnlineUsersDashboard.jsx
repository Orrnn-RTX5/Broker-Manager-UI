import { useCallback, useMemo, useState } from 'react';
import { Monitor, Search, ShieldCheck, Users, Wallet } from 'lucide-react';
import OnlineUsersDataGrid from './components/OnlineUsersDataGrid';
import { buildOnlineUserMetrics } from '../../utils/onlineUsers';

const formatInteger = (value) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(value);

const formatMoney = (value) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const MetricCard = ({ icon, label, value, hint }) => (
  <div className="ui-card ui-card-hover min-h-[122px] h-full p-4 flex items-start gap-3">
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
    >
      {icon}
    </div>
    <div className="min-w-0 flex-1 flex flex-col self-stretch">
      <div className="min-h-8 text-xs leading-4 uppercase tracking-wider font-medium" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="text-2xl leading-7 font-semibold tabular mt-1" style={{ color: 'var(--text)' }}>
        {value}
      </div>
      <div className="min-h-4 text-[11px] leading-4 mt-auto truncate" style={{ color: 'var(--muted)' }}>
        {hint}
      </div>
    </div>
  </div>
);

const OnlineUsersDashboard = () => {
  const [search, setSearch] = useState('');
  const [visibleRows, setVisibleRows] = useState([]);

  const handleRowsChange = useCallback((rows) => {
    setVisibleRows(rows);
  }, []);

  const metrics = useMemo(() => buildOnlineUserMetrics(visibleRows), [visibleRows]);

  return (
    <div className="p-6 w-full h-full flex flex-col gap-5 overflow-y-auto">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
            Online Users
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Live connected users from the manager backend.
          </p>
        </div>

        <div className="relative w-full max-w-sm">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={<Users size={18} />}
          label="Online Users"
          value={formatInteger(metrics.activeUsers)}
          hint="Matching current filter"
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
