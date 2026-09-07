import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User, ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { getClientsPage, normalizeClientRow, peekAccountDetailsManyPage } from '../../../services/api';
import ClientDetailsModal from '../../../components/Popups/ClientDetailsModal';
import {
  CLIENTS_INITIAL_PARAMS,
  TRADING_ACCOUNTS_INITIAL_PARAMS,
  WORKSPACE_DATA_STALE_MS,
  WORKSPACE_QUERY_META,
} from '../../../utils/workspaceQueryOptions.js';

const CLIENTS_CACHE_KEY = 'rtx5_clients_cache_v1';

const getInitialCachedClients = () => {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(CLIENTS_CACHE_KEY) : null;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) return parsed;
  } catch {
    // Ignore storage parse errors
  }
  return undefined;
};

const saveCachedClients = (data) => {
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return;
  try {
    window.sessionStorage?.setItem(CLIENTS_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or private mode
  }
};

const toClientPage = (page) => {
  if (!page?.rows?.length) return undefined;
  return {
    rows: page.rows.map((row) => normalizeClientRow(row.raw || row)),
    total: page.total ?? null,
    hasMore: Boolean(page.hasMore),
    nextOffset: page.nextOffset ?? page.rows.length,
  };
};

const STATUS_BADGE = {
  Active: 'ui-badge-success',
  Inactive: 'ui-badge-neutral',
  Unregistered: 'ui-badge-warn',
  Pending: 'ui-badge-info',
};

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <ChevronsUpDown size={11} className="inline ml-1" style={{ color: 'var(--muted)' }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />
    : <ChevronDown size={11} className="inline ml-1" style={{ color: 'var(--accent)' }} />;
};

const ClientsDataGrid = ({
  search = '',
  typeFilter = 'All Types',
  statusFilter = 'All Statuses',
  countryFilter = 'All Countries',
  grid,
  onRowsChange,
  onRowContext,
}) => {
  const queryClient = useQueryClient();
  const [sortCol, setSortCol] = useState(CLIENTS_INITIAL_PARAMS.sort_by);
  const [sortDir, setSortDir] = useState(CLIENTS_INITIAL_PARAMS.sort_dir);
  const [detailsClient, setDetailsClient] = useState(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('clients');
  const pageSize = CLIENTS_INITIAL_PARAMS.limit;

  const filters = useMemo(() => ({
    ...(typeFilter !== 'All Types' ? { type: typeFilter } : {}),
    ...(statusFilter !== 'All Statuses' ? { status: statusFilter } : {}),
    ...(countryFilter !== 'All Countries' ? { country: countryFilter } : {}),
  }), [typeFilter, statusFilter, countryFilter]);

  const params = useMemo(() => ({
    search,
    sort_by: sortCol,
    sort_dir: sortDir,
    filters,
  }), [search, sortCol, sortDir, filters]);

  const isDefaultParams = !search
    && typeFilter === 'All Types'
    && statusFilter === 'All Statuses'
    && countryFilter === 'All Countries'
    && sortCol === CLIENTS_INITIAL_PARAMS.sort_by
    && sortDir === CLIENTS_INITIAL_PARAMS.sort_dir;

  const initialData = useMemo(() => {
    if (!isDefaultParams) return undefined;
    const sessionCache = getInitialCachedClients();
    if (sessionCache) return sessionCache;

    const fromShared = toClientPage(peekAccountDetailsManyPage());
    if (fromShared) return fromShared;

    const tradingAccounts = queryClient.getQueryData(['trading-accounts', 'page', TRADING_ACCOUNTS_INITIAL_PARAMS]);
    const fromTrading = toClientPage(tradingAccounts);
    if (fromTrading) return fromTrading;

    return toClientPage(queryClient.getQueryData(['sidebar-accounts', '']));
  }, [isDefaultParams, queryClient]);

  const {
    rows: pageRows,
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
    queryKey: ['clients', 'page'],
    queryFn: async (pagedParams, options) => {
      const result = await getClientsPage(pagedParams, options);
      if (pagedParams.offset === 0 && !pagedParams.search && result?.rows?.length > 0) {
        saveCachedClients(result);
      }
      return result;
    },
    params,
    pageSize,
    enabled: hasRequestedData,
    staleTime: WORKSPACE_DATA_STALE_MS,
    refetchOnMount: true,
    keepRunningOnUnmount: true,
    initialData,
    placeholderData: (previousData) => previousData || initialData,
    meta: WORKSPACE_QUERY_META,
  });

  useEffect(() => {
    if (onRowsChange) onRowsChange(pageRows);
  }, [pageRows, onRowsChange]);

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

  const isVisible = (key) => !grid || !grid.hiddenColumns.has(key);
  const isChecked = (id) => grid?.selectedIds?.has(id) ?? false;
  const toggleRow = (id) => grid?.toggle(id);

  const renderHeader = (col, label, align = 'left') => (
    <th onClick={() => handleSort(col)} style={{ textAlign: align }}>
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  const gridlineStyle = grid?.showGridlines === false
    ? { '--row-border': 'transparent' }
    : {};
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = pageRows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + pageRows.length;
  const isIdle = !hasRequestedData;
  const isInitialLoad = !isIdle && pageRows.length === 0 && (isLoading || isFetching);
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';
  const dataColumns = ['id', 'name', 'city', 'type', 'status', 'lead', 'email', 'phone', 'country'];

  const renderSkeletonRows = () => Array.from({ length: 8 }, (_, index) => (
    <tr key={`skeleton-${index}`}>
      {grid && <td />}
      {dataColumns.filter(isVisible).map((column) => (
        <td key={column}>
          <span
            className="inline-block h-2.5 rounded animate-pulse"
            style={{
              width: column === 'email' ? '78%' : column === 'name' ? '62%' : '46%',
              background: 'var(--surface-3)',
            }}
          />
        </td>
      ))}
    </tr>
  ));

  return (
    <div className="clients-grid ui-card flex flex-col min-h-0 w-full flex-1 overflow-hidden">
      {isError && (
        <div
          className="px-4 py-2 text-xs break-all"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
        >
          <strong>API Error.</strong> {error?.message || 'Failed to load clients.'}
        </div>
      )}
      <div className="grid-scroll-area w-full min-h-0 overflow-auto flex-1">
        <table className={`ui-grid min-w-max ${grid?.showGridlines === false ? 'no-gridlines' : ''}`} style={gridlineStyle}>
          <thead className="sticky top-0 z-10" style={{ boxShadow: '0 1px 0 var(--border)' }}>
            <tr>
              {grid && <th style={{ width: 32 }} />}
              {isVisible('id') && renderHeader('id', 'ID')}
              {isVisible('name') && renderHeader('name', 'Name')}
              {isVisible('city') && renderHeader('city', 'City')}
              {isVisible('type') && renderHeader('type', 'Type')}
              {isVisible('status') && renderHeader('status', 'Status')}
              {isVisible('lead') && renderHeader('lead', 'Lead')}
              {isVisible('email') && renderHeader('email', 'Email')}
              {isVisible('phone') && renderHeader('phone', 'Phone')}
              {isVisible('country') && renderHeader('country', 'Country')}
            </tr>
          </thead>
          <tbody>
            {isInitialLoad ? renderSkeletonRows() : pageRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  {isIdle ? (
                    <div className="flex flex-col items-center gap-3">
                      <span>Clients are not loaded.</span>
                      <button type="button" onClick={handleLoadData} className="ui-btn ui-btn-primary ui-btn-sm">
                        <RefreshCw size={13} />
                        {loadLabel}
                      </button>
                    </div>
                  ) : 'No clients match the current filters.'}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => toggleRow(row.id)}
                  onDoubleClick={() => setDetailsClient(row)}
                  onContextMenu={(e) => onRowContext && onRowContext(e, row)}
                  className={isChecked(row.id) ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  {grid && (
                    <td onClick={(e) => { e.stopPropagation(); toggleRow(row.id); }} style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={isChecked(row.id)} onChange={() => toggleRow(row.id)} onClick={(e) => e.stopPropagation()} />
                    </td>
                  )}
                  {isVisible('id') && (
                    <td style={{ color: 'var(--text-3)' }}>
                      <span className="inline-flex items-center gap-2">
                        <User size={13} style={{ color: 'var(--accent)' }} />
                        <span className="tabular">{row.id}</span>
                      </span>
                    </td>
                  )}
                  {isVisible('name') && <td style={{ fontWeight: 500 }}>{row.name}</td>}
                  {isVisible('city') && <td style={{ color: 'var(--text-2)' }}>{row.city || '-'}</td>}
                  {isVisible('type') && <td style={{ color: 'var(--text-2)' }}>{row.type}</td>}
                  {isVisible('status') && (
                    <td>
                      <span className={`ui-badge ${STATUS_BADGE[row.status] || 'ui-badge-neutral'}`}>
                        {row.status}
                      </span>
                    </td>
                  )}
                  {isVisible('lead') && <td style={{ color: 'var(--muted)' }}>{row.lead}</td>}
                  {isVisible('email') && (
                    <td>
                      <a
                        href={`mailto:${row.email}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: 'var(--accent-text)' }}
                      >
                        {row.email}
                      </a>
                    </td>
                  )}
                  {isVisible('phone') && <td className="font-mono tabular" style={{ color: 'var(--text-2)' }}>{row.phone}</td>}
                  {isVisible('country') && <td style={{ color: 'var(--text-2)' }}>{row.country}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        className="clients-grid-footer flex items-center justify-between px-4 py-2 text-[10px] shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: '10px' }}
      >
        <span className="flex items-center gap-2">
          <span>
            {isIdle ? (
              'Clients not loaded'
            ) : isInitialLoad ? (
              'Loading clients…'
            ) : (
              <>
                Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{rangeStart}-{rangeEnd}</span>
                {' '}of{' '}
                <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{total ?? 'many'}</span> clients
              </>
            )}
          </span>
          {grid?.selectedIds?.size > 0 && (
            <span className="ui-badge ui-badge-brand" style={{ fontSize: '10px' }}>
              {grid.selectedIds.size} selected
            </span>
          )}
          {isFetching && pageRows.length > 0 && (
            <span className="ui-badge ui-badge-neutral" style={{ fontSize: '10px' }}>
              <RefreshCw size={10} className="animate-spin" />
              Refreshing
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleRefresh} disabled={isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ fontSize: '10px' }}>
            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            {isIdle ? 'Load' : 'Refresh'}
          </button>
          <button onClick={prevPage} disabled={isIdle || page === 0 || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ fontSize: '10px' }}>Prev</button>
          <span className="tabular px-1" style={{ color: 'var(--text-2)', fontSize: '10px' }}>{isIdle ? '-' : `${page + 1} / ${totalPages ?? '?'}`}</span>
          <button onClick={nextPage} disabled={isIdle || !hasMore || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs" style={{ fontSize: '10px' }}>Next</button>
        </div>
      </div>

      {detailsClient && (
        <ClientDetailsModal client={detailsClient} onClose={() => setDetailsClient(null)} />
      )}
    </div>
  );
};

export default ClientsDataGrid;
