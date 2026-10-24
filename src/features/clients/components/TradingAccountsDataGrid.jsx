import { formatPageLabel } from '../../../utils/pageLabel.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Edit2 } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { usePermissions } from '../../../hooks/usePermissions';
import { getTradingAccountsPage, normalizeTradingAccountRow, preloadAccountPositions } from '../../../services/api';
import GridLoadingState from '../../../components/GridLoadingState';
import { prefetchAccountDetails } from '../../../services/accountDetails';
import { PERMISSIONS } from '../../../utils/permissions';

// A pointer resting this long on a row signals intent to open it.
const ROW_PREFETCH_INTENT_MS = 120;
const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const TRADING_ACCOUNTS_CACHE_KEY = 'rtx5_trading_accounts_cache_v2';

const compareText = (valA, valB, dirMultiplier) => {
  const strA = String(valA ?? '').trim();
  const strB = String(valB ?? '').trim();
  if (!strA && !strB) return 0;
  if (!strA) return 1;
  if (!strB) return -1;
  return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' }) * dirMultiplier;
};

const compareNumber = (valA, valB, dirMultiplier) => {
  const numA = Number(valA ?? 0);
  const numB = Number(valB ?? 0);
  const safeA = Number.isFinite(numA) ? numA : 0;
  const safeB = Number.isFinite(numB) ? numB : 0;
  return (safeA - safeB) * dirMultiplier;
};

export const sortTradingAccountRows = (rows = [], sortCol = 'login', sortDir = 'asc') => {
  if (!Array.isArray(rows) || rows.length <= 1) return rows;
  const dirMultiplier = String(sortDir).toLowerCase() === 'desc' ? -1 : 1;
  const col = String(sortCol || 'login').toLowerCase();

  return [...rows].sort((a, b) => {
    switch (col) {
      case 'login':
        return compareNumber(a?.login, b?.login, dirMultiplier) || compareText(a?.login, b?.login, dirMultiplier);
      case 'name':
        return compareText(a?.name, b?.name, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
      case 'group':
        return compareText(a?.group, b?.group, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
      case 'country':
        return (
          compareText(
            a?.country || a?.raw?.Country || a?.raw?.country,
            b?.country || b?.raw?.Country || b?.raw?.country,
            dirMultiplier
          )
          || compareText(a?.name, b?.name, dirMultiplier)
          || compareNumber(a?.login, b?.login, 1)
        );
      case 'client':
        return (
          compareText(
            a?.client || a?.raw?.Client || a?.raw?.client || a?.company || a?.name,
            b?.client || b?.raw?.Client || b?.raw?.client || b?.company || b?.name,
            dirMultiplier
          )
          || compareNumber(a?.login, b?.login, 1)
        );
      case 'leverage':
        return compareNumber(a?.leverage, b?.leverage, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
      case 'balance':
        return compareNumber(a?.balance, b?.balance, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
      case 'equity':
        return compareNumber(a?.equity, b?.equity, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
      case 'credit':
        return (
          compareNumber(a?.credit, b?.credit, dirMultiplier)
          || compareNumber(a?.profit, b?.profit, dirMultiplier)
          || compareNumber(a?.login, b?.login, 1)
        );
      case 'profit':
        return (
          compareNumber(a?.profit, b?.profit, dirMultiplier)
          || compareNumber(a?.credit, b?.credit, dirMultiplier)
          || compareNumber(a?.login, b?.login, 1)
        );
      case 'currency':
        return compareText(a?.currency, b?.currency, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
      default:
        return compareText(a?.[col], b?.[col], dirMultiplier) || compareNumber(a?.login, b?.login, 1);
    }
  });
};

const getInitialCachedTradingAccounts = () => {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(TRADING_ACCOUNTS_CACHE_KEY) : null;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
      const offset = Number(parsed.offset) || 0;
      return {
        ...parsed,
        total: parsed.total ?? (!parsed.hasMore ? offset + parsed.rows.length : null),
      };
    }
  } catch {
    // Ignore storage parse errors
  }
  return undefined;
};

const saveCachedTradingAccounts = (data) => {
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(TRADING_ACCOUNTS_CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // Storage full or private mode
  }
};

const TradingAccountsDataGrid = ({
  search = '',
  groupFilter = 'All Groups',
  countryFilter = 'All Countries',
  sortCol: controlledSortCol,
  sortDir: controlledSortDir,
  onSort,
  showGridlines = true,
  onRowsChange,
  onRowContext,
  onEditAccount,
  canEditAccounts = true,
  refreshVersion = 0,
}) => {
  const queryClient = useQueryClient();
  const { canAct } = usePermissions();
  const canViewPositions = canAct(PERMISSIONS.VIEW_POSITIONS);
  const [internalSortCol, setInternalSortCol] = useState('login');
  const [internalSortDir, setInternalSortDir] = useState('asc');
  const sortCol = controlledSortCol ?? internalSortCol;
  const sortDir = controlledSortDir ?? internalSortDir;
  const [selectedRow, setSelectedRow] = useState(null);
  const lastRefreshVersionRef = useRef(refreshVersion);
  const lastTapRef = useRef({ rowKey: null, time: 0 });
  const prefetchTimerRef = useRef(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('trading-accounts');
  const pageSize = 30;

  const filters = useMemo(() => ({
    ...(groupFilter !== 'All Groups' ? { group: groupFilter } : {}),
    ...(countryFilter !== 'All Countries' ? { country: countryFilter } : {}),
  }), [groupFilter, countryFilter]);

  const params = useMemo(() => ({
    search,
    sort_by: 'login',
    sort_dir: 'asc',
    filters,
  }), [search, filters]);

  const isDefaultParams = !search && groupFilter === 'All Groups' && countryFilter === 'All Countries';

  const initialData = useMemo(() => {
    if (!isDefaultParams) return undefined;
    const sessionCache = getInitialCachedTradingAccounts();
    if (sessionCache) return sessionCache;

    const sidebarAccounts = queryClient.getQueryData(['sidebar-accounts', '']);
    if (sidebarAccounts?.rows?.length > 0) {
      const hasMore = Boolean(sidebarAccounts.hasMore);
      return {
        rows: sidebarAccounts.rows.map(normalizeTradingAccountRow),
        total: sidebarAccounts.total ?? (!hasMore ? sidebarAccounts.rows.length : null),
        hasMore,
        nextOffset: sidebarAccounts.nextOffset ?? pageSize,
      };
    }
    return undefined;
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
    queryKey: ['trading-accounts', 'page'],
    queryFn: async (p, options) => {
      const result = await getTradingAccountsPage(p, options);
      if (p.offset === 0 && !p.search && result?.rows?.length > 0) {
        saveCachedTradingAccounts(result);
      }
      return result;
    },
    params,
    pageSize,
    enabled: hasRequestedData,
    initialData,
    placeholderData: (previousData) => previousData || initialData,
  });

  const sortedRows = useMemo(
    () => sortTradingAccountRows(rows, sortCol, sortDir),
    [rows, sortCol, sortDir]
  );

  useEffect(() => () => clearTimeout(prefetchTimerRef.current), []);

  useEffect(() => {
    if (onRowsChange) onRowsChange(sortedRows);
  }, [sortedRows, onRowsChange]);

  useEffect(() => {
    if (refreshVersion === lastRefreshVersionRef.current) return;
    lastRefreshVersionRef.current = refreshVersion;

    if (!hasRequestedData) {
      markDataRequested();
      return;
    }

    refetch();
  }, [refreshVersion, hasRequestedData, markDataRequested, refetch]);

  const handleSort = (col) => {
    if (typeof onSort === 'function') {
      onSort(col);
      return;
    }
    if (sortCol === col) setInternalSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    else {
      setInternalSortCol(col);
      setInternalSortDir('asc');
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
    <th onClick={() => handleSort(col)} style={{ textAlign: align, cursor: 'pointer', userSelect: 'none' }}
      aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={`Sort by ${label}`}>
      {label}
    </th>
  );

  const gridlineStyle = showGridlines === false
    ? { '--row-border': 'transparent' }
    : {};
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = sortedRows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + sortedRows.length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';
  const canUseEditAction = canEditAccounts && typeof onEditAccount === 'function';
  const editTitle = typeof onEditAccount !== 'function'
    ? 'Edit unavailable'
    : canEditAccounts ? 'Edit Account' : 'No permission to update accounts';
  // /AccountDetails is slow server-side; start it before the window opens so
  // Personal/Account tabs paint from cache instead of waiting on the network.
  const prefetchAccount = (row) => {
    clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = null;
    void prefetchAccountDetails(row.login);
  };
  const handleEditAccount = (row) => {
    if (!canUseEditAction) return;
    prefetchAccount(row);
    if (canViewPositions) void preloadAccountPositions(row.login);
    onEditAccount(row);
  };
  const handleRowTap = (row, rowKey, eventTime) => {
    const now = Number(eventTime);
    const lastTap = lastTapRef.current;

    if (lastTap.rowKey === rowKey && now - lastTap.time < 350) {
      lastTapRef.current = { rowKey: null, time: 0 };
      handleEditAccount(row);
      return;
    }

    lastTapRef.current = { rowKey, time: now };
  };

  return (
    <div className="trading-accounts-grid ui-card flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {isError && (
        <div
          className="trading-accounts-grid-error px-4 py-2 text-xs break-all"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
        >
          <strong>API Error.</strong> {error?.message || 'Failed to load accounts.'}
        </div>
      )}
      {isLoading && sortedRows.length === 0 ? (
        <GridLoadingState label="Loading trading accounts…" />
      ) : (
      <div className="grid-scroll-area w-full flex-1 min-h-0 overflow-auto">
        <table className={`ui-grid trading-accounts-table ${showGridlines === false ? 'no-gridlines' : ''}`} style={gridlineStyle}>
          <colgroup>
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '13.5%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11.5%' }} />
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '9.5%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10" style={{ boxShadow: '0 1px 0 var(--border)' }}>
            <tr>
              {renderHeader('login', 'Login')}
              {renderHeader('name', 'Name')}
              {renderHeader('group', 'Group')}
              {renderHeader('leverage', 'Lev.')}
              {renderHeader('balance', 'Balance')}
              {renderHeader('equity', 'Equity')}
              {renderHeader('credit', 'Credit')}
              {renderHeader('profit', 'Profit')}
              {renderHeader('currency', 'Cu.')}
              <th style={{ textAlign: 'left' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="trading-accounts-grid-empty text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  {isIdle ? (
                    <div className="flex flex-col items-center gap-3">
                      <span>Trading accounts are not loaded.</span>
                      <button type="button" onClick={handleLoadData} className="ui-btn ui-btn-primary ui-btn-sm">
                        <RefreshCw size={13} />
                        {loadLabel}
                      </button>
                    </div>
                  ) : isLoading ? 'Loading accounts...' : 'No accounts match the current filters.'}
                </td>
              </tr>
            ) : sortedRows.map((row, idx) => {
              const rowKey = `${row.login}-${idx}`;
              const profitTone = row.profit < 0 ? 'var(--danger-text)' : row.profit > 0 ? 'var(--ok-text)' : 'var(--text-3)';
              return (
                <tr
                  key={rowKey}
                  onPointerEnter={(event) => {
                    if (!canUseEditAction || event.pointerType !== 'mouse') return;
                    clearTimeout(prefetchTimerRef.current);
                    prefetchTimerRef.current = setTimeout(() => prefetchAccount(row), ROW_PREFETCH_INTENT_MS);
                  }}
                  onPointerLeave={() => {
                    clearTimeout(prefetchTimerRef.current);
                    prefetchTimerRef.current = null;
                  }}
                  onPointerDown={(event) => {
                    if (!canUseEditAction || (event.pointerType === 'mouse' && event.button !== 0)) return;
                    prefetchAccount(row);
                    if (canViewPositions) void preloadAccountPositions(row.login);
                  }}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onDoubleClick={() => handleEditAccount(row)}
                  onTouchEnd={(event) => handleRowTap(row, rowKey, event.timeStamp)}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ color: 'var(--text-3)' }}>
                    <span className="tabular">{row.login}</span>
                  </td>
                  <td style={{ fontWeight: 500 }} className="truncate">{row.name}</td>
                  <td style={{ color: 'var(--text-3)' }} className="truncate">{row.group}</td>
                  <td className="tabular" style={{ color: 'var(--text-3)' }}>1:{row.leverage}</td>
                  <td className="tabular">{fmt(row.balance)}</td>
                  <td className="tabular">{fmt(row.equity)}</td>
                  <td className="tabular" style={{ color: 'var(--text-3)' }}>{fmt(row.credit || 0)}</td>
                  <td className="tabular" style={{ color: profitTone, fontWeight: 500 }}>{fmt(row.profit)}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.currency}</td>
                  <td
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                      title={editTitle}
                      aria-label={`Edit account ${row.login}`}
                      disabled={!canUseEditAction}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditAccount(row);
                      }}
                    >
                      <Edit2 size={13} style={{ color: canUseEditAction ? 'var(--accent)' : 'var(--muted)' }} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div
        className="trading-accounts-grid-footer flex items-center justify-between px-3 py-1 text-xs shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
      >
        <span className="flex items-center gap-2">
          <span>
            {isIdle ? (
              'Trading accounts not loaded'
            ) : (
              <>
                Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{rangeStart}-{rangeEnd}</span>
                {' '}of{' '}
                <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{total ?? 'many'}</span> accounts
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
          <span className="tabular px-1" style={{ color: 'var(--text-2)' }}>{isIdle ? '-' : formatPageLabel(page, totalPages)}</span>
          <button onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs">Next</button>
        </div>
      </div>
    </div>
  );
};

export default TradingAccountsDataGrid;
