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
  onCustomizeFilter,
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
  const normalizedGroupFilter = String(groupFilter ?? '').trim().toLowerCase();
  const normalizedCountryFilter = String(countryFilter ?? '').trim().toLowerCase();
  const isNoneFilterActive = (
    (!normalizedGroupFilter || normalizedGroupFilter === 'all groups' || normalizedGroupFilter === 'none')
    && (!normalizedCountryFilter || normalizedCountryFilter === 'all countries')
  );
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

  const filterSubmenu = [
    {
      key: 'filter-none',
      label: 'None',
      icon: 'filter-none',
      checked: isNoneFilterActive,
      onSelect: () => {
        onFilterByGroup?.('All Groups');
        onFilterByCountry?.('All Countries');
        if (onClearFilter) onClearFilter();
        else grid?.clearFilter?.();
      },
    },
    { divider: true },
    {
      key: 'filter-lp',
      label: 'lp',
      checked: normalizedGroupFilter === 'lp',
      onSelect: () => onFilterByGroup?.('lp'),
    },
    {
      key: 'filter-real',
      label: 'real',
      checked: normalizedGroupFilter === 'real',
      onSelect: () => onFilterByGroup?.('real'),
    },
    { divider: true },
    {
      key: 'filter-customize',
      label: 'Customize',
      icon: 'customize',
      onSelect: () => {
        if (onCustomizeFilter) onCustomizeFilter();
        else onFind?.();
      },
    },
  ];

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
      key: 'copy-lines',
      label: 'Lines',
      icon: 'copy-lines',
      shortcut: 'Ctrl+C',
      onSelect: () => {
        if (onCopyAs) {
          onCopyAs('tsv');
          return;
        }
        const targetRows = selectedIds.size > 0
          ? rows.filter((r) => selectedIds.has(r?.[rowKey]))
          : selectedRow
            ? [selectedRow]
            : rows;
        const visibleCols = columns.filter((col) => !hiddenColumns.has(col.key));
        const text = targetRows
          .map((row) => visibleCols.map((col) => String(row?.[col.key] ?? '')).join('\t'))
          .join('\n');
        if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(text);
        }
      },
    },
    {
      key: 'copy-list-of-logins',
      label: 'List Of Logins',
      icon: 'copy-list-of-logins',
      disabled: !hasTargetAccount && rows.length === 0,
      onSelect: () => {
        if (onCopyLogins) {
          onCopyLogins(selectedRow);
          return;
        }
        const logins = selectedIds.size > 0
          ? [...selectedIds]
          : (() => {
            const login = typeof selectedRow === 'object' ? selectedRow?.[rowKey] ?? selectedRow?.login : selectedRow;
            return login ? [login] : rows.map((r) => r?.[rowKey] ?? r?.login).filter(Boolean);
          })();
        const text = logins.map(String).join('\n');
        if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(text);
        }
      },
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
