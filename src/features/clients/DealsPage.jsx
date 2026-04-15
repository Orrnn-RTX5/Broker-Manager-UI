import { useState } from 'react';
import { ChevronDown, Search, Activity } from 'lucide-react';
import DealsDataGrid from './components/DealsDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';

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

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto" {...ctl.pageProps}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Activity size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Dealing</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Right-click for actions · Double-click a row to update</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <Dropdown value="All Actions" width="w-[110px]" options={['deal_buy', 'deal_sell']}  onChange={(e) => setActionFilter(e.target.value)} />
          <Dropdown value="All Symbols" width="w-[120px]" options={['GBPUSD', 'xauusd']}       onChange={(e) => setSymbolFilter(e.target.value)} />
          <Dropdown value="All Entries" width="w-[120px]" options={['entry_in', 'entry_out']}  onChange={(e) => setEntryFilter(e.target.value)} />
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
          onNewClient={() => setIsNewAccountOpen(true)}
        />
      )}

      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
    </div>
  );
};

export default DealsPage;
