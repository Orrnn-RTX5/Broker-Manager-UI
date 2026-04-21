import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  User, Shield, Laptop, Smartphone, Monitor, Clock, 
  ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, RefreshCcw
} from 'lucide-react';
import { getAccountsOnline } from '../../../services/api';

const formatDateTime = (ts) => {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

const formatAge = (seconds) => {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const rmins = mins % 60;
  return `${hrs}h ${rmins}m`;
};

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="inline ml-1" style={{ color: 'var(--muted)' }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />;
};

const AccountsOnlineGrid = ({ search = '', onRowsChange, onRowContext }) => {
  const { data: rawData = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['accounts-online'],
    queryFn: getAccountsOnline,
    refetchInterval: 10000, // Auto refresh every 10s
  });

  const [sortCol, setSortCol] = useState('login');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    const rows = Array.isArray(rawData) ? [...rawData] : (rawData?.answer || []);
    let filteredRows = rows;

    if (search) {
      const q = search.toLowerCase();
      filteredRows = rows.filter(r => 
        String(r.login).includes(q) || 
        (r.deviceType || '').toLowerCase().includes(q)
      );
    }

    filteredRows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av || '').localeCompare(String(bv || ''))
        : String(bv || '').localeCompare(String(av || ''));
    });
    return filteredRows;
  }, [rawData, search, sortCol, sortDir]);

  useMemo(() => { if (onRowsChange) onRowsChange(filtered); }, [filtered, onRowsChange]);

  const TH = ({ col, label, align = 'left' }) => (
    <th onClick={() => handleSort(col)} style={{ textAlign: align }} className="cursor-pointer">
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  return (
    <div className="ui-card flex flex-col w-full overflow-hidden min-h-[400px]">
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-2)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tabular" style={{ color: 'var(--text-3)' }}>
            {filtered.length} ACTIVE SESSIONS
          </span>
          {isFetching && <RefreshCcw size={12} className="animate-spin" style={{ color: 'var(--accent)' }} />}
        </div>
        <button onClick={() => refetch()} className="ui-btn ui-btn-ghost ui-btn-xs">FORCE RELOAD</button>
      </div>

      <div className="w-full overflow-x-auto flex-1">
        <table className="ui-grid min-w-max">
          <thead>
            <tr>
              <TH col="login" label="Login ID" />
              <TH col="connectedAt" label="Connected Since" />
              <TH col="sessionAge" label="Duration" />
              <TH col="isAdmin" label="Role" />
              <TH col="deviceType" label="Access Type" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-20">
                  <div className="flex flex-col items-center gap-2">
                    <RefreshCcw size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>Analyzing online sessions…</span>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="text-center py-20">
                  <div className="flex flex-col items-center gap-2 text-red-500">
                    <AlertTriangle size={24} />
                    <span className="text-sm font-bold">Failed to load session data</span>
                    <span className="text-xs opacity-70">{error.message}</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-20 text-sm" style={{ color: 'var(--muted)' }}>
                  No active accounts found online.
                </td>
              </tr>
            ) : filtered.map((row, idx) => {
              const rowKey = `${row.login}-${idx}`;
              const DeviceIcon = row.deviceType?.toLowerCase().includes('manager') ? Monitor : 
                               row.deviceType?.toLowerCase().includes('mobile') ? Smartphone : Laptop;

              return (
                <tr
                  key={rowKey}
                  hide-hover="false"
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="tabular">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                      <span className="font-bold" style={{ color: 'var(--text)' }}>{row.login}</span>
                    </div>
                  </td>
                  <td className="tabular" style={{ color: 'var(--text-2)' }}>{formatDateTime(row.connectedAt)}</td>
                  <td className="tabular">
                    <div className="flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                      <Clock size={12} />
                      <span>{formatAge(row.sessionAge)}</span>
                    </div>
                  </td>
                  <td>
                    {row.isAdmin ? (
                      <span className="ui-badge ui-badge-accent font-bold">
                        <Shield size={10} className="mr-1" />
                        ADMIN
                      </span>
                    ) : (
                      <span className="ui-badge ui-badge-soft">USER</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2" style={{ color: 'var(--text-3)' }}>
                      <DeviceIcon size={14} style={{ color: 'var(--accent)' }} />
                      <span className="capitalize">{row.deviceType || 'Unknown'}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccountsOnlineGrid;
