import { useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { fetchAllSidebarAccounts, getSidebarAccountsQueryOptions } from '../../../services/sidebarAccounts.js';
import { updateManagerAccount } from '../../../services/managerAccountApi.js';
import { advanceRealtimeCacheRevision } from '../../../services/realtimeCacheRevision.js';
import { GROUP_ACCOUNT_COLUMNS, accountsInGroup, readLeverageRatio } from '../groupAccountRows.js';
import {
  applyGroupLeverage,
  beginGroupApply,
  buildApplyConfirmCopy,
  endGroupApply,
  isGroupApplyInFlight,
  subscribeGroupApply,
} from './groupLeverageApply.js';
import DepositDialog from '../../../components/Popups/DepositDialog.jsx';

// Lists the trading accounts that belong to one group, from the shared account list.
// Viewing this tab never writes to accounts: opening, rendering, refreshing,
// searching and selecting rows are read-only. Pushing the group leverage onto
// member accounts happens solely through the explicit "Apply group leverage"
// button below, which asks for confirmation first and then reports
// succeeded/failed counts. There is intentionally no effect that writes.

const GroupAccountsTab = ({ groupName, groupLeverage, onOpenAccount }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useQuery(getSidebarAccountsQueryOptions(''));
  const [search, setSearch] = useState('');
  const [selectedLogin, setSelectedLogin] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Apply is busy while THIS group has a write in flight, wherever it started: a tab switch or
  // remount must not re-enable Apply for a group whose write is still running.
  const applying = useSyncExternalStore(subscribeGroupApply, () => isGroupApplyInFlight(groupName));
  const [applyResult, setApplyResult] = useState(null);
  const [applyError, setApplyError] = useState(null);

  // Reset the apply report when the viewed group changes. Done during render
  // (the documented adjust-state-during-render pattern), never in an effect
  // hook: this file must contain no effect hooks so viewing can never write.
  const [lastGroupKey, setLastGroupKey] = useState(null);
  const groupKey = `${groupName ?? ''}::${groupLeverage ?? ''}`;
  if (lastGroupKey !== groupKey) {
    setLastGroupKey(groupKey);
    setApplyResult(null);
    setApplyError(null);
  }

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
    // One write per group at a time: refuse while this group's apply is still in flight.
    if (!beginGroupApply(groupName)) return;
    setApplyError(null);
    // The result is tagged with the group it was started for: a switch to another group meanwhile must not show it there.
    const startedFor = groupKey;
    try {
      // Members are read fresh from the server, never from the rows already on screen, and never
      // from a read that started before this click: an account that left the group must not be patched.
      // This read is never written into the shared list cache: it can be older than a cache write
      // made while the apply runs. The list re-reads after the writes instead (see finally).
      const fresh = await fetchAllSidebarAccounts({ fresh: true });
      const members = accountsInGroup(fresh?.rows, groupName, { leverage: groupLeverage }).map((row) => row.account);
      const result = await applyGroupLeverage({
        members,
        expectedGroup: groupName,
        groupLeverage,
        confirm: true,
        updateAccount: updateManagerAccount,
      });
      if (result.succeeded > 0 && Array.isArray(result.succeededLogins) && result.succeededLogins.length > 0) {
        const succeededSet = new Set(result.succeededLogins);
        queryClient.setQueriesData({ queryKey: ['sidebar-accounts'] }, (current) => {
          if (!current?.rows) return current;
          return {
            ...current,
            rows: current.rows.map((account) => (
              succeededSet.has(account?.login)
                ? { ...account, leverage: groupRatio, Leverage: groupRatio }
                : account
            )),
          };
        });
      }
      setApplyResult({ ...result, groupKey: startedFor, memberCount: members.length });
    } catch (err) {
      setApplyError({ groupKey: startedFor, message: err?.message || 'Could not apply group leverage.' });
    } finally {
      endGroupApply(groupName);
      // The writes are over. Advance the cache revision first, so no read that started before the last
      // PATCH is reused or cached (sidebarAccounts only reuses in-flight reads of the same revision).
      advanceRealtimeCacheRevision();
      // Re-read the shared list now that the writes are over, so it shows the server state.
      void queryClient.invalidateQueries({ queryKey: ['sidebar-accounts'] });
    }
  };

  // Only a result or error started for the group on screen is shown.
  const shownResult = applyResult && applyResult.groupKey === groupKey ? applyResult : null;
  const shownError = applyError && applyError.groupKey === groupKey ? applyError.message : null;

  const applyMessage = applying
    ? 'Applying group leverage…'
    : shownResult && shownResult.total === 0
      ? (shownResult.memberCount === 0
        ? 'This group has no accounts.'
        : groupRatio === null || groupRatio === undefined
          ? 'Group leverage is not set for this group, so there is nothing to apply.'
          : `All ${shownResult.memberCount} accounts already use group leverage 1 : ${groupRatio}.`)
      : shownResult
        ? `Applied group leverage to ${shownResult.succeeded} of ${shownResult.total} accounts.`
        + (shownResult.failed > 0 ? ` ${shownResult.failed} could not be updated.` : '')
        + (shownResult.memberCount > shownResult.total
          ? ` ${shownResult.memberCount - shownResult.total} listed ${shownResult.memberCount - shownResult.total === 1 ? 'account was' : 'accounts were'} not changed (already at group leverage or without a login).`
          : '')
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
      <div className="groups-props-inline groups-accounts-tools">
        <div className="relative groups-accounts-search-wrap">
          <Search size={13} className="groups-search-icon" />
          <input
            className="ui-input ui-input-sm groups-search groups-accounts-search"
            placeholder="Find account..."
            aria-label="Find accounts in this group"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="groups-accounts-count" role="status">
          {isLoading ? '' : `${visibleRows.length} of ${rows.length} account${rows.length === 1 ? '' : 's'}`}
        </span>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon ui-btn-sm" title="Refresh accounts" aria-label="Refresh accounts" disabled={isFetching || applying} onClick={() => refetch()}>
          {isFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>
      {applyMessage && <p className="groups-props-empty" role="status">{applyMessage}</p>}
      {shownError && <p className="groups-props-error" role="alert">{shownError}</p>}
      {confirmOpen && !applying && (() => {
        const copy = buildApplyConfirmCopy({ groupRatio, count: rows.length });
        return (
          <DepositDialog
            status="confirm"
            title={copy.title}
            message={copy.message}
            confirmLabel={copy.confirmLabel}
            onConfirm={handleConfirmApply}
            onDismiss={() => setConfirmOpen(false)}
          />
        );
      })()}
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
      <div className="groups-accounts-footer">
        <span className="groups-accounts-hint">Double-click an account to open it.</span>
        <button
          type="button"
          className="ui-btn ui-btn-secondary ui-btn-sm"
          disabled={!canApply}
          title={groupRatio === null || groupRatio === undefined ? 'Group leverage is not set for this group' : `Apply group leverage to all ${rows.length} accounts in this group`}
          onClick={() => { setApplyResult(null); setApplyError(null); setConfirmOpen(true); }}
        >
          {`Apply group leverage to all ${rows.length} accounts in group`}
        </button>
      </div>
    </div>
  );
};

export default GroupAccountsTab;
