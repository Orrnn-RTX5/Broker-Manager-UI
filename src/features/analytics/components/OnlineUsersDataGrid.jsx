import { useState, useMemo } from 'react';
import { User, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getOnlineUsers } from '../../../services/api';
import { ONLINE_USERS_FALLBACK } from '../../../data/onlineUsers';

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="inline ml-1" style={{ color: 'var(--muted)' }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />;
};

const OnlineUsersDataGrid = ({ search = '', onRowsChange, onRowContext }) => {
  const { data: rawData, isLoading, isFallback, error } = useDataSource(getOnlineUsers, ONLINE_USERS_FALLBACK);
  const [sortCol, setSortCol] = useState('login');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let rows = [...rawData];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        String(r.login).includes(q) ||
        (r.group || '').toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av || '').localeCompare(String(bv || ''))
        : String(bv || '').localeCompare(String(av || ''));
    });
    return rows;
  }, [rawData, search, sortCol, sortDir]);

  useMemo(() => { if (onRowsChange) onRowsChange(filtered); /* eslint-disable-line */ }, [filtered]);

  const pageRows = filtered.slice(0, (page + 1) * pageSize);

  const TH = ({ col, label, align = 'left' }) => (
    <th onClick={() => handleSort(col)} style={{ textAlign: align }} className="cursor-pointer">
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  return (
    <div className="ui-card flex flex-col w-full overflow-hidden">
      {error && (
        <div
          className="px-4 py-2 text-xs break-all"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
        >
          <strong>API Fallback Detected.</strong> {error}
        </div>
      )}
      <div className="w-full overflow-x-auto">
        <table className="ui-grid min-w-max">
          <thead>
            <tr>
              <TH col="login" label="Login" />
              <TH col="name" label="Name" />
              <TH col="group" label="Group" />
              <TH col="client" label="Client" />
              <TH col="version" label="Build" />
              <TH col="ip" label="IP Address" />
              <TH col="equity" label="Equity" align="right" />
              <TH col="currency" label="Cu." />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  {isLoading ? 'Loading online users…' : (isFallback ? 'BACKEND DISCONNECTED' : 'No online users match the current filters.')}
                </td>
              </tr>
            ) : pageRows.map((row, idx) => {
              const rowKey = `${row.login}-${idx}`;
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ color: 'var(--text-3)' }}>
                    <span className="inline-flex items-center gap-2">
                      <User size={13} style={{ color: 'var(--accent)' }} />
                      <span className="tabular">{row.login}</span>
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{row.name}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.group}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.client}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.version}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text-3)' }}>{row.ip}</td>
                  <td className="tabular" style={{ textAlign: 'right' }}>{fmt(row.equity)}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.currency}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isFallback && (
        <div
          className="flex items-center justify-between px-4 py-2.5 text-xs shrink-0"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
        >
          <span className="flex items-center gap-2">
            <span className="ui-badge ui-badge-danger">
              <AlertTriangle size={10} />
              BACKEND DISCONNECTED
            </span>
          </span>
        </div>
      )}
    </div>
  );
};

export default OnlineUsersDataGrid;
