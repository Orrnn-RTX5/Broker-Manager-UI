import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { getSidebarAccountsQueryOptions } from '../../../services/sidebarAccounts.js';

const pick = (account, keys) => {
  for (const key of keys) {
    const value = account[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
};

const money = (value) => {
  const number = Number(value);
  return value === '' || !Number.isFinite(number)
    ? ''
    : number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const COLUMNS = [
  { key: 'login', label: 'Login' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'leverage', label: 'Leverage' },
  { key: 'balance', label: 'Balance', numeric: true },
  { key: 'equity', label: 'Equity', numeric: true },
];

const toRow = (account) => {
  const leverage = pick(account, ['leverage', 'Leverage']);
  return {
    account,
    login: account.login,
    name: account.Name || '',
    email: pick(account, ['email', 'Email', 'username', 'Username']),
    leverage: leverage === '' ? '' : `1 : ${leverage}`,
    balance: money(pick(account, ['balance', 'Balance'])),
    equity: money(pick(account, ['equity', 'Equity'])),
  };
};

const sameGroup = (left, right) => String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();

// Lists the trading accounts that belong to one group, from the shared account list.
const GroupAccountsTab = ({ groupName, onOpenAccount }) => {
  const { data, isLoading, isFetching, error, refetch } = useQuery(getSidebarAccountsQueryOptions(''));
  const [search, setSearch] = useState('');
  const [selectedLogin, setSelectedLogin] = useState(null);

  const rows = useMemo(
    () => (data?.rows || []).filter((account) => sameGroup(account.group, groupName)).map(toRow),
    [data, groupName],
  );
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => COLUMNS.some((column) => String(row[column.key]).toLowerCase().includes(query)));
  }, [rows, search]);

  const emptyMessage = error
    ? null
    : isLoading
      ? 'Loading accounts...'
      : search.trim()
        ? 'No accounts match your search.'
        : 'There are no accounts in this group.';

  return (
    <div className="groups-props-page">
      <div className="groups-props-intro">
        <Users size={40} className="groups-props-icon" />
        <span>Accounts in this group. Double-click an account to open it.</span>
      </div>
      <div className="groups-props-inline groups-accounts-tools">
        <div className="relative">
          <Search size={13} className="groups-search-icon" />
          <input
            className="ui-input ui-input-sm groups-search"
            placeholder="Find account..."
            aria-label="Find accounts in this group"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="groups-accounts-count" role="status">
          {isLoading ? '' : `${visibleRows.length} of ${rows.length} account${rows.length === 1 ? '' : 's'}`}
        </span>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon ui-btn-sm" title="Refresh accounts" aria-label="Refresh accounts" disabled={isFetching} onClick={() => refetch()}>
          {isFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>
      {error && (
        <div className="groups-props-error" role="alert">
          <span>{error.message || 'Failed to load accounts.'}</span>
        </div>
      )}
      <div className="groups-props-list groups-accounts-list">
        <table className="ui-grid groups-props-grid" aria-label={`Accounts in ${groupName}`}>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" style={column.numeric ? { textAlign: 'right' } : undefined}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = row.login === selectedLogin;
              return (
                <tr
                  key={row.login}
                  className={selected ? 'is-selected' : ''}
                  aria-selected={selected}
                  onClick={() => setSelectedLogin(row.login)}
                  onDoubleClick={() => onOpenAccount?.(row.account)}
                >
                  {COLUMNS.map((column) => (
                    <td key={column.key} style={column.numeric ? { textAlign: 'right' } : undefined}>
                      {row[column.key] !== '' ? row[column.key] : <span className="groups-cell-empty">—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {emptyMessage && visibleRows.length === 0 && <p className="groups-props-empty" role="status">{emptyMessage}</p>}
      </div>
    </div>
  );
};

export default GroupAccountsTab;
