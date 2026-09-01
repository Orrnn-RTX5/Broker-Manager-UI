import { useMemo, useState } from 'react';
import { Search, User } from 'lucide-react';
import FilterDropdown from '../../components/FilterDropdown';
import TradingAccountsDataGrid from './components/TradingAccountsDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import AccountRestrictionsModal from '../../components/Popups/AccountRestrictionsModal';
import AccountDetailsModal from '../../components/Popups/AccountDetailsModal';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';
import { useGroupList } from '../../hooks/useGroupList';
import { usePermissions } from '../../hooks/usePermissions';
import { ALL_COUNTRIES } from '../../utils/countries';
import { PERMISSIONS } from '../../utils/permissions';

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

const TradingAccountsPage = () => {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('All Groups');
  const [countryFilter, setCountryFilter] = useState('All Countries');
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [restrictLogin, setRestrictLogin] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { groups, loading: groupsLoading } = useGroupList({ limit: 100, offset: 0, sort_by: 'name', sort_dir: 'asc' });
  const { canAct } = usePermissions();
  const canEditAccounts = canAct(PERMISSIONS.MANAGE_ACCOUNTS);
  const groupOptions = useMemo(
    () => ['All Groups', ...groups.map((group) => group.name).filter(Boolean)],
    [groups]
  );
  const countryOptions = useMemo(() => ['All Countries', ...ALL_COUNTRIES], []);

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
    <div className="trading-accounts-page p-6 w-full h-full flex flex-col gap-4 overflow-y-auto" {...ctl.pageProps}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <User size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="trading-accounts-title text-xl font-semibold" style={{ color: 'var(--text)' }}>Trading Accounts</h1>
            <p className="trading-accounts-subtitle text-xs" style={{ color: 'var(--text-3)' }}>Right-click for actions · Double-click a row to edit</p>
          </div>
        </div>
        <div className="trading-accounts-filters flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <FilterDropdown
            value={groupFilter}
            className="w-[160px]"
            options={groupOptions}
            loading={groupsLoading}
            loadingLabel="Loading groups…"
            onChange={setGroupFilter}
          />
          <FilterDropdown
            value={countryFilter}
            className="w-[160px]"
            options={countryOptions}
            onChange={setCountryFilter}
          />
        </div>
      </div>

      <div className="trading-accounts-search relative w-full max-w-xs">
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
        onEditAccount={setEditAccount}
        canEditAccounts={canEditAccounts}
        refreshVersion={refreshVersion}
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

      {editAccount && (
        <AccountDetailsModal
          account={editAccount}
          initialTab="Personal"
          onClose={() => setEditAccount(null)}
          onAccountUpdated={() => setRefreshVersion((version) => version + 1)}
        />
      )}

      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
    </div>
  );
};

export default TradingAccountsPage;
