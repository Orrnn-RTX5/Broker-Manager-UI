import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  Activity, ArrowUpDown, BarChart2, Bug, ChevronDown, ClipboardList, Copy,
  Expand, Folder, FolderOpen, Gavel, Handshake, History, Info, LayoutGrid,
  Keyboard, Plus, Printer, RefreshCw, RotateCcw, Search, Settings2,
  PanelRightOpen, Shield, TrendingUp, User, Users, X,
} from 'lucide-react';

import AccountLimitModal from './Popups/AccountLimitModal';
import AccountDetailsModal from './Popups/AccountDetailsModal';
import KeyboardShortcutsModal from './Popups/KeyboardShortcutsModal';
import useWorkspaceNavigation from '../hooks/useWorkspaceNavigation';
import { requestOpenBugReport } from '../services/bugReportHistory.js';
import { getSidebarAccountsQueryOptions } from '../services/sidebarAccounts.js';
import { useI18nStore } from '../i18n/index.js';
import { usePermissions } from '../hooks/usePermissions.js';
import { useMultiScreenStore } from '../store/multiScreenStore';
import { PERMISSIONS } from '../utils/permissions.js';

const MANAGER_REFRESH_EVENT = 'manager:refresh-data';

const toneColor = {
  default: 'var(--text-3)', accent: 'var(--accent-text)', ok: 'var(--ok-text)',
  warn: 'var(--warn-text)', danger: 'var(--danger-text)', info: 'var(--info-text)',
};

const matchesRoute = (pathname, action) => (
  typeof action.match === 'function' ? action.match(pathname) : Boolean(action.path && pathname === action.path)
);

const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* use fallback */ }
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

function ActionMenu({
  id,
  label,
  title,
  icon: Icon,
  actions,
  pathname,
  onPrefetch,
  openId,
  onOpenChange,
  showLabel = true,
}) {
  const isOpen = openId === id;
  const menuRef = useRef(null);

  const prefetchActions = () => {
    actions.forEach((action) => {
      if (action.path) onPrefetch?.(action.path);
    });
  };

  const hasLabel = Boolean(showLabel && label);
  const resolvedTitle = title || label;

  return (
    <div className="manager-action-menu" data-menu={id} ref={menuRef}>
      <button
        type="button"
        className={`manager-toolbar-trigger ${!hasLabel ? 'is-icon-dropdown' : ''} ${isOpen ? 'is-open' : ''} ${actions.some((action) => matchesRoute(pathname, action)) ? 'is-active' : ''}`}
        title={resolvedTitle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          prefetchActions();
          onOpenChange(isOpen ? null : id);
        }}
      >
        {Icon ? <Icon size={15} strokeWidth={1.8} aria-hidden="true" /> : null}
        {hasLabel && <span>{label}</span>}
        <ChevronDown size={14} className={`manager-toolbar-chevron ${isOpen ? 'is-open' : ''}`} />
      </button>
      {isOpen && (
        <div className="manager-action-popover" role="menu">
          {actions.map((action) => {
            const Icon = action.icon;
            const active = matchesRoute(pathname, action);
            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                className={`manager-action-popover-item ${active ? 'is-active' : ''}`}
                onPointerDown={() => {
                  if (action.path) onPrefetch?.(action.path);
                }}
                onClick={() => {
                  onOpenChange(null);
                  action.onClick();
                }}
              >
                <Icon size={16} style={{ color: toneColor[action.tone] || toneColor.default }} strokeWidth={1.8} />
                <span>{action.label}</span>
                {action.shortcut && <kbd className="manager-menu-shortcut">{action.shortcut}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PrimaryLink = ({ action, pathname, onPrefetch }) => {
  const active = typeof action.active === 'boolean'
    ? action.active
    : matchesRoute(pathname, action);
  const Icon = action.icon;
  const handleIntent = () => {
    action.onPrefetch?.();
    if (action.path) onPrefetch?.(action.path);
    else if (action.id === 'dashboard') onPrefetch?.('/dashboard');
  };
  return (
    <button
      type="button"
      onClick={action.onClick}
      onPointerEnter={handleIntent}
      onPointerDown={handleIntent}
      onFocus={handleIntent}
      className={`manager-primary-link ${active ? 'is-active' : ''}`}
      title={action.label}
      aria-label={action.label}
      aria-pressed={typeof action.active === 'boolean' ? active : undefined}
    >
      {Icon ? <Icon size={16} strokeWidth={1.8} aria-hidden="true" /> : null}
      <span>{action.label}</span>
    </button>
  );
};


function CommandPalette({ onClose, actions }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const matchingActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return actions;
    return actions.filter((action) => `${action.label} ${action.category || ''}`.toLowerCase().includes(normalizedQuery));
  }, [actions, query]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, matchingActions.length - 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => Math.max(index - 1, 0)); }
      if (event.key === 'Enter' && matchingActions[selectedIndex]) {
        event.preventDefault();
        matchingActions[selectedIndex].onClick();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [matchingActions, onClose, selectedIndex]);

  return (
    <div className="manager-command-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="manager-command-palette" role="dialog" aria-modal="true" aria-label="Quick command menu" onMouseDown={(event) => event.stopPropagation()}>
        <div className="manager-command-input-wrap">
          <label className="manager-command-search-field">
            <Search size={20} strokeWidth={1.8} aria-hidden="true" />
            <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }} placeholder="Search commands, screens, and actions…" aria-label="Search commands" autoComplete="off" spellCheck={false} />
          </label>
          <button type="button" onClick={onClose} aria-label="Close quick command menu" title="Close (Esc)"><X size={18} strokeWidth={1.8} aria-hidden="true" /></button>
        </div>
        <div className="manager-command-results">
          {matchingActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button key={action.id} type="button" className={index === selectedIndex ? 'is-selected' : ''} onMouseEnter={() => setSelectedIndex(index)} onClick={() => { action.onClick(); onClose(); }}>
                <span className="manager-command-icon" style={{ color: toneColor[action.tone] || toneColor.default }}>{createElement(Icon, { size: 17, strokeWidth: 1.8 })}</span>
                <span className="manager-command-label"><strong>{action.label}</strong><small>{action.category}</small></span>
                {action.shortcut && <kbd>{action.shortcut}</kbd>}
              </button>
            );
          })}
          {!matchingActions.length && <div className="manager-command-empty">No matching commands.</div>}
        </div>
        <footer className="manager-command-footer"><span><kbd>↑↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></footer>
      </section>
    </div>
  );
}

function AccountLookup({ value, onChange, onOpen, isOpen, onOpenChange }) {
  const lookupRef = useRef(null);

  const submit = (event) => {
    event?.preventDefault();
    if (!value.trim()) return;
    onOpen();
    onOpenChange(false);
  };

  return (
    <div className="manager-account-lookup" ref={lookupRef}>
      <button
        type="button"
        className={`manager-account-lookup-trigger ${isOpen ? 'is-open' : ''}`}
        title="Find account"
        aria-label="Find account"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!isOpen);
        }}
      >
        <Search size={16} /> <span>Find account</span>
      </button>
      {isOpen && (
        <form className="manager-account-lookup-popover" onSubmit={submit}>
          <label htmlFor="manager-account-id">Account login</label>
          <div>
            <input id="manager-account-id" autoFocus value={value} onChange={onChange} placeholder="Enter login ID" inputMode="numeric" />
            <button type="submit">Open</button>
          </div>
        </form>
      )}
    </div>
  );
}

const ToolBar = ({
  toggleSidebar,
  isSidebarOpen,
  toggleRightSidebar,
  isRightSidebarOpen,
  toggleMarketData,
  isMarketDataOpen,
  toggleOwnerConsole,
  isOwnerConsoleOpen,
  resetLayout,
}) => {
  const openAccountScreen = useMultiScreenStore((state) => state.openAccountScreen);
  const [isAccountLimitModalOpen, setIsAccountLimitModalOpen] = useState(false);
  const [searchLoginId, setSearchLoginId] = useState('');
  const [activeSearchedAccount, setActiveSearchedAccount] = useState(null);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);
  const [openToolbarMenu, setOpenToolbarMenu] = useState(null);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useWorkspaceNavigation();
  const { canAct } = usePermissions();
  const canViewPositions = canAct(PERMISSIONS.VIEW_POSITIONS);
  const go = (path) => () => {
    navigate(path);
  };

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries();
    window.dispatchEvent(new Event(MANAGER_REFRESH_EVENT));
  }, [queryClient]);
  const fullscreen = useCallback(() => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(console.error);
    else document.exitFullscreen?.().catch?.(console.error);
  }, []);
  const searchAccount = () => {
    const login = searchLoginId.trim();
    if (!login) return;
    setActiveSearchedAccount(login);
    setSearchLoginId('');
  };

  const handleResetWorkspace = useCallback(() => {
    resetLayout?.();
    useI18nStore.getState().resetLanguage?.();
    if (location.pathname !== '/dashboard' && location.pathname !== '/') {
      navigate('/dashboard');
    }
  }, [resetLayout, navigate, location.pathname]);

  const accountPanelAction = {
    id: 'accounts-panel',
    label: `${isRightSidebarOpen ? 'Hide' : 'Show'} account panel`,
    icon: Users,
    tone: 'accent',
    shortcut: 'Ctrl L',
    active: Boolean(isRightSidebarOpen),
    onClick: toggleRightSidebar,
    onPrefetch: () => {
      queryClient.prefetchQuery(getSidebarAccountsQueryOptions('')).catch(() => undefined);
    },
  };
  const primaryActions = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart2, category: 'Navigation', match: (path) => path === '/' || path === '/dashboard' || path === '/admin-dashboard', onClick: go('/dashboard') },
    // The account panel replaces the top-level Clients link. Opening it mounts
    // the panel and triggers its account-data request.
    { ...accountPanelAction, id: 'accounts-panel-primary' },
    { id: 'accounts', label: 'Accounts', icon: User, path: '/clients/trading-accounts', onClick: go('/clients/trading-accounts') },
    {
      id: 'market-watch',
      label: 'Market Watch',
      icon: ArrowUpDown,
      tone: 'ok',
      shortcut: 'Ctrl M',
      active: Boolean(isMarketDataOpen),
      onClick: toggleMarketData,
    },
  ];
  const workspaceActions = [
    { id: 'navigator', label: `${isSidebarOpen ? 'Hide' : 'Show'} navigator`, icon: FolderOpen, tone: 'accent', shortcut: 'Alt N', onClick: toggleSidebar },
    { id: 'reset-layout', label: 'Reset workspace layout', icon: LayoutGrid, tone: 'default', shortcut: 'Alt T', onClick: handleResetWorkspace },
  ];
  const operations = [
    { id: 'dealing', label: 'Dealing', icon: Activity, tone: 'danger', path: '/dealing', onClick: go('/dealing') },
    { id: 'account-limits', label: 'Account limits', icon: Info, tone: 'info', onClick: () => setIsAccountLimitModalOpen(true) },
    { id: 'dealer-queue', label: 'Dealer queue', icon: Gavel, tone: 'warn', shortcut: 'Ctrl Q', path: '/dealer/queue', onClick: go('/dealer/queue') },
    { id: 'restricted-accounts', label: 'Restricted accounts', icon: Shield, tone: 'danger', path: '/dealer/restrictions', onClick: go('/dealer/restrictions') },
    ...(canViewPositions ? [{ id: 'open-positions', label: 'Open positions', icon: TrendingUp, tone: 'ok', path: '/analytics/open-positions', onClick: go('/analytics/open-positions') }] : []),
    { id: 'open-orders', label: 'Open orders', icon: ClipboardList, tone: 'warn', path: '/analytics/open-orders', onClick: go('/analytics/open-orders') },
    ...(canViewPositions ? [{ id: 'position-history', label: 'Position history', icon: History, tone: 'info', path: '/clients/positions', onClick: go('/clients/positions') }] : []),
    { id: 'orders', label: 'Orders', icon: ClipboardList, tone: 'warn', path: '/clients/orders', onClick: go('/clients/orders') },
  ];
  const management = [
    { id: 'ib-accounts', label: 'IB accounts', icon: Handshake, tone: 'ok', path: '/ib', onClick: go('/ib') },
    { id: 'groups', label: 'Groups', icon: Folder, tone: 'accent', path: '/groups', onClick: go('/groups') },
    { id: 'symbols', label: 'Symbols browser', icon: TrendingUp, tone: 'info', path: '/symbols', onClick: go('/symbols') },
    { id: 'symbol-management', label: 'Symbol management', icon: Settings2, tone: 'info', path: '/symbol-management', onClick: go('/symbol-management') },
  ];
  const utilities = [
    { id: 'refresh', label: 'Refresh data', icon: RefreshCw, tone: 'accent', shortcut: 'Ctrl R', onClick: refreshData },
    { id: 'fullscreen', label: 'Fullscreen', icon: Expand, shortcut: 'Alt R / F11', onClick: fullscreen },
    { id: 'print', label: 'Print current view', icon: Printer, onClick: () => window.print() },
    { id: 'copy-url', label: 'Copy current link', icon: Copy, tone: 'accent', onClick: () => copyText(window.location.href).catch(console.error) },
    { id: 'shortcut-toolbox', label: 'Toolbox', icon: Keyboard, tone: 'info', shortcut: 'Ctrl /', onClick: () => setIsKeyboardShortcutsOpen(true) },
  ];
  const commandActions = [
    { id: 'new-account-command', label: 'Create new account', icon: Plus, tone: 'accent', category: 'Quick action', shortcut: 'Ctrl Shift N', onClick: () => openAccountScreen() },
    { id: 'find-account-command', label: 'Find account by login', icon: Search, tone: 'info', category: 'Quick action', onClick: () => setOpenToolbarMenu('find-account') },
    ...primaryActions.map((action) => ({ ...action, category: 'Navigation' })),
    ...workspaceActions.map((action) => ({ ...action, category: 'Workspace' })),
    ...operations.map((action) => ({ ...action, category: 'Operations' })),
    ...management.map((action) => ({ ...action, category: 'Management' })),
    ...utilities.map((action) => ({ ...action, category: 'Utilities' })),
  ];

  useEffect(() => {
    const onKeyDown = (event) => {
      const commandKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (event.key === 'Escape') setOpenToolbarMenu(null);
      if (event.altKey && !commandKey && key === 'r') {
        event.preventDefault();
        fullscreen();
        return;
      }
      if (!commandKey) return;
      if (key === 'k') { event.preventDefault(); setIsCommandOpen((open) => !open); }
      if (key === 'r') { event.preventDefault(); refreshData(); }
      if (key === '/') { event.preventDefault(); setIsKeyboardShortcutsOpen(true); }
      if (event.shiftKey && key === 'n') { event.preventDefault(); openAccountScreen(); }
    };
    const onPointerDown = (event) => {
      if (!event.target.closest?.('.manager-toolbar')) setOpenToolbarMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [fullscreen, openAccountScreen, refreshData]);

  return (
    <>
      <nav className="manager-toolbar workspace-ui" aria-label="Primary workspace navigation">
        <div className="manager-toolbar-left">
          <ActionMenu id="workspace" label="Workspace" icon={LayoutGrid} actions={workspaceActions} pathname={location.pathname} onPrefetch={navigate.preload} openId={openToolbarMenu} onOpenChange={setOpenToolbarMenu} />
          <span className="manager-toolbar-divider" />
          <div className="manager-primary-navigation">
            {primaryActions.map((action) => (
              <PrimaryLink key={action.id} action={action} pathname={location.pathname} onPrefetch={navigate.preload} />
            ))}
          </div>
          <ActionMenu id="operations" label="Operations" icon={Activity} actions={operations} pathname={location.pathname} onPrefetch={navigate.preload} openId={openToolbarMenu} onOpenChange={setOpenToolbarMenu} />
          <ActionMenu id="management" label="Management" title="Management" icon={Settings2} actions={management} pathname={location.pathname} onPrefetch={navigate.preload} openId={openToolbarMenu} onOpenChange={setOpenToolbarMenu} />
        </div>

        <div className="manager-toolbar-right">
          <AccountLookup
            value={searchLoginId}
            onChange={(event) => setSearchLoginId(event.target.value)}
            onOpen={searchAccount}
            isOpen={openToolbarMenu === 'find-account'}
            onOpenChange={(open) => setOpenToolbarMenu(open ? 'find-account' : null)}
          />
          {!isOwnerConsoleOpen && (
            <button
              type="button"
              className="manager-primary-link manager-owner-console-toggle"
              onClick={toggleOwnerConsole}
              title="Open Owner Console"
              aria-label="Open Owner Console"
            >
              <PanelRightOpen size={17} strokeWidth={1.9} />
            </button>
          )}
          <button
            type="button"
            className="manager-primary-link"
            onClick={requestOpenBugReport}
            title="Report a Bug to the RTX5 platform team"
            aria-label="Report a Bug to the RTX5 platform team"
          >
            <Bug size={15} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="manager-primary-link manager-reset-layout"
            onClick={handleResetWorkspace}
            title="Reset workspace layout"
            aria-label="Reset workspace layout"
          >
            <RotateCcw size={15} strokeWidth={1.9} />
            <span>Reset</span>
          </button>
          <button type="button" className="manager-new-account" onClick={() => openAccountScreen()}>
            <Plus size={16} strokeWidth={2.2} /> <span>New account</span>
          </button>
        </div>
      </nav>

      <AccountLimitModal isOpen={isAccountLimitModalOpen} onClose={() => setIsAccountLimitModalOpen(false)} />
      {activeSearchedAccount && <AccountDetailsModal account={activeSearchedAccount} onClose={() => setActiveSearchedAccount(null)} initialTab="Overview" />}
      {isCommandOpen && <CommandPalette onClose={() => setIsCommandOpen(false)} actions={commandActions} />}
      {isKeyboardShortcutsOpen && <KeyboardShortcutsModal onClose={() => setIsKeyboardShortcutsOpen(false)} />}
    </>
  );
};

export default ToolBar;
