import { useEffect, useMemo, useRef, useState } from 'react';
import { User, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, RefreshCw, Edit2 } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { getTradingAccountsPage } from '../../../services/api';

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="inline ml-1" style={{ color: 'var(--muted)' }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />;
};

const TradingAccountsDataGrid = ({
  search = '',
  groupFilter = 'All Groups',
  countryFilter = 'All Countries',
  onRowsChange,
  onRowContext,
  onEditAccount,
  canEditAccounts = true,
  refreshVersion = 0,
}) => {
  const [sortCol, setSortCol] = useState('login');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
  const lastRefreshVersionRef = useRef(refreshVersion);
  const lastTapRef = useRef({ rowKey: null, time: 0 });
  const [hasRequestedData, markDataRequested] = useManualGridLoad('trading-accounts');
  const pageSize = 30;

  const filters = useMemo(() => ({
    ...(groupFilter !== 'All Groups' ? { group: groupFilter } : {}),
    ...(countryFilter !== 'All Countries' ? { country: countryFilter } : {}),
  }), [groupFilter, countryFilter]);

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
    queryKey: ['trading-accounts', 'page'],
    queryFn: getTradingAccountsPage,
    params,
    pageSize,
    enabled: hasRequestedData,
    keepRunningOnUnmount: true,
  });

  useEffect(() => {
    if (onRowsChange) onRowsChange(rows);
  }, [rows, onRowsChange]);

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
    <th onClick={() => handleSort(col)} style={{ textAlign: align }}>
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;
  const isIdle = !hasRequestedData;
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';
  const canUseEditAction = canEditAccounts && typeof onEditAccount === 'function';
  const editTitle = typeof onEditAccount !== 'function'
    ? 'Edit unavailable'
    : canEditAccounts ? 'Edit Account' : 'No permission to update accounts';
  const handleEditAccount = (row) => {
    if (!canUseEditAction) return;
    onEditAccount(row);
  };
  const handleRowTap = (row, rowKey) => {
    const now = Date.now();
    const lastTap = lastTapRef.current;

    if (lastTap.rowKey === rowKey && now - lastTap.time < 350) {
      lastTapRef.current = { rowKey: null, time: 0 };
      handleEditAccount(row);
      return;
    }

    lastTapRef.current = { rowKey, time: now };
  };

  return (
    <div className="ui-card flex flex-col w-full overflow-hidden">
      {isError && (
        <div
          className="px-4 py-2 text-xs break-all"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
        >
          <strong>API Error.</strong> {error?.message || 'Failed to load accounts.'}
        </div>
      )}
      <div className="w-full overflow-x-auto">
        <table className="ui-grid min-w-max">
          <thead>
            <tr>
              {renderHeader('login', 'Login')}
              {renderHeader('status', 'Status')}
              {renderHeader('name', 'Name')}
              {renderHeader('group', 'Group')}
              {renderHeader('leverage', 'Lev.')}
              {renderHeader('balance', 'Balance', 'right')}
              {renderHeader('equity', 'Equity', 'right')}
              {renderHeader('credit', 'Credit', 'right')}
              {renderHeader('profit', 'Profit', 'right')}
              {renderHeader('currency', 'Cu.')}
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
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
            ) : rows.map((row, idx) => {
              const rowKey = `${row.login}-${idx}`;
              const profitTone = row.profit < 0 ? 'var(--danger-text)' : row.profit > 0 ? 'var(--ok-text)' : 'var(--text-3)';
              const status = (row.status || 'active').toLowerCase();
              return (
                <tr
                  key={rowKey}
                  onClick={() => setSelectedRow(selectedRow === rowKey ? null : rowKey)}
                  onDoubleClick={() => handleEditAccount(row)}
                  onTouchEnd={() => handleRowTap(row, rowKey)}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={selectedRow === rowKey ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ color: 'var(--text-3)' }}>
                    <span className="inline-flex items-center gap-2">
                      <User size={13} style={{ color: 'var(--accent)' }} />
                      <span className="tabular">{row.login}</span>
                    </span>
                  </td>
                  <td>
                    <span className={`ui-badge text-[9px] px-1 py-0 ${
                      status === 'active' ? 'ui-badge-success' : status === 'disabled' ? 'ui-badge-danger' : 'ui-badge-warn'
                    }`}>
                      {status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }} className="truncate max-w-[150px]">{row.name}</td>
                  <td style={{ color: 'var(--text-3)' }} className="truncate max-w-[150px]">{row.group}</td>
                  <td style={{ color: 'var(--text-3)', textAlign: 'center' }}>1:{row.leverage}</td>
                  <td className="tabular" style={{ textAlign: 'right' }}>{fmt(row.balance)}</td>
                  <td className="tabular" style={{ textAlign: 'right' }}>{fmt(row.equity)}</td>
                  <td className="tabular" style={{ textAlign: 'right', color: 'var(--text-3)' }}>{fmt(row.credit || 0)}</td>
                  <td className="tabular" style={{ textAlign: 'right', color: profitTone, fontWeight: 500 }}>{fmt(row.profit)}</td>
                  <td style={{ color: 'var(--text-3)' }}>{row.currency}</td>
                  <td
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    style={{ textAlign: 'right' }}
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

      <div
        className="flex items-center justify-between px-4 py-2.5 text-xs shrink-0"
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
          <span className="tabular px-1" style={{ color: 'var(--text-2)' }}>{isIdle ? '-' : `${page + 1} / ${totalPages ?? '?'}`}</span>
          <button onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs">Next</button>
        </div>
      </div>
    </div>
  );
};

export default TradingAccountsDataGrid;
