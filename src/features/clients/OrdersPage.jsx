import { useState } from 'react';
import { ChevronDown, Search, ClipboardList } from 'lucide-react';
import OrdersDataGrid from './components/OrdersDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import DealerOrderMenu from '../../components/menus/DealerOrderMenu';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';

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

const Dropdown = ({ value, width = 'w-32', options = [], onChange }) => (
  <div className={`relative ${width}`}>
    <select
      onChange={onChange}
      className="appearance-none w-full h-7 pl-2.5 pr-7 text-xs rounded-md transition-colors focus:outline-none"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-3)', color: 'var(--text-2)', boxShadow: 'var(--shadow-xs)' }}
    >
      <option>{value}</option>
      {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
    <ChevronDown size={11} className="absolute right-2 top-2 pointer-events-none" style={{ color: 'var(--muted)' }} />
  </div>
);

const OrdersPage = () => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [symbolFilter, setSymbolFilter] = useState('All Symbols');
  const [reasonFilter, setReasonFilter] = useState('All Reasons');
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [dealerMenu, setDealerMenu] = useState(null);

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

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto" {...ctl.pageProps}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Orders</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Right-click for actions · Double-click a row to modify</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <Dropdown value="All Types"   width="w-[100px]" options={['Buy', 'Sell']}                onChange={(e) => setTypeFilter(e.target.value)} />
          <Dropdown value="All Symbols" width="w-[120px]" options={['xauusd.c', 'xauusd', 'Nubjpy.c']} onChange={(e) => setSymbolFilter(e.target.value)} />
          <Dropdown value="All Reasons" width="w-[120px]" options={['Mobile', 'Client', 'Expert']} onChange={(e) => setReasonFilter(e.target.value)} />
        </div>
      </div>

      <div className="relative w-full max-w-xs">
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

      <OrdersDataGrid
        search={search}
        typeFilter={typeFilter}
        symbolFilter={symbolFilter}
        reasonFilter={reasonFilter}
        {...ctl.gridProps}
        onRowContext={(e, row) => {
          ctl.gridProps.onRowContext(e, row);
          setDealerMenu({ x: e.clientX + 265, y: e.clientY, order: row });
        }}
      />

      {ctl.contextMenuProps.isOpen && (
        <ClientsContextMenu
          {...ctl.contextMenuProps}
          onNewClient={() => setIsNewAccountOpen(true)}
        />
      )}

      {dealerMenu && (
        <DealerOrderMenu
          x={dealerMenu.x}
          y={dealerMenu.y}
          order={dealerMenu.order}
          onClose={() => setDealerMenu(null)}
          onRefresh={() => {}}
        />
      )}

      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
    </div>
  );
};

export default OrdersPage;
