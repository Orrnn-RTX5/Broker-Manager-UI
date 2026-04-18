import { useState } from 'react';
import { ChevronDown, Search, User } from 'lucide-react';
import TradingAccountsDataGrid from './components/TradingAccountsDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import AccountRestrictionsModal from '../../components/Popups/AccountRestrictionsModal';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';
import { ALL_COUNTRIES } from '../../utils/countries';

const GROUPS = ['FlexyB\\CENT','FlexyB\\STD','FlexyB\\Social','FlexyB\\Superfast','FlexyB\\YOFX','FlexyB\\YOFXNET','Demo\\extra','Demo\\MaxMaster','YOFX\\YOFX','demo\\PRO','demo\\STD','demo\\Propfirm'];

const ACCOUNT_COLUMNS = [
  { key: 'login',    label: 'Login' },
  { key: 'name',     label: 'Name' },
  { key: 'group',    label: 'Group' },
  { key: 'country',  label: 'Country' },
  { key: 'client',   label: 'Client' },
  { key: 'balance',  label: 'Balance' },
  { key: 'equity',   label: 'Equity' },
  { key: 'profit',   label: 'Profit / Credit' },
  { key: 'currency', label: 'Currency' },
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

const TradingAccountsPage = () => {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('All Groups');
  const [countryFilter, setCountryFilter] = useState('All Countries');
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [restrictLogin, setRestrictLogin] = useState(null);

  const ctl = useGridPageController({
    columns: ACCOUNT_COLUMNS,
    rowKey: 'login',
    exportName: 'trading-accounts',
    entityLabel: 'account',
    onClearFilter: () => {
      setSearch(''); setGroupFilter('All Groups'); setCountryFilter('All Countries');
    },
  });

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto" {...ctl.pageProps}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <User size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Trading Accounts</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Right-click for actions</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <Dropdown value="All Groups"    width="w-[160px]" options={GROUPS}        onChange={(e) => setGroupFilter(e.target.value)} />
          <Dropdown value="All Countries" width="w-[140px]" options={ALL_COUNTRIES} onChange={(e) => setCountryFilter(e.target.value)} />
        </div>
      </div>

      <div className="relative w-full max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          placeholder="Search login, name, group…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ui-input ui-input-sm"
          style={{ paddingLeft: 32 }}
        />
      </div>

      <TradingAccountsDataGrid
        search={search}
        groupFilter={groupFilter}
        countryFilter={countryFilter}
        {...ctl.gridProps}
      />

      {ctl.contextMenuProps.isOpen && (
        <ClientsContextMenu
          {...ctl.contextMenuProps}
          onNewClient={() => setIsNewAccountOpen(true)}
          onOpenDetails={(row) => setRestrictLogin(row.login)}
        />
      )}

      {restrictLogin && (
        <AccountRestrictionsModal login={restrictLogin} onClose={() => setRestrictLogin(null)} />
      )}

      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
    </div>
  );
};

export default TradingAccountsPage;
