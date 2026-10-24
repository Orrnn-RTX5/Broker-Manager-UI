import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import FilterDropdown from '../../components/FilterDropdown';
import DealsDataGrid from './components/DealsDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import useGridPageController from '../../hooks/useGridPageController';
import { useDealerMenu } from '../../hooks/useDealerMenu';
import useSymbolStore from '../../store/symbolStore';
import { useMultiScreenStore } from '../../store/multiScreenStore';
import useOwnerConsoleAutoCollapse from '../../hooks/useOwnerConsoleAutoCollapse';

const DEAL_COLUMNS = [
  { key: 'ticket',       label: 'Ticket' },
  { key: 'orderTicket',  label: 'Order' },
  { key: 'login',        label: 'Login' },
  { key: 'username',     label: 'Username' },
  { key: 'accountName',  label: 'Account' },
  { key: 'accountGroup', label: 'Group' },
  { key: 'symbol',       label: 'Symbol' },
  { key: 'action',       label: 'Action' },
  { key: 'volume',       label: 'Volume' },
  { key: 'price',        label: 'Price' },
  { key: 'profit',       label: 'Profit' },
  { key: 'commission',   label: 'Comm.' },
  { key: 'swap',         label: 'Swap' },
  { key: 'fee',          label: 'Fee' },
  { key: 'time',         label: 'Time' },
  { key: 'comment',      label: 'Comment' },
];

const ACTION_FILTER_MAP = {
  'All Actions': 'All Actions',
  Buy: 'deal_buy',
  Sell: 'deal_sell',
};

const ENTRY_FILTER_MAP = {
  'All Entries': 'All Entries',
  'Entry In': 'entry_in',
  'Entry Out': 'entry_out',
};

const DealsPage = () => {
  const headerRef = useOwnerConsoleAutoCollapse('.deals-filters');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All Actions');
  const [symbolFilter, setSymbolFilter] = useState('All Symbols');
  const [entryFilter, setEntryFilter] = useState('All Entries');
  const storeSymbols = useSymbolStore((state) => state.symbols);
  const openAccountScreen = useMultiScreenStore((state) => state.openAccountScreen);

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

  const symbolOptions = useMemo(() => {
    const dynamicSymbols = (ctl.grid?.rows || [])
      .map((row) => String(row?.symbol || '').trim().toUpperCase())
      .filter(Boolean);
    const catalogSymbols = Object.keys(storeSymbols || {});
    return Array.from(new Set([
      'All Symbols',
      ...dynamicSymbols,
      ...catalogSymbols,
    ]));
  }, [ctl.grid?.rows, storeSymbols]);

  const { getDealActions, renderDialog } = useDealerMenu(() => {
    ctl.gridProps.onRowsChange?.([]);
  });

  const dealerActions = useMemo(() => {
    if (!ctl.contextMenuProps.selectedRow) return [];
    return getDealActions(ctl.contextMenuProps.selectedRow);
  }, [ctl.contextMenuProps.selectedRow, getDealActions]);

  const mappedActionFilter = ACTION_FILTER_MAP[actionFilter] || actionFilter;
  const mappedEntryFilter = ENTRY_FILTER_MAP[entryFilter] || entryFilter;

  return (
    <div className="deals-page p-3 w-full h-full min-h-0 flex flex-col gap-2 overflow-hidden" {...ctl.pageProps}>
      <div ref={headerRef} className="deals-header flex flex-row items-center justify-between gap-2 shrink-0">
        <div className="deals-heading flex items-center gap-2 min-w-0">
          <h1 className="font-semibold deals-title" style={{ color: 'var(--text)' }}>Dealing</h1>
        </div>
        <div className="deals-filters flex items-center gap-2 flex-nowrap shrink-0">
          <div className="deals-search relative w-[220px] shrink-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Search login, ticket, symbol…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ui-input ui-input-sm h-7 w-full"
              style={{ paddingLeft: 32 }}
            />
          </div>
          <FilterDropdown value={actionFilter} className="w-[115px]" options={['All Actions', 'Buy', 'Sell']} onChange={setActionFilter} />
          <FilterDropdown value={symbolFilter} className="w-[120px]" options={symbolOptions} onChange={setSymbolFilter} />
          <FilterDropdown value={entryFilter} className="w-[120px]" options={['All Entries', 'Entry In', 'Entry Out']} onChange={setEntryFilter} />
        </div>
      </div>

      <DealsDataGrid
        search={search}
        actionFilter={mappedActionFilter}
        symbolFilter={symbolFilter}
        entryFilter={mappedEntryFilter}
        {...ctl.gridProps}
      />

      {ctl.contextMenuProps.isOpen && (
        <ClientsContextMenu
          {...ctl.contextMenuProps}
          grid={{ ...ctl.grid, extraActions: dealerActions }}
          onNewClient={() => openAccountScreen()}
        />
      )}

      {renderDialog()}
    </div>
  );
};

export default DealsPage;
