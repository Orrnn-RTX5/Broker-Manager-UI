import { useState, useMemo } from 'react';
import { Search, Activity } from 'lucide-react';
import FilterDropdown from '../../components/FilterDropdown';
import DealsDataGrid from './components/DealsDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';
import { useDealerMenu } from '../../hooks/useDealerMenu';

const DEAL_COLUMNS = [
  { key: 'ticket',       label: 'Ticket' },
  { key: 'orderTicket',  label: 'Order Ticket' },
  { key: 'login',        label: 'Login' },
  { key: 'username',     label: 'Username' },
  { key: 'accountName',  label: 'Account' },
  { key: 'accountGroup', label: 'Group' },
  { key: 'symbol',       label: 'Symbol' },
  { key: 'action',       label: 'Action' },
  { key: 'entry',        label: 'Entry' },
  { key: 'volume',       label: 'Volume' },
  { key: 'price',        label: 'Price' },
  { key: 'profit',       label: 'Profit' },
  { key: 'commission',   label: 'Commission' },
  { key: 'swap',         label: 'Swap' },
  { key: 'fee',          label: 'Fee' },
  { key: 'time',         label: 'Time' },
  { key: 'comment',      label: 'Comment' },
];

const DealsPage = () => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All Actions');
  const [symbolFilter, setSymbolFilter] = useState('All Symbols');
  const [entryFilter, setEntryFilter] = useState('All Entries');
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);

  const ctl = useGridPageController({
    columns: DEAL_COLUMNS,
    rowKey: 'ticket',
    exportName: 'deals',
    entityLabel: 'deal',
    onClearFilter: () => {
      setSearch(''); setActionFilter('All Actions');
      setSymbolFilter('All Symbols'); setEntryFilter('All Entries');
    },
  });

  const { getDealActions, renderDialog } = useDealerMenu(() => {
    ctl.gridProps.onRowsChange?.([]);
  });

  const dealerActions = useMemo(() => {
    if (!ctl.contextMenuProps.selectedRow) return [];
    return getDealActions(ctl.contextMenuProps.selectedRow);
  }, [ctl.contextMenuProps.selectedRow, getDealActions]);

  return (
    <div className="deals-page p-6 w-full h-full flex flex-col gap-4 overflow-y-auto" {...ctl.pageProps}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <Activity size={16} style={{ color: 'var(--accent)' }} />
          <div className="flex flex-col">
            <h1 className="font-semibold deals-title" style={{ color: 'var(--text)', fontSize: '12px', lineHeight: '15px' }}>Dealing</h1>
            <p className="deals-subtitle" style={{ color: 'var(--text-3)', fontSize: '10px', lineHeight: '13px', marginTop: '4px' }}>Right-click for actions · Double-click a row to update</p>
          </div>
        </div>
        <div className="deals-filters flex items-center gap-2 mt-2 md:mt-0 flex-nowrap shrink-0">
          <FilterDropdown value={actionFilter} className="w-[110px]" fontSize="10px" options={['All Actions', 'deal_buy', 'deal_sell']} onChange={setActionFilter} />
          <FilterDropdown value={symbolFilter} className="w-[120px]" fontSize="10px" options={['All Symbols', 'GBPUSD', 'xauusd']} onChange={setSymbolFilter} />
          <FilterDropdown value={entryFilter} className="w-[120px]" fontSize="10px" options={['All Entries', 'entry_in', 'entry_out']} onChange={setEntryFilter} />
        </div>
      </div>

      <div className="deals-search relative w-full max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          placeholder="Search login, ticket, symbol…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ui-input ui-input-sm h-7"
          style={{ paddingLeft: 32, fontSize: '10px' }}
        />
      </div>

      <DealsDataGrid
        search={search}
        actionFilter={actionFilter}
        symbolFilter={symbolFilter}
        entryFilter={entryFilter}
        {...ctl.gridProps}
      />

      {ctl.contextMenuProps.isOpen && (
        <ClientsContextMenu
          {...ctl.contextMenuProps}
          grid={{ ...ctl.grid, extraActions: dealerActions }}
          onNewClient={() => setIsNewAccountOpen(true)}
        />
      )}

      {renderDialog()}

      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
    </div>
  );
};

export default DealsPage;
