import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getBrokerDeals } from '../../../services/api';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';

const DEALS_FALLBACK = [];

const fmt = (n, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fmtDate = (ts) => {
  if (!ts) return '—';
  const dateObj = new Date(ts > 1e11 ? ts : ts * 1000);
  if (isNaN(dateObj.getTime())) return String(ts);
  return dateObj.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
};

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="inline ml-1" style={{ color: 'var(--muted)' }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />;
};

const DealsDataGrid = ({ search = '', actionFilter = 'All Actions', symbolFilter = 'All Symbols', entryFilter = 'All Entries', onRowsChange, onRowContext }) => {
  const { data: rawData, isLoading, isFallback, error } = useDataSource(getBrokerDeals, DEALS_FALLBACK);
  const [sortCol, setSortCol] = useState('ticket');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [activeAccountDetailsId, setActiveAccountDetailsId] = useState(null);
  const [activeAccountTicket, setActiveAccountTicket] = useState(null);
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
        String(r.login).includes(q) ||
        String(r.ticket).includes(q) ||
        String(r.orderTicket).includes(q) ||
        (r.symbol || '').toLowerCase().includes(q) ||
        (r.accountName || '').toLowerCase().includes(q) ||
        (r.username || '').toLowerCase().includes(q)
      );
    }
    if (actionFilter !== 'All Actions') rows = rows.filter(r => (r.action || '').toLowerCase() === actionFilter.toLowerCase());
    if (symbolFilter !== 'All Symbols') rows = rows.filter(r => r.symbol === symbolFilter);
    if (entryFilter !== 'All Entries') rows = rows.filter(r => r.entry === entryFilter);

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av || '').localeCompare(String(bv || ''))
        : String(bv || '').localeCompare(String(av || ''));
    });
    return rows;
  }, [rawData, search, actionFilter, symbolFilter, entryFilter, sortCol, sortDir]);

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
          <strong>API Error Detected.</strong> {error}
        </div>
      )}
      <div className="w-full overflow-x-auto">
        <table className="ui-grid min-w-max">
          <thead>
            <tr>
              <TH col="ticket" label="Ticket" />
              <TH col="orderTicket" label="Order Ticket" />
              <TH col="login" label="Login" />
              <TH col="username" label="Username" />
              <TH col="accountName" label="Account" />
              <TH col="accountGroup" label="Group" />
              <TH col="symbol" label="Symbol" />
              <TH col="action" label="Action" />
              <TH col="entry" label="Entry" />
              <TH col="volume" label="Volume" align="right" />
              <TH col="price" label="Price" align="right" />
              <TH col="profit" label="Profit" align="right" />
              <TH col="commission" label="Commission" align="right" />
              <TH col="swap" label="Swap" align="right" />
              <TH col="fee" label="Fee" align="right" />
              <TH col="time" label="Time" />
              <TH col="comment" label="Comment" />
            </tr>
          </thead>
          <tbody>
            {isLoading && pageRows.length === 0 ? (
              <tr><td colSpan={17} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>Loading deals…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={17} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>No deals match the current filters.</td></tr>
            ) : pageRows.map((row, idx) => {
              const rowKey = `${row.ticket}-${idx}`;
              const isBuy = row.action === 'deal_buy';
              const profitTone = row.profit < 0 ? 'var(--danger-text)' : 'var(--ok-text)';
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onDoubleClick={() => {
                    setActiveAccountDetailsId(row.login);
                    setActiveAccountTicket(row.ticket);
                  }}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="tabular">{row.ticket}</td>
                  <td className="tabular" style={{ color: 'var(--text-3)' }}>{row.orderTicket}</td>
                  <td className="tabular" style={{ color: 'var(--text-3)' }}>{row.login}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.username}</td>
                  <td style={{ fontWeight: 500 }}>{row.accountName}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.accountGroup}</td>
                  <td style={{ fontWeight: 500 }}>{row.symbol}</td>
                  <td className="capitalize">
                    <span className={`ui-badge ${isBuy ? 'ui-badge-success' : 'ui-badge-danger'}`}>
                      {row.action}
                    </span>
                  </td>
                  <td>{row.entry}</td>
                  <td className="tabular" style={{ textAlign: 'right' }}>{row.volume}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right' }}>{fmt(row.price, 5)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right', color: profitTone, fontWeight: 600 }}>{fmt(row.profit)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right' }}>{fmt(row.commission)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right' }}>{fmt(row.swap)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right' }}>{fmt(row.fee)}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text-3)', fontSize: 11 }}>{fmtDate(row.time)}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.comment}</td>
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
              <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{filtered.length}</span> deals
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

      {activeAccountDetailsId && (
        <AccountDetailsModal
          account={activeAccountDetailsId}
          targetTicket={activeAccountTicket}
          initialTab="Trade"
          entity="deal"
          onClose={() => {
            setActiveAccountDetailsId(null);
            setActiveAccountTicket(null);
          }}
        />
      )}
    </div>
  );
};

export default DealsDataGrid;
