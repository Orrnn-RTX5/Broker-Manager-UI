import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  Activity, ArrowUpDown, BarChart2, ChevronDown, ClipboardList, Command, Copy,
  Expand, Folder, FolderOpen, Gavel, Handshake, History, Info, LayoutGrid,
  LogOut, MoreHorizontal, Plus, Printer, RefreshCw, Search, Settings2,
  Shield, TrendingUp, User, Users, X,
} from 'lucide-react';

import NewAccountModal from './Popups/NewAccountModal';
import AccountLimitModal from './Popups/AccountLimitModal';
import AccountDetailsModal from './Popups/AccountDetailsModal';
import useWorkspaceNavigation from '../hooks/useWorkspaceNavigation';

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

function ActionMenu({ label, icon: TriggerIcon = MoreHorizontal, actions, pathname }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="manager-action-menu" ref={menuRef}>
      <button
        type="button"
        className={`manager-toolbar-trigger ${actions.some((action) => matchesRoute(pathname, action)) ? 'is-active' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        {createElement(TriggerIcon, { size: 16, strokeWidth: 1.9 })}
        <span>{label}</span>
        <ChevronDown size={14} className={isOpen ? 'rotate-180' : ''} />
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
                onClick={() => { setIsOpen(false); action.onClick(); }}
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

const PrimaryLink = ({ action, pathname }) => {
  const Icon = action.icon;
  const active = typeof action.active === 'boolean'
    ? action.active
    : matchesRoute(pathname, action);
  return (
    <button
      type="button"
      onClick={action.onClick}
      className={`manager-primary-link ${active ? 'is-active' : ''}`}
      aria-pressed={typeof action.active === 'boolean' ? active : undefined}
    >
      <Icon size={16} strokeWidth={1.8} />
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
          <Search size={18} aria-hidden="true" />
          <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }} placeholder="Search commands, screens, and actions..." aria-label="Search commands" />
          <button type="button" onClick={onClose} aria-label="Close quick command menu"><X size={17} /></button>
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

  useEffect(() => {
    const close = (event) => {
      if (!lookupRef.current?.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onOpenChange]);

  const submit = (event) => {
    event?.preventDefault();
    if (!value.trim()) return;
    onOpen();
    onOpenChange(false);
  };

  return (
    <div className="manager-account-lookup" ref={lookupRef}>
      <button type="button" className="manager-account-lookup-trigger" onClick={() => onOpenChange(!isOpen)} aria-expanded={isOpen}>
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

const ToolBar = ({ toggleSidebar, isSidebarOpen, toggleRightSidebar, isRightSidebarOpen, toggleMarketData, isMarketDataOpen, resetLayout, onLogout }) => {
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [isAccountLimitModalOpen, setIsAccountLimitModalOpen] = useState(false);
  const [searchLoginId, setSearchLoginId] = useState('');
  const [activeSearchedAccount, setActiveSearchedAccount] = useState(null);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isAccountLookupOpen, setIsAccountLookupOpen] = useState(false);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useWorkspaceNavigation();
  const go = (path) => () => navigate(path);

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

  const accountPanelAction = {
    id: 'accounts-panel',
    label: `${isRightSidebarOpen ? 'Hide' : 'Show'} account panel`,
    icon: Users,
    tone: 'accent',
    shortcut: 'Ctrl L',
    active: Boolean(isRightSidebarOpen),
    onClick: toggleRightSidebar,
  };
  const primaryActions = [
    { id: 'dashboard', label: 'Overview', icon: BarChart2, category: 'Navigation', match: (path) => path === '/' || path === '/dashboard' || path === '/admin-dashboard', onClick: go('/dashboard') },
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
    { id: 'reset-layout', label: 'Reset workspace layout', icon: LayoutGrid, tone: 'default', onClick: resetLayout },
  ];
  const operations = [
    { id: 'dealing', label: 'Dealing', icon: Activity, tone: 'danger', path: '/dealing', onClick: go('/dealing') },
    { id: 'account-limits', label: 'Account limits', icon: Info, tone: 'info', onClick: () => setIsAccountLimitModalOpen(true) },
    { id: 'dealer-queue', label: 'Dealer queue', icon: Gavel, tone: 'warn', shortcut: 'Ctrl Q', path: '/dealer/queue', onClick: go('/dealer/queue') },
    { id: 'restricted-accounts', label: 'Restricted accounts', icon: Shield, tone: 'danger', path: '/dealer/restrictions', onClick: go('/dealer/restrictions') },
    { id: 'open-positions', label: 'Open positions', icon: TrendingUp, tone: 'ok', path: '/analytics/open-positions', onClick: go('/analytics/open-positions') },
    { id: 'open-orders', label: 'Open orders', icon: ClipboardList, tone: 'warn', path: '/analytics/open-orders', onClick: go('/analytics/open-orders') },
    { id: 'position-history', label: 'Position history', icon: History, tone: 'info', path: '/clients/positions', onClick: go('/clients/positions') },
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
  ];
  const commandActions = [
    { id: 'new-account-command', label: 'Create new account', icon: Plus, tone: 'accent', category: 'Quick action', shortcut: 'Ctrl Shift N', onClick: () => setIsNewAccountModalOpen(true) },
    { id: 'find-account-command', label: 'Find account by login', icon: Search, tone: 'info', category: 'Quick action', onClick: () => setIsAccountLookupOpen(true) },
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
      if (event.altKey && !commandKey && key === 'r') {
        event.preventDefault();
        fullscreen();
        return;
      }
      if (!commandKey) return;
      if (key === 'k') { event.preventDefault(); setIsCommandOpen((open) => !open); }
      if (key === 'r') { event.preventDefault(); refreshData(); }
      if (event.shiftKey && key === 'n') { event.preventDefault(); setIsNewAccountModalOpen(true); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, refreshData]);

  return (
    <>
      <nav className="manager-toolbar workspace-ui" aria-label="Primary workspace navigation">
        <div className="manager-toolbar-left">
          <ActionMenu label="Workspace" icon={LayoutGrid} actions={workspaceActions} pathname={location.pathname} />
          <span className="manager-toolbar-divider" />
          <div className="manager-primary-navigation">
            {primaryActions.map((action) => <PrimaryLink key={action.id} action={action} pathname={location.pathname} />)}
          </div>
          <ActionMenu label="Operations" icon={Gavel} actions={operations} pathname={location.pathname} />
          <ActionMenu label="Management" icon={Settings2} actions={management} pathname={location.pathname} />
        </div>

        <div className="manager-toolbar-right">
          <AccountLookup value={searchLoginId} onChange={(event) => setSearchLoginId(event.target.value)} onOpen={searchAccount} isOpen={isAccountLookupOpen} onOpenChange={setIsAccountLookupOpen} />
          <button type="button" className="manager-new-account" onClick={() => setIsNewAccountModalOpen(true)}>
            <Plus size={16} strokeWidth={2.2} /> <span>New account</span>
          </button>
          <button type="button" className="manager-command-trigger" onClick={() => setIsCommandOpen(true)} title="Quick commands (Ctrl K)">
            <Command size={16} /> <span>Quick search</span><kbd>Ctrl K</kbd>
          </button>
          <ActionMenu label="More" actions={utilities} pathname={location.pathname} />
          <button type="button" className="manager-logout" onClick={() => onLogout?.()} title="Logout" aria-label="Logout">
            <LogOut size={17} />
          </button>
        </div>
      </nav>

      <NewAccountModal isOpen={isNewAccountModalOpen} onClose={() => setIsNewAccountModalOpen(false)} />
      <AccountLimitModal isOpen={isAccountLimitModalOpen} onClose={() => setIsAccountLimitModalOpen(false)} />
      {activeSearchedAccount && <AccountDetailsModal account={activeSearchedAccount} onClose={() => setActiveSearchedAccount(null)} initialTab="Overview" />}
      {isCommandOpen && <CommandPalette onClose={() => setIsCommandOpen(false)} actions={commandActions} />}
    </>
  );
};

export default ToolBar;
