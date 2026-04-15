import { useState, useMemo } from 'react';
import { User, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getTradingAccounts } from '../../../services/api';
import { TRADING_ACCOUNTS_FALLBACK } from '../../../data/tradingAccounts';

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="inline ml-1" style={{ color: 'var(--muted)' }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />;
};

const TradingAccountsDataGrid = ({ search = '', groupFilter = 'All Groups', countryFilter = 'All Countries', onRowsChange, onRowContext }) => {
  const { data: rawData, isLoading, isFallback, error } = useDataSource(getTradingAccounts, TRADING_ACCOUNTS_FALLBACK);
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
        r.name.toLowerCase().includes(q) ||
        r.login.includes(q) ||
        r.group.toLowerCase().includes(q)
      );
    }
    if (groupFilter !== 'All Groups') rows = rows.filter(r => r.group === groupFilter);
    if (countryFilter !== 'All Countries') rows = rows.filter(r => r.country === countryFilter);

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [rawData, search, groupFilter, countryFilter, sortCol, sortDir]);

  useMemo(() => { if (onRowsChange) onRowsChange(filtered); /* eslint-disable-line */ }, [filtered]);

  const pageRows = filtered.slice(0, (page + 1) * pageSize);

  const TH = ({ col, label, align = 'left' }) => (
    <th onClick={() => handleSort(col)} style={{ textAlign: align }}>
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
              <TH col="country" label="Country" />
              <TH col="client" label="Client" />
              <TH col="balance" label="Balance" align="right" />
              <th style={{ textAlign: 'right' }}>Balance / Checked</th>
              <TH col="equity" label="Equity" align="right" />
              <TH col="profit" label="Profit / Credit" align="right" />
              <TH col="currency" label="Cu." />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  {isLoading ? 'Loading accounts…' : 'No accounts match the current filters.'}
                </td>
              </tr>
            ) : pageRows.map((row, idx) => {
              const rowKey = `${row.login}-${idx}`;
              const profitTone = row.profit < 0 ? 'var(--danger-text)' : row.profit > 0 ? 'var(--ok-text)' : 'var(--text-3)';
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
                  <td style={{ color: 'var(--text-2)' }}>{row.country}</td>
                  <td style={{ color: 'var(--muted)', textAlign: 'center' }}>{row.client || '—'}</td>
                  <td className="tabular" style={{ textAlign: 'right' }}>{fmt(row.balance)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}></td>
                  <td className="tabular" style={{ textAlign: 'right' }}>{fmt(row.equity)}</td>
                  <td className="tabular" style={{ textAlign: 'right', color: profitTone, fontWeight: 500 }}>{fmt(row.profit)}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.currency}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 50 && (
        <div
          className="flex items-center justify-between px-4 py-2.5 text-xs shrink-0"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
        >
          <span className="flex items-center gap-2">
            <span>
              Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>1–{Math.min((page + 1) * pageSize, filtered.length)}</span>
              {' '}of{' '}
              <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{filtered.length}</span> accounts
            </span>
            {isFallback && (
              <span className="ui-badge ui-badge-warn">
                <AlertTriangle size={10} />
                DEMO DATA
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {(page + 1) * pageSize < filtered.length ? (
              <button onClick={() => setPage(p => p + 1)} className="ui-btn ui-btn-primary ui-btn-xs">
                Show More
              </button>
            ) : (
              <span className="italic" style={{ color: 'var(--muted)' }}>All loaded</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TradingAccountsDataGrid;
