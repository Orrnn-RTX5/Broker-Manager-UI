import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { buildTradingAccountsContextMenuItems } from './tradingAccountsContextMenuModel';

export const TradingAccountsMenuIcon = memo(function TradingAccountsMenuIcon({ name, checked }) {
  switch (name) {
    case 'new-account':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2.5V13.5M2.5 8H13.5" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'account-details':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="3.2" width="13" height="10" rx="1.4" fill="#3898ff" />
          <rect x="6.2" y="2" width="3.6" height="2" rx="0.6" fill="#1f1f1f" stroke="#3898ff" strokeWidth="1" />
          <circle cx="5.2" cy="7.1" r="1.35" fill="#e8f3ff" />
          <path d="M3.1 11.4c.35-1.35 1.15-2 2.1-2s1.75.65 2.1 2" stroke="#e8f3ff" strokeWidth="1.15" strokeLinecap="round" />
          <line x1="8.8" y1="6.6" x2="12.7" y2="6.6" stroke="#e8f3ff" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="8.8" y1="8.8" x2="12.7" y2="8.8" stroke="#e8f3ff" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="8.8" y1="10.9" x2="11.6" y2="10.9" stroke="#e8f3ff" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'mail':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.8" y="3.3" width="12.4" height="9.4" rx="1" stroke="#e08e26" strokeWidth="1.25" />
          <path d="M2.2 4.1L8 8.6L13.8 4.1" stroke="#e08e26" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'notification':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 2.2a3.7 3.7 0 0 0-3.7 3.7v2.3c0 .9-.38 1.68-1.08 2.18l-.32.22h10.2l-.32-.22A2.68 2.68 0 0 1 11.7 8.2V5.9A3.7 3.7 0 0 0 8 2.2Z"
            stroke="#e08e26"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path d="M6.6 12.2a1.45 1.45 0 0 0 2.8 0" stroke="#e08e26" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      );
    case 'export':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M12.6 9.2A5.2 5.2 0 1 1 8.8 3"
            stroke="#22c55e"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M8.5 7.5L13.6 2.4M10.4 2.4H13.6V5.6"
            stroke="#22c55e"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'import':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M12.6 9.2A5.2 5.2 0 1 1 8.8 3"
            stroke="#22c55e"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M13.6 2.4L8.5 7.5M11.7 7.5H8.5V4.3"
            stroke="#22c55e"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'find':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="6.8" cy="6.8" r="4.3" stroke="#2b99ff" strokeWidth="1.35" />
          <path d="M10.1 10.1L13.8 13.8" stroke="#2b99ff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'delete':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'charges':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3.1 6.2A5.2 5.2 0 0 1 12.6 5.2" stroke="#2b99ff" strokeWidth="1.25" strokeLinecap="round" />
          <path d="M12.8 2.9V5.4H10.3" stroke="#2b99ff" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12.9 9.8A5.2 5.2 0 0 1 3.4 10.8" stroke="#2b99ff" strokeWidth="1.25" strokeLinecap="round" />
          <path d="M3.2 13.1V10.6H5.7" stroke="#2b99ff" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M8 4.8v6.4M9.4 6.2c0-.65-.63-1-1.4-1-.78 0-1.4.38-1.4.95 0 1.15 2.8.7 2.8 1.9 0 .6-.62.98-1.4.98-.82 0-1.45-.38-1.45-1.02"
            stroke="#2b99ff"
            strokeWidth="1.15"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'check-balance':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5.6" stroke="#22c55e" strokeWidth="1.3" />
          <path d="M5.4 8.1L7.2 9.9L10.8 6.3" stroke="#22c55e" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'fix-balance':
    case 'customize':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="2.1" stroke="#2b99ff" strokeWidth="1.25" />
          <path
            d="M6.85 1.8h2.3l.32 1.48c.38.13.73.33 1.04.58l1.43-.48 1.15 1.98-1.11 1c.06.21.09.42.09.64s-.03.43-.09.64l1.11 1-1.15 1.98-1.43-.48c-.31.25-.66.45-1.04.58l-.32 1.48h-2.3l-.32-1.48a4.5 4.5 0 0 1-1.04-.58l-1.43.48-1.15-1.98 1.11-1A3.9 3.9 0 0 1 3.93 8c0-.22.03-.43.09-.64l-1.11-1 1.15-1.98 1.43.48c.31-.25.66-.45 1.04-.58L6.85 1.8Z"
            stroke="#2b99ff"
            strokeWidth="1.15"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'filter-none':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          {checked !== false && (
            <rect
              x="0.5"
              y="0.5"
              width="17"
              height="17"
              fill="rgba(255, 255, 255, 0.04)"
              stroke="#9ca3af"
              strokeWidth="1"
            />
          )}
          <rect
            x="4"
            y="4"
            width="10"
            height="10"
            stroke="#2b99ff"
            strokeWidth="1.2"
            strokeDasharray="1.6 1.4"
          />
        </svg>
      );
    case 'fix-personal-data':
    case 'copy-list-of-logins':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="4.8" r="2.3" stroke="#2b99ff" strokeWidth="1.3" />
          <path d="M3.4 13.2c.55-2.4 2.2-3.6 4.6-3.6s4.05 1.2 4.6 3.6H3.4Z" stroke="#2b99ff" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      );
    case 'copy-lines':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M5.2 12H3.1C2.77 12 2.5 11.73 2.5 11.4V2.4C2.5 2.07 2.77 1.8 3.1 1.8H9.2C9.53 1.8 9.8 2.07 9.8 2.4V3.8"
            stroke="#2b99ff"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M5.8 3.8H10.9L13.5 6.4V13.6C13.5 13.93 13.23 14.2 12.9 14.2H5.8C5.47 14.2 5.2 13.93 5.2 13.6V4.4C5.2 4.07 5.47 3.8 5.8 3.8Z"
            stroke="#2b99ff"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M10.7 3.8V6.5H13.5" stroke="#2b99ff" strokeWidth="1.15" strokeLinejoin="round" />
        </svg>
      );
    case 'logins-clipboard':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3.2" y="3" width="9.6" height="11" rx="1.1" stroke="#8e8e93" strokeWidth="1.2" />
          <path d="M6 3V2.2C6 1.76 6.36 1.4 6.8 1.4H9.2C9.64 1.4 10 1.76 10 2.2V3" stroke="#8e8e93" strokeWidth="1.2" />
          <rect x="5.2" y="5.5" width="5.6" height="6.4" rx="0.5" stroke="#8e8e93" strokeWidth="1" />
        </svg>
      );
    case 'logins-file':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3.5 2.2H9.8L12.8 5.2V13.4C12.8 13.84 12.44 14.2 12 14.2H3.5C3.06 14.2 2.7 13.84 2.7 13.4V3C2.7 2.56 3.06 2.2 3.5 2.2Z"
            stroke="#2b99ff"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path d="M9.6 2.2V5.4H12.8" stroke="#2b99ff" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    default:
      if (checked) {
        return <Check size={12} strokeWidth={2.4} color="#f4f4f5" aria-hidden="true" />;
      }
      return null;
  }
});

const TradingAccountsContextMenu = memo(function TradingAccountsContextMenu({
  x = 0,
  y = 0,
  onClose,
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
  onOpenAccountSummary,
  onOpenAccountRestrictions,
  onCharges,
  onCheckBalance,
  onFixBalance,
  onFixPersonalData,
  onBlockAccount,
  onUnblockAccount,
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
}) {
  const menuRef = useRef(null);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [hoveredSubKey, setHoveredSubKey] = useState(null);

  const items = useMemo(
    () =>
      buildTradingAccountsContextMenuItems({
        selectedRow,
        rows,
        grid,
        groupFilter,
        countryFilter,
        autoScroll,
        autoArrange,
        showGrid,
        canEditAccounts,
        onNewAccount,
        onOpenAccountDetails,
        onOpenAccountSummary,
        onOpenAccountRestrictions,
        onCharges,
        onCheckBalance,
        onFixBalance,
        onFixPersonalData,
        onBlockAccount,
        onUnblockAccount,
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
      }),
    [
      selectedRow,
      rows,
      grid,
      groupFilter,
      countryFilter,
      autoScroll,
      autoArrange,
      showGrid,
      canEditAccounts,
      onNewAccount,
      onOpenAccountDetails,
      onOpenAccountSummary,
      onOpenAccountRestrictions,
      onCharges,
      onCheckBalance,
      onFixBalance,
      onFixPersonalData,
      onBlockAccount,
      onUnblockAccount,
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
    ]
  );

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose?.();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
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
      className="rtx-mt5-context-menu trading-accounts-context-menu"
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
        padding: '4px',
        background: '#1c1e22',
        border: '1px solid #383c44',
        borderRadius: '4px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.58), 0 0 0 1px rgba(255, 255, 255, 0.03) inset',
        color: '#e6e8ec',
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '11px',
        fontWeight: 400,
        lineHeight: '16px',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
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
                margin: '4px 4px',
                background: '#2c3038',
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
                minHeight: '23px',
                padding: '2px 10px 2px 6px',
                border: 0,
                outline: 'none',
                borderRadius: '3px',
                background: isHovered && !isDisabled ? '#1b65b8' : 'transparent',
                color: isDisabled ? '#6e7683' : (isHovered ? '#ffffff' : '#e6e8ec'),
                cursor: isDisabled ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontSize: '11px',
                fontWeight: 400,
                gap: '12px',
                transition: 'background-color 90ms ease, color 90ms ease',
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
                  <path d="M1 1L5 4L1 7V1Z" fill={isHovered ? '#ffffff' : '#9ca3af'} />
                </svg>
              ) : item.shortcut ? (
                <span
                  style={{
                    color: isDisabled ? '#6e7683' : (isHovered ? '#e2e8f0' : '#9ca3af'),
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
                  top: '-4px',
                  ...(openSubmenuLeft ? { right: '100%', marginRight: '2px' } : { left: '100%', marginLeft: '2px' }),
                  zIndex: 10001,
                  minWidth: '182px',
                  padding: '4px',
                  background: '#1c1e22',
                  border: '1px solid #383c44',
                  borderRadius: '4px',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.58), 0 0 0 1px rgba(255, 255, 255, 0.03) inset',
                  color: '#e6e8ec',
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
                          margin: '4px 4px',
                          background: '#2c3038',
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
                      onMouseEnter={() => setHoveredSubKey(subKey)}
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
                        minHeight: '23px',
                        padding: '2px 10px 2px 6px',
                        border: 0,
                        borderRadius: '3px',
                        background: subHovered && !subDisabled ? '#1b65b8' : 'transparent',
                        color: subDisabled ? '#6e7683' : (subHovered ? '#ffffff' : '#e6e8ec'),
                        cursor: subDisabled ? 'default' : 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        fontSize: '11px',
                        fontWeight: 400,
                        gap: '10px',
                        transition: 'background-color 90ms ease, color 90ms ease',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        <span
                          style={{
                            width: '20px',
                            height: '18px',
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
      document.querySelector('.rtx5-command-shell')
      || document.getElementById('root')
      || document.body;
    return createPortal(menuNode, portalTarget);
  }
  return menuNode;
});

export default TradingAccountsContextMenu;
