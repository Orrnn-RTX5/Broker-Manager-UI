import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, RefreshCw } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { getBrokerDealsPage } from '../../../services/api';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';

const fmt = (n, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const fmtDate = (ts) => {
  if (!ts) return '-';
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
  const [sortCol, setSortCol] = useState('ticket');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [activeAccountDetailsId, setActiveAccountDetailsId] = useState(null);
  const [activeAccountTicket, setActiveAccountTicket] = useState(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('deals');
  const pageSize = 30;

  const filters = useMemo(() => ({
    ...(actionFilter !== 'All Actions' ? { action: actionFilter } : {}),
    ...(symbolFilter !== 'All Symbols' ? { symbol: symbolFilter } : {}),
    ...(entryFilter !== 'All Entries' ? { entry: entryFilter } : {}),
  }), [actionFilter, symbolFilter, entryFilter]);

  const params = useMemo(() => ({
    search,
    sort_by: sortCol,
    sort_dir: sortDir,
    filters,
  }), [search, sortCol, sortDir, filters]);

  const {
    rows,
    total,
    hasMore,
    page,
    offset,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    nextPage,
    prevPage,
  } = usePagedData({
    queryKey: ['deals', 'page'],
    queryFn: getBrokerDealsPage,
    params,
    pageSize,
    enabled: hasRequestedData,
    keepRunningOnUnmount: true,
  });

  useEffect(() => {
    if (onRowsChange) onRowsChange(rows);
  }, [rows, onRowsChange]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const handleLoadData = () => markDataRequested();

  const handleRefresh = () => {
    if (!hasRequestedData) {
      markDataRequested();
      return;
    }
    refetch();
  };

  const renderHeader = (col, label, align = 'left') => (
    <th onClick={() => handleSort(col)} style={{ textAlign: align }}>
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';

  return (
    <div className="ui-card flex flex-col w-full overflow-hidden">
      {isError && (
        <div
          className="px-4 py-2 text-xs break-all"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
        >
          <strong>API Error.</strong> {error?.message || 'Failed to load deals.'}
        </div>
      )}
      <div className="w-full overflow-x-auto">
        <table className="ui-grid min-w-max">
          <thead>
            <tr>
              {renderHeader('ticket', 'Ticket')}
              {renderHeader('orderTicket', 'Order Ticket')}
              {renderHeader('login', 'Login')}
              {renderHeader('username', 'Username')}
              {renderHeader('accountName', 'Account')}
              {renderHeader('accountGroup', 'Group')}
              {renderHeader('symbol', 'Symbol')}
              {renderHeader('action', 'Action')}
              {renderHeader('entry', 'Entry')}
              {renderHeader('volume', 'Volume', 'right')}
              {renderHeader('price', 'Price', 'right')}
              {renderHeader('profit', 'Profit', 'right')}
              {renderHeader('commission', 'Commission', 'right')}
              {renderHeader('swap', 'Swap', 'right')}
              {renderHeader('fee', 'Fee', 'right')}
              {renderHeader('time', 'Time')}
              {renderHeader('comment', 'Comment')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={17} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                {isIdle ? (
                  <div className="flex flex-col items-center gap-3">
                    <span>Deals are not loaded.</span>
                    <button type="button" onClick={handleLoadData} className="ui-btn ui-btn-primary ui-btn-sm">
                      <RefreshCw size={13} />
                      {loadLabel}
                    </button>
                  </div>
                ) : isLoading ? 'Loading deals...' : 'No deals match the current filters.'}
              </td></tr>
            ) : rows.map((row, idx) => {
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

      <div
        className="flex items-center justify-between px-4 py-2.5 text-xs shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
      >
        <span className="flex items-center gap-2">
          <span>
            {isIdle ? (
              'Deals not loaded'
            ) : (
              <>
                Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{rangeStart}-{rangeEnd}</span>
                {' '}of{' '}
                <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{total ?? 'many'}</span> deals
              </>
            )}
          </span>
          {isFetching && !isLoading && (
            <span className="ui-badge ui-badge-danger">
              <AlertTriangle size={10} />
              Updating
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleRefresh} disabled={isFetching} className="ui-btn ui-btn-secondary ui-btn-xs">
            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            {isIdle ? 'Load' : 'Refresh'}
          </button>
          <button onClick={prevPage} disabled={isIdle || page === 0 || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs">Prev</button>
          <span className="tabular px-1" style={{ color: 'var(--text-2)' }}>{isIdle ? '-' : `${page + 1} / ${totalPages ?? '?'}`}</span>
          <button onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="ui-btn ui-btn-primary ui-btn-xs">Next</button>
        </div>
      </div>

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
