import { useState, useRef } from 'react';
import { Search, Users2 } from 'lucide-react';
import FilterDropdown from '../../components/FilterDropdown';
import ClientsDataGrid from './components/ClientsDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import ClientDetailsModal from '../../components/Popups/ClientDetailsModal';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridController from '../../hooks/useGridController';
import { rowsToCSV, rowsToTSV, rowsToJSON, copyToClipboard, downloadBlob, stampedFilename } from '../../utils/gridUtils';
import { ALL_COUNTRIES } from '../../utils/countries';

const CLIENT_COLUMNS = [
  { key: 'id',      label: 'ID' },
  { key: 'name',    label: 'Name' },
  { key: 'city',    label: 'City' },
  { key: 'type',    label: 'Type' },
  { key: 'status',  label: 'Status' },
  { key: 'lead',    label: 'Lead' },
  { key: 'email',   label: 'Email' },
  { key: 'phone',   label: 'Phone' },
  { key: 'country', label: 'Country' },
];

const ClientsDashboard = () => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [countryFilter, setCountryFilter] = useState('All Countries');

  const [contextMenu, setContextMenu] = useState(null);
  const [detailsClient, setDetailsClient] = useState(null);
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [currentRows, setCurrentRows] = useState([]);

  // Filtered rows are lifted from the grid so the context menu operates on them.
  const rowsRef = useRef([]);
  const handleRowsChange = (rows) => {
    rowsRef.current = rows;
    setCurrentRows(rows);
  };

  const grid = useGridController({
    columns: CLIENT_COLUMNS,
    rowKey: 'id',
    onClearFilter: () => {
      setSearch('');
      setTypeFilter('All Types');
      setStatusFilter('All Statuses');
      setCountryFilter('All Countries');
    },
  });

  // Open menu either on the page (no target row) or on a specific row.
  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, row: null });
  };
  const handleRowContext = (e, row) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, row });
  };

  // Which rows to act on: the user's checkbox selection, otherwise all visible.
  const targetRows = () => {
    if (grid.selectedIds.size === 0) return rowsRef.current;
    return rowsRef.current.filter(r => grid.selectedIds.has(r.id));
  };

  const handleCopyAs = (format) => {
    const rows = targetRows();
    if (rows.length === 0) { alert('No rows to copy.'); return; }
    const cols = grid.visibleColumns;
    const text =
      format === 'json' ? rowsToJSON(rows, cols) :
      format === 'tsv'  ? rowsToTSV(rows, cols)  :
                          rowsToCSV(rows, cols);
    copyToClipboard(text)
      .then(() => alert(`Copied ${rows.length} row(s) as ${format.toUpperCase()}.`))
      .catch(err => alert(`Copy failed: ${err.message}`));
  };

  const handleExport = () => {
    const rows = targetRows();
    if (rows.length === 0) { alert('No rows to export.'); return; }
    const csv = rowsToCSV(rows, grid.visibleColumns);
    downloadBlob(csv, stampedFilename('clients', 'csv'));
  };

  return (
    <div
      className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto"
      onContextMenu={handleContextMenu}
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Users2 size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Clients</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Right-click for actions · Double-click a row for details
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <FilterDropdown value={typeFilter} className="w-[130px]" options={['All Types', 'Individual', 'Corporate', 'IB']} onChange={setTypeFilter} />
          <FilterDropdown value={statusFilter} className="w-[130px]" options={['All Statuses', 'Active', 'Inactive', 'Unregistered', 'Pending']} onChange={setStatusFilter} />
          <FilterDropdown value={countryFilter} className="w-[140px]" options={['All Countries', ...ALL_COUNTRIES]} onChange={setCountryFilter} />
        </div>
      </div>

      <div className="relative w-full max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          placeholder="Search name, email, ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ui-input ui-input-sm"
          style={{ paddingLeft: 32 }}
        />
      </div>

      <ClientsDataGrid
        search={search}
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        countryFilter={countryFilter}
        grid={grid}
        onRowsChange={handleRowsChange}
        onRowContext={handleRowContext}
      />

      {contextMenu && (
        <ClientsContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          grid={grid}
          rows={currentRows}
          selectedRow={contextMenu.row}
          entityLabel="client"
          onNewClient={() => setIsNewAccountOpen(true)}
          onOpenDetails={(row) => setDetailsClient(row)}
          onCopyAs={handleCopyAs}
          onExport={handleExport}
        />
      )}

      {detailsClient && (
        <ClientDetailsModal client={detailsClient} onClose={() => setDetailsClient(null)} />
      )}

      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
    </div>
  );
};

export default ClientsDashboard;
