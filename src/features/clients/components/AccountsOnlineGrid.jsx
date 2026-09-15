import { formatPageLabel } from '../../../utils/pageLabel.js';
import { useI18nStore } from '../../../i18n/index.js';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  User, Shield, Laptop, Smartphone, Monitor, Clock,
  ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, RefreshCcw
} from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { getAccountsOnlinePage } from '../../../services/api';
import GridLoadingState from '../../../components/GridLoadingState';

const ACCOUNTS_ONLINE_SNAPSHOT_KEY = 'rtx5_accounts_online_snapshot_v1';

const getInitialAccountsOnlineSnapshot = () => {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(ACCOUNTS_ONLINE_SNAPSHOT_KEY) : null;
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

const saveAccountsOnlineSnapshot = (data) => {
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(ACCOUNTS_ONLINE_SNAPSHOT_KEY, JSON.stringify({
        rows: data.rows.slice(0, 30),
        total: data.total ?? data.rows.length,
        hasMore: Boolean(data.hasMore),
      }));
    }
  } catch {
    // Storage full or private mode
  }
};

const formatDateTime = (ts, language) => {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString(language === 'en' ? 'en-US' : language, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
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

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="inline ml-1" style={{ color: 'var(--muted)' }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />;
};

const AccountsOnlineGrid = ({ search = '', onRowsChange, onRowContext }) => {
  const language = useI18nStore((state) => state.language);
  const queryClient = useQueryClient();
  const [sortCol, setSortCol] = useState('login');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('accounts-online');
  const pageSize = 30;

  const isDefaultParams = !search && sortCol === 'login' && sortDir === 'asc';

  const initialData = useMemo(() => {
    if (!isDefaultParams) return undefined;
    const cached = queryClient.getQueryData(['accounts-online', 'page', { search: '', sort_by: 'login', sort_dir: 'asc', limit: 30, offset: 0 }]);
    if (cached?.rows?.length > 0) return cached;
    return getInitialAccountsOnlineSnapshot();
  }, [isDefaultParams, queryClient]);

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
    initialData,
    placeholderData: (previousData) => previousData || initialData || getInitialAccountsOnlineSnapshot(),
  });

  useEffect(() => {
    if (rows && rows.length > 0 && isDefaultParams && offset === 0) {
      saveAccountsOnlineSnapshot({ rows, total, hasMore });
    }
  }, [rows, total, hasMore, isDefaultParams, offset]);

  // Prevent brief flash of loading skeleton on sub-120ms network fetches
  const [showLoadingState, setShowLoadingState] = useState(false);
  useEffect(() => {
    if (isLoading && rows.length === 0) {
      const timer = setTimeout(() => setShowLoadingState(true), 120);
      return () => clearTimeout(timer);
    }
    setShowLoadingState(false);
  }, [isLoading, rows.length]);

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
    <th onClick={() => handleSort(col)} style={{ textAlign: 'center' }} className="cursor-pointer">
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() ? 'Load results' : 'Load first 30';

  return (
    <div className="active-sessions-grid ui-card flex flex-col w-full overflow-hidden min-h-[400px]">
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-2)' }}>
        <div className="flex items-center gap-2">
          <span className="active-sessions-heading font-semibold tabular" style={{ color: 'var(--text-3)' }}>
            {isIdle ? 'ACTIVE SESSIONS NOT LOADED' : `${total ?? rows.length} ACTIVE SESSIONS`}
          </span>
          {isFetching && <RefreshCcw size={12} className="animate-spin" style={{ color: 'var(--accent)' }} />}
        </div>
        <button onClick={handleRefresh} disabled={isFetching} className="ui-btn ui-btn-ghost ui-btn-xs">
          <RefreshCcw size={11} className={isFetching ? 'animate-spin' : ''} />
          {isIdle ? 'LOAD' : 'FORCE RELOAD'}
        </button>
      </div>

      {isLoading && rows.length === 0 && showLoadingState ? (
        <GridLoadingState label="Loading active sessions…" />
      ) : (
      <div className="w-full overflow-x-auto flex-1">
        <table className="ui-grid min-w-max">
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
                <td colSpan={5} className="text-center py-20">
                  <div className="flex flex-col items-center gap-3" style={{ color: 'var(--muted)' }}>
                    <span className="text-sm">Active sessions are not loaded.</span>
                    <button type="button" onClick={handleLoadData} className="ui-btn ui-btn-primary ui-btn-sm">
                      <RefreshCcw size={13} />
                      {loadLabel}
                    </button>
                  </div>
                </td>
              </tr>
            ) : isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-20">
                  <div className="flex flex-col items-center gap-2">
                    <RefreshCcw size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>Analyzing online sessions...</span>
                  </div>
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={5} className="text-center py-20">
                  <div className="flex flex-col items-center gap-2 text-red-500">
                    <AlertTriangle size={24} />
                    <span className="text-sm font-bold">Failed to load session data</span>
                    <span className="text-xs opacity-70">{error?.message}</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-20 text-sm" style={{ color: 'var(--muted)' }}>
                  No active accounts found online.
                </td>
              </tr>
            ) : rows.map((row, idx) => {
              const rowKey = `${row.login}-${idx}`;
              const DeviceIcon = row.deviceType?.toLowerCase().includes('manager') ? Monitor :
                row.deviceType?.toLowerCase().includes('mobile') ? Smartphone : Laptop;

              return (
                <tr
                  key={rowKey}
                  hide-hover="false"
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="tabular" style={{ textAlign: 'center' }}>
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                      <span className="tabular" style={{ color: 'var(--text)' }}>{row.login}</span>
                    </div>
                  </td>
                  <td className="tabular" style={{ color: 'var(--text-2)', textAlign: 'center' }}>{formatDateTime(row.connectedAt, language)}</td>
                  <td className="tabular" style={{ textAlign: 'center' }}>
                    <div className="flex items-center justify-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                      <Clock size={12} />
                      <span>{formatAge(row.sessionAge)}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {row.isAdmin ? (
                      <span className="ui-badge ui-badge-accent">
                        <Shield size={10} className="mr-1" />
                        ADMIN
                      </span>
                    ) : (
                      <span className="ui-badge ui-badge-soft">USER</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="flex items-center justify-center gap-2" style={{ color: 'var(--text-3)' }}>
                      <DeviceIcon size={14} style={{ color: 'var(--accent)' }} />
                      <span className="capitalize">{row.deviceType || 'Unknown'}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div
        className="flex items-center justify-between px-4 py-2.5 text-xs shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
      >
        <span>
          {isIdle ? (
            'Active sessions not loaded'
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

export default AccountsOnlineGrid;
