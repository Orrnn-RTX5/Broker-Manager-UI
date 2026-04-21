import { useState, useMemo } from 'react';
import { User, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getClients } from '../../../services/api';
import { CLIENTS_FALLBACK } from '../../../data/clients';
import ClientDetailsModal from '../../../components/Popups/ClientDetailsModal';

const STATUS_BADGE = {
  Active:       'ui-badge-success',
  Inactive:     'ui-badge-neutral',
  Unregistered: 'ui-badge-warn',
  Pending:      'ui-badge-info',
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
  onRowsChange,            // (rows) => void    — lifted filtered rows
  onRowContext,            // (e, row) => void   — row right-click for menu
}) => {
  const { data: rawData, isLoading, isFallback } = useDataSource(getClients, CLIENTS_FALLBACK);
  const [sortCol, setSortCol] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [detailsClient, setDetailsClient] = useState(null);
  const [page, setPage] = useState(0);
  const pageSize = 30;

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let rows = [...rawData];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        String(r.id).includes(q) ||
        r.phone.includes(q)
      );
    }
    if (typeFilter !== 'All Types') rows = rows.filter(r => r.type === typeFilter);
    if (statusFilter !== 'All Statuses') rows = rows.filter(r => r.status === statusFilter);
    if (countryFilter !== 'All Countries') rows = rows.filter(r => r.country === countryFilter);

    rows.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return rows;
  }, [rawData, search, typeFilter, statusFilter, countryFilter, sortCol, sortDir]);

  // Lift filtered rows up to the page so the context menu can operate on them.
  useMemo(() => { if (onRowsChange) onRowsChange(filtered); /* eslint-disable-line */ }, [filtered]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const isVisible = (key) => !grid || !grid.hiddenColumns.has(key);
  const isChecked = (id) => grid?.selectedIds?.has(id) ?? false;
  const toggleRow = (id) => grid?.toggle(id);

  const TH = ({ col, label, align = 'left' }) => (
    <th onClick={() => handleSort(col)} style={{ textAlign: align }}>
      {label}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </th>
  );

  const gridlineStyle = grid?.showGridlines === false
    ? { '--row-border': 'transparent' }
    : {};

  return (
    <div className="ui-card flex flex-col w-full flex-1 overflow-hidden">
      <div className="w-full overflow-x-auto flex-1">
        <table className={`ui-grid min-w-max ${grid?.showGridlines === false ? 'no-gridlines' : ''}`} style={gridlineStyle}>
          <thead>
            <tr>
              {grid && <th style={{ width: 32 }} />}
              {isVisible('id')      && <TH col="id"      label="ID" />}
              {isVisible('name')    && <TH col="name"    label="Name" />}
              {isVisible('city')    && <TH col="city"    label="City" />}
              {isVisible('type')    && <TH col="type"    label="Type" />}
              {isVisible('status')  && <TH col="status"  label="Status" />}
              {isVisible('lead')    && <TH col="lead"    label="Lead" />}
              {isVisible('email')   && <TH col="email"   label="Email" />}
              {isVisible('phone')   && <TH col="phone"   label="Phone" />}
              {isVisible('country') && <TH col="country" label="Country" />}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  {isLoading ? 'Loading clients…' : (isFallback ? 'BACKEND DISCONNECTED' : 'No clients match the current filters.')}
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
                  {isVisible('name')    && <td style={{ fontWeight: 500 }}>{row.name}</td>}
                  {isVisible('city')    && <td style={{ color: 'var(--text-2)' }}>{row.city || '—'}</td>}
                  {isVisible('type')    && <td style={{ color: 'var(--text-2)' }}>{row.type}</td>}
                  {isVisible('status')  && (
                    <td>
                      <span className={`ui-badge ${STATUS_BADGE[row.status] || 'ui-badge-neutral'}`}>
                        {row.status}
                      </span>
                    </td>
                  )}
                  {isVisible('lead')    && <td style={{ color: 'var(--muted)' }}>{row.lead}</td>}
                  {isVisible('email')   && (
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
                  {isVisible('phone')   && <td className="font-mono tabular" style={{ color: 'var(--text-2)' }}>{row.phone}</td>}
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
            Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)}</span>
            {' '}of{' '}
            <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{filtered.length}</span> clients
          </span>
          {grid?.selectedIds?.size > 0 && (
            <span className="ui-badge ui-badge-brand">
              {grid.selectedIds.size} selected
            </span>
          )}
          {isFallback && (
            <span className="ui-badge ui-badge-danger">
              <AlertTriangle size={10} />
              BACKEND DISCONNECTED
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="ui-btn ui-btn-secondary ui-btn-xs">Prev</button>
          <span className="tabular px-1" style={{ color: 'var(--text-2)' }}>{page + 1} / {Math.max(1, totalPages)}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="ui-btn ui-btn-secondary ui-btn-xs">Next</button>
        </div>
      </div>

      {detailsClient && (
        <ClientDetailsModal client={detailsClient} onClose={() => setDetailsClient(null)} />
      )}
    </div>
  );
};

export default ClientsDataGrid;
