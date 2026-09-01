import { useEffect, useMemo, useState } from 'react';
import { User, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, RefreshCw } from 'lucide-react';
import usePagedData from '../../../hooks/usePagedData';
import useManualGridLoad from '../../../hooks/useManualGridLoad';
import { getClientsPage } from '../../../services/api';
import ClientDetailsModal from '../../../components/Popups/ClientDetailsModal';

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
  const [sortCol, setSortCol] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [detailsClient, setDetailsClient] = useState(null);
  const [hasRequestedData, markDataRequested] = useManualGridLoad('clients');
  const pageSize = 30;

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
    queryFn: getClientsPage,
    params,
    pageSize,
    enabled: hasRequestedData,
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
  const loadLabel = String(search || '').trim() || Object.keys(filters).length > 0 ? 'Load results' : 'Load first 30';

  return (
    <div className="ui-card flex flex-col min-h-0 w-full flex-1 overflow-hidden">
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
            {pageRows.length === 0 ? (
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
                  ) : isLoading ? 'Loading clients...' : 'No clients match the current filters.'}
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
        className="flex items-center justify-between px-4 py-2.5 text-xs shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
      >
        <span className="flex items-center gap-2">
          <span>
            {isIdle ? (
              'Clients not loaded'
            ) : (
              <>
                Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{rangeStart}-{rangeEnd}</span>
                {' '}of{' '}
                <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{total ?? 'many'}</span> clients
              </>
            )}
          </span>
          {grid?.selectedIds?.size > 0 && (
            <span className="ui-badge ui-badge-brand">
              {grid.selectedIds.size} selected
            </span>
          )}
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

      {detailsClient && (
        <ClientDetailsModal client={detailsClient} onClose={() => setDetailsClient(null)} />
      )}
    </div>
  );
};

export default ClientsDataGrid;
