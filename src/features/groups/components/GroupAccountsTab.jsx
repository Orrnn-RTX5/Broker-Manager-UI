import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { getSidebarAccountsQueryOptions } from '../../../services/sidebarAccounts.js';
import { updateManagerAccount } from '../../../services/managerAccountApi.js';
import { GROUP_ACCOUNT_COLUMNS, accountsInGroup, readLeverageRatio, sameGroupName } from '../groupAccountRows.js';

// Lists the trading accounts that belong to one group, from the shared account list.
const GroupAccountsTab = ({ groupName, groupLeverage, onOpenAccount }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useQuery(getSidebarAccountsQueryOptions(''));
  const [search, setSearch] = useState('');
  const [selectedLogin, setSelectedLogin] = useState(null);
  const syncedKey = useRef('');

  // The group is the source of leverage. Push it onto any account in the group
  // that still has a different ratio, then refresh the rows in place.
  useEffect(() => {
    const leverage = readLeverageRatio({ leverage: groupLeverage });
    if (!groupName || !leverage || isLoading) return undefined;
    const key = `${groupName}:${leverage}`;
    if (syncedKey.current === key) return undefined;
    const stale = (data?.rows || []).filter((account) => {
      const name = account.group ?? account.Group ?? account.accountGroup ?? account.AccountGroup;
      return sameGroupName(name, groupName) && readLeverageRatio(account) !== leverage;
    });
    syncedKey.current = key;
    if (!stale.length) return undefined;
    let cancelled = false;
    (async () => {
      let updated = 0;
      for (const account of stale) {
        try {
          await updateManagerAccount(account.login, { Leverage: leverage });
          updated += 1;
        } catch {
          // A rejected account stays as returned by the server.
        }
      }
      if (cancelled || !updated) return;
      queryClient.setQueriesData({ queryKey: ['sidebar-accounts'] }, (current) => {
        if (!current?.rows) return current;
        return {
          ...current,
          rows: current.rows.map((account) => {
            const name = account.group ?? account.Group ?? account.accountGroup ?? account.AccountGroup;
            return sameGroupName(name, groupName) ? { ...account, leverage, Leverage: leverage } : account;
          }),
        };
      });
    })();
    return () => { cancelled = true; };
  }, [groupName, groupLeverage, isLoading, data, queryClient]);

  const rows = useMemo(
    () => accountsInGroup(data?.rows, groupName, { leverage: groupLeverage }),
    [data, groupName, groupLeverage],
  );
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => GROUP_ACCOUNT_COLUMNS.some((column) => String(row[column.key]).toLowerCase().includes(query)));
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
              {GROUP_ACCOUNT_COLUMNS.map((column) => (
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
                  {GROUP_ACCOUNT_COLUMNS.map((column) => (
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
