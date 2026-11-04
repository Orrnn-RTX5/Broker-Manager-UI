import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import FilterDropdown from '../../components/FilterDropdown';
import TradingAccountsDataGrid from './components/TradingAccountsDataGrid';
import TradingAccountsContextMenu from './components/TradingAccountsContextMenu';
import AccountRestrictionsModal from '../../components/Popups/AccountRestrictionsModal';
import AccountDetailsModal from '../../components/Popups/AccountDetailsModal';
import AccountsSummaryModal from '../../components/Popups/AccountsSummaryModal';
import AccountActionDialog from '../../components/Popups/AccountActionDialog';
import BulkOperationsChargesModal from '../../components/Popups/BulkOperationsChargesModal';
import CheckBalanceDialog from '../../components/Popups/CheckBalanceDialog';
import InternalMailModal from '../../components/Popups/InternalMailModal';
import PushNotificationModal from '../../components/Popups/PushNotificationModal';
import {
  getBlockingPopupWindowSummary,
  notifyCloseOpenPopupsRequired,
} from '../../components/Popups/popupContextMenuGuard';
import useGridPageController from '../../hooks/useGridPageController';
import { useGroupList } from '../../hooks/useGroupList';
import { usePermissions } from '../../hooks/usePermissions';
import { useMultiScreenStore } from '../../store/multiScreenStore';
import { showResult } from '../../store/resultDialogStore';
import { fetchManagerApi } from '../../services/managerFetch';
import { deleteManagerAccount } from '../../services/managerAccountApi';
import { invalidateRealtimeCaches } from '../../services/api';
import { copyToClipboard } from '../../utils/gridUtils';
import { ALL_COUNTRIES } from '../../utils/countries';
import { PERMISSIONS } from '../../utils/permissions';

const ACCOUNT_COLUMNS = [
  { key: 'login',          label: 'Login' },
  { key: 'name',           label: 'Name' },
  { key: 'group',          label: 'Group' },
  { key: 'country',        label: 'Country' },
  { key: 'client',         label: 'Client' },
  { key: 'balance',        label: 'Balance' },
  { key: 'balanceChecked', label: 'Balance / Checked' },
  { key: 'equity',         label: 'Equity' },
  { key: 'profit',         label: 'Profit' },
  { key: 'currency',       label: 'Currency' },
];

const TradingAccountsPage = () => {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('All Groups');
  const [countryFilter, setCountryFilter] = useState('All Countries');
  const [sortCol, setSortCol] = useState('login');
  const [sortDir, setSortDir] = useState('asc');
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoArrange, setAutoArrange] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [summaryAccount, setSummaryAccount] = useState(null);
  const [restrictLogin, setRestrictLogin] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [bulkChargesAccounts, setBulkChargesAccounts] = useState(null);
  const [checkBalanceAccounts, setCheckBalanceAccounts] = useState(null);
  const [mailAccounts, setMailAccounts] = useState(null);
  const [notificationAccounts, setNotificationAccounts] = useState(null);
  const [checkedBalances, setCheckedBalances] = useState({});
  const [refreshVersion, setRefreshVersion] = useState(0);

  const searchInputRef = useRef(null);
  const importInputRef = useRef(null);

  const openAccountScreen = useMultiScreenStore((state) => state.openAccountScreen);
  const openAccountWindows = useMultiScreenStore((state) => state.openAccountWindows);
  const activeAccountWindowLogin = useMultiScreenStore((state) => state.activeAccountWindowLogin);
  const sidebarMounted = useMultiScreenStore((state) => Boolean(state.mountedAccountWindowHosts?.sidebar));
  const openAccountDetailWindow = useMultiScreenStore((state) => state.openAccountDetailWindow);
  const closeAccountDetailWindow = useMultiScreenStore((state) => state.closeAccountDetailWindow);
  const focusAccountDetailWindow = useMultiScreenStore((state) => state.focusAccountDetailWindow);
  const registerAccountWindowHost = useMultiScreenStore((state) => state.registerAccountWindowHost);

  useEffect(() => {
    registerAccountWindowHost('tradingAccounts', true);
    return () => registerAccountWindowHost('tradingAccounts', false);
  }, [registerAccountWindowHost]);

  const handleOpenAccountDetail = useCallback((acc, initialTab = 'Overview') => {
    if (!acc) return;
    openAccountDetailWindow(typeof acc === 'object' ? { ...acc } : acc, {
      source: 'trading-accounts',
      initialTab,
    });
  }, [openAccountDetailWindow]);

  const tradingAccountWindows = useMemo(
    () => (sidebarMounted ? openAccountWindows.filter((item) => item.source !== 'sidebar') : openAccountWindows),
    [openAccountWindows, sidebarMounted]
  );
  const { groups, loading: groupsLoading } = useGroupList({ limit: 100, offset: 0, sort_by: 'name', sort_dir: 'asc' });
  const { canAct } = usePermissions();
  const canEditAccounts = canAct(PERMISSIONS.MANAGE_ACCOUNTS);
  const groupOptions = useMemo(() => {
    const base = ['All Groups', ...groups.map((group) => group.name).filter(Boolean)];
    if (groupFilter && !base.includes(groupFilter)) {
      return [...base, groupFilter];
    }
    return base;
  }, [groups, groupFilter]);
  const countryOptions = useMemo(() => ['All Countries', ...ALL_COUNTRIES], []);

  const handleSort = useCallback((col) => {
    if (sortCol === col) {
      setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }, [sortCol]);

  const hasOtherBlockingModal = Boolean(
    summaryAccount ||
    restrictLogin ||
    pendingAction ||
    checkBalanceAccounts ||
    mailAccounts ||
    notificationAccounts
  );

  const blockingPopupSummary = useMemo(
    () =>
      getBlockingPopupWindowSummary({
        openAccountWindows: tradingAccountWindows,
        hasBulkOperations: Boolean(bulkChargesAccounts),
        hasOtherModal: hasOtherBlockingModal,
      }),
    [tradingAccountWindows, bulkChargesAccounts, hasOtherBlockingModal]
  );

  const hasOpenBlockingWindows = blockingPopupSummary.isBlocked;

  const handleBlockedContextMenu = useCallback(() => {
    notifyCloseOpenPopupsRequired({
      openAccountWindows: tradingAccountWindows,
      hasBulkOperations: Boolean(bulkChargesAccounts),
      hasOtherModal: hasOtherBlockingModal,
    });
  }, [tradingAccountWindows, bulkChargesAccounts, hasOtherBlockingModal]);

  const ctl = useGridPageController({
    columns: ACCOUNT_COLUMNS,
    rowKey: 'login',
    exportName: 'trading-accounts',
    entityLabel: 'account',
    canOpenContextMenu: () => !hasOpenBlockingWindows,
    onBlockedContextMenu: handleBlockedContextMenu,
    onClearFilter: () => {
      setSearch('');
      setGroupFilter('All Groups');
      setCountryFilter('All Countries');
      setSortCol('login');
      setSortDir('asc');
    },
  });

  useEffect(() => {
    if (hasOpenBlockingWindows && ctl.contextMenuProps.isOpen) {
      ctl.contextMenuProps.onClose();
    }
  }, [hasOpenBlockingWindows, ctl.contextMenuProps]);

  const resolveTargetAccount = useCallback((row) => {
    if (row) return row;
    if (ctl.contextMenuProps.selectedRow) return ctl.contextMenuProps.selectedRow;
    if (selectedAccount) return selectedAccount;
    if (ctl.grid.selectedIds.size > 0) {
      const firstId = [...ctl.grid.selectedIds][0];
      const matched = (ctl.contextMenuProps.rows || []).find((r) => String(r?.login) === String(firstId));
      return matched || { login: firstId };
    }
    return null;
  }, [ctl.contextMenuProps.selectedRow, ctl.contextMenuProps.rows, ctl.grid.selectedIds, selectedAccount]);

  const handleFocusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  const handleTriggerImport = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    showResult.info(`Selected "${file.name}" for account import.`);
  }, []);

  const handleDeleteAccounts = useCallback((row) => {
    const target = resolveTargetAccount(row);
    if (!target) return;
    if (!canEditAccounts) {
      showResult.error('Your role does not have permission to delete accounts.');
      return;
    }
    setPendingAction({ action: 'delete', account: target });
  }, [canEditAccounts, resolveTargetAccount]);

  const handleBlockAccount = useCallback((row) => {
    const target = resolveTargetAccount(row);
    if (!target) return;
    if (!canEditAccounts) {
      showResult.error('Your role does not have permission to manage accounts.');
      return;
    }
    setPendingAction({ action: 'block', account: target });
  }, [canEditAccounts, resolveTargetAccount]);

  const handleUnblockAccount = useCallback((row) => {
    const target = resolveTargetAccount(row);
    if (!target) return;
    if (!canEditAccounts) {
      showResult.error('Your role does not have permission to manage accounts.');
      return;
    }
    setPendingAction({ action: 'unblock', account: target });
  }, [canEditAccounts, resolveTargetAccount]);

  const handleOpenDetails = useCallback((row) => {
    const target = resolveTargetAccount(row);
    if (target) handleOpenAccountDetail(target, 'Overview');
  }, [handleOpenAccountDetail, resolveTargetAccount]);

  const handleOpenSummary = useCallback((row) => {
    const target = resolveTargetAccount(row);
    if (!target) return;
    const login = typeof target === 'object' ? target.login : target;
    setSummaryAccount({ login, row: typeof target === 'object' ? target : undefined });
  }, [resolveTargetAccount]);

  const handleOpenRestrictions = useCallback((row) => {
    const target = resolveTargetAccount(row);
    const login = typeof target === 'object' ? target?.login : target;
    if (login) setRestrictLogin(login);
  }, [resolveTargetAccount]);

  const handleCheckBalance = useCallback((row) => {
    const allRows = ctl.contextMenuProps.rows || [];
    if (ctl.grid.selectedIds.size > 1) {
      const selectedList = allRows.filter((r) => ctl.grid.selectedIds.has(r?.login));
      if (selectedList.length > 0) {
        setCheckBalanceAccounts(selectedList);
        return;
      }
    }
    const target = resolveTargetAccount(row);
    if (target) setCheckBalanceAccounts([target]);
  }, [ctl.contextMenuProps.rows, ctl.grid.selectedIds, resolveTargetAccount]);

  const handleCharges = useCallback((row) => {
    const allRows = ctl.contextMenuProps.rows || [];
    if (ctl.grid.selectedIds.size > 1) {
      const selectedList = allRows.filter((r) => ctl.grid.selectedIds.has(r?.login));
      if (selectedList.length > 0) {
        setBulkChargesAccounts(selectedList);
        return;
      }
    }
    const target = resolveTargetAccount(row);
    if (target) setBulkChargesAccounts([target]);
  }, [ctl.contextMenuProps.rows, ctl.grid.selectedIds, resolveTargetAccount]);

  const handleFixBalance = useCallback((row) => {
    const target = resolveTargetAccount(row);
    if (target) handleOpenAccountDetail(target, 'Balance');
  }, [handleOpenAccountDetail, resolveTargetAccount]);

  const handleFixPersonalData = useCallback((row) => {
    const target = resolveTargetAccount(row);
    if (target) handleOpenAccountDetail(target, 'Personal');
  }, [handleOpenAccountDetail, resolveTargetAccount]);

  const handleInternalMail = useCallback((row) => {
    const allRows = ctl.contextMenuProps.rows || [];
    if (ctl.grid.selectedIds.size > 1) {
      const selectedList = allRows.filter((r) => ctl.grid.selectedIds.has(r?.login));
      if (selectedList.length > 0) {
        setMailAccounts(selectedList);
        return;
      }
    }
    const target = resolveTargetAccount(row);
    if (target) setMailAccounts([target]);
  }, [ctl.contextMenuProps.rows, ctl.grid.selectedIds, resolveTargetAccount]);

  const handlePushNotification = useCallback((row) => {
    const allRows = ctl.contextMenuProps.rows || [];
    if (ctl.grid.selectedIds.size > 1) {
      const selectedList = allRows.filter((r) => ctl.grid.selectedIds.has(r?.login));
      if (selectedList.length > 0) {
        setNotificationAccounts(selectedList);
        return;
      }
    }
    const target = resolveTargetAccount(row);
    if (target) setNotificationAccounts([target]);
  }, [ctl.contextMenuProps.rows, ctl.grid.selectedIds, resolveTargetAccount]);

  const handleCopyLogins = useCallback((row) => {
    const logins = ctl.grid.selectedIds.size > 0
      ? [...ctl.grid.selectedIds]
      : (() => {
        const target = resolveTargetAccount(row);
        const login = typeof target === 'object' ? target?.login : target;
        return login ? [login] : (ctl.contextMenuProps.rows || []).map((r) => r.login).filter(Boolean);
      })();
    if (logins.length === 0) {
      showResult.info('No account logins to copy.');
      return;
    }
    copyToClipboard(logins.join('\n'))
      .then(() => showResult.success(`Copied ${logins.length} login(s) to clipboard.`))
      .catch((err) => showResult.error(`Copy failed: ${err.message}`));
  }, [ctl.contextMenuProps.rows, ctl.grid.selectedIds, resolveTargetAccount]);

  const performAccountAction = useCallback(async (action, acc) => {
    if (!canEditAccounts) throw new Error('Your role does not have permission to manage accounts.');
    const login = typeof acc === 'object' ? acc.login : acc;
    if (action === 'delete') {
      await deleteManagerAccount(login);
      invalidateRealtimeCaches('accounts');
      showResult.success(`Account ${login} deleted successfully.`);
      setRefreshVersion((version) => version + 1);
      return;
    }
    const endpoint = action === 'block' ? 'UserArchive' : 'UserRestore';
    const res = await fetchManagerApi(`/${endpoint}?${new URLSearchParams({ login: String(login) })}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok || data?.success === false || data?.error) {
      throw new Error(data?.message || data?.error?.message || data?.error || `Unable to ${action} the account.`);
    }
    showResult.success(`Account ${login} ${action === 'block' ? 'blocked' : 'unblocked'} successfully.`);
    setRefreshVersion((version) => version + 1);
  }, [canEditAccounts]);

  const handlePageKeyDown = useCallback((event) => {
    const activeEl = document.activeElement;
    const isInput = Boolean(
      activeEl
      && (activeEl.tagName === 'INPUT'
        || activeEl.tagName === 'TEXTAREA'
        || activeEl.tagName === 'SELECT'
        || activeEl.isContentEditable)
    );

    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && key === 'n') {
      event.preventDefault();
      openAccountScreen();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && key === 'f') {
      event.preventDefault();
      handleFocusSearch();
      return;
    }
    if (isInput) return;

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && key === 'd') {
      event.preventDefault();
      handleDeleteAccounts(selectedAccount);
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if (key === 'a') {
        event.preventDefault();
        setAutoArrange((prev) => !prev);
      } else if (key === 'g') {
        event.preventDefault();
        ctl.grid.toggleGridlines();
      }
    }
  }, [ctl.grid, handleDeleteAccounts, handleFocusSearch, openAccountScreen, selectedAccount]);

  return (
    <div
      className="trading-accounts-page p-3 w-full h-full min-h-0 flex flex-col gap-2 overflow-hidden"
      tabIndex={-1}
      onKeyDown={handlePageKeyDown}
      {...ctl.pageProps}
    >
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.json,.txt"
        onChange={handleImportFileChange}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="trading-accounts-header flex flex-wrap items-center justify-between pb-0 gap-2 shrink-0">
        <div className="trading-accounts-heading flex items-center gap-2 min-w-0">
          <h1 className="trading-accounts-title" style={{ color: 'var(--text)' }}>Trading Accounts</h1>
        </div>
        <div className="trading-accounts-filters flex items-center gap-2 flex-wrap shrink-0 max-w-full">
          <div className="trading-accounts-search relative w-[200px] max-w-full shrink-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
            <input
              ref={searchInputRef}
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
            className="w-[140px]"
            options={groupOptions}
            loading={groupsLoading}
            loadingLabel="Loading groups…"
            onChange={setGroupFilter}
          />
          <FilterDropdown
            value={countryFilter}
            className="w-[140px]"
            options={countryOptions}
            onChange={setCountryFilter}
          />
        </div>
      </div>

      <TradingAccountsDataGrid
        search={search}
        groupFilter={groupFilter}
        countryFilter={countryFilter}
        groups={groups}
        grid={ctl.grid}
        sortCol={sortCol}
        sortDir={sortDir}
        onSort={handleSort}
        showGridlines={ctl.grid.showGridlines}
        autoArrange={autoArrange}
        autoScroll={autoScroll}
        onSelectAccount={setSelectedAccount}
        onEditAccount={handleOpenAccountDetail}
        canEditAccounts={canEditAccounts}
        checkedBalances={checkedBalances}
        refreshVersion={refreshVersion}
        {...ctl.gridProps}
      />

      {ctl.contextMenuProps.isOpen && !hasOpenBlockingWindows && (
        <TradingAccountsContextMenu
          x={ctl.contextMenuProps.x}
          y={ctl.contextMenuProps.y}
          onClose={ctl.contextMenuProps.onClose}
          selectedRow={ctl.contextMenuProps.selectedRow || selectedAccount}
          rows={ctl.contextMenuProps.rows}
          grid={ctl.grid}
          groupFilter={groupFilter}
          countryFilter={countryFilter}
          autoScroll={autoScroll}
          autoArrange={autoArrange}
          showGrid={ctl.grid.showGridlines}
          canEditAccounts={canEditAccounts}
          onNewAccount={() => openAccountScreen()}
          onOpenAccountDetails={handleOpenDetails}
          onOpenAccountSummary={handleOpenSummary}
          onOpenAccountRestrictions={handleOpenRestrictions}
          onCharges={handleCharges}
          onCheckBalance={handleCheckBalance}
          onFixBalance={handleFixBalance}
          onFixPersonalData={handleFixPersonalData}
          onBlockAccount={handleBlockAccount}
          onUnblockAccount={handleUnblockAccount}
          onInternalMail={handleInternalMail}
          onPushNotification={handlePushNotification}
          onFilterByGroup={setGroupFilter}
          onFilterByCountry={setCountryFilter}
          onClearFilter={ctl.grid.clearFilter}
          onCustomizeFilter={handleFocusSearch}
          onCopyAs={ctl.contextMenuProps.onCopyAs}
          onCopyLogins={handleCopyLogins}
          onExport={ctl.contextMenuProps.onExport}
          onImport={handleTriggerImport}
          onFind={handleFocusSearch}
          onDeleteAccounts={handleDeleteAccounts}
          onToggleAutoScroll={() => setAutoScroll((prev) => !prev)}
          onToggleAutoArrange={() => setAutoArrange((prev) => !prev)}
          onToggleGrid={() => ctl.grid.toggleGridlines()}
          onToggleColumn={(key) => ctl.grid.toggleColumn(key)}
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

      {pendingAction && (
        <AccountActionDialog
          {...pendingAction}
          onClose={() => setPendingAction(null)}
          onConfirm={performAccountAction}
        />
      )}

      {bulkChargesAccounts && (
        <BulkOperationsChargesModal
          accounts={bulkChargesAccounts}
          groups={groups}
          canEditAccounts={canEditAccounts}
          onOpenAccountDetails={(acc) => handleOpenAccountDetail(acc, 'Overview')}
          onClose={() => setBulkChargesAccounts(null)}
          onSuccess={() => setRefreshVersion((version) => version + 1)}
        />
      )}

      {checkBalanceAccounts && (
        <CheckBalanceDialog
          accounts={checkBalanceAccounts}
          onClose={() => setCheckBalanceAccounts(null)}
          onBalancesChecked={(balanceMap) => {
            setCheckedBalances((prev) => ({ ...prev, ...balanceMap }));
          }}
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

      {tradingAccountWindows.map((win) => {
        const editAccount = win.account ?? win.login;
        return (
          <AccountDetailsModal
            key={typeof editAccount === 'object' ? editAccount.login : editAccount}
            account={editAccount}
            initialTab={win.initialTab || 'Overview'}
            windowIndex={win.slotIndex}
            totalWindows={openAccountWindows.length}
            zOrder={win.zOrder}
            isActiveWindow={String(activeAccountWindowLogin) === String(win.login)}
            onFocusWindow={() => focusAccountDetailWindow(win.login)}
            onClose={() => closeAccountDetailWindow(win.login)}
            onAccountUpdated={() => setRefreshVersion((version) => version + 1)}
          />
        );
      })}
    </div>
  );
};

export default TradingAccountsPage;
