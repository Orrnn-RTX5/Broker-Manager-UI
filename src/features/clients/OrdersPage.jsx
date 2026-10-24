import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import FilterDropdown from '../../components/FilterDropdown';
import OrdersDataGrid from './components/OrdersDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import useGridPageController from '../../hooks/useGridPageController';
import { useDealerMenu } from '../../hooks/useDealerMenu';
import useSymbolStore from '../../store/symbolStore';
import { useMultiScreenStore } from '../../store/multiScreenStore';

const ORDER_COLUMNS = [
  { key: 'ticket',    label: 'Ticket' },
  { key: 'login',     label: 'Login' },
  { key: 'name',      label: 'User Name' },
  { key: 'group',     label: 'Group' },
  { key: 'symbol',    label: 'Symbol' },
  { key: 'side',      label: 'Side' },
  { key: 'volume',    label: 'Lots' },
  { key: 'priceOpen', label: 'Open' },
  { key: 'priceSl',   label: 'S/L' },
  { key: 'priceTp',   label: 'T/P' },
  { key: 'status',    label: 'Status' },
  { key: 'timeSetup', label: 'Setup Time' },
  { key: 'timeDone',  label: 'Done Time' },
  { key: 'comment',   label: 'Comment' },
];

const OrdersPage = () => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [symbolFilter, setSymbolFilter] = useState('All Symbols');
  const [reasonFilter, setReasonFilter] = useState('All Reasons');
  const storeSymbols = useSymbolStore((state) => state.symbols);
  const openAccountScreen = useMultiScreenStore((state) => state.openAccountScreen);

  const ctl = useGridPageController({
    columns: ORDER_COLUMNS,
    rowKey: 'ticket',
    exportName: 'orders',
    entityLabel: 'order',
    onClearFilter: () => {
      setSearch(''); setTypeFilter('All Types');
      setSymbolFilter('All Symbols'); setReasonFilter('All Reasons');
    },
  });

  const symbolOptions = useMemo(() => {
    const dynamicSymbols = (ctl.grid?.rows || [])
      .map((row) => row?.symbol)
      .filter(Boolean);
    const catalogSymbols = Object.keys(storeSymbols || {});
    return Array.from(new Set([
      'All Symbols',
      ...dynamicSymbols,
      ...catalogSymbols,
    ]));
  }, [ctl.grid?.rows, storeSymbols]);

  const { getOrderActions, renderDialog } = useDealerMenu(() => {
    ctl.gridProps.onRowsChange?.([]);
  });

  const dealerActions = useMemo(() => {
    if (!ctl.contextMenuProps.selectedRow) return [];
    return getOrderActions(ctl.contextMenuProps.selectedRow);
  }, [ctl.contextMenuProps.selectedRow, getOrderActions]);

  return (
    <div className="orders-page p-3 w-full h-full min-h-0 flex flex-col gap-2 overflow-hidden" {...ctl.pageProps}>
      <div className="orders-header flex flex-col md:flex-row items-start md:items-center justify-between pb-0 gap-2 shrink-0">
        <div className="orders-heading flex items-center gap-2 min-w-0">
          <h1 className="orders-title" style={{ color: 'var(--text)' }}>Orders</h1>
        </div>
        <div className="orders-filters flex items-center gap-2 mt-2 md:mt-0 flex-nowrap shrink-0">
          <div className="orders-search relative w-[220px] shrink-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text)' }} />
            <input
              type="text"
              placeholder="Search login, ticket, symbol…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ui-input ui-input-sm w-full"
              style={{ paddingLeft: 32 }}
            />
          </div>
          <FilterDropdown value={typeFilter} className="w-[125px]" options={['All Types', 'Buy', 'Sell']} onChange={setTypeFilter} />
          <FilterDropdown value={symbolFilter} className="w-[135px]" options={symbolOptions} onChange={setSymbolFilter} />
          <FilterDropdown value={reasonFilter} className="w-[135px]" options={['All Reasons', 'Mobile', 'Client', 'Expert']} onChange={setReasonFilter} />
        </div>
      </div>

      <OrdersDataGrid
        search={search}
        typeFilter={typeFilter}
        symbolFilter={symbolFilter}
        reasonFilter={reasonFilter}
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

export default OrdersPage;
