import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getOrders } from '../../../services/api';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';

const ORDERS_FALLBACK = [];

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

const OrdersDataGrid = ({ search = '', typeFilter = 'All Types', symbolFilter = 'All Symbols', reasonFilter = 'All Reasons', onRowsChange, onRowContext }) => {
  const { data: rawData, isLoading, isFallback, error } = useDataSource(getOrders, ORDERS_FALLBACK);
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
        (r.symbol || '').toLowerCase().includes(q) ||
        (r.name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'All Types') rows = rows.filter(r => (r.type || '').toLowerCase() === typeFilter.toLowerCase());
    if (symbolFilter !== 'All Symbols') rows = rows.filter(r => r.symbol === symbolFilter);
    if (reasonFilter !== 'All Reasons') rows = rows.filter(r => r.comment === reasonFilter);

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av || '').localeCompare(String(bv || ''))
        : String(bv || '').localeCompare(String(av || ''));
    });
    return rows;
  }, [rawData, search, typeFilter, symbolFilter, reasonFilter, sortCol, sortDir]);

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
              <TH col="login" label="Login" />
              <TH col="name" label="User Name" />
              <TH col="group" label="Group" />
              <TH col="symbol" label="Symbol" />
              <TH col="type" label="Type" />
              <TH col="side" label="Side" />
              <TH col="volume" label="Lots" align="right" />
              <TH col="priceOpen" label="Open" align="right" />
              <TH col="priceSl" label="S/L" align="right" />
              <TH col="priceTp" label="T/P" align="right" />
              <TH col="status" label="Status" />
              <TH col="timeSetup" label="Setup Time" />
              <TH col="timeDone" label="Done Time" />
              <TH col="comment" label="Comment" />
            </tr>
          </thead>
          <tbody>
            {isLoading && pageRows.length === 0 ? (
              <tr>
                <td colSpan={15} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>Loading orders…</td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={15} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>No orders match the current filters.</td>
              </tr>
            ) : pageRows.map((row, idx) => {
              const rowKey = `${row.ticket}-${idx}`;
              const isBuy = row.type === 'buy';
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
                  <td className="tabular" style={{ color: 'var(--text-3)' }}>{row.login}</td>
                  <td style={{ fontWeight: 500 }}>{row.name}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.group}</td>
                  <td style={{ fontWeight: 500 }}>{row.symbol}</td>
                  <td className="capitalize">
                    <span className={`ui-badge ${isBuy ? 'ui-badge-success' : 'ui-badge-danger'}`}>
                      {row.type}
                    </span>
                  </td>
                  <td>{row.side}</td>
                  <td className="tabular" style={{ textAlign: 'right' }}>{row.volume}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right' }}>{fmt(row.priceOpen, 5)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right' }}>{fmt(row.priceSl, 5)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'right' }}>{fmt(row.priceTp, 5)}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.status}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text-3)', fontSize: 11 }}>{fmtDate(row.timeSetup)}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text-3)', fontSize: 11 }}>{fmtDate(row.timeDone)}</td>
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
          <span className="flex items-center gap-3">
            <span>
              Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>1–{Math.min((page + 1) * pageSize, filtered.length)}</span>
              {' '}of{' '}
              <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{filtered.length}</span>
            </span>
            <span style={{ color: 'var(--muted)' }}>·</span>
            <span>Buy: <span className="tabular font-medium" style={{ color: 'var(--ok-text)' }}>{filtered.filter(r => (r.type || '').toLowerCase() === 'buy').length}</span></span>
            <span>Sell: <span className="tabular font-medium" style={{ color: 'var(--danger-text)' }}>{filtered.filter(r => (r.type || '').toLowerCase() === 'sell').length}</span></span>
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
          entity="order"
          onClose={() => {
            setActiveAccountDetailsId(null);
            setActiveAccountTicket(null);
          }}
        />
      )}
    </div>
  );
};

export default OrdersDataGrid;
