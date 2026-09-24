import { formatPageLabel } from '../../../utils/pageLabel.js';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import GridLoadingState from '../../../components/GridLoadingState';
import { useAnalyticsDataTiming } from '../../../hooks/useAnalyticsTiming.js';
import { fetchOnlineUsersAnalyticsPage } from '../analyticsQueries.js';
import { peekOnlineUsersPage, peekOnlineUsersUpdatedAt } from '../../../services/onlineUsersSnapshot.js';
import { ANALYTICS_VIEWS, ONLINE_USERS_STALE_MS, ONLINE_USERS_INITIAL_PARAMS } from '../../../utils/analyticsQueryOptions.js';

const MONEY_FORMAT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n) => MONEY_FORMAT.format(n);

const OnlineUsersDataGrid = ({ search = '', onRowsChange, onRowContext }) => {
  const [sortCol, setSortCol] = useState('login');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('analytics-online-users');
  const pageSize = ONLINE_USERS_INITIAL_PARAMS.limit;

  const params = useMemo(() => ({
    search,
    sort_by: sortCol,
    sort_dir: sortDir,
  }), [search, sortCol, sortDir]);

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
    queryKey: ['online-users', 'page'],
    queryFn: fetchOnlineUsersAnalyticsPage,
    params,
    pageSize,
    enabled: hasRequestedData,
    refetchInterval: 10_000,
    staleTime: ONLINE_USERS_STALE_MS,
    // Every page and search renders from the shared snapshot on the first
    // frame; a stale snapshot refreshes in the background on mount.
    initialDataForParams: peekOnlineUsersPage,
    initialDataUpdatedAt: peekOnlineUsersUpdatedAt,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  });

  // Prevent brief flash of loading skeleton on sub-120ms network fetches
  const [showLoadingState, setShowLoadingState] = useState(false);
  useEffect(() => {
    if (isLoading && rows.length === 0) {
      const timer = setTimeout(() => setShowLoadingState(true), 120);
      return () => clearTimeout(timer);
    }
    setShowLoadingState(false);
  }, [isLoading, rows.length]);

  const timingMetadata = useMemo(() => ({
    rowCount: rows.length,
    cacheAvailable: dataUpdatedAt > 0,
  }), [dataUpdatedAt, rows.length]);
  useAnalyticsDataTiming(ANALYTICS_VIEWS.onlineUsers, {
    settled: hasRequestedData && !isLoading && (dataUpdatedAt > 0 || isError),
    outcome: isError ? 'error' : rows.length > 0 ? 'success' : 'empty',
    dataVersion: dataUpdatedAt,
    metadata: timingMetadata,
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
    <th onClick={() => handleSort(col)} aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} title={`Sort by ${label}`} style={{ textAlign: 'center' }} className="cursor-pointer">
      {label}
    </th>
  );

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() ? 'Load results' : 'Load first 30';

  return (
    <div className="online-users-grid ui-card flex flex-col w-full shrink-0 overflow-hidden">
      <div
        className="online-users-grid-header flex items-center justify-between px-3 py-1"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}
      >
        <div>
          <div className="online-users-grid-title text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            {isIdle ? 'Online users not loaded' : `${total ?? rows.length} online users`}
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isFetching}
          className="ui-btn ui-btn-secondary ui-btn-xs flex items-center gap-1.5"
        >
          <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} />
          {isIdle ? 'Load' : 'Refresh'}
        </button>
      </div>
      {isError && (
        <div
          className="online-users-grid-error px-4 py-2 text-xs break-all"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
        >
          <strong>API Error.</strong> {error?.message || 'Failed to load online users.'}
        </div>
      )}
      {isLoading && rows.length === 0 && showLoadingState ? (
        <GridLoadingState label="Loading online users…" compact />
      ) : (
      <div className="w-full overflow-x-auto">
        <table className="ui-grid min-w-max">
          <thead>
            <tr>
              {renderHeader('login', 'Login')}
              {renderHeader('name', 'Name')}
              {renderHeader('group', 'Group')}
              {renderHeader('client', 'Client')}
              {renderHeader('version', 'Build')}
              {renderHeader('ip', 'IP Address')}
              {renderHeader('equity', 'Equity')}
              {renderHeader('currency', 'Currency')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="online-users-grid-empty text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  {isIdle ? (
                    <div className="flex flex-col items-center gap-3">
                      <span>Online users are not loaded.</span>
                      <button type="button" onClick={handleLoadData} className="ui-btn ui-btn-primary ui-btn-sm">
                        <RefreshCcw size={13} />
                        {loadLabel}
                      </button>
                    </div>
                  ) : isLoading ? 'Loading online users...' : 'No online users match the current filters.'}
                </td>
              </tr>
            ) : rows.map((row, idx) => {
              const rowKey = `${row.login}-${idx}`;
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>
                    <span className="tabular">{row.login}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{row.name}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.group}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.client}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.version}</td>
                  <td className="tabular font-mono" style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.ip}</td>
                  <td className="tabular" style={{ textAlign: 'center' }}>{fmt(row.equity)}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>{row.currency}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div
        className="online-users-grid-footer flex items-center justify-between px-3 py-1 text-xs shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
      >
        <span className="flex items-center gap-2">
          {isIdle ? (
            'Online users not loaded'
          ) : (
            <>
              Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{rangeStart}-{rangeEnd}</span>
              {' '}of{' '}
              <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{total ?? 'many'}</span>
            </>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={prevPage} disabled={isIdle || page === 0 || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs">Prev</button>
          <span className="tabular px-1" style={{ color: 'var(--text-2)' }}>{isIdle ? '-' : formatPageLabel(page, totalPages)}</span>
          <button onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs">Next</button>
        </div>
      </div>
    </div>
  );
};

export default OnlineUsersDataGrid;
