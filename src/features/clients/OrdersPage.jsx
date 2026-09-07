import { useState, useMemo } from 'react';
import { Search, ClipboardList } from 'lucide-react';
import FilterDropdown from '../../components/FilterDropdown';
import OrdersDataGrid from './components/OrdersDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';
import { useDealerMenu } from '../../hooks/useDealerMenu';

const ORDER_COLUMNS = [
  { key: 'ticket',    label: 'Ticket' },
  { key: 'login',     label: 'Login' },
  { key: 'name',      label: 'User Name' },
  { key: 'group',     label: 'Group' },
  { key: 'symbol',    label: 'Symbol' },
  { key: 'type',      label: 'Type' },
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
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);

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

  const { getOrderActions, renderDialog } = useDealerMenu(() => {
    ctl.gridProps.onRowsChange?.([]);
  });

  const dealerActions = useMemo(() => {
    if (!ctl.contextMenuProps.selectedRow) return [];
    return getOrderActions(ctl.contextMenuProps.selectedRow);
  }, [ctl.contextMenuProps.selectedRow, getOrderActions]);

  return (
    <div className="orders-page p-6 w-full h-full flex flex-col gap-4 overflow-y-auto" {...ctl.pageProps}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardList size={18} style={{ color: 'var(--accent)' }} />
          <div className="min-w-0">
            <h1 className="orders-title text-xl font-semibold" style={{ color: 'var(--text)' }}>Orders</h1>
            <p className="orders-subtitle text-xs" style={{ color: 'var(--text-3)' }}>Right-click for actions · Double-click a row to modify</p>
          </div>
        </div>
        <div className="orders-filters flex flex-nowrap items-center justify-end gap-2">
          <FilterDropdown value={typeFilter} className="w-[96px]" options={['All Types', 'Buy', 'Sell']} onChange={setTypeFilter} />
          <FilterDropdown value={symbolFilter} className="w-[112px]" options={['All Symbols', 'xauusd.c', 'xauusd', 'Nubjpy.c']} onChange={setSymbolFilter} />
          <FilterDropdown value={reasonFilter} className="w-[112px]" options={['All Reasons', 'Mobile', 'Client', 'Expert']} onChange={setReasonFilter} />
        </div>
      </div>

      {/* Search */}
      <div className="orders-search-row relative -top-1 flex items-center justify-start">
        <div className="orders-search relative w-full max-w-[420px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search login, ticket, symbol…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 32 }}
          />
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
          onNewClient={() => setIsNewAccountOpen(true)}
        />
      )}

      {renderDialog()}

      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
    </div>
  );
};

export default OrdersPage;
