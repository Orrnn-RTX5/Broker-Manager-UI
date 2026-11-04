import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTradingAccountsContextMenuItems,
  DEFAULT_TRADING_ACCOUNT_COLUMNS,
} from './tradingAccountsContextMenuModel.js';
import {
  CLOSE_POPUPS_REQUIRED_EVENT,
  getBlockingPopupWindowSummary,
} from '../../../components/Popups/popupContextMenuGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('buildTradingAccountsContextMenuItems matches MT5 Trading Accounts right-click menu structure and shortcuts', () => {
  const sampleRow = {
    login: '68096272',
    name: 'Test Trader',
    group: 'demo\\forex-hedge-usd-01',
    country: 'India',
    client: 'Client A',
    balance: 9627.86,
    currency: 'USD',
  };

  const items = buildTradingAccountsContextMenuItems({
    selectedRow: sampleRow,
    rows: [sampleRow],
  });

  const labelsAndDividers = items.map((item) =>
    item.divider ? '---' : item.label
  );

  assert.deepEqual(labelsAndDividers, [
    'New Account',
    'Account Details',
    'Bulk Operations',
    '---',
    'Internal Mail / Email',
    'Push Notification / SMS',
    '---',
    'Select By',
    'Filter',
    'Copy As',
    'Export',
    'Import',
    'Find',
    '---',
    'Delete Accounts',
    '---',
    'Auto Scroll',
    'Auto Arrange',
    'Grid',
    '---',
    'Columns',
  ]);

  const byKey = Object.fromEntries(
    items.filter((item) => !item.divider).map((item) => [item.key, item])
  );

  assert.equal(byKey['new-account'].shortcut, 'Ctrl+Shift+N');
  assert.equal(byKey['new-account'].icon, 'new-account');
  assert.equal(byKey['account-details'].icon, 'account-details');
  assert.ok(Array.isArray(byKey['bulk-operations'].submenu));
  assert.deepEqual(
    byKey['bulk-operations'].submenu.map((item) => [item.label, item.icon]),
    [
      ['Charges', 'charges'],
      ['Check Balance', 'check-balance'],
      ['Fix Balance', 'fix-balance'],
      ['Fix Personal Data', 'fix-personal-data'],
    ]
  );
  assert.equal(byKey['internal-mail-email'].icon, 'mail');
  assert.equal(byKey['push-notification-sms'].icon, 'notification');
  assert.ok(Array.isArray(byKey['select-by'].submenu));
  assert.deepEqual(
    byKey['select-by'].submenu.map((item) => [item.label, item.icon]),
    [
      ['Logins from Clipboard', 'logins-clipboard'],
      ['Logins from File', 'logins-file'],
    ]
  );
  assert.ok(Array.isArray(byKey['filter'].submenu));
  assert.deepEqual(
    byKey['filter'].submenu.map((item) =>
      item.divider ? '---' : [item.label, item.icon ?? null, item.checked ?? null]
    ),
    [
      ['None', 'filter-none', true],
      '---',
      ['lp', null, false],
      ['real', null, false],
      '---',
      ['Customize', 'customize', null],
    ]
  );
  assert.ok(Array.isArray(byKey['copy-as'].submenu));
  assert.deepEqual(
    byKey['copy-as'].submenu.map((item) => [item.label, item.icon, item.shortcut ?? null]),
    [
      ['Lines', 'copy-lines', 'Ctrl+C'],
      ['List Of Logins', 'copy-list-of-logins', null],
    ]
  );
  assert.equal(byKey['export'].icon, 'export');
  assert.equal(byKey['import'].icon, 'import');
  assert.equal(byKey['find'].icon, 'find');
  assert.equal(byKey['find'].shortcut, 'Ctrl+F');
  assert.equal(byKey['delete-accounts'].icon, 'delete');
  assert.equal(byKey['delete-accounts'].shortcut, 'Ctrl+D');

  // Default check states matching screenshot
  assert.equal(byKey['auto-scroll'].checked, false);
  assert.equal(byKey['auto-arrange'].checked, true);
  assert.equal(byKey['auto-arrange'].shortcut, 'A');
  assert.equal(byKey['grid'].checked, true);
  assert.equal(byKey['grid'].shortcut, 'G');

  // Columns submenu contains all trading account columns checked by default
  assert.equal(
    byKey['columns'].submenu.length,
    DEFAULT_TRADING_ACCOUNT_COLUMNS.length
  );
  assert.ok(byKey['columns'].submenu.every((col) => col.checked === true));
});

test('buildTradingAccountsContextMenuItems invokes callbacks for menu actions and submenus', () => {
  const calls = [];
  const sampleRow = {
    login: '68096272',
    name: 'Test Trader',
    group: 'demo\\forex-hedge-usd-01',
    country: 'India',
    currency: 'USD',
  };

  const gridMock = {
    rowKey: 'login',
    selectedIds: new Set(['68096272']),
    columns: DEFAULT_TRADING_ACCOUNT_COLUMNS,
    hiddenColumns: new Set(['profit']),
    selectAll: (ids) => calls.push(['selectAll', ids]),
    clear: () => calls.push(['clear']),
    invert: (ids) => calls.push(['invert', ids]),
    toggleColumn: (key) => calls.push(['toggleColumn', key]),
    toggleGridlines: () => calls.push(['toggleGridlines']),
  };

  const items = buildTradingAccountsContextMenuItems({
    selectedRow: sampleRow,
    rows: [sampleRow],
    grid: gridMock,
    onNewAccount: () => calls.push(['newAccount']),
    onOpenAccountDetails: (row) => calls.push(['accountDetails', row?.login]),
    onInternalMail: (row) => calls.push(['internalMail', row?.login]),
    onPushNotification: (row) => calls.push(['pushNotification', row?.login]),
    onExport: () => calls.push(['export']),
    onImport: () => calls.push(['import']),
    onFind: () => calls.push(['find']),
    onDeleteAccounts: (row) => calls.push(['deleteAccounts', row?.login]),
    onToggleAutoScroll: () => calls.push(['toggleAutoScroll']),
    onToggleAutoArrange: () => calls.push(['toggleAutoArrange']),
    onToggleGrid: () => calls.push(['toggleGrid']),
    onCopyAs: (fmt) => calls.push(['copyAs', fmt]),
    onCopyLogins: (row) => calls.push(['copyLogins', row?.login]),
    onFilterByGroup: (grp) => calls.push(['filterByGroup', grp]),
    onFilterByCountry: (country) => calls.push(['filterByCountry', country]),
    onClearFilter: () => calls.push(['clearFilter']),
    onCustomizeFilter: () => calls.push(['customizeFilter']),
  });

  const byKey = Object.fromEntries(
    items.filter((item) => !item.divider).map((item) => [item.key, item])
  );

  byKey['new-account'].onSelect();
  byKey['account-details'].onSelect();
  byKey['internal-mail-email'].onSelect();
  byKey['push-notification-sms'].onSelect();
  byKey['export'].onSelect();
  byKey['import'].onSelect();
  byKey['find'].onSelect();
  byKey['delete-accounts'].onSelect();
  byKey['auto-scroll'].onSelect();
  byKey['auto-arrange'].onSelect();
  byKey['grid'].onSelect();

  const filterByKey = Object.fromEntries(
    byKey['filter'].submenu.filter((item) => !item.divider).map((item) => [item.key, item])
  );
  filterByKey['filter-lp'].onSelect();
  filterByKey['filter-real'].onSelect();
  filterByKey['filter-none'].onSelect();
  filterByKey['filter-customize'].onSelect();

  const copyAsByKey = Object.fromEntries(
    byKey['copy-as'].submenu.filter((item) => !item.divider).map((item) => [item.key, item])
  );
  copyAsByKey['copy-lines'].onSelect();
  copyAsByKey['copy-list-of-logins'].onSelect();

  const profitCol = byKey['columns'].submenu.find(
    (col) => col.key === 'col-profit'
  );
  assert.equal(profitCol.checked, false);
  profitCol.onSelect();

  assert.deepEqual(calls, [
    ['newAccount'],
    ['accountDetails', '68096272'],
    ['internalMail', '68096272'],
    ['pushNotification', '68096272'],
    ['export'],
    ['import'],
    ['find'],
    ['deleteAccounts', '68096272'],
    ['toggleAutoScroll'],
    ['toggleAutoArrange'],
    ['toggleGrid'],
    ['filterByGroup', 'lp'],
    ['filterByGroup', 'real'],
    ['filterByGroup', 'All Groups'],
    ['filterByCountry', 'All Countries'],
    ['clearFilter'],
    ['customizeFilter'],
    ['copyAs', 'tsv'],
    ['copyLogins', '68096272'],
    ['toggleColumn', 'profit'],
  ]);
});

test('TradingAccountsPage wires TradingAccountsContextMenu and TradingAccountsDataGrid row right-click', () => {
  const pageSource = fs.readFileSync(
    path.resolve(__dirname, '../TradingAccountsPage.jsx'),
    'utf8'
  );
  assert.match(pageSource, /import TradingAccountsContextMenu from '\.\/components\/TradingAccountsContextMenu'/);
  assert.match(pageSource, /import BulkOperationsChargesModal from '\.\.\/\.\.\/components\/Popups\/BulkOperationsChargesModal'/);
  assert.match(pageSource, /import CheckBalanceDialog from '\.\.\/\.\.\/components\/Popups\/CheckBalanceDialog'/);
  assert.match(pageSource, /import InternalMailModal from '\.\.\/\.\.\/components\/Popups\/InternalMailModal'/);
  assert.match(pageSource, /import PushNotificationModal from '\.\.\/\.\.\/components\/Popups\/PushNotificationModal'/);
  assert.match(pageSource, /<TradingAccountsContextMenu/);
  assert.match(pageSource, /<BulkOperationsChargesModal/);
  assert.match(pageSource, /<CheckBalanceDialog/);
  assert.match(pageSource, /<InternalMailModal/);
  assert.match(pageSource, /<PushNotificationModal/);
  assert.match(pageSource, /\{\.\.\.ctl\.gridProps\}/);

  const mailModalSource = fs.readFileSync(
    path.resolve(__dirname, '../../../components/Popups/InternalMailModal.jsx'),
    'utf8'
  );
  assert.match(mailModalSource, /Mail/);
  assert.match(mailModalSource, /To:/);
  assert.match(mailModalSource, /Subject:/);
  assert.match(mailModalSource, /Template:/);
  assert.match(mailModalSource, /Mail server:/);
  assert.match(mailModalSource, /Send/);
  assert.match(mailModalSource, /Email/);
  assert.match(mailModalSource, /Default font/);
  assert.match(mailModalSource, /Size/);

  const notifyModalSource = fs.readFileSync(
    path.resolve(__dirname, '../../../components/Popups/PushNotificationModal.jsx'),
    'utf8'
  );
  assert.match(notifyModalSource, /Notification/);
  assert.match(
    notifyModalSource,
    /Sending internal push notification and\/or SMS\. You can specify several MetaQuotes IDs separated by a comma\./
  );
  assert.match(notifyModalSource, /Send by:/);
  assert.match(notifyModalSource, /Recipients:/);
  assert.match(notifyModalSource, /Sender name:/);
  assert.match(notifyModalSource, /Internal push notification by MetaQuotes ID/);
  assert.match(notifyModalSource, /SMS/);
  assert.match(notifyModalSource, /Send/);
  assert.match(notifyModalSource, /Cancel/);

  const checkBalanceSource = fs.readFileSync(
    path.resolve(__dirname, '../../../components/Popups/CheckBalanceDialog.jsx'),
    'utf8'
  );
  assert.match(checkBalanceSource, /Accounts/);
  assert.match(checkBalanceSource, /Check balances for selected accounts\?/);
  assert.match(checkBalanceSource, /Yes/);
  assert.match(checkBalanceSource, /No/);

  const modalSource = fs.readFileSync(
    path.resolve(__dirname, '../../../components/Popups/BulkOperationsChargesModal.jsx'),
    'utf8'
  );
  assert.match(modalSource, /Bulk Operations/);
  assert.match(modalSource, /Operation:/);
  for (const opLabel of [
    'Balance',
    'Credit',
    'Charge',
    'Correction',
    'Bonus',
    'Commission',
    'Dividend',
    'Franked Dividend',
    'Tax',
  ]) {
    assert.match(modalSource, new RegExp(`label:\\s*'${opLabel}'`));
  }
  assert.match(modalSource, /Amount:/);
  assert.match(modalSource, /Comment:/);
  assert.match(
    modalSource,
    /Conduct balance operation without checking the free margin and the current balance on the account/
  );
  assert.match(modalSource, /Process/);
  assert.match(modalSource, /Cancel/);
  assert.match(modalSource, /onDoubleClick=\{\(\) => \{/);
  assert.match(modalSource, /handleOpenAccount\(row\)/);
  assert.match(modalSource, /initialTab:\s*'Overview'/);

  const accountDetailsSource = fs.readFileSync(
    path.resolve(__dirname, '../../../components/Popups/AccountDetailsModal.jsx'),
    'utf8'
  );
  assert.match(accountDetailsSource, /document\.querySelector\('\.bulk-ops-window'\)/);
  assert.match(accountDetailsSource, /cascadeOffsetTop\s*=\s*38/);
  assert.match(accountDetailsSource, /handleMinimize/);
  assert.match(accountDetailsSource, /handleRestoreFromMinimize/);
  assert.match(accountDetailsSource, /bottom:\s*'25px'/);
});

test('TradingAccountsDataGrid and CSS style demo accounts green, real accounts yellow, and contest accounts blue', () => {
  const gridSource = fs.readFileSync(
    path.resolve(__dirname, './TradingAccountsDataGrid.jsx'),
    'utf8'
  );
  const indexCss = fs.readFileSync(
    path.resolve(__dirname, '../../../index.css'),
    'utf8'
  );

  assert.match(gridSource, /getAccountVisualType/);
  assert.match(gridSource, /'is-contest'/);
  assert.match(gridSource, /'is-demo'/);
  assert.match(gridSource, /'is-real'/);

  // Demo = green (#22c55e), Real = yellow (#facc15), Contest = blue (#3b82f6)
  assert.match(indexCss, /\.trading-accounts-login-icon\.is-demo[\s\S]*?color:\s*#22c55e/);
  assert.match(indexCss, /\.trading-accounts-login-icon\.is-real[\s\S]*?color:\s*#facc15/);
  assert.match(indexCss, /\.trading-accounts-login-icon\.is-contest[\s\S]*?color:\s*#3b82f6/);
});

test('Right-click context menu is blocked while Bulk Operations and Account Details tabs are open and indicates to cross (✕) them first', () => {
  const twoTabsSummary = getBlockingPopupWindowSummary({
    openAccountWindows: [{ login: '200013', minimized: false }],
    hasBulkOperations: true,
    doc: null,
  });
  assert.equal(twoTabsSummary.isBlocked, true);
  assert.equal(twoTabsSummary.totalOpenTabs, 2);
  assert.match(twoTabsSummary.message, /Please cross \(✕\) these 2 open tabs first/);

  const singleTabSummary = getBlockingPopupWindowSummary({
    openAccountWindows: [{ login: '200013', minimized: false }],
    hasBulkOperations: false,
    doc: null,
  });
  assert.equal(singleTabSummary.isBlocked, true);
  assert.equal(singleTabSummary.totalOpenTabs, 1);
  assert.match(singleTabSummary.message, /Please cross \(✕\) this open tab first/);

  const closedOrMinimizedSummary = getBlockingPopupWindowSummary({
    openAccountWindows: [{ login: '200013', minimized: true }],
    hasBulkOperations: false,
    doc: null,
  });
  assert.equal(closedOrMinimizedSummary.isBlocked, false);
  assert.equal(closedOrMinimizedSummary.totalOpenTabs, 0);

  const pageSource = fs.readFileSync(
    path.resolve(__dirname, '../TradingAccountsPage.jsx'),
    'utf8'
  );
  const accountDetailsSource = fs.readFileSync(
    path.resolve(__dirname, '../../../components/Popups/AccountDetailsModal.jsx'),
    'utf8'
  );
  const bulkModalSource = fs.readFileSync(
    path.resolve(__dirname, '../../../components/Popups/BulkOperationsChargesModal.jsx'),
    'utf8'
  );

  assert.equal(CLOSE_POPUPS_REQUIRED_EVENT, 'rtx:close-popups-required');
  assert.match(pageSource, /canOpenContextMenu:\s*\(\)\s*=>\s*!hasOpenBlockingWindows/);
  assert.match(pageSource, /ctl\.contextMenuProps\.isOpen && !hasOpenBlockingWindows/);
  assert.match(accountDetailsSource, /notifyCloseOpenPopupsRequired/);
  assert.match(accountDetailsSource, /is-close-highlight/);
  assert.match(bulkModalSource, /notifyCloseOpenPopupsRequired/);
  assert.match(bulkModalSource, /is-close-highlight/);
});
