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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="orders-title text-xl font-semibold" style={{ color: 'var(--text)' }}>Orders</h1>
            <p className="orders-subtitle text-xs" style={{ color: 'var(--text-3)' }}>Right-click for actions · Double-click a row to modify</p>
          </div>
        </div>
        <div className="orders-filters flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <FilterDropdown value={typeFilter} className="w-[100px]" options={['All Types', 'Buy', 'Sell']} onChange={setTypeFilter} />
          <FilterDropdown value={symbolFilter} className="w-[120px]" options={['All Symbols', 'xauusd.c', 'xauusd', 'Nubjpy.c']} onChange={setSymbolFilter} />
          <FilterDropdown value={reasonFilter} className="w-[120px]" options={['All Reasons', 'Mobile', 'Client', 'Expert']} onChange={setReasonFilter} />
        </div>
      </div>

      {/* Filters */}
      <div className="orders-filters flex flex-wrap items-center gap-2">
        <div className="orders-search relative max-w-xs w-full">
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
        {['All Types', 'Buy', 'Sell'].map(opt => (
          <button
            key={opt}
            onClick={() => setTypeFilter(opt)}
            className={`ui-btn ui-btn-sm ${typeFilter === opt ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
          >
            {opt}
          </button>
        ))}
        <div className="h-6 w-px mx-1" style={{ background: 'var(--border)' }} />
        <FilterDropdown value={symbolFilter} className="w-[120px]" options={['All Symbols', 'xauusd.c', 'xauusd', 'Nubjpy.c']} onChange={setSymbolFilter} />
        <FilterDropdown value={reasonFilter} className="w-[120px]" options={['All Reasons', 'Mobile', 'Client', 'Expert']} onChange={setReasonFilter} />
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
