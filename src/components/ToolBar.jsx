import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  Activity,
  AppWindow,
  ArrowUpDown,
  BarChart2,
  ClipboardList,
  Copy,
  Folder,
  FolderOpen,
  Gavel,
  Handshake,
  History,
  Info,
  LayoutGrid,
  LogOut,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  TrendingUp,
  User,
  Users,
  Users2,
} from 'lucide-react';

import NewAccountModal from './Popups/NewAccountModal';
import AccountLimitModal from './Popups/AccountLimitModal';
import AccountDetailsModal from './Popups/AccountDetailsModal';
import useWorkspaceNavigation from '../hooks/useWorkspaceNavigation';

const MANAGER_REFRESH_EVENT = 'manager:refresh-data';

const toneColor = {
  default: 'var(--text-3)',
  accent: 'var(--accent)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  info: 'var(--info)',
};

const ToolButton = ({
  icon,
  label,
  text,
  tone = 'default',
  active = false,
  disabled = false,
  onClick,
  title,
}) => {
  const [hover, setHover] = useState(false);
  const IconComponent = icon;
  const color = toneColor[tone] || toneColor.default;
  const resolvedTitle = title || label;

  const bg = disabled
    ? 'transparent'
    : active
      ? 'var(--accent-soft)'
      : hover
        ? 'var(--surface-3)'
        : 'transparent';

  return (
    <button
      type="button"
      title={resolvedTitle}
      aria-label={resolvedTitle}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md select-none transition-colors"
      style={{
        background: bg,
        border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <IconComponent size={16} style={{ color }} strokeWidth={1.75} aria-hidden="true" />
      {text && (
        <span
          className="text-[12px] pr-1 font-medium"
          style={{ color: disabled ? 'var(--muted)' : 'var(--text-2)' }}
        >
          {text}
        </span>
      )}
    </button>
  );
};

const ToolSeparator = () => (
  <div className="h-5 w-px mx-1 shrink-0" style={{ background: 'var(--border)' }} />
);

const matchesRoute = (pathname, action) => {
  if (typeof action.match === 'function') return action.match(pathname);
  return Boolean(action.path && pathname === action.path);
};

const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the legacy copy path when clipboard permissions fail.
    }
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

const ToolBar = ({
  toggleSidebar,
  isSidebarOpen,
  toggleRightSidebar,
  isRightSidebarOpen,
  toggleMarketData,
  resetLayout,
  onLogout,
}) => {
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [isAccountLimitModalOpen, setIsAccountLimitModalOpen] = useState(false);
  const [searchLoginId, setSearchLoginId] = useState('');
  const [activeSearchedAccount, setActiveSearchedAccount] = useState(null);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useWorkspaceNavigation();

  const navigateTo = (path) => () => navigate(path);

  const handleRefreshData = () => {
    queryClient.invalidateQueries();
    window.dispatchEvent(new Event(MANAGER_REFRESH_EVENT));
  };

  const handleSearchAccount = () => {
    const login = searchLoginId.trim();
    if (!login) return;
    setActiveSearchedAccount(login);
    setSearchLoginId('');
  };

  const handleCopyUrl = () => {
    copyText(window.location.href).catch((error) => {
      console.error('Failed to copy current URL', error);
    });
  };

  const handlePrint = () => window.print();

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
      return;
    }
    document.exitFullscreen?.().catch?.(console.error);
  };

  const actionGroups = [
    [
      {
        id: 'navigator',
        label: 'Navigator',
        title: 'Toggle Navigator panel',
        icon: FolderOpen,
        tone: 'warn',
        active: isSidebarOpen,
        onClick: toggleSidebar,
      },
      {
        id: 'accounts-panel',
        label: 'Accounts Panel',
        title: 'Toggle Accounts panel',
        icon: Users,
        tone: 'accent',
        active: isRightSidebarOpen,
        onClick: toggleRightSidebar,
      },
      {
        id: 'market-watch',
        label: 'Market Watch',
        icon: ArrowUpDown,
        tone: 'ok',
        onClick: toggleMarketData,
      },
      {
        id: 'reset-layout',
        label: 'Reset Layout',
        icon: LayoutGrid,
        tone: 'accent',
        onClick: resetLayout,
      },
    ],
    [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: BarChart2,
        tone: 'accent',
        path: '/dashboard',
        match: (pathname) => pathname === '/' || pathname === '/dashboard' || pathname === '/admin-dashboard',
      },
      { id: 'clients', label: 'Clients', icon: Users2, tone: 'accent', path: '/clients' },
      { id: 'trading-accounts', label: 'Trading Accounts', icon: User, tone: 'accent', path: '/clients/trading-accounts' },
      { id: 'open-positions', label: 'Open Positions', icon: TrendingUp, tone: 'ok', path: '/analytics/open-positions' },
      { id: 'open-orders', label: 'Open Orders', icon: ClipboardList, tone: 'warn', path: '/analytics/open-orders' },
      { id: 'position-history', label: 'Position History', icon: History, tone: 'info', path: '/clients/positions' },
      { id: 'orders', label: 'Orders', icon: ClipboardList, tone: 'warn', path: '/clients/orders' },
      { id: 'deals', label: 'Deals', icon: Activity, tone: 'danger', path: '/dealing' },
    ],
    [
      {
        id: 'new-account',
        label: 'New Account',
        icon: Plus,
        tone: 'ok',
        text: 'New',
        onClick: () => setIsNewAccountModalOpen(true),
      },
      {
        id: 'account-limits',
        label: 'Account Limits',
        icon: Info,
        tone: 'info',
        onClick: () => setIsAccountLimitModalOpen(true),
      },
      { id: 'dealer-queue', label: 'Dealer Queue', icon: Gavel, tone: 'warn', path: '/dealer/queue' },
      { id: 'restricted-accounts', label: 'Restricted Accounts', icon: Shield, tone: 'danger', path: '/dealer/restrictions' },
    ],
    [
      { id: 'ib-accounts', label: 'IB Accounts', icon: Handshake, tone: 'ok', path: '/ib' },
      { id: 'groups', label: 'Groups', icon: Folder, tone: 'accent', path: '/groups' },
      { id: 'symbols', label: 'Symbols Browser', icon: TrendingUp, tone: 'info', path: '/symbols' },
      { id: 'symbol-management', label: 'Symbol Management', icon: Settings2, tone: 'info', path: '/symbol-management' },
    ],
    [
      { id: 'fullscreen', label: 'Fullscreen', icon: AppWindow, onClick: handleFullscreen },
      { id: 'print', label: 'Print', icon: Printer, onClick: handlePrint },
      { id: 'copy-url', label: 'Copy URL', icon: Copy, tone: 'accent', onClick: handleCopyUrl },
      { id: 'refresh-data', label: 'Refresh Data', icon: RefreshCw, onClick: handleRefreshData },
    ],
  ];

  const renderAction = (action) => {
    const onClick = action.onClick || (action.path ? navigateTo(action.path) : undefined);

    return (
      <ToolButton
        key={action.id}
        icon={action.icon}
        label={action.label}
        text={action.text}
        title={action.title}
        tone={action.tone}
        active={action.active ?? matchesRoute(location.pathname, action)}
        disabled={!onClick}
        onClick={onClick}
      />
    );
  };

  return (
    <>
      <div
        className="h-11 flex items-center px-2 overflow-x-auto"
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center w-full h-full gap-0.5 whitespace-nowrap min-w-max">
          {actionGroups.map((group, index) => (
            <span key={group.map((action) => action.id).join('-')} className="contents">
              {index > 0 && <ToolSeparator />}
              {group.map(renderAction)}
            </span>
          ))}

          <div className="flex items-center h-full ml-auto pl-2 gap-0.5">
            <ToolSeparator />
            <div
              className="flex items-center ml-1 h-7 w-56 rounded-md transition-colors"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-3)',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <Search size={13} style={{ color: 'var(--muted)' }} className="ml-2" aria-hidden="true" />
              <input
                type="text"
                value={searchLoginId}
                onChange={(event) => setSearchLoginId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSearchAccount();
                }}
                placeholder="Search login id..."
                aria-label="Search account by login ID"
                className="h-full w-full px-2 text-[12px] focus:outline-none"
                style={{ background: 'transparent', color: 'var(--text)' }}
              />
              <button
                type="button"
                onClick={handleSearchAccount}
                title="Open account details"
                aria-label="Open account details"
                className="px-2 h-full flex items-center rounded-r-md transition-colors"
                style={{ color: 'var(--muted)', cursor: 'pointer' }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = 'var(--accent-soft)';
                  event.currentTarget.style.color = 'var(--accent-text)';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                  event.currentTarget.style.color = 'var(--muted)';
                }}
              >
                <span className="text-[11px] font-medium">Go</span>
              </button>
            </div>
            <ToolButton
              icon={LogOut}
              label="Logout"
              text="Logout"
              tone="danger"
              onClick={() => onLogout?.()}
            />
          </div>
        </div>
      </div>

      <NewAccountModal isOpen={isNewAccountModalOpen} onClose={() => setIsNewAccountModalOpen(false)} />
      <AccountLimitModal isOpen={isAccountLimitModalOpen} onClose={() => setIsAccountLimitModalOpen(false)} />

      {activeSearchedAccount && (
        <AccountDetailsModal
          account={activeSearchedAccount}
          onClose={() => setActiveSearchedAccount(null)}
          initialTab="Overview"
        />
      )}
    </>
  );
};

export default ToolBar;
