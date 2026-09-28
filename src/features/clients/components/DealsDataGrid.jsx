import { formatPageLabel } from '../../../utils/pageLabel.js';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { getBrokerDealsPage } from '../../../services/api';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';
import GridLoadingState from '../../../components/GridLoadingState';
import {
  DEALS_INITIAL_PARAMS,
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

const DEALS_SNAPSHOT_KEY = 'rtx5_deals_snapshot_v1';

const getInitialDealsSnapshot = () => {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(DEALS_SNAPSHOT_KEY) : null;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore storage parse errors
  }
  return undefined;
};

const saveDealsSnapshot = (data) => {
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(DEALS_SNAPSHOT_KEY, JSON.stringify({
        rows: data.rows.slice(0, 30),
        total: data.total ?? data.rows.length,
        hasMore: Boolean(data.hasMore),
      }));
    }
  } catch {
    // Storage full or private mode
  }
};

const DealsDataGrid = ({ search = '', actionFilter = 'All Actions', symbolFilter = 'All Symbols', entryFilter = 'All Entries', onRowsChange, onRowContext }) => {
  const queryClient = useQueryClient();
  const [sortCol, setSortCol] = useState(DEALS_INITIAL_PARAMS.sort_by);
  const [sortDir, setSortDir] = useState(DEALS_INITIAL_PARAMS.sort_dir);
  const [selectedRow, setSelectedRow] = useState(null);
  const [activeAccountDetailsId, setActiveAccountDetailsId] = useState(null);
  const [activeAccountTicket, setActiveAccountTicket] = useState(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('deals');
  const pageSize = DEALS_INITIAL_PARAMS.limit;

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

  const isDefaultParams = !search
    && actionFilter === 'All Actions'
    && symbolFilter === 'All Symbols'
    && entryFilter === 'All Entries'
    && sortCol === DEALS_INITIAL_PARAMS.sort_by
    && sortDir === DEALS_INITIAL_PARAMS.sort_dir;

  const initialData = useMemo(() => {
    if (!isDefaultParams) return undefined;
    const cached = queryClient.getQueryData(['deals', 'page', DEALS_INITIAL_PARAMS]);
    if (cached?.rows?.length > 0) return cached;
    return getInitialDealsSnapshot();
  }, [isDefaultParams, queryClient]);

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
    staleTime: WORKSPACE_DATA_STALE_MS,
    meta: WORKSPACE_QUERY_META,
    initialData,
    placeholderData: (previousData) => {
      const base = previousData || initialData || getInitialDealsSnapshot();
      if (!base?.rows?.length) return undefined;
      const s = String(search || '').trim().toLowerCase();
      if (!s && (!filters || Object.keys(filters).length === 0)) {
        return base;
      }
      let matchedRows = base.rows;
      if (s) {
        matchedRows = matchedRows.filter((r) =>
          String(r.login || '').toLowerCase().includes(s) ||
          String(r.ticket || '').toLowerCase().includes(s) ||
          String(r.symbol || '').toLowerCase().includes(s) ||
          String(r.accountName || '').toLowerCase().includes(s)
        );
      }
      if (filters?.action && filters.action !== 'all actions') {
        matchedRows = matchedRows.filter((r) => String(r.action || '').toLowerCase() === filters.action.toLowerCase());
      }
      if (filters?.symbol && filters.symbol !== 'All Symbols') {
        matchedRows = matchedRows.filter((r) => String(r.symbol || '').toLowerCase() === filters.symbol.toLowerCase());
      }
      if (filters?.entry && filters.entry !== 'All Entries') {
        matchedRows = matchedRows.filter((r) => String(r.entry || '').toLowerCase() === filters.entry.toLowerCase());
      }
      return {
        rows: matchedRows,
        total: matchedRows.length,
        hasMore: false,
      };
    },
  });

  useEffect(() => {
    if (rows && rows.length > 0 && isDefaultParams && offset === 0) {
      saveDealsSnapshot({ rows, total, hasMore });
    }
  }, [rows, total, hasMore, isDefaultParams, offset]);

  // Prevent brief flash of loading skeleton on sub-120ms network fetches
  const [showLoadingState, setShowLoadingState] = useState(false);
  const shouldShowLoadingState = isLoading && rows.length === 0;
  useEffect(() => {
    const timer = setTimeout(
      () => setShowLoadingState(shouldShowLoadingState),
      shouldShowLoadingState ? 120 : 0
    );
    return () => clearTimeout(timer);
  }, [shouldShowLoadingState]);

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
    <th onClick={() => handleSort(col)} style={{ textAlign: align }} aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label}
    </th>
  );

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';

  return (
    <div className="deals-grid ui-card flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {isError && (
        <div
          className="px-4 py-2 text-xs break-all"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
        >
          <strong>API Error.</strong> {error?.message || 'Failed to load deals.'}
        </div>
      )}
      {shouldShowLoadingState && showLoadingState ? (
        <GridLoadingState label="Loading deals…" />
      ) : (
      <div className="grid-scroll-area w-full flex-1 min-h-0 overflow-auto">
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
              <tr><td colSpan={17} className="text-center py-16" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                {isIdle ? (
                  <div className="flex flex-col items-center gap-3">
                    <span style={{ fontSize: '11px' }}>Deals are not loaded.</span>
                    <button type="button" onClick={handleLoadData} className="ui-btn ui-btn-primary ui-btn-sm" style={{ fontSize: '11px' }}>
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
                  <td>{row.accountName}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.accountGroup}</td>
                  <td>{row.symbol}</td>
                  <td className="uppercase">
                    <span className={`ui-status ${isBuy ? 'ui-status-ok' : 'ui-status-danger'}`}>
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
                  <td className="tabular font-mono" style={{ color: 'var(--text-3)', fontSize: '11px' }}>{fmtDate(row.time)}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div
        className="deals-grid-footer flex items-center justify-between px-3 py-1 shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: '10px' }}
      >
        <span className="flex items-center gap-2" style={{ fontSize: '10px' }}>
          <span style={{ fontSize: '10px' }}>
            {isIdle ? (
              'Deals not loaded'
            ) : (
              <>
                Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)', fontSize: '10px' }}>{rangeStart}-{rangeEnd}</span>
                {' '}of{' '}
                <span className="tabular font-medium" style={{ color: 'var(--text-2)', fontSize: '10px' }}>{total ?? 'many'}</span> deals
              </>
            )}
          </span>
          {isFetching && !isLoading && (
            <span className="ui-badge ui-badge-danger" style={{ fontSize: '10px' }}>
              <AlertTriangle size={10} />
              Updating
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleRefresh} disabled={isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ fontSize: '10px' }}>
            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            {isIdle ? 'Load' : 'Refresh'}
          </button>
          <button onClick={prevPage} disabled={isIdle || page === 0 || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ fontSize: '10px' }}>Prev</button>
          <span className="tabular px-1 pagination-page" style={{ color: 'var(--text-2)', fontSize: '10px' }}>{isIdle ? '-' : formatPageLabel(page, totalPages)}</span>
          <button onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ fontSize: '10px' }}>Next</button>
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
