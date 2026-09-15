import { showResult } from '../store/resultDialogStore.js';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader, WifiOff, Search } from 'lucide-react';
import AccountDetailsModal from './Popups/AccountDetailsModal';
import AccountsSummaryModal from './Popups/AccountsSummaryModal';
import AccountRestrictionsModal from './Popups/AccountRestrictionsModal';
import SidebarContextMenu from './menus/SidebarContextMenu';
import { fetchManagerApi } from '../services/managerFetch';
import { deleteManagerAccount } from '../services/managerAccountApi';
import { peekAccountDetailsManyPage, preloadAccountPositions } from '../services/api';
import {
  fetchSidebarAccountDetails,
  fetchAllSidebarAccounts,
  getInitialCachedSidebarAccounts,
  normalizeSidebarAccountPage,
} from '../services/sidebarAccounts';
import { usePermissions } from '../hooks/usePermissions';
import { PERMISSIONS } from '../utils/permissions';
import { TRADING_ACCOUNTS_INITIAL_PARAMS } from '../utils/workspaceQueryOptions';
import { getSidebarAccountType } from '../utils/sidebarAccountRows';

const ACCOUNT_SEARCH_DEBOUNCE_MS = 300;
const MIN_ACCOUNT_SEARCH_LENGTH = 2;

const emptySidebarPage = (page) => ({
  rows: [],
  total: page?.total ?? null,
  hasMore: false,
  nextOffset: 0,
});

const hasBalance = (account) => (
  account?.balance !== undefined
  && account?.balance !== null
  && account.balance !== ''
  && Number.isFinite(Number(account.balance))
);

/**
 * MarginCallsSidebar — pure content component.
 * All panel chrome (title bar, drag, resize, float) is handled by DockPanel
 * from the docking system. This component renders only data UI.
 */
const MarginCallsSidebar = ({ isAuthenticated, accountType = 'all' }) => {
  const queryClient = useQueryClient();
  const [accountSearch, setAccountSearch] = useState('');
  const [debouncedAccountSearch, setDebouncedAccountSearch] = useState('');
  const [selectedAccountDetails, setSelectedAccountDetails] = useState(null);
  const [summaryAccount, setSummaryAccount] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState({});
  const [restrictLogin, setRestrictLogin] = useState(null);

  const { canAct } = usePermissions();
  const canManageAccounts = canAct(PERMISSIONS.MANAGE_ACCOUNTS);
  const canEditRestrictions = canAct(PERMISSIONS.EDIT_ACCOUNTS);
  const canManipulateRestrictionTrades = canAct(PERMISSIONS.MANIPULATE_TRADES);
  const canOpenRestrictions = canEditRestrictions || canManipulateRestrictionTrades;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAccountSearch(accountSearch.trim());
    }, ACCOUNT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [accountSearch]);

  const isSearchValid = !debouncedAccountSearch || debouncedAccountSearch.length >= MIN_ACCOUNT_SEARCH_LENGTH;

  // Check if workspace trading-accounts query is already warmed up in cache
  const cachedTradingAccounts = !debouncedAccountSearch
    ? queryClient.getQueryData(['trading-accounts', 'page', TRADING_ACCOUNTS_INITIAL_PARAMS])
    : null;

  const initialData = useMemo(() => {
    if (debouncedAccountSearch) return undefined;
    const candidates = [
      getInitialCachedSidebarAccounts(),
      cachedTradingAccounts,
      peekAccountDetailsManyPage(),
    ];
    for (const candidate of candidates) {
      const page = normalizeSidebarAccountPage(candidate);
      if (page) return page;
    }
    return undefined;
  }, [debouncedAccountSearch, cachedTradingAccounts]);

  const {
    data: initialPage,
    isLoading: isInitialLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['sidebar-accounts', debouncedAccountSearch],
    queryFn: ({ signal }) => fetchAllSidebarAccounts({
      search: debouncedAccountSearch,
      signal,
    }),
    select: (page) => normalizeSidebarAccountPage(page) || emptySidebarPage(page),
    initialData,
    // Epoch timestamp keeps the cached page visible but stale, so React Query
    // refreshes it in the background instead of trusting old session data.
    initialDataUpdatedAt: initialData ? 1 : undefined,
    placeholderData: initialData,
    enabled: isAuthenticated && isSearchValid,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: { suppressGlobalLoader: true },
  });

  const normalizedQueryPage = useMemo(
    () => normalizeSidebarAccountPage(initialPage),
    [initialPage],
  );
  const visiblePage = useMemo(() => {
    if (initialPage && initialPage.rows?.length === 0) return emptySidebarPage(initialPage);
    return normalizedQueryPage || initialData || emptySidebarPage(initialPage);
  }, [initialData, initialPage, normalizedQueryPage]);

  useEffect(() => {
    if (debouncedAccountSearch || !initialData) return;
    const queryKey = ['sidebar-accounts', ''];
    const cachedPage = queryClient.getQueryData(queryKey);
    const normalizedCachedPage = normalizeSidebarAccountPage(cachedPage);
    const cachedHasBalances = normalizedCachedPage?.rows?.some(hasBalance);
    const initialHasBalances = initialData?.rows?.some(hasBalance);
    if (cachedHasBalances || !initialHasBalances) return;

    queryClient.setQueryData(queryKey, initialData, { updatedAt: 1 });
    queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'active' });
  }, [debouncedAccountSearch, initialData, queryClient]);

  const baseAccounts = useMemo(() => visiblePage?.rows || [], [visiblePage]);

  const missingBalanceLogins = useMemo(() => (
    [...new Set(baseAccounts
      .filter((account) => account?.login && (!hasBalance(account) || (accountType !== 'all' && !getSidebarAccountType(account))))
      .map((account) => String(account.login)))]
  ), [baseAccounts, accountType]);

  const { data: balanceDetails = [], isFetching: isFetchingDetails } = useQuery({
    queryKey: ['sidebar-account-balance-details', missingBalanceLogins],
    queryFn: async ({ signal }) => {
      const rows = await Promise.all(missingBalanceLogins.map((login) => (
        fetchSidebarAccountDetails(login, { signal }).catch(() => null)
      )));
      return rows.filter(Boolean);
    },
    enabled: isAuthenticated && missingBalanceLogins.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    meta: { suppressGlobalLoader: true },
  });

  const accounts = useMemo(() => {
    const detailsByLogin = new Map(balanceDetails.map((account) => [String(account.login), account]));
    return baseAccounts.map((account) => {
      const details = detailsByLogin.get(String(account.login));
      return details ? { ...account, ...details, login: account.login } : account;
    }).filter((account) => accountType === 'all' || getSidebarAccountType(account) === accountType);
  }, [balanceDetails, baseAccounts, accountType]);

  const loading = (isInitialLoading || (accountType !== 'all' && isFetchingDetails)) && accounts.length === 0;
  const error = queryError ? (queryError.message || 'Failed to load accounts.') : null;

  const handleRefresh = () => refetch();

  const handleSearchChange = (event) => {
    const nextValue = event.target.value;
    setAccountSearch(nextValue);
    if (!nextValue.trim()) {
      setDebouncedAccountSearch('');
    }
  };


  const balanceDisplay = (acc) =>
    acc.balance !== undefined
      ? Number(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—';

  const handleContextMenu = (e, acc) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, account: acc });
  };

  const handleMenuAction = async (action, acc) => {
    const login = typeof acc === 'object' ? acc.login : acc;

    if (action === 'summary') {
      try {
        const params = new URLSearchParams();
        params.append('login[]', String(login));
        const res = await fetchManagerApi(`/AccountsSummary?${params.toString()}`, {
          method: 'GET',
          headers: { 'accept': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSummaryAccount({ login, data });
      } catch (err) {
        showResult.error("Error fetching summary: " + err.message);
      }
    } else if (action === 'details') {
      void preloadAccountPositions(login);
      setSelectedAccountDetails(acc);
    } else if (action === 'restrictions') {
      if (!canOpenRestrictions) {
        showResult.error('Your role does not have permission to change account restrictions or trade overrides.');
        return;
      }
      setRestrictLogin(login);
    } else if (action === 'block') {
      if (!canManageAccounts) {
        showResult.error('Your role does not have permission to block accounts.');
        return;
      }
      try {
        const params = new URLSearchParams({ login: String(login) });
        const res = await fetchManagerApi(`/UserArchive?${params.toString()}`, {
          method: 'POST',
          headers: { 'accept': 'application/json', 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
        setBlockedUsers(prev => ({ ...prev, [login]: true }));
        showResult.success(`User ${login} blocked successfully.`);
      } catch (err) {
        showResult.error("Error blocking user: " + err.message);
      }
    } else if (action === 'unblock') {
      if (!canManageAccounts) {
        showResult.error('Your role does not have permission to unblock accounts.');
        return;
      }
      try {
        const params = new URLSearchParams({ login: String(login) });
        const res = await fetchManagerApi(`/UserRestore?${params.toString()}`, {
          method: 'POST',
          headers: { 'accept': 'application/json', 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
        setBlockedUsers(prev => ({ ...prev, [login]: false }));
        showResult.success(`User ${login} unblocked successfully.`);
      } catch (err) {
        showResult.error("Error unblocking user: " + err.message);
      }
    } else if (action === 'delete') {
      if (!canManageAccounts) {
        showResult.error('Your role does not have permission to delete accounts.');
        return;
      }
      if (!window.confirm(`Are you sure you want to permanently delete account ${login}?`)) return;
      try {
        await deleteManagerAccount(login);

        showResult.success(`Account ${login} deleted successfully.`);
        handleRefresh();
      } catch (err) {
        showResult.error("Error deleting account: " + err.message);
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'var(--surface)' }}>
      {/* Mini toolbar */}
      <div
        className="shrink-0"
        style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
      >
        {isAuthenticated && (
          <div className="p-2">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
              <input
                value={accountSearch}
                onChange={handleSearchChange}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setDebouncedAccountSearch(accountSearch.trim());
                  }
                }}
                className="ui-input ui-input-sm w-full"
                placeholder="Search login..."
                style={{ paddingLeft: 26 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="accounts-sidebar-body flex-1 overflow-y-auto overflow-x-hidden">
        {!isAuthenticated && (
          <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--muted)' }}>
            <WifiOff size={18} />
            <span className="text-xs">Not connected</span>
          </div>
        )}

        {isAuthenticated && loading && (
          <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
            <Loader size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span className="text-xs">Loading accounts…</span>
          </div>
        )}

        {isAuthenticated && !loading && error && (
          <div className="p-4 flex flex-col items-center gap-2 text-center">
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
            <span className="text-xs" style={{ color: 'var(--danger-text)' }}>{error}</span>
            <button onClick={handleRefresh} className="ui-btn ui-btn-ghost ui-btn-xs" style={{ color: 'var(--accent-text)' }}>
              Retry
            </button>
          </div>
        )}

        {isAuthenticated && !loading && (!error || accounts.length > 0) && (
          <table className="ui-grid accounts-sidebar-grid">
            <thead>
              <tr>
                <th>login_id</th>
              
                <th style={{ textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-xs" style={{ color: 'var(--muted)' }}>
                    No accounts found
                  </td>
                </tr>
              ) : (
                accounts.map((acc, idx) => {
                  const isPrimitive = typeof acc === 'number' || typeof acc === 'string';
                  const login = isPrimitive ? acc : acc.login;
                  const bal = isPrimitive ? '—' : balanceDisplay(acc);
                  const mcl = isPrimitive ? undefined : acc.MarginCallLevel;
                  const isUrgent = mcl !== undefined && Number(mcl) < 100;
                  return (
                    <tr
                      key={login ?? idx}
                      onPointerDown={(event) => {
                        if (event.pointerType === 'mouse' && event.button !== 0) return;
                        void preloadAccountPositions(login);
                      }}
                      onDoubleClick={() => setSelectedAccountDetails(acc)}
                      onContextMenu={(e) => handleContextMenu(e, acc)}
                      style={{
                        cursor: 'pointer',
                        background: isUrgent ? 'var(--danger-soft)' : undefined,
                      }}
                    >
                      <td
                        className="accounts-sidebar-login"
                        style={{ color: isUrgent ? 'var(--danger-text)' : 'var(--text)' }}
                      >
                        <span className="tabular font-mono">{login}</span>
                      </td>
                     
                      <td className="accounts-sidebar-balance tabular font-mono" style={{ textAlign: 'right', color: isUrgent ? 'var(--danger-text)' : 'var(--text)' }}>
                        {bal}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Popups */}
      {selectedAccountDetails && (
        <AccountDetailsModal
          account={selectedAccountDetails}
          onClose={() => setSelectedAccountDetails(null)}
        />
      )}

      {summaryAccount && (
        <AccountsSummaryModal
          account={summaryAccount}
          onClose={() => setSummaryAccount(null)}
        />
      )}

      {restrictLogin && (
        <AccountRestrictionsModal login={restrictLogin} onClose={() => setRestrictLogin(null)} />
      )}

      {contextMenu && (
        <SidebarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          account={contextMenu.account}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
          canManageAccounts={canManageAccounts}
          canManageRestrictions={canOpenRestrictions}
          isBlocked={blockedUsers[typeof contextMenu.account === 'object' ? contextMenu.account.login : contextMenu.account]}
        />
      )}
    </div>
  );
};

export default MarginCallsSidebar;
