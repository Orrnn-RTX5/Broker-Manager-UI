import { formatPageLabel } from '../../../utils/pageLabel.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import { useLivePositions } from '../../../hooks/useLiveTrading';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';
import GridLoadingState from '../../../components/GridLoadingState';
import { subscribeToPositionSync, requiresPositionReconciliation } from '../../../services/positionSync';
import { useAnalyticsDataTiming } from '../../../hooks/useAnalyticsTiming.js';
import { fetchOpenPositionsAnalyticsPage } from '../../analytics/analyticsQueries.js';
import { ANALYTICS_VIEWS, OPEN_POSITIONS_STALE_MS } from '../../../utils/analyticsQueryOptions.js';

const formatters = new Map();
const fmt = (n, d = 2) => {
  if (!formatters.has(d)) formatters.set(d, new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return formatters.get(d).format(n);
};
const EMPTY_ROWS = Object.freeze([]);

const PositionsDataGrid = ({ search = '', typeFilter = 'All Types', symbolFilter = 'All Symbols', reasonFilter = 'All Reasons', grid, onRowsChange, onRowContext }) => {
  const queryClient = useQueryClient();
  const [sortCol, setSortCol] = useState('position');
  const [sortDir, setSortDir] = useState('asc');
  const [activeAccountDetailsId, setActiveAccountDetailsId] = useState(null);
  const [activeAccountTicket, setActiveAccountTicket] = useState(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('open-positions');
  const pageSize = 30;

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
    rows: snapshotRows,
    total,
    hasMore,
    page,
    offset,
    isLoading,
    isFetching,
    isError,
    error,
    dataUpdatedAt,
    nextPage,
    prevPage,
  } = usePagedData({
    queryKey: ['positions', 'page'],
    queryFn: fetchOpenPositionsAnalyticsPage,
    params,
    pageSize,
    debounceMs: 150,
    enabled: hasRequestedData,
    staleTime: OPEN_POSITIONS_STALE_MS,
    placeholderData: (previousData) => {
      const base = previousData;
      if (!base?.rows?.length) return undefined;
      const s = String(search || '').trim().toLowerCase();
      if (!s && (!filters || Object.keys(filters).length === 0)) {
        return base;
      }
      let matchedRows = base.rows;
      if (s) {
        matchedRows = matchedRows.filter((r) =>
          String(r.login || '').toLowerCase().includes(s) ||
          String(r.ticket || r.position || '').toLowerCase().includes(s) ||
          String(r.symbol || '').toLowerCase().includes(s)
        );
      }
      if (filters?.type && filters.type !== 'all types') {
        matchedRows = matchedRows.filter((r) => String(r.type || '').toLowerCase() === filters.type.toLowerCase());
      }
      if (filters?.symbol && filters.symbol !== 'All Symbols') {
        matchedRows = matchedRows.filter((r) => String(r.symbol || '').toLowerCase() === filters.symbol.toLowerCase());
      }
      if (filters?.reason && filters.reason !== 'All Reasons') {
        matchedRows = matchedRows.filter((r) => String(r.reason || '').toLowerCase() === filters.reason.toLowerCase());
      }
      return {
        rows: matchedRows,
        total: matchedRows.length,
        hasMore: false,
      };
    },
  });

  const positionsAccessDenied = isError && (
    Number(error?.status) === 403 || /\bview_positions\b/i.test(String(error?.message || ''))
  );
  const liveRows = useLivePositions(positionsAccessDenied ? EMPTY_ROWS : snapshotRows);
  const rows = positionsAccessDenied ? EMPTY_ROWS : liveRows;
  // Prevent brief flash of loading skeleton on sub-120ms network fetches
  const [showLoadingState, setShowLoadingState] = useState(false);
  useEffect(() => {
    const shouldShow = isLoading && rows.length === 0;
    const timer = setTimeout(() => setShowLoadingState(shouldShow), shouldShow ? 120 : 0);
    return () => clearTimeout(timer);
  }, [isLoading, rows.length]);

  const timingMetadata = useMemo(() => ({
    rowCount: rows.length,
    cacheAvailable: dataUpdatedAt > 0,
  }), [dataUpdatedAt, rows.length]);
  useAnalyticsDataTiming(ANALYTICS_VIEWS.openPositions, {
    settled: hasRequestedData && !isLoading && (dataUpdatedAt > 0 || isError),
    outcome: isError ? 'error' : rows.length > 0 ? 'success' : 'empty',
    dataVersion: dataUpdatedAt,
    metadata: timingMetadata,
  });

  const onRowsChangeRef = useRef(onRowsChange);
  useEffect(() => {
    onRowsChangeRef.current = onRowsChange;
  });

  useEffect(() => {
    onRowsChangeRef.current?.(rows);
  }, [rows]);

  useEffect(() => subscribeToPositionSync((event) => {
    if (event.type === 'position' && !requiresPositionReconciliation(event.payload)) return;
    // Reconnect notifications carry no position change. Refetching on every
    // unstable websocket reconnect can stampede the slow PositionsAll route.
    if (event?.type === 'snapshot' && event?.reason !== 'reconciled') return;
    if (event?.type === 'position' && !event.snapshot) return;

    // Read the shared book after a live patch or a completed reconciliation.
    // Keep an existing request running so a busy stream cannot starve loading.
    if (hasRequestedData && !positionsAccessDenied) queryClient.invalidateQueries({ queryKey: ['positions'] }, { cancelRefetch: false });
  }), [hasRequestedData, positionsAccessDenied, queryClient]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const handleLoadData = () => markDataRequested();
  const selectedPosition = rows.find(row => grid?.selectedIds.has(row.position));
  const openPositionDetails = (row) => {
    if (!row) return;
    setActiveAccountDetailsId(row.login);
    setActiveAccountTicket(row.position);
  };

  const renderHeader = (col, label) => (
    <th
      onClick={() => handleSort(col)}
      aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ textAlign: 'center' }}
    >
      {label}
    </th>
  );

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const pageBuys = rows.filter((row) => row.type === 'buy').length;
  const pageSells = rows.filter((row) => row.type === 'sell').length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';

  if (positionsAccessDenied) {
    return (
      <div className="open-positions-grid ui-card flex flex-1 items-center justify-center p-6" role="status">
        <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 400 }}>
          This manager does not have permission to view positions.
        </span>
      </div>
    );
  }

  return (
    <div className="open-positions-grid ui-card flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {isError && (
        <div
          className="open-positions-grid-error px-4 py-2 text-xs break-all"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
        >
          <strong>API Error.</strong> {error?.message || 'Failed to load positions.'}
        </div>
      )}
      {isLoading && rows.length === 0 && showLoadingState ? (
        <GridLoadingState label="Loading open positions…" />
      ) : (
      <div className="grid-scroll-area w-full flex-1 min-h-0 overflow-auto">
        <table className="ui-grid min-w-max">
          <thead className="sticky top-0 z-10" style={{ boxShadow: '0 1px 0 var(--border)' }}>
            <tr>
              <th aria-label="Select position" style={{ width: 32, cursor: 'default' }} />
              {renderHeader('position', 'Ticket')}
              {renderHeader('login', 'Login')}
              {renderHeader('name', 'User Name')}
              {renderHeader('email', 'Email')}
              {renderHeader('symbol', 'Symbol')}
              {renderHeader('type', 'Action')}
              {renderHeader('volume', 'Lots')}
              {renderHeader('priceOpen', 'Open')}
              {renderHeader('priceCurrent', 'Current')}
              {renderHeader('priceSl', 'S/L')}
              {renderHeader('priceTp', 'T/P')}
              {renderHeader('swap', 'Storage')}
              {renderHeader('profit', 'Profit / Loss')}
              {renderHeader('comment', 'Comment')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="open-positions-grid-empty text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  {isIdle ? (
                    <div className="flex flex-col items-center gap-3">
                      <span>Open positions are not loaded.</span>
                      <button type="button" onClick={handleLoadData} className="ui-btn ui-btn-primary ui-btn-sm">
                        <RefreshCw size={13} />
                        {loadLabel}
                      </button>
                    </div>
                  ) : isLoading ? 'Loading positions...' : 'No positions match the current filters.'}
                </td>
              </tr>
            ) : rows.map((row) => {
              const rowKey = row.position;
              const isSelected = grid?.selectedIds.has(rowKey) ?? false;
              const isBuy = row.type === 'buy';
              const profitTone = row.profit < 0
                ? 'var(--open-position-loss-color)'
                : 'var(--open-position-profit-color)';
              return (
                <tr
                  key={rowKey}
                  onClick={() => grid?.toggle(rowKey)}
                  onDoubleClick={() => openPositionDetails(row)}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={isSelected ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select position ${row.position}`} checked={isSelected} onChange={() => grid?.toggle(rowKey)} />
                  </td>
                  <td className="open-position-value tabular" style={{ textAlign: 'center' }}>{row.position}</td>
                  <td className="open-position-value tabular" style={{ textAlign: 'center' }}>{row.login}</td>
                  <td className="open-position-value" style={{ textAlign: 'center' }}>{row.name}</td>
                  <td className="open-position-value" style={{ textAlign: 'center' }}>{row.email}</td>
                  <td className="open-position-value" style={{ textAlign: 'center' }}>{row.symbol}</td>
                  <td className="open-position-action-cell" style={{ textAlign: 'center' }}>
                    <span className={`open-position-action ${isBuy ? 'is-buy' : 'is-sell'}`}>
                      {row.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="open-position-value tabular" style={{ textAlign: 'center' }}>{row.volume}</td>
                  <td className="open-position-value tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceOpen)}</td>
                  <td className="open-position-value tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceCurrent, 1)}</td>
                  <td className="open-position-value tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceSl)}</td>
                  <td className="open-position-value tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceTp)}</td>
                  <td className="open-position-value tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.swap)}</td>
                  <td className="open-position-profit tabular font-mono" style={{ textAlign: 'center', color: profitTone }}>{fmt(row.profit)}</td>
                  <td className="open-position-value" style={{ textAlign: 'center' }}>{row.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div
        className="open-positions-grid-footer flex items-center justify-between px-3 py-0.5 text-[10px] shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: '10px' }}
      >
        <span className="flex items-center gap-3">
          <span>
            {isIdle ? (
              'Open positions not loaded'
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
          {grid?.selectedIds.size > 0 && (
            <button type="button" className="ui-badge ui-badge-brand" disabled={!selectedPosition}
              title={selectedPosition ? `Open details for position ${selectedPosition.position}` : 'Selected position is not on this page'}
              style={{ cursor: selectedPosition ? 'pointer' : 'default' }}
              onClick={() => openPositionDetails(selectedPosition)}>
              Selected
            </button>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={prevPage} disabled={isIdle || page === 0 || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ fontSize: '10px' }}>Prev</button>
          <span className="tabular px-1" style={{ color: 'var(--text-2)', fontSize: '10px' }}>{isIdle ? '-' : formatPageLabel(page, totalPages)}</span>
          <button onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="ui-btn ui-btn-primary ui-btn-xs" style={{ fontSize: '10px' }}>Next</button>
        </div>
      </div>

      {activeAccountDetailsId && (
        <AccountDetailsModal
          account={activeAccountDetailsId}
          targetTicket={activeAccountTicket}
          initialTab="Trade"
          entity="position"
          onClose={() => {
            setActiveAccountDetailsId(null);
            setActiveAccountTicket(null);
          }}
        />
      )}
    </div>
  );
};

export default PositionsDataGrid;
