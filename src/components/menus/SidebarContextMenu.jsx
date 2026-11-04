import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import {
  TradingAccountsMenuIcon,
} from '../../features/clients/components/TradingAccountsContextMenu';
import {
  buildTradingAccountsContextMenuItems,
} from '../../features/clients/components/tradingAccountsContextMenuModel';
import '../Popups/AccountPanel.css';

const SIDEBAR_COLUMNS = [
  { key: 'login', label: 'Login' },
  { key: 'balance', label: 'Balance' },
];

const SidebarContextMenu = ({
  x = 0,
  y = 0,
  account,
  rows = [],
  onClose,
  onAction,
  onIntent,
  canManageAccounts = true,
  autoScroll = false,
  autoArrange = true,
  showGrid = true,
  hiddenColumns,
  onToggleAutoScroll,
  onToggleAutoArrange,
  onToggleGrid,
  onToggleColumn,
}) => {
  const menuRef = useRef(null);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [hoveredSubKey, setHoveredSubKey] = useState(null);

  const selectedRow = useMemo(() => {
    if (account && typeof account === 'object') return account;
    return account ? { login: account } : null;
  }, [account]);

  const gridProxy = useMemo(() => ({
    rowKey: 'login',
    columns: SIDEBAR_COLUMNS,
    hiddenColumns: hiddenColumns || new Set(),
    selectedIds: selectedRow?.login ? new Set([selectedRow.login]) : new Set(),
    selectAll: () => onAction?.('select-all', account),
    clear: () => onAction?.('clear-selection', account),
    invert: () => onAction?.('invert-selection', account),
    toggleGridlines: () => onToggleGrid?.(),
    toggleColumn: (key) => onToggleColumn?.(key),
  }), [account, hiddenColumns, onAction, onToggleColumn, onToggleGrid, selectedRow]);

  const items = useMemo(
    () =>
      buildTradingAccountsContextMenuItems({
        selectedRow,
        rows,
        grid: gridProxy,
        autoScroll,
        autoArrange,
        showGrid,
        canEditAccounts: canManageAccounts,
        onNewAccount: () => onAction?.('new-account', account),
        onOpenAccountDetails: () => onAction?.('details', account),
        onOpenAccountSummary: () => onAction?.('summary', account),
        onOpenAccountRestrictions: () => onAction?.('restrictions', account),
        onCharges: () => onAction?.('charges', account),
        onCheckBalance: () => onAction?.('balance', account),
        onFixBalance: () => onAction?.('fix-balance', account),
        onFixPersonalData: () => onAction?.('fix-personal-data', account),
        onBlockAccount: () => onAction?.('block', account),
        onUnblockAccount: () => onAction?.('unblock', account),
        onInternalMail: () => onAction?.('mail', account),
        onPushNotification: () => onAction?.('notification', account),
        onFilterByGroup: (group) => onAction?.('filter-group', group),
        onFilterByCountry: (country) => onAction?.('filter-country', country),
        onClearFilter: () => onAction?.('clear-filter', account),
        onCopyAs: (fmt) => onAction?.(`copy-${fmt}`, account),
        onCopyLogins: () => onAction?.('copy-logins', account),
        onExport: () => onAction?.('export', account),
        onImport: () => onAction?.('import', account),
        onFind: () => onAction?.('find', account),
        onDeleteAccounts: () => onAction?.('delete', account),
        onToggleAutoScroll: () => onToggleAutoScroll?.(),
        onToggleAutoArrange: () => onToggleAutoArrange?.(),
        onToggleGrid: () => onToggleGrid?.(),
        onToggleColumn: (key) => onToggleColumn?.(key),
      }),
    [
      account,
      autoArrange,
      autoScroll,
      canManageAccounts,
      gridProxy,
      onAction,
      onToggleAutoArrange,
      onToggleAutoScroll,
      onToggleColumn,
      onToggleGrid,
      rows,
      selectedRow,
      showGrid,
    ]
  );

  useEffect(() => {
    const outside = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose?.();
    };
    const escape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;
  const menuWidth = 236;
  const estimatedHeight = Math.min(viewportH - 16, items.length * 22 + 16);
  const left = Math.max(4, Math.min(x, viewportW - menuWidth - 8));
  const top = Math.max(4, Math.min(y, viewportH - estimatedHeight - 8));
  const openSubmenuLeft = left + menuWidth + 190 > viewportW;

  const menuNode = (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Trading Accounts context menu"
      className="rtx-mt5-context-menu trading-accounts-context-menu account-panel-context-menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 10000,
        minWidth: `${menuWidth}px`,
        padding: '4px 0',
        background: '#1f1f1f',
        border: '1px solid #6b6b6b',
        borderRadius: '0px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
        color: '#e8e8e8',
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '11px',
        fontWeight: 400,
        lineHeight: '16px',
        userSelect: 'none',
      }}
    >
      {items.map((item, idx) => {
        if (item.divider) {
          return (
            <div
              key={`divider-${idx}`}
              role="separator"
              style={{
                height: '1px',
                margin: '4px 2px',
                background: '#484848',
              }}
            />
          );
        }

        const itemKey = item.key || item.label;
        const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
        const isHovered = hoveredKey === itemKey;
        const isDisabled = Boolean(item.disabled);

        return (
          <div
            key={itemKey}
            style={{ position: 'relative' }}
            onMouseEnter={() => {
              setHoveredKey(itemKey);
              setHoveredSubKey(null);
              if (itemKey === 'account-details') onIntent?.('details', account);
            }}
          >
            <button
              type="button"
              role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={item.checked !== undefined ? Boolean(item.checked) : undefined}
              aria-haspopup={hasSubmenu ? 'menu' : undefined}
              aria-expanded={hasSubmenu ? isHovered : undefined}
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                if (hasSubmenu) {
                  setHoveredKey(itemKey);
                  setHoveredSubKey(null);
                  return;
                }
                item.onSelect?.();
                onClose?.();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                minHeight: '22px',
                padding: '2px 10px 2px 6px',
                border: 0,
                background: isHovered && !isDisabled ? '#0078d7' : 'transparent',
                color: isDisabled ? '#7a7a7a' : (isHovered ? '#ffffff' : '#e8e8e8'),
                cursor: isDisabled ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontSize: '11px',
                fontWeight: 400,
                gap: '12px',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', minWidth: 0 }}>
                <span
                  style={{
                    width: '20px',
                    height: '16px',
                    flex: '0 0 20px',
                    marginRight: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '2px',
                  }}
                >
                  <TradingAccountsMenuIcon name={item.icon} checked={item.checked} />
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
              </span>
              {hasSubmenu ? (
                <svg width="6" height="8" viewBox="0 0 6 8" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M1 1L5 4L1 7V1Z" fill="#e8e8e8" />
                </svg>
              ) : item.shortcut ? (
                <span
                  style={{
                    color: isDisabled ? '#7a7a7a' : '#d0d0d0',
                    fontSize: '11px',
                    marginLeft: '16px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.shortcut}
                </span>
              ) : null}
            </button>

            {hasSubmenu && isHovered && (
              <div
                role="menu"
                aria-label={`${item.label} submenu`}
                style={{
                  position: 'absolute',
                  top: '-3px',
                  ...(openSubmenuLeft ? { right: '100%', marginRight: '-1px' } : { left: '100%', marginLeft: '-1px' }),
                  zIndex: 10001,
                  minWidth: '176px',
                  padding: '3px 0',
                  background: '#1f1f1f',
                  border: '1px solid #484848',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
                  color: '#e8e8e8',
                }}
              >
                {item.submenu.map((sub, subIdx) => {
                  if (sub.divider) {
                    return (
                      <div
                        key={`sub-divider-${subIdx}`}
                        role="separator"
                        style={{
                          height: '1px',
                          margin: '3px 2px',
                          background: '#383838',
                        }}
                      />
                    );
                  }
                  const subKey = sub.key || sub.label;
                  const subHovered = hoveredSubKey === subKey;
                  const subDisabled = Boolean(sub.disabled);
                  return (
                    <button
                      key={subKey}
                      type="button"
                      role={sub.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                      aria-checked={sub.checked !== undefined ? Boolean(sub.checked) : undefined}
                      disabled={subDisabled}
                      onMouseEnter={() => {
                        setHoveredSubKey(subKey);
                        if (subKey === 'bulk-summary') onIntent?.('summary', account);
                      }}
                      onClick={() => {
                        if (subDisabled) return;
                        sub.onSelect?.();
                        onClose?.();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        minHeight: '22px',
                        padding: '2px 10px 2px 6px',
                        border: 0,
                        background: subHovered && !subDisabled ? '#0078d7' : 'transparent',
                        color: subDisabled ? '#7a7a7a' : (subHovered ? '#ffffff' : '#e8e8e8'),
                        cursor: subDisabled ? 'default' : 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        fontSize: '11px',
                        fontWeight: 400,
                        gap: '10px',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span
                          style={{
                            width: '20px',
                            height: '16px',
                            flex: '0 0 20px',
                            marginRight: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <TradingAccountsMenuIcon name={sub.icon} checked={sub.checked} />
                        </span>
                        <span style={{ whiteSpace: 'nowrap' }}>{sub.label}</span>
                      </span>
                      {sub.shortcut && (
                        <span style={{ color: '#d0d0d0', fontSize: '11px' }}>{sub.shortcut}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (typeof document !== 'undefined') {
    const portalTarget =
      document.querySelector('.rtx5-command-shell') ||
      document.getElementById('root') ||
      document.body;
    return createPortal(menuNode, portalTarget);
  }
  return menuNode;
};

export default SidebarContextMenu;
