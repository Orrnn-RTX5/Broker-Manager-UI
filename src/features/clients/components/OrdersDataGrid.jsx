import { formatPageLabel } from '../../../utils/pageLabel.js';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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

  const renderHeader = (col, label, align = 'left') => (
    <th
      onClick={() => handleSort(col)}
      aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={`Sort by ${label}`}
      style={{ textAlign: align, color: 'var(--text)' }}
    >
      {label}
    </th>
  );

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const pageBuys = rows.filter((row) => String(row.side || row.type || '').toLowerCase() === 'buy').length;
  const pageSells = rows.filter((row) => String(row.side || row.type || '').toLowerCase() === 'sell').length;
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
        <table className="ui-grid orders-table">
          <colgroup>
            <col style={{ width: '6.4%' }} />
            <col style={{ width: '5.4%' }} />
            <col style={{ width: '7.6%' }} />
            <col style={{ width: '8.8%' }} />
            <col style={{ width: '5.8%' }} />
            <col style={{ width: '4.4%' }} />
            <col style={{ width: '4.4%' }} />
            <col style={{ width: '7.8%' }} />
            <col style={{ width: '5.8%' }} />
            <col style={{ width: '5.8%' }} />
            <col style={{ width: '5.4%' }} />
            <col style={{ width: '13.2%' }} />
            <col style={{ width: '13.2%' }} />
            <col style={{ width: '6.0%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10" style={{ boxShadow: '0 1px 0 var(--border)' }}>
            <tr>
              {renderHeader('ticket', 'Ticket')}
              {renderHeader('login', 'Login')}
              {renderHeader('name', 'User Name')}
              {renderHeader('group', 'Group')}
              {renderHeader('symbol', 'Symbol')}
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
                <td colSpan={14} className="orders-grid-empty text-center py-16 text-sm" style={{ color: 'var(--text)' }}>
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
              const sideRaw = String(row.side || '').trim().toLowerCase();
              const isBuy = sideRaw.startsWith('buy');
              const isSell = sideRaw.startsWith('sell');
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
                  <td className="tabular" style={{ color: 'var(--text)' }}>{row.ticket}</td>
                  <td className="tabular" style={{ color: 'var(--text)' }}>{row.login}</td>
                  <td style={{ color: 'var(--text)' }}>{row.name}</td>
                  <td style={{ color: 'var(--text)' }}>{row.group}</td>
                  <td style={{ color: 'var(--text)' }}>{row.symbol}</td>
                  <td>
                    <span
                      className={`orders-side-badge ${isBuy ? 'is-buy' : isSell ? 'is-sell' : 'is-neutral'}`}
                      style={{ color: isBuy ? '#38bdf8' : isSell ? '#f87171' : 'var(--text)' }}
                    >
                      {row.side}
                    </span>
                  </td>
                  <td className="tabular" style={{ color: 'var(--text)' }}>{row.volume}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text)' }}>{fmt(row.priceOpen, 5)}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text)' }}>{fmt(row.priceSl, 5)}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text)' }}>{fmt(row.priceTp, 5)}</td>
                  <td style={{ color: 'var(--text)' }}>{row.status}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text)', fontSize: 11 }}>{fmtDate(row.timeSetup)}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text)', fontSize: 11 }}>{fmtDate(row.timeDone)}</td>
                  <td style={{ color: 'var(--text)' }}>{row.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div
        className="orders-grid-footer flex items-center justify-between px-3 py-0 text-xs shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
      >
        <span className="flex items-center gap-3">
          <span>
            {isIdle ? (
              'Orders not loaded'
            ) : (
              <>
                Showing <span className="tabular font-medium" style={{ color: 'var(--text)' }}>{rangeStart}-{rangeEnd}</span>
                {' '}of{' '}
                <span className="tabular font-medium" style={{ color: 'var(--text)' }}>{total ?? 'many'}</span>
              </>
            )}
          </span>
          {!isIdle && <span style={{ color: 'var(--text)' }}>Page buy: <span className="tabular font-medium" style={{ color: 'var(--text)' }}>{pageBuys}</span></span>}
          {!isIdle && <span style={{ color: 'var(--text)' }}>Page sell: <span className="tabular font-medium" style={{ color: 'var(--text)' }}>{pageSells}</span></span>}
          {isFetching && !isLoading && (
            <span className="ui-badge ui-badge-danger">
              <AlertTriangle size={10} />
              Updating
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleRefresh} disabled={isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ paddingBlock: 2, color: 'var(--text)' }}>
            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            {isIdle ? 'Load' : 'Refresh'}
          </button>
          <button onClick={prevPage} disabled={isIdle || page === 0 || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ paddingBlock: 2, color: 'var(--text)' }}>Prev</button>
          <span className="tabular px-1" style={{ color: 'var(--text)' }}>{isIdle ? '-' : formatPageLabel(page, totalPages)}</span>
          <button onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ paddingBlock: 2, color: 'var(--text)' }}>Next</button>
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
