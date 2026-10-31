import { formatPageLabel } from '../../../utils/pageLabel.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { usePermissions } from '../../../hooks/usePermissions';
import { getTradingAccountsPage, normalizeTradingAccountRow, preloadAccountPositions } from '../../../services/api';
import GridLoadingState from '../../../components/GridLoadingState';
import { prefetchAccountDetails } from '../../../services/accountDetails';
import { PERMISSIONS } from '../../../utils/permissions';

// A pointer resting this long on a row signals intent to open it.
const ROW_PREFETCH_INTENT_MS = 120;

const fmt = (n) => {
  const num = Number(n ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe).replace(/,/g, ' ');
};

const TRADING_ACCOUNTS_CACHE_KEY = 'rtx5_trading_accounts_cache_v2';

const AccountTypeIcon = ({ group }) => {
  const isDemoOrContest = /demo|contest/i.test(String(group ?? ''));
  return (
    <svg
      className={`trading-accounts-login-icon ${isDemoOrContest ? 'is-demo' : 'is-real'}`}
      viewBox="0 0 16 16"
      width="13"
      height="13"
      aria-hidden="true"
    >
      <circle cx="8" cy="4.75" r="2.25" />
      <path d="M3.25 13.25c.65-2.35 2.35-3.5 4.75-3.5s4.1 1.15 4.75 3.5Z" />
    </svg>
  );
};

const getCountryValue = (row) => String(row?.country || row?.raw?.Country || row?.raw?.country || '').trim();

const getClientValue = (row) => String(row?.client || row?.raw?.Client || row?.raw?.client || '').trim();

const getBalanceCheckedRaw = (row) => (
  row?.balanceChecked
  ?? row?.raw?.BalanceChecked
  ?? row?.raw?.balanceChecked
  ?? row?.raw?.balance_checked
  ?? ''
);

const getBalanceCheckedDisplay = (row) => {
  const rawVal = getBalanceCheckedRaw(row);
  if (rawVal === '' || rawVal === null || rawVal === undefined) return '';
  const num = Number(rawVal);
  return Number.isFinite(num) ? fmt(num) : String(rawVal);
};

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

const sortTradingAccountRows = (rows = [], sortCol = 'login', sortDir = 'asc') => {
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
          compareText(getCountryValue(a), getCountryValue(b), dirMultiplier)
          || compareText(a?.name, b?.name, dirMultiplier)
          || compareNumber(a?.login, b?.login, 1)
        );
      case 'client':
        return (
          compareText(
            getClientValue(a) || a?.company || a?.name,
            getClientValue(b) || b?.company || b?.name,
            dirMultiplier
          )
          || compareNumber(a?.login, b?.login, 1)
        );
      case 'leverage':
        return compareNumber(a?.leverage, b?.leverage, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
      case 'balance':
        return compareNumber(a?.balance, b?.balance, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
      case 'balancechecked': {
        const valA = getBalanceCheckedRaw(a);
        const valB = getBalanceCheckedRaw(b);
        if (valA === '' && valB === '') return compareNumber(a?.balance, b?.balance, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
        if (valA === '') return 1;
        if (valB === '') return -1;
        return compareNumber(valA, valB, dirMultiplier) || compareNumber(a?.login, b?.login, 1);
      }
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
  groups = [],
  grid,
  sortCol: controlledSortCol,
  sortDir: controlledSortDir,
  onSort,
  showGridlines = true,
  onRowsChange,
  onRowContext,
  onEditAccount,
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

  const groupCurrencyMap = useMemo(() => {
    const map = new Map();
    for (const grp of Array.isArray(groups) ? groups : []) {
      const grpName = String(grp?.name ?? grp?.Name ?? '').trim();
      const grpCurrency = String(grp?.currency ?? grp?.Currency ?? grp?.depositCurrency ?? '').trim();
      if (grpName && grpCurrency) map.set(grpName, grpCurrency);
    }
    return map;
  }, [groups]);

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

  const enrichedRows = useMemo(
    () => rows.map((row) => {
      const country = getCountryValue(row);
      const client = getClientValue(row);
      const balanceChecked = getBalanceCheckedDisplay(row);
      const currency = String(
        row?.currency
        || row?.raw?.Currency
        || row?.raw?.currency
        || groupCurrencyMap.get(String(row?.group ?? '').trim())
        || 'USD'
      ).trim();
      return {
        ...row,
        country,
        client,
        balanceChecked,
        currency,
      };
    }),
    [rows, groupCurrencyMap]
  );

  const sortedRows = useMemo(
    () => sortTradingAccountRows(enrichedRows, sortCol, sortDir),
    [enrichedRows, sortCol, sortDir]
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

  const isVisible = (key) => !grid?.hiddenColumns?.has(key);

  const renderHeader = (col, label, align = 'left') => {
    const isSorted = sortCol === col;
    return (
      <th
        onClick={() => handleSort(col)}
        className={`trading-accounts-th ${align === 'right' ? 'is-right' : 'is-left'}`}
        style={{ textAlign: align, cursor: 'pointer', userSelect: 'none' }}
        aria-sort={isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        title={`Sort by ${label}`}
      >
        <span className={`trading-accounts-th-content ${align === 'right' ? 'is-right' : 'is-left'}`}>
          <span>{label}</span>
          {isSorted && (
            <span className="trading-accounts-sort-arrow" aria-hidden="true">
              {sortDir === 'asc' ? '▲' : '▼'}
            </span>
          )}
        </span>
      </th>
    );
  };

  const gridlineStyle = showGridlines === false
    ? { '--row-border': 'transparent' }
    : {};
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = sortedRows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + sortedRows.length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';
  const canUseEditAction = typeof onEditAccount === 'function';

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
            {isVisible('login') && <col style={{ width: '9%' }} />}
            {isVisible('name') && <col style={{ width: '16%' }} />}
            {isVisible('group') && <col style={{ width: '16%' }} />}
            {isVisible('country') && <col style={{ width: '10%' }} />}
            {isVisible('client') && <col style={{ width: '7%' }} />}
            {isVisible('balance') && <col style={{ width: '9.5%' }} />}
            {isVisible('balanceChecked') && <col style={{ width: '11%' }} />}
            {isVisible('equity') && <col style={{ width: '9.5%' }} />}
            {isVisible('profit') && <col style={{ width: '6.5%' }} />}
            {isVisible('currency') && <col style={{ width: '5.5%' }} />}
          </colgroup>
          <thead className="sticky top-0 z-10" style={{ boxShadow: '0 1px 0 var(--border)' }}>
            <tr>
              {isVisible('login') && renderHeader('login', 'Login', 'left')}
              {isVisible('name') && renderHeader('name', 'Name', 'left')}
              {isVisible('group') && renderHeader('group', 'Group', 'right')}
              {isVisible('country') && renderHeader('country', 'Country', 'right')}
              {isVisible('client') && renderHeader('client', 'Client', 'right')}
              {isVisible('balance') && renderHeader('balance', 'Balance', 'right')}
              {isVisible('balanceChecked') && renderHeader('balanceChecked', 'Balance / Checked', 'right')}
              {isVisible('equity') && renderHeader('equity', 'Equity', 'right')}
              {isVisible('profit') && renderHeader('profit', 'Profit', 'right')}
              {isVisible('currency') && renderHeader('currency', 'Currency', 'left')}
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
              const isSelected = selectedRow === rowKey || Boolean(grid?.selectedIds?.has(row.login));
              return (
                <tr
                  key={rowKey}
                  tabIndex={0}
                  aria-selected={isSelected}
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
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleEditAccount(row);
                    }
                  }}
                  onTouchEnd={(event) => handleRowTap(row, rowKey, event.timeStamp)}
                  onContextMenu={(e) => {
                    setSelectedRow(rowKey);
                    if (onRowContext) onRowContext(e, row);
                  }}
                  className={isSelected ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  {isVisible('login') && (
                    <td className="trading-accounts-cell-login is-left" title={String(row.login ?? '')}>
                      <span className="trading-accounts-login-wrap">
                        <AccountTypeIcon group={row.group} />
                        <span className="tabular">{row.login}</span>
                      </span>
                    </td>
                  )}
                  {isVisible('name') && (
                    <td className="truncate is-left" title={row.name || ''}>{row.name}</td>
                  )}
                  {isVisible('group') && (
                    <td className="truncate is-right" title={row.group || ''}>{row.group}</td>
                  )}
                  {isVisible('country') && (
                    <td className="truncate is-right" title={row.country || ''}>{row.country}</td>
                  )}
                  {isVisible('client') && (
                    <td className="truncate is-right" title={row.client || ''}>{row.client}</td>
                  )}
                  {isVisible('balance') && (
                    <td className="tabular is-right">{fmt(row.balance)}</td>
                  )}
                  {isVisible('balanceChecked') && (
                    <td className="tabular is-right">{row.balanceChecked}</td>
                  )}
                  {isVisible('equity') && (
                    <td className="tabular is-right">{fmt(row.equity)}</td>
                  )}
                  {isVisible('profit') && (
                    <td className="tabular is-right">{fmt(row.profit)}</td>
                  )}
                  {isVisible('currency') && (
                    <td className="is-left">{row.currency}</td>
                  )}
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
