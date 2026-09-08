import { formatPageLabel } from '../../../utils/pageLabel.js';
import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, RefreshCw } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { getOrdersPage } from '../../../services/api';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';
import GridLoadingState from '../../../components/GridLoadingState';
import {
  ORDERS_INITIAL_PARAMS,
  WORKSPACE_DATA_STALE_MS,
  WORKSPACE_QUERY_META,
} from '../../../utils/workspaceQueryOptions.js';

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

const OrdersDataGrid = ({ search = '', typeFilter = 'All Types', symbolFilter = 'All Symbols', reasonFilter = 'All Reasons', onRowsChange, onRowContext }) => {
  const [sortCol, setSortCol] = useState(ORDERS_INITIAL_PARAMS.sort_by);
  const [sortDir, setSortDir] = useState(ORDERS_INITIAL_PARAMS.sort_dir);
  const [selectedRow, setSelectedRow] = useState(null);
  const [activeAccountDetailsId, setActiveAccountDetailsId] = useState(null);
  const [activeAccountTicket, setActiveAccountTicket] = useState(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('orders');
  const pageSize = ORDERS_INITIAL_PARAMS.limit;

  const filters = useMemo(() => ({
    ...(typeFilter !== 'All Types' ? { type: typeFilter.toLowerCase() } : {}),
    ...(symbolFilter !== 'All Symbols' ? { symbol: symbolFilter } : {}),
    ...(reasonFilter !== 'All Reasons' ? { reason: reasonFilter } : {}),
  }), [typeFilter, symbolFilter, reasonFilter]);

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
    queryKey: ['orders', 'page'],
    queryFn: getOrdersPage,
    params,
    pageSize,
    enabled: hasRequestedData,
    staleTime: WORKSPACE_DATA_STALE_MS,
    meta: WORKSPACE_QUERY_META,
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

  const renderHeader = (col, label) => (
    <th onClick={() => handleSort(col)} style={{ textAlign: 'center' }}>
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const pageBuys = rows.filter((row) => (row.type || '').toLowerCase() === 'buy').length;
  const pageSells = rows.filter((row) => (row.type || '').toLowerCase() === 'sell').length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';

  return (
    <div className="orders-grid ui-card flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {isError && (
        <div
          className="orders-grid-error px-4 py-2 text-xs break-all"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
        >
          <strong>API Error.</strong> {error?.message || 'Failed to load orders.'}
        </div>
      )}
      {isLoading && rows.length === 0 ? (
        <GridLoadingState label="Loading orders…" />
      ) : (
      <div className="grid-scroll-area w-full flex-1 min-h-0 overflow-auto">
        <table className="ui-grid min-w-max">
          <thead className="sticky top-0 z-10" style={{ boxShadow: '0 1px 0 var(--border)' }}>
            <tr>
              {renderHeader('ticket', 'Ticket')}
              {renderHeader('login', 'Login')}
              {renderHeader('name', 'User Name')}
              {renderHeader('group', 'Group')}
              {renderHeader('symbol', 'Symbol')}
              {renderHeader('type', 'Type')}
              {renderHeader('side', 'Side')}
              {renderHeader('volume', 'Lots')}
              {renderHeader('priceOpen', 'Open')}
              {renderHeader('priceSl', 'S/L')}
              {renderHeader('priceTp', 'T/P')}
              {renderHeader('status', 'Status')}
              {renderHeader('timeSetup', 'Setup Time')}
              {renderHeader('timeDone', 'Done Time')}
              {renderHeader('comment', 'Comment')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="orders-grid-empty text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  {isIdle ? (
                    <div className="flex flex-col items-center gap-3">
                      <span>Orders are not loaded.</span>
                      <button type="button" onClick={handleLoadData} className="ui-btn ui-btn-primary ui-btn-sm">
                        <RefreshCw size={13} />
                        {loadLabel}
                      </button>
                    </div>
                  ) : isLoading ? 'Loading orders...' : 'No orders match the current filters.'}
                </td>
              </tr>
            ) : rows.map((row, idx) => {
              const rowKey = `${row.ticket}-${idx}`;
              const side = String(row.side || '').toLowerCase();
              const typeBadgeClass = side === 'buy'
                ? 'ui-badge-success'
                : side === 'sell'
                  ? 'ui-badge-danger'
                  : 'ui-badge-info';
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
                  <td className="tabular" style={{ textAlign: 'center' }}>{row.ticket}</td>
                  <td className="tabular" style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.login}</td>
                  <td style={{ fontWeight: 500, textAlign: 'center' }}>{row.name}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.group}</td>
                  <td style={{ fontWeight: 500, textAlign: 'center' }}>{row.symbol}</td>
                  <td className="capitalize" style={{ textAlign: 'center' }}>
                    <span className={`ui-badge ${typeBadgeClass}`}>
                      {row.type}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{row.side}</td>
                  <td className="tabular" style={{ textAlign: 'center' }}>{row.volume}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceOpen, 5)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceSl, 5)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceTp, 5)}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.status}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center' }}>{fmtDate(row.timeSetup)}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text-3)', fontSize: 11, textAlign: 'center' }}>{fmtDate(row.timeDone)}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div
        className="orders-grid-footer flex items-center justify-between px-3 py-0 text-xs shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
      >
        <span className="flex items-center gap-3">
          <span>
            {isIdle ? (
              'Orders not loaded'
            ) : (
              <>
                Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{rangeStart}-{rangeEnd}</span>
                {' '}of{' '}
                <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{total ?? 'many'}</span>
              </>
            )}
          </span>
          {!isIdle && <span style={{ color: 'var(--muted)' }}>Page buy: <span className="tabular font-medium" style={{ color: 'var(--ok-text)' }}>{pageBuys}</span></span>}
          {!isIdle && <span style={{ color: 'var(--muted)' }}>Page sell: <span className="tabular font-medium" style={{ color: 'var(--danger-text)' }}>{pageSells}</span></span>}
          {isFetching && !isLoading && (
            <span className="ui-badge ui-badge-danger">
              <AlertTriangle size={10} />
              Updating
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleRefresh} disabled={isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ paddingBlock: 2 }}>
            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            {isIdle ? 'Load' : 'Refresh'}
          </button>
          <button onClick={prevPage} disabled={isIdle || page === 0 || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ paddingBlock: 2 }}>Prev</button>
          <span className="tabular px-1" style={{ color: 'var(--text-2)' }}>{isIdle ? '-' : formatPageLabel(page, totalPages)}</span>
          <button onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="ui-btn ui-btn-primary ui-btn-xs" style={{ paddingBlock: 2 }}>Next</button>
        </div>
      </div>

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
