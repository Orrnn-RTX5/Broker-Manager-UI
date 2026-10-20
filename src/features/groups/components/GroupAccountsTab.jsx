import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { getSidebarAccountsQueryOptions } from '../../../services/sidebarAccounts.js';
import { updateManagerAccount } from '../../../services/managerAccountApi.js';
import { GROUP_ACCOUNT_COLUMNS, accountsInGroup, readLeverageRatio } from '../groupAccountRows.js';

// Lists the trading accounts that belong to one group, from the shared account list.
// Viewing this tab never writes to accounts: opening, rendering, refreshing,
// searching and selecting rows are read-only. Pushing the group leverage onto
// member accounts happens solely through the explicit "Apply group leverage"
// button below, which asks for confirmation first and then reports
// succeeded/failed counts. There is intentionally no effect that writes.
export const applyGroupLeverage = async ({ members, groupLeverage, confirm, updateAccount }) => {
  const leverage = readLeverageRatio({ leverage: groupLeverage });
  if (!confirm || !leverage || typeof updateAccount !== 'function') {
    return { succeeded: 0, failed: 0, total: 0 };
  }
  const stale = (members || []).filter((member) => readLeverageRatio(member) !== leverage);
  let succeeded = 0;
  let failed = 0;
  for (const member of stale) {
    try {
      await updateAccount(member.login, { Leverage: leverage });
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }
  return { succeeded, failed, total: stale.length };
};

const GroupAccountsTab = ({ groupName, groupLeverage, onOpenAccount }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useQuery(getSidebarAccountsQueryOptions(''));
  const [search, setSearch] = useState('');
  const [selectedLogin, setSelectedLogin] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  const rows = useMemo(
    () => accountsInGroup(data?.rows, groupName, { leverage: groupLeverage }),
    [data, groupName, groupLeverage],
  );
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => GROUP_ACCOUNT_COLUMNS.some((column) => String(row[column.key]).toLowerCase().includes(query)));
  }, [rows, search]);

  const groupRatio = readLeverageRatio({ leverage: groupLeverage });
  const canApply = rows.length > 0 && groupRatio !== null && !applying;

  const handleConfirmApply = async () => {
    setConfirmOpen(false);
    setApplying(true);
    try {
      const result = await applyGroupLeverage({
        members: rows.map((row) => row.account),
        groupLeverage,
        confirm: true,
        updateAccount: updateManagerAccount,
      });
      if (result.succeeded > 0) {
        const memberLogins = new Set(rows.map((row) => row.account?.login));
        queryClient.setQueriesData({ queryKey: ['sidebar-accounts'] }, (current) => {
          if (!current?.rows) return current;
          return {
            ...current,
            rows: current.rows.map((account) => (
              memberLogins.has(account?.login)
                ? { ...account, leverage: groupRatio, Leverage: groupRatio }
                : account
            )),
          };
        });
      }
      setApplyResult(result);
    } finally {
      setApplying(false);
    }
  };

  const applyMessage = applying
    ? 'Applying group leverage…'
    : applyResult && applyResult.total === 0
      ? `All ${rows.length} accounts already use group leverage 1 : ${groupRatio}.`
      : applyResult
        ? `Applied group leverage to ${applyResult.succeeded} of ${applyResult.total} accounts.`
          + (applyResult.failed > 0 ? ` ${applyResult.failed} could not be updated.` : '')
        : null;

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
      <div className="groups-props-inline">
        <button
          type="button"
          className="ui-btn ui-btn-secondary ui-btn-sm"
          disabled={!canApply}
          onClick={() => { setApplyResult(null); setConfirmOpen(true); }}
        >
          {`Apply group leverage to ${rows.length} accounts`}
        </button>
      </div>
      {applyMessage && <p className="groups-props-empty" role="status">{applyMessage}</p>}
      {confirmOpen && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.45)', zIndex: 60 }}>
          <div role="alertdialog" aria-modal="true" aria-label="Apply group leverage" aria-describedby="groups-apply-desc" style={{ maxWidth: 420, padding: 16, borderRadius: 8, background: 'var(--surface, #fff)' }}>
            <p id="groups-apply-desc" className="groups-props-empty">
              {`Apply group leverage 1 : ${groupRatio} to ${rows.length} accounts? Only accounts with a different leverage will be updated.`}
            </p>
            <div className="groups-props-inline">
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleConfirmApply}>Apply</button>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setConfirmOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
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
