export const DEFAULT_TRADING_ACCOUNT_COLUMNS = [
  { key: 'login', label: 'Login' },
  { key: 'name', label: 'Name' },
  { key: 'group', label: 'Group' },
  { key: 'country', label: 'Country' },
  { key: 'client', label: 'Client' },
  { key: 'balance', label: 'Balance' },
  { key: 'balanceChecked', label: 'Balance / Checked' },
  { key: 'equity', label: 'Equity' },
  { key: 'profit', label: 'Profit' },
  { key: 'currency', label: 'Currency' },
];

export const parseLoginsFromText = (rawText = '') => {
  const tokens = String(rawText || '')
    .split(/[\s,;|\r\n\t]+/)
    .map((token) => token.replace(/^["'#]+|["']+$/g, '').trim())
    .filter((token) => /^\d+$/.test(token));
  return [...new Set(tokens)];
};

const selectMatchingLoginsFromText = ({ text, rows = [], rowKey = 'login', grid }) => {
  const parsedLogins = parseLoginsFromText(text);
  if (parsedLogins.length === 0) return [];
  const loginSet = new Set(parsedLogins.map(String));
  const matchedIds = rows
    .map((r) => r?.[rowKey])
    .filter((id) => id !== undefined && id !== null && loginSet.has(String(id)));
  const finalIds = matchedIds.length > 0 ? matchedIds : parsedLogins;
  grid?.selectAll?.(finalIds);
  return finalIds;
};

const defaultSelectLoginsFromClipboard = async ({ rows, rowKey, grid }) => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return [];
  try {
    const text = await navigator.clipboard.readText();
    return selectMatchingLoginsFromText({ text, rows, rowKey, grid });
  } catch {
    return [];
  }
};

const defaultSelectLoginsFromFile = ({ rows, rowKey, grid }) => {
  if (typeof document === 'undefined') return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.csv,.tsv,.log';
  input.style.display = 'none';
  input.addEventListener('change', (event) => {
    const file = event.target?.files?.[0];
    input.remove();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      selectMatchingLoginsFromText({ text: content, rows, rowKey, grid });
    };
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
};

export function buildTradingAccountsContextMenuItems({
  selectedRow = null,
  rows = [],
  grid = null,
  groupFilter = 'All Groups',
  countryFilter = 'All Countries',
  autoScroll = false,
  autoArrange = true,
  showGrid = true,
  canEditAccounts = true,
  onNewAccount,
  onOpenAccountDetails,
  onCharges,
  onCheckBalance,
  onFixBalance,
  onFixPersonalData,
  onInternalMail,
  onPushNotification,
  onSelectLoginsFromClipboard,
  onSelectLoginsFromFile,
  onFilterByGroup,
  onFilterByCountry,
  onClearFilter,
  onCopyAs,
  onCopyLogins,
  onExport,
  onImport,
  onFind,
  onDeleteAccounts,
  onToggleAutoScroll,
  onToggleAutoArrange,
  onToggleGrid,
  onToggleColumn,
} = {}) {
  const rowKey = grid?.rowKey || 'login';
  const selectedIds = grid?.selectedIds ?? new Set();
  const hasSelection = selectedIds.size > 0;
  const hasTargetAccount = Boolean(selectedRow?.login ?? selectedRow) || hasSelection;
  const targetGroup = String(selectedRow?.group ?? '').trim();
  const targetCountry = String(selectedRow?.country ?? '').trim();
  const columns = Array.isArray(grid?.columns) && grid.columns.length > 0
    ? grid.columns
    : DEFAULT_TRADING_ACCOUNT_COLUMNS;
  const hiddenColumns = grid?.hiddenColumns ?? new Set();

  const selectBySubmenu = [
    {
      key: 'select-logins-from-clipboard',
      label: 'Logins from Clipboard',
      icon: 'logins-clipboard',
      disabled: false,
      onSelect: () => {
        if (onSelectLoginsFromClipboard) {
          onSelectLoginsFromClipboard();
        } else {
          void defaultSelectLoginsFromClipboard({ rows, rowKey, grid });
        }
      },
    },
    {
      key: 'select-logins-from-file',
      label: 'Logins from File',
      icon: 'logins-file',
      disabled: false,
      onSelect: () => {
        if (onSelectLoginsFromFile) {
          onSelectLoginsFromFile();
        } else {
          defaultSelectLoginsFromFile({ rows, rowKey, grid });
        }
      },
    },
  ];

  const filterSubmenu = [];
  if (targetGroup) {
    filterSubmenu.push({
      key: 'filter-group-target',
      label: `Group: ${targetGroup}`,
      checked: groupFilter === targetGroup,
      onSelect: () => onFilterByGroup?.(targetGroup),
    });
  }
  if (targetCountry) {
    filterSubmenu.push({
      key: 'filter-country-target',
      label: `Country: ${targetCountry}`,
      checked: countryFilter === targetCountry,
      onSelect: () => onFilterByCountry?.(targetCountry),
    });
  }
  if (filterSubmenu.length > 0) {
    filterSubmenu.push({ divider: true });
  }
  filterSubmenu.push(
    {
      key: 'filter-all-groups',
      label: 'All Groups',
      checked: groupFilter === 'All Groups',
      onSelect: () => onFilterByGroup?.('All Groups'),
    },
    {
      key: 'filter-all-countries',
      label: 'All Countries',
      checked: countryFilter === 'All Countries',
      onSelect: () => onFilterByCountry?.('All Countries'),
    },
    { divider: true },
    {
      key: 'filter-clear',
      label: 'Clear Filter',
      onSelect: () => {
        if (onClearFilter) onClearFilter();
        else grid?.clearFilter?.();
      },
    }
  );

  const bulkOperationsSubmenu = [
    {
      key: 'bulk-charges',
      label: 'Charges',
      icon: 'charges',
      disabled: !hasTargetAccount || !canEditAccounts,
      onSelect: () => {
        if (onCharges) onCharges(selectedRow);
        else if (onCheckBalance) onCheckBalance(selectedRow);
        else onOpenAccountDetails?.(selectedRow);
      },
    },
    {
      key: 'bulk-check-balance',
      label: 'Check Balance',
      icon: 'check-balance',
      disabled: !hasTargetAccount,
      onSelect: () => {
        if (onCheckBalance) onCheckBalance(selectedRow);
        else onOpenAccountDetails?.(selectedRow);
      },
    },
    {
      key: 'bulk-fix-balance',
      label: 'Fix Balance',
      icon: 'fix-balance',
      disabled: !hasTargetAccount || !canEditAccounts,
      onSelect: () => {
        if (onFixBalance) onFixBalance(selectedRow);
        else if (onCheckBalance) onCheckBalance(selectedRow);
        else onOpenAccountDetails?.(selectedRow);
      },
    },
    {
      key: 'bulk-fix-personal-data',
      label: 'Fix Personal Data',
      icon: 'fix-personal-data',
      disabled: !hasTargetAccount || !canEditAccounts,
      onSelect: () => {
        if (onFixPersonalData) onFixPersonalData(selectedRow);
        else onOpenAccountDetails?.(selectedRow);
      },
    },
  ];

  const copyAsSubmenu = [
    {
      key: 'copy-tsv',
      label: 'Text (Tab-Separated)',
      shortcut: 'Ctrl+C',
      onSelect: () => onCopyAs?.('tsv'),
    },
    {
      key: 'copy-csv',
      label: 'CSV',
      onSelect: () => onCopyAs?.('csv'),
    },
    {
      key: 'copy-json',
      label: 'JSON',
      onSelect: () => onCopyAs?.('json'),
    },
    { divider: true },
    {
      key: 'copy-login',
      label: 'Login ID',
      disabled: !hasTargetAccount && rows.length === 0,
      onSelect: () => onCopyLogins?.(selectedRow),
    },
  ];

  const columnsSubmenu = columns.map((col) => ({
    key: `col-${col.key}`,
    label: col.label || col.key,
    checked: !hiddenColumns.has(col.key),
    onSelect: () => {
      if (onToggleColumn) onToggleColumn(col.key);
      else grid?.toggleColumn?.(col.key);
    },
  }));

  return [
    {
      key: 'new-account',
      label: 'New Account',
      icon: 'new-account',
      shortcut: 'Ctrl+Shift+N',
      onSelect: () => onNewAccount?.(),
    },
    {
      key: 'account-details',
      label: 'Account Details',
      icon: 'account-details',
      disabled: !hasTargetAccount,
      onSelect: () => onOpenAccountDetails?.(selectedRow),
    },
    {
      key: 'bulk-operations',
      label: 'Bulk Operations',
      submenu: bulkOperationsSubmenu,
    },
    { divider: true },
    {
      key: 'internal-mail-email',
      label: 'Internal Mail / Email',
      icon: 'mail',
      disabled: !hasTargetAccount,
      onSelect: () => onInternalMail?.(selectedRow),
    },
    {
      key: 'push-notification-sms',
      label: 'Push Notification / SMS',
      icon: 'notification',
      disabled: !hasTargetAccount,
      onSelect: () => onPushNotification?.(selectedRow),
    },
    { divider: true },
    {
      key: 'select-by',
      label: 'Select By',
      submenu: selectBySubmenu,
    },
    {
      key: 'filter',
      label: 'Filter',
      submenu: filterSubmenu,
    },
    {
      key: 'copy-as',
      label: 'Copy As',
      submenu: copyAsSubmenu,
    },
    {
      key: 'export',
      label: 'Export',
      icon: 'export',
      onSelect: () => onExport?.(),
    },
    {
      key: 'import',
      label: 'Import',
      icon: 'import',
      onSelect: () => onImport?.(),
    },
    {
      key: 'find',
      label: 'Find',
      icon: 'find',
      shortcut: 'Ctrl+F',
      onSelect: () => onFind?.(),
    },
    { divider: true },
    {
      key: 'delete-accounts',
      label: 'Delete Accounts',
      icon: 'delete',
      shortcut: 'Ctrl+D',
      disabled: !hasTargetAccount || !canEditAccounts,
      onSelect: () => onDeleteAccounts?.(selectedRow),
    },
    { divider: true },
    {
      key: 'auto-scroll',
      label: 'Auto Scroll',
      checked: Boolean(autoScroll),
      onSelect: () => onToggleAutoScroll?.(),
    },
    {
      key: 'auto-arrange',
      label: 'Auto Arrange',
      shortcut: 'A',
      checked: Boolean(autoArrange),
      onSelect: () => onToggleAutoArrange?.(),
    },
    {
      key: 'grid',
      label: 'Grid',
      shortcut: 'G',
      checked: Boolean(showGrid),
      onSelect: () => {
        if (onToggleGrid) onToggleGrid();
        else grid?.toggleGridlines?.();
      },
    },
    { divider: true },
    {
      key: 'columns',
      label: 'Columns',
      submenu: columnsSubmenu,
    },
  ];
}
