import { useCallback, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import FilterDropdown from '../../components/FilterDropdown';
import TradingAccountsDataGrid from './components/TradingAccountsDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import AccountRestrictionsModal from '../../components/Popups/AccountRestrictionsModal';
import AccountDetailsModal from '../../components/Popups/AccountDetailsModal';
import useGridPageController from '../../hooks/useGridPageController';
import { useGroupList } from '../../hooks/useGroupList';
import { usePermissions } from '../../hooks/usePermissions';
import { useMultiScreenStore } from '../../store/multiScreenStore';
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
  const [sortCol, setSortCol] = useState('login');
  const [sortDir, setSortDir] = useState('asc');
  const openAccountScreen = useMultiScreenStore((state) => state.openAccountScreen);
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

  const handleSort = useCallback((col) => {
    if (sortCol === col) {
      setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }, [sortCol]);

  const ctl = useGridPageController({
    columns: ACCOUNT_COLUMNS,
    rowKey: 'login',
    exportName: 'trading-accounts',
    entityLabel: 'account',
    onClearFilter: () => {
      setSearch('');
      setGroupFilter('All Groups');
      setCountryFilter('All Countries');
      setSortCol('login');
      setSortDir('asc');
    },
  });

  return (
    <div className="trading-accounts-page p-3 w-full h-full min-h-0 flex flex-col gap-2 overflow-hidden" {...ctl.pageProps}>
      <div className="trading-accounts-header flex flex-col md:flex-row items-start md:items-center justify-between pb-0 gap-2 shrink-0">
        <div className="trading-accounts-heading flex items-center gap-2 min-w-0">
          <h1 className="trading-accounts-title" style={{ color: 'var(--text)' }}>Trading Accounts</h1>
        </div>
        <div className="trading-accounts-filters flex items-center gap-2 mt-2 md:mt-0 flex-nowrap shrink-0">
          <div className="trading-accounts-search relative w-[220px] shrink-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Search login, name, group…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ui-input ui-input-sm w-full"
              style={{ paddingLeft: 32 }}
            />
          </div>
          <FilterDropdown
            value={groupFilter}
            className="w-[150px]"
            options={groupOptions}
            loading={groupsLoading}
            loadingLabel="Loading groups…"
            onChange={setGroupFilter}
          />
          <FilterDropdown
            value={countryFilter}
            className="w-[150px]"
            options={countryOptions}
            onChange={setCountryFilter}
          />
        </div>
      </div>

      <TradingAccountsDataGrid
        search={search}
        groupFilter={groupFilter}
        countryFilter={countryFilter}
        sortCol={sortCol}
        sortDir={sortDir}
        onSort={handleSort}
        showGridlines={ctl.grid.showGridlines}
        onEditAccount={setEditAccount}
        canEditAccounts={canEditAccounts}
        refreshVersion={refreshVersion}
        {...ctl.gridProps}
      />

      {ctl.contextMenuProps.isOpen && (
        <ClientsContextMenu
          {...ctl.contextMenuProps}
          sortCol={sortCol}
          sortDir={sortDir}
          onSortColumn={handleSort}
          onNewClient={() => openAccountScreen()}
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
    </div>
  );
};

export default TradingAccountsPage;
