import { formatPageLabel } from '../../../utils/pageLabel.js';
import { useI18nStore } from '../../../i18n/index.js';
import { useEffect, useMemo, useState } from 'react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { getAccountsOnlinePage } from '../../../services/api';
import { peekOnlineUsersPage, peekOnlineUsersUpdatedAt } from '../../../services/onlineUsersSnapshot.js';

// toLocaleString builds a new formatter per call; reuse one per language.
const dateTimeFormatters = new Map();
const formatDateTime = (ts, language) => {
  if (!ts) return '-';
  const locale = language === 'en' ? 'en-US' : language;
  let formatter = dateTimeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    dateTimeFormatters.set(locale, formatter);
  }
  return formatter.format(new Date(ts * 1000));
};

const formatAge = (seconds) => {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const rmins = mins % 60;
  return `${hrs}h ${rmins}m`;
};

const AccountsOnlineGrid = ({ search = '', searchControl, onRowsChange, onRowContext }) => {
  const language = useI18nStore((state) => state.language);
  const [sortCol, setSortCol] = useState('login');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('accounts-online');
  const pageSize = 30;

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
    refetch,
    nextPage,
    prevPage,
  } = usePagedData({
    queryKey: ['accounts-online', 'page'],
    queryFn: getAccountsOnlinePage,
    params,
    pageSize,
    enabled: hasRequestedData,
    refetchInterval: 10_000,
    staleTime: 30_000,
    // Every page and search renders from the shared online-users snapshot on
    // the first frame; a stale snapshot refreshes in the background on mount.
    initialDataForParams: peekOnlineUsersPage,
    initialDataUpdatedAt: peekOnlineUsersUpdatedAt,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  });
  const accessDenied = isError && [401, 403].includes(Number(error?.status));

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
    if (onRowsChange) onRowsChange(accessDenied ? [] : rows);
  }, [rows, onRowsChange, accessDenied]);

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
    <th scope="col" aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="active-sessions-sort"
        onClick={() => handleSort(col)}
        title={`Sort by ${label}: ${sortCol === col && sortDir === 'asc' ? 'descending' : 'ascending'}`}
      >
        {label}

      </button>
    </th>
  );

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() ? 'Load results' : 'Load first 30';

  return (
    <div className="active-sessions-grid">
      <div className="active-sessions-grid-toolbar">
        <div className="active-sessions-summary">
          <h1 className="active-sessions-title">Active Sessions</h1>
        </div>
        <div className="active-sessions-actions">
          {searchControl}
        </div>
      </div>

      {isError && !accessDenied && rows.length > 0 && <div className="active-sessions-notice" role="alert">
        <span>Unable to refresh sessions. Showing the last available data.</span>
        <button type="button" onClick={handleRefresh} disabled={isFetching} className="active-sessions-button">Retry</button>
      </div>}

      <div className="active-sessions-table-wrap">
        <table className="active-sessions-table" aria-label="Active sessions" aria-busy={isFetching}>
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              {renderHeader('login', 'Login ID')}
              {renderHeader('connectedAt', 'Connected Since')}
              {renderHeader('sessionAge', 'Duration')}
              {renderHeader('isAdmin', 'Role')}
              {renderHeader('deviceType', 'Access Type')}
            </tr>
          </thead>
          <tbody>
            {isIdle ? (
              <tr>
                <td colSpan={5} className="active-sessions-empty">
                  <div className="active-sessions-state">
                    <span>Active sessions are not loaded.</span>
                    <button type="button" onClick={handleLoadData} className="active-sessions-button">
                      {loadLabel}
                    </button>
                  </div>
                </td>
              </tr>
            ) : isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="active-sessions-empty">
                  <div className="active-sessions-state" role="status">
                    {showLoadingState && <span>Loading active sessions…</span>}
                  </div>
                </td>
              </tr>
            ) : isError && (rows.length === 0 || accessDenied) ? (
              <tr>
                <td colSpan={5} className="active-sessions-empty">
                  <div className="active-sessions-state active-sessions-error" role="alert">
                    <span>Failed to load session data</span>
                    <span>{error?.message}</span>
                    <button type="button" onClick={handleRefresh} disabled={isFetching} className="active-sessions-button">Retry</button>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="active-sessions-empty">
                  No active accounts found online.
                </td>
              </tr>
            ) : rows.map((row) => {
              const rowKey = `${row.login}-${row.connectedAt}-${row.deviceType}`;

              return (
                <tr
                  key={rowKey}
                  tabIndex={0}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedRow(selectedRow === rowKey ? null : rowKey);
                    }
                  }}
                  onContextMenu={(e) => { setSelectedRow(rowKey); onRowContext?.(e, row); }}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  aria-selected={selectedRow === rowKey}
                >
                  <td>{row.login}</td>
                  <td>{formatDateTime(row.connectedAt, language)}</td>
                  <td>{formatAge(row.sessionAge)}</td>
                  <td>{row.isAdmin ? 'Administrator' : 'User'}</td>
                  <td className="active-sessions-access">{String(row.deviceType).toLowerCase() === 'api' ? 'API' : row.deviceType || 'Unknown'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="active-sessions-pagination">
        <span>
          {isIdle ? (
            'Active sessions not loaded'
          ) : (
            <>
              Showing <span className="tabular">{rangeStart}-{rangeEnd}</span>
              {' '}of{' '}
              <span className="tabular">{total ?? 'many'}</span>
            </>
          )}
        </span>
        <div className="active-sessions-page-controls">
          <button type="button" onClick={prevPage} disabled={isIdle || page === 0 || isFetching} className="active-sessions-button">Prev</button>
          <span className="tabular">{isIdle ? '-' : formatPageLabel(page, totalPages)}</span>
          <button type="button" onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="active-sessions-button">Next</button>
        </div>
      </div>
    </div>
  );
};

export default AccountsOnlineGrid;
