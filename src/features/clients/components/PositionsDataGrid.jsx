import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, RefreshCw } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import AccountDetailsModal from '../../../components/Popups/AccountDetailsModal';
import GridLoadingState from '../../../components/GridLoadingState';
import { subscribeToPositionSync } from '../../../services/positionSync';
import { useAnalyticsDataTiming } from '../../../hooks/useAnalyticsTiming.js';
import { fetchOpenPositionsAnalyticsPage } from '../../analytics/analyticsQueries.js';
import { ANALYTICS_VIEWS, OPEN_POSITIONS_STALE_MS } from '../../../utils/analyticsQueryOptions.js';

const fmt = (n, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="inline ml-1" style={{ color: 'var(--muted)' }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />;
};

const PositionsDataGrid = ({ search = '', typeFilter = 'All Types', symbolFilter = 'All Symbols', reasonFilter = 'All Reasons', onRowsChange, onRowContext }) => {
  const queryClient = useQueryClient();
  const [sortCol, setSortCol] = useState('position');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
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
    rows,
    total,
    hasMore,
    page,
    offset,
    isLoading,
    isFetching,
    isError,
    error,
    dataUpdatedAt,
    refetch,
    nextPage,
    prevPage,
  } = usePagedData({
    queryKey: ['positions', 'page'],
    queryFn: fetchOpenPositionsAnalyticsPage,
    params,
    pageSize,
    enabled: hasRequestedData,
    staleTime: OPEN_POSITIONS_STALE_MS,
    refetchOnMount: true,
  });

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

  useEffect(() => {
    if (onRowsChange) onRowsChange(rows);
  }, [rows, onRowsChange]);

  useEffect(() => subscribeToPositionSync(() => {
    // An HTTP snapshot is deliberately used after every lifecycle event. It
    // handles opens, partial closes and reversals without trying to infer the
    // complete row shape from a websocket frame.
    if (hasRequestedData) queryClient.invalidateQueries({ queryKey: ['positions'] });
    else markDataRequested();
  }), [hasRequestedData, markDataRequested, queryClient]);

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
  const pageBuys = rows.filter((row) => row.type === 'buy').length;
  const pageSells = rows.filter((row) => row.type === 'sell').length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';

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
      {isLoading && rows.length === 0 ? (
        <GridLoadingState label="Loading open positions…" />
      ) : (
      <div className="grid-scroll-area w-full flex-1 min-h-0 overflow-auto">
        <table className="ui-grid min-w-max">
          <thead className="sticky top-0 z-10" style={{ boxShadow: '0 1px 0 var(--border)' }}>
            <tr>
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
              {renderHeader('profit', 'Profit')}
              {renderHeader('comment', 'Comment')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={14} className="open-positions-grid-empty text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
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
            ) : rows.map((row, idx) => {
              const rowKey = `${row.position}-${idx}`;
              const isBuy = row.type === 'buy';
              const swapTone = row.swap < 0 ? 'var(--danger-text)' : 'var(--text-2)';
              const profitTone = row.profit < 0 ? 'var(--danger-text)' : 'var(--ok-text)';
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onDoubleClick={() => {
                    setActiveAccountDetailsId(row.login);
                    setActiveAccountTicket(row.position);
                  }}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="tabular" style={{ textAlign: 'center' }}>{row.position}</td>
                  <td className="tabular" style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.login}</td>
                  <td style={{ fontWeight: 500, textAlign: 'center' }}>{row.name}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.email}</td>
                  <td style={{ fontWeight: 500, textAlign: 'center' }}>{row.symbol}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`ui-badge ${isBuy ? 'ui-badge-success' : 'ui-badge-danger'}`}>
                      {row.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="tabular" style={{ textAlign: 'center' }}>{row.volume}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceOpen)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceCurrent, 1)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceSl)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'center' }}>{fmt(row.priceTp)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'center', color: swapTone }}>{fmt(row.swap)}</td>
                  <td className="tabular font-mono" style={{ textAlign: 'center', color: profitTone, fontWeight: 600 }}>{fmt(row.profit)}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.comment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div
        className="open-positions-grid-footer flex items-center justify-between px-4 py-2.5 text-xs shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
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
