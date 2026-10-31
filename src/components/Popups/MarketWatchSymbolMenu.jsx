import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';

const Mt5MenuIcon = memo(function Mt5MenuIcon({ name, checked }) {
  switch (name) {
    case 'properties':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M6.8 1.5h2.4l.4 1.7a5.2 5.2 0 0 1 1.3.7l1.6-.6 1.2 2.1-1.3 1.1a5.3 5.3 0 0 1 0 1.5l1.3 1.1-1.2 2.1-1.6-.6a5.2 5.2 0 0 1-1.3.7l-.4 1.7H6.8l-.4-1.7a5.2 5.2 0 0 1-1.3-.7l-1.6.6-1.2-2.1 1.3-1.1a5.3 5.3 0 0 1 0-1.5L2.3 5.4l1.2-2.1 1.6.6a5.2 5.2 0 0 1 1.3-.7l.4-1.7Z"
            stroke="#2b99ff"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="8" r="2.1" stroke="#2b99ff" strokeWidth="1.2" />
        </svg>
      );
    case 'raw-quotes':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 5.2L5 2.5L8 5.2" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M1.5 8.2C3.2 6.6 5.2 6.6 7 8.2C8.8 9.8 10.8 9.8 14.5 7.2" stroke="#2b99ff" strokeWidth="1.35" strokeLinecap="round" />
          <path d="M7.5 11.2L10.5 13.8L13.5 11.2" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'details':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 6L4.5 3.3L7 6" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 10L4.5 12.7L7 10" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="9" y1="4.5" x2="14.5" y2="4.5" stroke="#2b99ff" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="9" y1="8" x2="14.5" y2="8" stroke="#2b99ff" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="9" y1="11.5" x2="14.5" y2="11.5" stroke="#2b99ff" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'tick-chart':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M1.5 8.5H4.2L6.1 3.5L9.1 12.5L11.2 7.5H14.5"
            stroke="#2b99ff"
            strokeWidth="1.45"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'dom':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="5.5" cy="3.5" r="1.1" fill="#767676" />
          <rect x="8.5" y="2.6" width="5" height="1.8" rx="0.5" stroke="#767676" strokeWidth="1.1" />
          <circle cx="5.5" cy="6.5" r="1.1" fill="#767676" />
          <rect x="8.5" y="5.6" width="5" height="1.8" rx="0.5" stroke="#767676" strokeWidth="1.1" />
          <rect x="2.5" y="8.6" width="5" height="1.8" rx="0.5" stroke="#767676" strokeWidth="1.1" />
          <circle cx="10.2" cy="9.5" r="1.1" fill="#767676" />
          <rect x="2.5" y="11.6" width="5" height="1.8" rx="0.5" stroke="#767676" strokeWidth="1.1" />
          <circle cx="10.2" cy="12.5" r="1.1" fill="#767676" />
        </svg>
      );
    case 'specification':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1" stroke="#2b99ff" strokeWidth="1.25" />
          <line x1="1.8" y1="5.2" x2="14.2" y2="5.2" stroke="#2b99ff" strokeWidth="1.15" />
          <circle cx="4.3" cy="8" r="0.85" fill="#2b99ff" />
          <line x1="6.4" y1="8" x2="12.2" y2="8" stroke="#2b99ff" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="4.3" cy="10.8" r="0.85" fill="#2b99ff" />
          <line x1="6.4" y1="10.8" x2="12.2" y2="10.8" stroke="#2b99ff" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'symbols':
      return (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1" stroke="#e08e26" strokeWidth="1.25" fill="rgba(224, 142, 38, 0.1)" />
          <path
            d="M8 4.2v7.6M9.8 5.8c0-.9-.8-1.4-1.8-1.4s-1.8.5-1.8 1.3c0 1.7 3.6 1.1 3.6 2.9 0 .9-.8 1.4-1.8 1.4s-1.8-.5-1.8-1.4"
            stroke="#e08e26"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
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
    default:
      if (checked) {
        return <Check size={12} strokeWidth={2.4} color="#f4f4f5" aria-hidden="true" />;
      }
      return null;
  }
});

export const MarketWatchContextMenu = memo(function MarketWatchContextMenu({
  menu,
  onClose,
}) {
  const menuRef = useRef(null);
  const [hoverState, setHoverState] = useState({ menuRef: null, key: null, subKey: null });

  const hoveredKey = hoverState.menuRef === menu ? hoverState.key : null;
  const hoveredSubKey = hoverState.menuRef === menu ? hoverState.subKey : null;

  useEffect(() => {
    if (!menu) return undefined;
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;
  const menuWidth = Number(menu.minWidth) > 0 ? Number(menu.minWidth) : 204;
  const estimatedHeight = Math.min(viewportH - 16, (menu.items?.length || 10) * 21 + 16);
  const left = Math.max(4, Math.min(menu.x, viewportW - menuWidth - 8));
  const top = Math.max(4, Math.min(menu.y, viewportH - estimatedHeight - 8));
  const openSubmenuLeft = left + menuWidth + 168 > viewportW;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={menu.label || 'Market Watch context menu'}
      className="rtx-mt5-context-menu"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 9999,
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
      {menu.items.map((item, idx) => {
        if (item.divider) {
          return (
            <div
              key={`divider-${idx}`}
              role="separator"
              style={{
                height: '1px',
                margin: '4px 6px',
                background: '#484848',
              }}
            />
          );
        }

        const itemKey = item.key || item.label;
        const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
        const isHovered = hoveredKey === itemKey;
        const isDisabled = Boolean(item.disabled);
        const isMuted = Boolean(item.muted) && !isHovered;

        return (
          <div
            key={itemKey}
            style={{ position: 'relative' }}
            onMouseEnter={() => {
              setHoverState({ menuRef: menu, key: itemKey, subKey: null });
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
                  setHoverState({ menuRef: menu, key: itemKey, subKey: null });
                  return;
                }
                item.onSelect?.();
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                minHeight: '22px',
                padding: '2px 8px 2px 5px',
                border: 0,
                background: isHovered && !isDisabled ? '#333333' : 'transparent',
                color: isDisabled || isMuted ? '#7a7a7a' : '#e8e8e8',
                cursor: isDisabled ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                fontSize: '11px',
                fontWeight: 400,
                gap: '10px',
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
                    background: item.icon && item.checked ? 'rgba(43, 153, 255, 0.18)' : 'transparent',
                    borderRadius: '2px',
                  }}
                >
                  <Mt5MenuIcon name={item.icon} checked={item.checked} />
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
                    color: isDisabled || isMuted ? '#7a7a7a' : '#d0d0d0',
                    fontSize: '11px',
                    marginLeft: '14px',
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
                  zIndex: 10000,
                  minWidth: '152px',
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
                  return (
                    <button
                      key={subKey}
                      type="button"
                      role={sub.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                      aria-checked={sub.checked !== undefined ? Boolean(sub.checked) : undefined}
                      disabled={Boolean(sub.disabled)}
                      onMouseEnter={() => setHoverState({ menuRef: menu, key: itemKey, subKey })}
                      onClick={() => {
                        if (sub.disabled) return;
                        sub.onSelect?.();
                        onClose();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        minHeight: '22px',
                        padding: '2px 10px 2px 5px',
                        border: 0,
                        background: subHovered && !sub.disabled ? '#333333' : 'transparent',
                        color: sub.disabled ? '#7a7a7a' : '#e8e8e8',
                        cursor: sub.disabled ? 'default' : 'pointer',
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
                          {sub.checked ? <Check size={12} strokeWidth={2.4} color="#f4f4f5" aria-hidden="true" /> : null}
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
});

export const MarketWatchSymbolsModal = memo(function MarketWatchSymbolsModal({
  open,
  symbols = [],
  hiddenSymbols = new Set(),
  onToggleSymbolVisibility,
  onShowAll,
  onHideAll,
  onOpenSpecification,
  onClose,
}) {
  const [filterText, setFilterText] = useState('');
  const [selectedSym, setSelectedSym] = useState('');

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return symbols.filter((item) => {
      const sym = String(item.symbol || item || '').toLowerCase();
      const desc = String(item.description || item.category || '').toLowerCase();
      return !q || sym.includes(q) || desc.includes(q);
    });
  }, [filterText, symbols]);

  if (!open) return null;

  const activeSym = selectedSym || (filtered[0]?.symbol ?? filtered[0] ?? '');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Symbols"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.56)',
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        fontSize: '11px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 94vw)',
          maxHeight: 'min(480px, 88vh)',
          display: 'flex',
          flexDirection: 'column',
          background: '#1f1f1f',
          border: '1px solid #484848',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65)',
          color: '#e8e8e8',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '26px',
            padding: '0 10px',
            background: '#292929',
            borderBottom: '1px solid #3c3c3c',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Mt5MenuIcon name="symbols" />
            <span>Symbols</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Symbols dialog"
            style={{
              border: 0,
              background: 'transparent',
              color: '#e8e8e8',
              cursor: 'pointer',
              fontSize: '14px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '8px 10px', borderBottom: '1px solid #333333', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '24px',
              padding: '0 8px',
              background: '#161616',
              border: '1px solid #3c3c3c',
            }}
          >
            <Search size={12} color="#9ca3af" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search symbol or description..."
              aria-label="Filter symbols"
              style={{
                flex: 1,
                border: 0,
                outline: 0,
                background: 'transparent',
                color: '#e8e8e8',
                fontSize: '11px',
              }}
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText('')}
                style={{ border: 0, background: 'transparent', color: '#9ca3af', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => activeSym && onToggleSymbolVisibility?.(activeSym)}
            style={{
              height: '24px',
              padding: '0 10px',
              background: '#2b2b2b',
              border: '1px solid #484848',
              color: '#e8e8e8',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            {activeSym && hiddenSymbols.has(activeSym) ? 'Show Symbol' : 'Hide Symbol'}
          </button>
          <button
            type="button"
            onClick={onShowAll}
            style={{
              height: '24px',
              padding: '0 10px',
              background: '#2b2b2b',
              border: '1px solid #484848',
              color: '#e8e8e8',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Show All
          </button>
          <button
            type="button"
            onClick={() => onHideAll?.(activeSym)}
            style={{
              height: '24px',
              padding: '0 10px',
              background: '#2b2b2b',
              border: '1px solid #484848',
              color: '#e8e8e8',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Hide All
          </button>
        </div>

        <div style={{ flex: 1, minHeight: '220px', maxHeight: '340px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#262626', color: '#b8b8b8', position: 'sticky', top: 0 }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #383838', width: '42%' }}>Symbol</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #383838', width: '38%' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #383838', width: '20%' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const sym = String(entry.symbol || entry || '');
                const isHidden = hiddenSymbols.has(sym);
                const isSelected = activeSym === sym;
                return (
                  <tr
                    key={sym}
                    onClick={() => setSelectedSym(sym)}
                    onDoubleClick={() => onToggleSymbolVisibility?.(sym)}
                    style={{
                      background: isSelected ? '#0060a8' : 'transparent',
                      color: isHidden && !isSelected ? '#7a7a7a' : '#e8e8e8',
                      cursor: 'pointer',
                      borderBottom: '1px solid #2a2a2a',
                    }}
                  >
                    <td style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '2px',
                          background: isHidden ? '#4b5563' : '#e08e26',
                          display: 'inline-block',
                        }}
                      />
                      <span>{sym}</span>
                    </td>
                    <td style={{ padding: '4px 8px' }}>{isHidden ? 'Hidden' : 'Visible in Market Watch'}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSpecification?.(sym);
                        }}
                        style={{
                          border: '1px solid #484848',
                          background: '#2b2b2b',
                          color: '#e8e8e8',
                          padding: '1px 6px',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        Spec
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
