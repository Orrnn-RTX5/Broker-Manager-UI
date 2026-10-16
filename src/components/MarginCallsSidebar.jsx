import { showResult } from '../store/resultDialogStore.js';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader, WifiOff, Search } from 'lucide-react';
import AccountDetailsModal from './Popups/AccountDetailsModal';
import AccountsSummaryModal from './Popups/AccountsSummaryModal';
import AccountRestrictionsModal from './Popups/AccountRestrictionsModal';
import AccountActionDialog from './Popups/AccountActionDialog';
import SidebarContextMenu from './menus/SidebarContextMenu';
import { fetchManagerApi } from '../services/managerFetch';
import { deleteManagerAccount } from '../services/managerAccountApi';
import { peekAccountDetailsManyPage, preloadAccountPositions, invalidateRealtimeCaches } from '../services/api';
import { prefetchAccountDetails, prefetchAccountSummary, seedAccountDetails } from '../services/accountDetails';
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
import { useGroupList } from '../hooks/useGroupList';
import { buildGroupMarginLevels, buildMarginAlerts } from '../features/terminal/terminalAlerts';

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
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedLogin, setSelectedLogin] = useState(null);
  const prefetchTimerRef = useRef(null);

  const { canAct } = usePermissions();
  const { groups } = useGroupList({ enabled: isAuthenticated });
  const canViewPositions = canAct(PERMISSIONS.VIEW_POSITIONS);
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

  const urgentLogins = useMemo(() => new Set(
    buildMarginAlerts(accounts, buildGroupMarginLevels(groups)).map((alert) => alert.login),
  ), [accounts, groups]);

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
    warmAccount(acc);
    const rect = e.currentTarget.getBoundingClientRect();
    setSelectedLogin(String(acc.login));
    setContextMenu({ x: e.clientX ?? rect.left, y: e.clientY ?? rect.bottom, account: acc });
  };

  useEffect(() => () => clearTimeout(prefetchTimerRef.current), []);

  const warmAccount = (acc) => {
    clearTimeout(prefetchTimerRef.current);
    const login = typeof acc === 'object' ? acc.login : acc;
    if (typeof acc === 'object' && (hasBalance(acc) || acc.Name || acc.FirstName || acc.Email)) seedAccountDetails(login, acc);
    void prefetchAccountDetails(login);
    if (canViewPositions) void preloadAccountPositions(login);
  };

  const handleMenuIntent = (action, acc) => {
    if (action === 'details') warmAccount(acc);
    if (action === 'summary') void prefetchAccountSummary(typeof acc === 'object' ? acc.login : acc);
  };

  const handleMenuAction = (action, acc) => {
    const login = typeof acc === 'object' ? acc.login : acc;

    if (action === 'summary') {
      setSummaryAccount({ login, row: typeof acc === 'object' ? acc : undefined });
    } else if (action === 'details') {
      warmAccount(acc);
      setSelectedAccountDetails(acc);
    } else if (action === 'restrictions') {
      if (!canOpenRestrictions) {
        showResult.error('Your role does not have permission to change account restrictions or trade overrides.');
        return;
      }
      setRestrictLogin(login);
    } else if (['block', 'unblock', 'delete'].includes(action)) {
      if (!canManageAccounts) {
        showResult.error('Your role does not have permission to manage accounts.');
        return;
      }
      setPendingAction({ action, account: acc });
    }
  };

  const performAccountAction = async (action, acc) => {
    if (!canManageAccounts) throw new Error('Your role does not have permission to manage accounts.');
    const login = typeof acc === 'object' ? acc.login : acc;
    if (action === 'delete') {
      await deleteManagerAccount(login);
      invalidateRealtimeCaches('accounts');
      showResult.success(`Account ${login} deleted successfully.`);
      handleRefresh();
      return;
    }
    const endpoint = action === 'block' ? 'UserArchive' : 'UserRestore';
    const res = await fetchManagerApi(`/${endpoint}?${new URLSearchParams({ login: String(login) })}`, {
      method: 'POST', headers: { accept: 'application/json', 'Content-Type': 'application/json' }, body: '{}',
    });
    const data = await res.json();
    if (!res.ok || data?.success === false || data?.error) throw new Error(data?.message || data?.error?.message || data?.error || `Unable to ${action} the account.`);
    setBlockedUsers(previous => ({ ...previous, [login]: action === 'block' }));
    showResult.success(`Account ${login} ${action === 'block' ? 'blocked' : 'unblocked'} successfully.`);
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
                <th>Login</th>
              
                <th style={{ textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-center py-6 text-xs" style={{ color: 'var(--muted)' }}>
                    No accounts found
                  </td>
                </tr>
              ) : (
                accounts.map((acc, idx) => {
                  const isPrimitive = typeof acc === 'number' || typeof acc === 'string';
                  const login = isPrimitive ? acc : acc.login;
                  const bal = isPrimitive ? '—' : balanceDisplay(acc);
                  const isUrgent = urgentLogins.has(String(login));
                  return (
                    <tr
                      key={login ?? idx}
                      tabIndex={0}
                      data-account-login={login}
                      aria-selected={selectedLogin === String(login)}
                      className={selectedLogin === String(login) ? 'is-selected' : ''}
                      onClick={() => setSelectedLogin(String(login))}
                      onPointerEnter={() => { clearTimeout(prefetchTimerRef.current); prefetchTimerRef.current = setTimeout(() => warmAccount(acc), 120); }}
                      onPointerLeave={() => clearTimeout(prefetchTimerRef.current)}
                      onFocus={() => warmAccount(acc)}
                      onPointerDown={(event) => {
                        if (event.pointerType === 'mouse' && event.button !== 0) return;
                        warmAccount(acc);
                      }}
                      onDoubleClick={() => handleMenuAction('details', acc)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); handleMenuAction('details', acc); }
                        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) handleContextMenu(event, acc);
                      }}
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

      {pendingAction && <AccountActionDialog {...pendingAction} onClose={() => setPendingAction(null)} onConfirm={performAccountAction} />}

      {contextMenu && (
        <SidebarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          account={contextMenu.account}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
          onIntent={handleMenuIntent}
          canManageAccounts={canManageAccounts}
          canManageRestrictions={canOpenRestrictions}
          isBlocked={blockedUsers[typeof contextMenu.account === 'object' ? contextMenu.account.login : contextMenu.account]}
        />
      )}
    </div>
  );
};

export default MarginCallsSidebar;
