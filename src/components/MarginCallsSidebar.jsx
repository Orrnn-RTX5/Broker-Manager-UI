import { showResult } from '../store/resultDialogStore.js';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader, WifiOff, Search } from 'lucide-react';
import AccountDetailsModal from './Popups/AccountDetailsModal';
import AccountsSummaryModal from './Popups/AccountsSummaryModal';
import AccountRestrictionsModal from './Popups/AccountRestrictionsModal';
import AccountActionDialog from './Popups/AccountActionDialog';
import BulkOperationsChargesModal from './Popups/BulkOperationsChargesModal';
import CheckBalanceDialog from './Popups/CheckBalanceDialog';
import InternalMailModal from './Popups/InternalMailModal';
import PushNotificationModal from './Popups/PushNotificationModal';
import SidebarContextMenu from './menus/SidebarContextMenu';
import { fetchManagerApi } from '../services/managerFetch';
import { deleteManagerAccount } from '../services/managerAccountApi';
import { normalizeTradingAccountRow, peekAccountDetailsManyPage, preloadAccountPositions, invalidateRealtimeCaches } from '../services/api';
import { peekAccountDetails, prefetchAccountDetails, prefetchAccountSummary, seedAccountDetails } from '../services/accountDetails';
import {
  fetchSidebarAccountDetails,
  fetchAllSidebarAccounts,
  getInitialCachedSidebarAccounts,
  normalizeSidebarAccountPage,
} from '../services/sidebarAccounts';
import { usePermissions } from '../hooks/usePermissions';
import { useMultiScreenStore } from '../store/multiScreenStore';
import { PERMISSIONS } from '../utils/permissions';
import { TRADING_ACCOUNTS_INITIAL_PARAMS } from '../utils/workspaceQueryOptions';
import { getSidebarAccountType } from '../utils/sidebarAccountRows';
import { AccountTypeIcon } from '../features/clients/components/TradingAccountsDataGrid';
import { useGroupList } from '../hooks/useGroupList';
import { buildGroupMarginLevels, buildMarginAlerts } from '../features/terminal/terminalAlerts';
import { copyToClipboard, downloadBlob, rowsToCSV, rowsToJSON, rowsToTSV, stampedFilename } from '../utils/gridUtils';

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
  const openAccountScreen = useMultiScreenStore((state) => state.openAccountScreen);
  const openAccountWindows = useMultiScreenStore((state) => state.openAccountWindows);
  const activeAccountWindowLogin = useMultiScreenStore((state) => state.activeAccountWindowLogin);
  const tradingAccountsMounted = useMultiScreenStore((state) => Boolean(state.mountedAccountWindowHosts?.tradingAccounts));
  const openAccountDetailWindow = useMultiScreenStore((state) => state.openAccountDetailWindow);
  const closeAccountDetailWindow = useMultiScreenStore((state) => state.closeAccountDetailWindow);
  const focusAccountDetailWindow = useMultiScreenStore((state) => state.focusAccountDetailWindow);
  const registerAccountWindowHost = useMultiScreenStore((state) => state.registerAccountWindowHost);
  const [summaryAccount, setSummaryAccount] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState({});
  const [restrictLogin, setRestrictLogin] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [bulkChargesAccounts, setBulkChargesAccounts] = useState(null);
  const [checkBalanceAccounts, setCheckBalanceAccounts] = useState(null);
  const [mailAccounts, setMailAccounts] = useState(null);
  const [notificationAccounts, setNotificationAccounts] = useState(null);
  const [selectedLogin, setSelectedLogin] = useState(null);
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoArrange, setAutoArrange] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [hiddenColumns, setHiddenColumns] = useState(() => new Set());
  const searchInputRef = useRef(null);
  const prefetchTimerRef = useRef(null);
  const lastTapRef = useRef({ login: null, time: 0 });

  useEffect(() => {
    registerAccountWindowHost('sidebar', true);
    return () => registerAccountWindowHost('sidebar', false);
  }, [registerAccountWindowHost]);

  const sidebarAccountWindows = useMemo(
    () => (tradingAccountsMounted ? openAccountWindows.filter((item) => item.source === 'sidebar') : openAccountWindows),
    [openAccountWindows, tradingAccountsMounted]
  );

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

  const groupCurrencyMap = useMemo(() => {
    const map = new Map();
    for (const grp of Array.isArray(groups) ? groups : []) {
      const grpName = String(grp?.name ?? grp?.Name ?? '').trim();
      const grpCurrency = String(grp?.currency ?? grp?.Currency ?? grp?.depositCurrency ?? '').trim();
      if (grpName && grpCurrency) map.set(grpName, grpCurrency);
    }
    return map;
  }, [groups]);

  const groupRecordByNameMap = useMemo(() => {
    const map = new Map();
    for (const grp of Array.isArray(groups) ? groups : []) {
      const grpName = String(grp?.name ?? grp?.Name ?? grp?.group ?? grp?.Group ?? '').trim();
      if (grpName) map.set(grpName.toLowerCase(), grp);
    }
    return map;
  }, [groups]);

  const accounts = useMemo(() => {
    const detailsByLogin = new Map(balanceDetails.map((account) => [String(account.login), account]));
    const cachedByLogin = new Map();
    const registerRows = (rows) => {
      for (const row of Array.isArray(rows) ? rows : []) {
        const rowLogin = String(row?.login ?? row?.Login ?? '').trim();
        if (rowLogin && !cachedByLogin.has(rowLogin)) {
          cachedByLogin.set(rowLogin, normalizeTradingAccountRow(row));
        }
      }
    };
    registerRows(cachedTradingAccounts?.rows);
    for (const [, pageData] of queryClient.getQueriesData({ queryKey: ['trading-accounts'] })) {
      registerRows(pageData?.rows);
    }
    registerRows(peekAccountDetailsManyPage()?.rows);

    return baseAccounts.map((account) => {
      const loginKey = String(account?.login ?? account ?? '').trim();
      const details = detailsByLogin.get(loginKey);
      const cachedRow = cachedByLogin.get(loginKey);
      const peeked = loginKey ? peekAccountDetails(loginKey) : undefined;
      const merged = {
        ...(cachedRow && typeof cachedRow === 'object' ? cachedRow : {}),
        ...(account && typeof account === 'object' ? account : { login: loginKey }),
        ...(details && typeof details === 'object' ? details : {}),
        ...(peeked && typeof peeked === 'object' && !Array.isArray(peeked) ? peeked : {}),
        login: loginKey,
      };
      if (!merged || typeof merged !== 'object') return merged;
      const grpName = String(
        merged.group
        || merged.Group
        || merged.accountGroup
        || merged.AccountGroup
        || cachedRow?.group
        || ''
      ).trim();
      const groupRecord = grpName ? groupRecordByNameMap.get(grpName.toLowerCase()) || null : null;
      const currency = String(
        merged.currency
        || merged.Currency
        || merged.raw?.Currency
        || merged.raw?.currency
        || cachedRow?.currency
        || (grpName ? groupCurrencyMap.get(grpName) : '')
        || groupRecord?.currency
        || groupRecord?.Currency
        || groupRecord?.depositCurrency
        || 'USD'
      ).trim();
      const leverage =
        merged.leverage
        || merged.Leverage
        || merged.raw?.Leverage
        || merged.raw?.leverage
        || cachedRow?.leverage
        || groupRecord?.leverage
        || groupRecord?.Leverage
        || 100;
      const name = String(
        merged.name
        || merged.Name
        || cachedRow?.name
        || [merged.FirstName || merged.firstName, merged.LastName || merged.lastName].filter(Boolean).join(' ')
        || ''
      ).trim();
      return {
        ...merged,
        ...(grpName ? { group: grpName } : {}),
        ...(name ? { name, Name: name } : {}),
        ...(currency ? { currency, Currency: currency } : {}),
        leverage,
      };
    }).filter((account) => accountType === 'all' || getSidebarAccountType(account) === accountType);
  }, [balanceDetails, baseAccounts, accountType, groupCurrencyMap, groupRecordByNameMap, cachedTradingAccounts, queryClient]);

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

  const resolveDetailedSidebarAccount = (acc) => {
    const login = String(typeof acc === 'object' ? (acc?.login ?? acc?.Login ?? '') : (acc ?? '')).trim();
    const matched = accounts.find((item) => String(item?.login ?? item) === login);
    const peeked = login ? peekAccountDetails(login) : undefined;
    const base = {
      ...(matched && typeof matched === 'object' ? matched : {}),
      ...(acc && typeof acc === 'object' ? acc : {}),
      ...(peeked && typeof peeked === 'object' && !Array.isArray(peeked) ? peeked : {}),
      ...(login ? { login } : {}),
    };
    return Object.keys(base).length > 0 ? base : acc;
  };

  const warmAccount = (acc) => {
    clearTimeout(prefetchTimerRef.current);
    const resolved = resolveDetailedSidebarAccount(acc);
    const login = typeof resolved === 'object' ? resolved.login : resolved;
    if (typeof resolved === 'object' && (hasBalance(resolved) || resolved.Name || resolved.name || resolved.FirstName || resolved.Email || resolved.email)) {
      const seedSnapshot = Object.entries(resolved).reduce((target, [key, val]) => {
        if (val !== undefined && val !== null && !(typeof val === 'string' && val.trim() === '')) {
          target[key] = val;
        }
        return target;
      }, {});
      seedAccountDetails(login, seedSnapshot);
    }
    void prefetchAccountDetails(login);
    if (canViewPositions) void preloadAccountPositions(login);
  };

  const handleMenuIntent = (action, acc) => {
    if (action === 'details') warmAccount(acc);
    if (action === 'summary') void prefetchAccountSummary(typeof acc === 'object' ? acc.login : acc);
  };

  const handleMenuAction = (action, acc) => {
    const resolvedAcc = resolveDetailedSidebarAccount(acc);
    const login = typeof resolvedAcc === 'object' ? resolvedAcc?.login : resolvedAcc;

    if (action === 'new-account') {
      openAccountScreen();
    } else if (action === 'summary') {
      setSummaryAccount({ login, row: typeof resolvedAcc === 'object' ? resolvedAcc : undefined });
    } else if (action === 'details') {
      setSelectedLogin(String(login));
      warmAccount(resolvedAcc);
      openAccountDetailWindow(resolvedAcc && typeof resolvedAcc === 'object' ? { ...resolvedAcc } : resolvedAcc, {
        source: 'sidebar',
        initialTab: 'Overview',
      });
    } else if (action === 'charges') {
      setBulkChargesAccounts(resolvedAcc ? [resolvedAcc] : []);
    } else if (action === 'balance') {
      setCheckBalanceAccounts(resolvedAcc ? [resolvedAcc] : []);
    } else if (action === 'fix-balance') {
      setSelectedLogin(String(login));
      warmAccount(resolvedAcc);
      openAccountDetailWindow(resolvedAcc && typeof resolvedAcc === 'object' ? { ...resolvedAcc } : resolvedAcc, {
        source: 'sidebar',
        initialTab: 'Balance',
      });
    } else if (action === 'fix-personal-data') {
      setSelectedLogin(String(login));
      warmAccount(resolvedAcc);
      openAccountDetailWindow(resolvedAcc && typeof resolvedAcc === 'object' ? { ...resolvedAcc } : resolvedAcc, {
        source: 'sidebar',
        initialTab: 'Personal',
      });
    } else if (action === 'mail') {
      setMailAccounts(acc ? [acc] : []);
    } else if (action === 'notification') {
      setNotificationAccounts(acc ? [acc] : []);
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
    } else if (action === 'find' || action === 'customize-filter') {
      searchInputRef.current?.focus();
    } else if (action === 'clear-filter') {
      setAccountSearch('');
      setDebouncedAccountSearch('');
    } else if (action === 'filter-group' && typeof acc === 'string') {
      const nextFilter = acc === 'All Groups' ? '' : acc;
      setAccountSearch(nextFilter);
      setDebouncedAccountSearch(nextFilter);
    } else if (action === 'copy-logins') {
      const text = login ? String(login) : accounts.map((a) => (typeof a === 'object' ? a.login : a)).join('\n');
      void copyToClipboard(text).then(() => showResult.success('Copied login(s) to clipboard.'));
    } else if (action === 'copy-csv' || action === 'copy-tsv' || action === 'copy-json') {
      const cols = [{ key: 'login', label: 'Login' }, { key: 'balance', label: 'Balance' }];
      const target = acc && typeof acc === 'object' ? [acc] : accounts;
      const text = action === 'copy-json' ? rowsToJSON(target, cols) : action === 'copy-tsv' ? rowsToTSV(target, cols) : rowsToCSV(target, cols);
      void copyToClipboard(text).then(() => showResult.success(`Copied ${target.length} account(s).`));
    } else if (action === 'export') {
      const cols = [{ key: 'login', label: 'Login' }, { key: 'balance', label: 'Balance' }];
      downloadBlob(rowsToCSV(accounts, cols), stampedFilename('accounts', 'csv'));
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
                ref={searchInputRef}
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
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        handleMenuAction('details', acc);
                      }}
                      onTouchEnd={(event) => {
                        const now = Number(event.timeStamp);
                        const lastTap = lastTapRef.current;
                        if (lastTap.login === String(login) && now - lastTap.time < 350) {
                          lastTapRef.current = { login: null, time: 0 };
                          handleMenuAction('details', acc);
                          return;
                        }
                        lastTapRef.current = { login: String(login), time: now };
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); handleMenuAction('details', acc); }
                        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) handleContextMenu(event, acc);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, acc)}
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        background: isUrgent ? 'var(--danger-soft)' : undefined,
                      }}
                    >
                      <td
                        className="accounts-sidebar-login"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          handleMenuAction('details', acc);
                        }}
                        style={{ color: isUrgent ? 'var(--danger-text)' : 'var(--text)', userSelect: 'none' }}
                      >
                        <span className="trading-accounts-login-wrap">
                          <AccountTypeIcon
                            group={isPrimitive ? '' : (acc?.group ?? acc?.Group)}
                            row={isPrimitive ? null : acc}
                            groupRecord={!isPrimitive && (acc?.group ?? acc?.Group)
                              ? groupRecordByNameMap.get(String(acc.group ?? acc.Group).trim().toLowerCase()) || null
                              : null}
                          />
                          <span className="tabular font-mono">{login}</span>
                        </span>
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
      {sidebarAccountWindows.map((win) => {
        const matchedAccount = accounts.find((item) => String(item?.login ?? item) === String(win.login));
        const rawSelected = win.account ?? win.login;
        const selectedAccountDetails = matchedAccount && typeof rawSelected === 'object'
          ? { ...matchedAccount, ...rawSelected, login: rawSelected.login ?? matchedAccount.login }
          : (matchedAccount || rawSelected);
        return (
          <AccountDetailsModal
            key={typeof selectedAccountDetails === 'object' ? selectedAccountDetails.login : selectedAccountDetails}
            account={selectedAccountDetails}
            initialTab="Overview"
            windowIndex={win.slotIndex}
            totalWindows={openAccountWindows.length}
            zOrder={win.zOrder}
            isActiveWindow={String(activeAccountWindowLogin) === String(win.login)}
            onFocusWindow={() => focusAccountDetailWindow(win.login)}
            onClose={() => closeAccountDetailWindow(win.login)}
            onAccountUpdated={handleRefresh}
          />
        );
      })}

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

      {bulkChargesAccounts && (
        <BulkOperationsChargesModal
          accounts={bulkChargesAccounts}
          groups={groups}
          canEditAccounts={canManageAccounts}
          onOpenAccountDetails={(acc) => handleMenuAction('details', acc)}
          onClose={() => setBulkChargesAccounts(null)}
          onSuccess={handleRefresh}
        />
      )}

      {checkBalanceAccounts && (
        <CheckBalanceDialog
          accounts={checkBalanceAccounts}
          onClose={() => setCheckBalanceAccounts(null)}
          onBalancesChecked={() => handleRefresh()}
        />
      )}

      {mailAccounts && (
        <InternalMailModal
          accounts={mailAccounts}
          onClose={() => setMailAccounts(null)}
        />
      )}

      {notificationAccounts && (
        <PushNotificationModal
          accounts={notificationAccounts}
          onClose={() => setNotificationAccounts(null)}
        />
      )}

      {contextMenu && (
        <SidebarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          account={contextMenu.account}
          rows={accounts}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
          onIntent={handleMenuIntent}
          canManageAccounts={canManageAccounts}
          canManageRestrictions={canOpenRestrictions}
          groupFilter={accountSearch || 'All Groups'}
          isBlocked={blockedUsers[typeof contextMenu.account === 'object' ? contextMenu.account.login : contextMenu.account]}
          autoScroll={autoScroll}
          autoArrange={autoArrange}
          showGrid={showGrid}
          hiddenColumns={hiddenColumns}
          onToggleAutoScroll={() => setAutoScroll((prev) => !prev)}
          onToggleAutoArrange={() => setAutoArrange((prev) => !prev)}
          onToggleGrid={() => setShowGrid((prev) => !prev)}
          onToggleColumn={(key) => setHiddenColumns((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else if (next.size < 1) next.add(key);
            return next;
          })}
        />
      )}
    </div>
  );
};

export default MarginCallsSidebar;
