import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  Activity, BarChart2, ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck,
  FileClock, Folder, Gavel, GitBranch, Handshake, Landmark, LayoutDashboard,
  Award, BookOpen, Code, FileText, Globe, GraduationCap, Headphones, Mail,
  Lock, LogIn, Megaphone, MessageSquare, Network, Newspaper, Plus, Search, ShoppingBag,
  Server, Settings2, Shield, ShieldCheck, TrendingUp, Unplug, User, Users, Users2, X,
} from 'lucide-react';
import { useGroupList } from '../hooks/useGroupList';
import useWorkspaceNavigation from '../hooks/useWorkspaceNavigation';
import { usePermissions } from '../hooks/usePermissions';
import { getBrokerInfo } from '../services/brokerAuth';
import NewGroupModal from '../features/groups/components/NewGroupModal';
import { getGroupDetailsPath } from '../features/groups/groupRoutes';
import { PERMISSIONS } from '../utils/permissions';
import { preloadAnalyticsDestination } from '../features/analytics/analyticsQueries.js';
import { preloadWorkspaceDestination } from '../features/workspaceQueries.js';
import { SERVER_REPORT_FOLDERS } from './serverReportNavigation.js';
import { APP_STORE_CATEGORIES, SUPPORT_ARTICLE_CATEGORIES } from './supportNavigation.js';

const RenameIcon = ({ size = 14, color = '#38bdf8' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ color, flexShrink: 0 }}
    aria-hidden="true"
  >
    <path d="M4 3H2V13H4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 3H14V13H12" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.5 6.5H10.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <path d="M5.5 9.5H10.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const SERVER_CONTEXT_MENU_ITEMS = [
  { action: 'connect', label: 'Connect to the Server', icon: LogIn, tone: 'connect', shortcut: 'Enter' },
  { action: 'disconnect', label: 'Disconnect from the Server', icon: Unplug, disabled: true },
];

const DAILY_REPORT_CONTEXT_MENU_ITEMS = [
  { action: 'connect', label: 'Connect to the Server', icon: LogIn, tone: 'connect', shortcut: 'Enter' },
  { action: 'disconnect', label: 'Disconnect from the Server', icon: Unplug, tone: 'danger' },
  { separator: true },
  { action: 'change-password', label: 'Change Password', icon: Lock, tone: 'password' },
  { action: 'delete-account', label: 'Delete the Account', icon: X, tone: 'danger', shortcut: 'Delete' },
];

const NavigatorContextMenu = ({ x, y, items, ariaLabel, onClose, isAnalyticsMenu }) => {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [flipSubmenuLeft, setFlipSubmenuLeft] = useState(false);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 8;
    const menuWidth = menu.offsetWidth || 272;
    const menuHeight = menu.offsetHeight || 360;
    const clampedLeft = Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin));
    const clampedTop = Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin));
    setPosition({
      left: clampedLeft,
      top: clampedTop,
    });
    setFlipSubmenuLeft(clampedLeft + menuWidth + 200 > window.innerWidth);
    menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (activeSubmenu) {
          setActiveSubmenu(null);
          return;
        }
        onClose();
        return;
      }
      if (event.key === 'ArrowRight') {
        const activeEl = document.activeElement;
        const row = activeEl?.closest('.cc-server-context-menu-row');
        const action = row?.dataset?.action;
        const item = items.find((i) => i.action === action);
        if (item?.hasSubmenu) {
          event.preventDefault();
          setActiveSubmenu(action);
          setTimeout(() => {
            row?.querySelector('.cc-context-submenu [role="menuitem"]:not(:disabled)')?.focus();
          }, 0);
        }
        return;
      }
      if (event.key === 'ArrowLeft') {
        const activeEl = document.activeElement;
        const inSubmenu = activeEl?.closest('.cc-context-submenu');
        if (inSubmenu) {
          event.preventDefault();
          const parentRow = inSubmenu.closest('.cc-server-context-menu-row');
          setActiveSubmenu(null);
          parentRow?.querySelector('.cc-server-context-menu-item')?.focus();
        }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const currentContainer = document.activeElement?.closest('.cc-context-submenu') || menuRef.current;
      const enabledItems = Array.from(
        currentContainer?.querySelectorAll(':scope > .cc-server-context-menu-row > [role="menuitem"]:not(:disabled), :scope > [role="menuitem"]:not(:disabled)') || []
      );
      if (!enabledItems.length) return;
      event.preventDefault();
      const currentIndex = enabledItems.indexOf(document.activeElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? enabledItems.length - 1
          : event.key === 'ArrowUp'
            ? (currentIndex <= 0 ? enabledItems.length - 1 : currentIndex - 1)
            : (currentIndex + 1) % enabledItems.length;
      enabledItems[nextIndex].focus();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, activeSubmenu, items]);

  const portalRoot = document.querySelector('.rtx5-command-shell') || document.body;

  return createPortal(
    <div
      ref={menuRef}
      className={`cc-server-context-menu ${isAnalyticsMenu ? 'is-analytics-menu' : ''}`}
      role="menu"
      aria-label={ariaLabel}
      style={position}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
    >
      {items.map((item) => {
        if (item.separator) return <div key="separator" className="cc-server-context-menu-separator" role="separator" />;
        const Icon = item.icon;
        const isSubmenuOpen = activeSubmenu === item.action;
        return (
          <div
            key={item.action}
            className="cc-server-context-menu-row"
            data-action={item.action}
            onMouseEnter={() => {
              if (item.hasSubmenu) setActiveSubmenu(item.action);
              else setActiveSubmenu(null);
            }}
          >
            <button
              type="button"
              className="cc-server-context-menu-item"
              data-action={item.action}
              data-tone={item.tone}
              role="menuitem"
              aria-haspopup={item.hasSubmenu ? 'menu' : undefined}
              aria-expanded={item.hasSubmenu ? isSubmenuOpen : undefined}
              aria-disabled={item.disabled || undefined}
              disabled={item.disabled}
              tabIndex={item.disabled ? -1 : item.action === 'connect' || item.action === 'add' ? 0 : -1}
              onClick={() => {
                if (item.disabled) return;
                item.onClick?.();
                onClose();
              }}
            >
              {Icon ? (
                <Icon size={14} strokeWidth={1.7} aria-hidden="true" />
              ) : (
                <i className="cc-menu-empty-icon" aria-hidden="true" />
              )}
              <span>{item.label}</span>
              {item.shortcut && (
                <kbd className={item.plainShortcut ? 'cc-menu-shortcut-plain' : undefined}>
                  {item.shortcut}
                </kbd>
              )}
              {item.hasSubmenu && <span className="cc-menu-arrow" aria-hidden="true">▶</span>}
            </button>
            {item.hasSubmenu && isSubmenuOpen && item.submenuItems && (
              <div
                className={`cc-context-submenu ${flipSubmenuLeft ? 'flip-left' : ''}`}
                role="menu"
                aria-label={item.label}
              >
                {item.submenuItems.map((sub) => (
                  <button
                    key={sub.action}
                    type="button"
                    className="cc-server-context-menu-item"
                    data-action={sub.action}
                    role="menuitem"
                    onClick={() => {
                      sub.onClick?.();
                      onClose();
                    }}
                  >
                    <span>{sub.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>,
    portalRoot,
  );
};

const TreeNode = ({ label, icon: Icon, children, defaultExpanded = false, count, path, activePath, disabled, disabledReason = 'Workspace adapter not connected yet', onClickNode, onExpandedChange, onIntent, onContextMenu }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = Children.count(children) > 0;
  // Clients and IB Tree are separate destinations, not child views of their
  // neighboring list pages. Only detail routes inherit a list highlight.
  const active = path && (
    activePath === path
    || (path === '/symbols' && activePath.startsWith('/symbols/'))
    || (path === '/ib' && /^\/ib\/\d+(?:\/|$)/.test(activePath))
  );
  const activate = (event) => {
    if (disabled) return;
    if (hasChildren) {
      const next = !expanded;
      setExpanded(next);
      onExpandedChange?.(next);
    }
    onClickNode?.(event);
  };
  return (
    <div className={`cc-tree-node ${hasChildren ? 'is-branch' : 'is-leaf'} ${active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <div role="treeitem" tabIndex={disabled ? -1 : 0} aria-expanded={hasChildren ? expanded : undefined} aria-disabled={disabled || undefined} aria-haspopup={onContextMenu ? 'menu' : undefined} title={disabled ? `${label} — ${disabledReason}` : label} onClick={activate} onPointerEnter={onIntent} onFocus={onIntent} onContextMenu={disabled ? undefined : onContextMenu} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); } }}>
        <span className="cc-tree-chevron">{hasChildren ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
        <span className="cc-tree-icon">{Icon && <Icon size={13} strokeWidth={1.65} />}</span>
        <span>{label}</span>{count != null && <b>{count}</b>}
      </div>
      {hasChildren && expanded && <div className="cc-tree-children">{children}</div>}
    </div>
  );
};

export default function NavigatorPanel() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useWorkspaceNavigation();
  const [loadGroups, setLoadGroups] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const { groups, total, loading } = useGroupList({ limit: 100, offset: 0, sort_by: 'name', sort_dir: 'asc', enabled: loadGroups });
  const { canAct, manager } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const [brokerInfo] = useState(() => getBrokerInfo());
  const serverLabel = brokerInfo?.name || brokerInfo?.broker_id || 'Nexa';
  const managerLogin = String(manager.login ?? '').trim();
  const dailyReportLabel = managerLogin ? `(${managerLogin})- Daily Report` : 'Daily Report';
  const go = (path) => () => navigate(path);
  const [navigatorContextMenu, setNavigatorContextMenu] = useState(null);
  const closeNavigatorContextMenu = useCallback(() => setNavigatorContextMenu(null), []);
  const openNavigatorContextMenu = useCallback((event, type) => {
    event.preventDefault();
    event.stopPropagation();
    setNavigatorContextMenu({ x: event.clientX, y: event.clientY, type });
  }, []);
  const openServerContextMenu = useCallback((event) => openNavigatorContextMenu(event, 'server'), [openNavigatorContextMenu]);
  const openDailyReportContextMenu = useCallback((event) => openNavigatorContextMenu(event, 'daily-report'), [openNavigatorContextMenu]);
  const openTradingAnalyticsContextMenu = useCallback((event) => openNavigatorContextMenu(event, 'analytics'), [openNavigatorContextMenu]);

  const analyticsContextMenuItems = useMemo(() => [
    { action: 'add', label: 'Add', icon: Plus, tone: 'add', shortcut: 'Insert', plainShortcut: true },
    { action: 'add-folder', label: 'Add Folder', icon: Folder, tone: 'folder', shortcut: 'Alt+Insert', plainShortcut: true },
    { action: 'rename', label: 'Rename', icon: RenameIcon, tone: 'rename', shortcut: 'F2', plainShortcut: true },
    { action: 'delete', label: 'Delete', icon: X, tone: 'danger', shortcut: 'Delete', plainShortcut: true },
    { separator: true },
    { action: 'preset-trading-accounts', label: 'Add Preset Trading Accounts', onClick: () => navigate('/analytics/trading-accounts') },
    { action: 'preset-online-users', label: 'Add Preset Online Users', onClick: () => navigate('/analytics/online-users') },
    { action: 'preset-open-positions', label: 'Add Preset Open Positions', onClick: () => navigate('/analytics/open-positions') },
    { action: 'preset-open-orders', label: 'Add Preset Open Orders', onClick: () => navigate('/analytics/open-orders') },
    { action: 'preset-advertising-campaigns', label: 'Add Preset Advertising Campaigns', onClick: () => navigate('/analytics/advertising-campaigns') },
    { action: 'preset-by-country', label: 'Add Preset By Country', onClick: () => navigate('/analytics/by-country') },
    {
      action: 'preset-finteza-website',
      label: 'Add Preset Finteza Website',
      hasSubmenu: true,
      onClick: () => navigate('/analytics/advertising-campaigns?source=website'),
      submenuItems: [
        { action: 'finteza-traffic', label: 'Overview & Traffic', onClick: () => navigate('/analytics/advertising-campaigns?source=website') },
        { action: 'finteza-audience', label: 'Audience & Geography', onClick: () => navigate('/analytics/by-country?source=website') },
        { action: 'finteza-conversions', label: 'Conversions & Goals', onClick: () => navigate('/analytics/advertising-campaigns?source=goals') },
        { action: 'finteza-funnel', label: 'E-Commerce Funnel', onClick: () => navigate('/analytics/advertising-campaigns?source=funnel') },
      ],
    },
    {
      action: 'preset-finteza-campaign',
      label: 'Add Preset Finteza Campaign',
      hasSubmenu: true,
      onClick: () => navigate('/analytics/advertising-campaigns?view=sources'),
      submenuItems: [
        { action: 'finteza-sources', label: 'Advertising Sources', onClick: () => navigate('/analytics/advertising-campaigns?view=sources') },
        { action: 'finteza-utm', label: 'UTM Campaigns', onClick: () => navigate('/analytics/advertising-campaigns?view=utm') },
        { action: 'finteza-banners', label: 'Ad Banners Performance', onClick: () => navigate('/analytics/advertising-campaigns?view=banners') },
        { action: 'finteza-roi', label: 'Cost & ROI Tracking', onClick: () => navigate('/analytics/advertising-campaigns?view=roi') },
      ],
    },
  ], [navigate]);

  const node = (label, icon, path, preload = 'workspace', onContextMenu) => (
    <TreeNode key={label} label={label} icon={icon} path={path} activePath={location.pathname} onIntent={() => preload === 'analytics' ? preloadAnalyticsDestination(queryClient, path) : preloadWorkspaceDestination(queryClient, path)} onClickNode={go(path)} onContextMenu={onContextMenu} />
  );

  useEffect(() => {
    const start = () => setLoadGroups(true);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(start, 1000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="cc-navigator workspace-ui" role="tree" aria-label="Brokerage workspaces">
      <div className="cc-navigator-scroll">
        <TreeNode label="Servers" icon={Server} defaultExpanded>
          <TreeNode label={serverLabel} icon={Server} defaultExpanded onContextMenu={openServerContextMenu}>
            {node(dailyReportLabel, FileClock, '/reports/daily', 'workspace', openDailyReportContextMenu)}
          </TreeNode>
          <TreeNode label="RTX5-Demo" icon={Server} />
          <TreeNode label="Backup Servers" icon={Network} disabled />
        </TreeNode>

        <TreeNode label="Analytics" icon={BarChart2} defaultExpanded onContextMenu={openTradingAnalyticsContextMenu}>
          {node('Dashboard', LayoutDashboard, '/dashboard', 'analytics')}
          {node('Trading Analytics', TrendingUp, '/analytics/trading-accounts', 'analytics', openTradingAnalyticsContextMenu)}
          {node('Online Users', Users, '/analytics/online-users', 'analytics', openTradingAnalyticsContextMenu)}
          {node('Open Positions', Activity, '/analytics/open-positions', 'analytics', openTradingAnalyticsContextMenu)}
          {node('Open Orders', ClipboardCheck, '/analytics/open-orders', 'analytics', openTradingAnalyticsContextMenu)}
          {node('Advertising Campaigns', Megaphone, '/analytics/advertising-campaigns', 'analytics', openTradingAnalyticsContextMenu)}
          {node('By Country', Globe, '/analytics/by-country', 'analytics', openTradingAnalyticsContextMenu)}
        </TreeNode>

        <TreeNode label="Server Reports" icon={FileClock} defaultExpanded>
          {SERVER_REPORT_FOLDERS.map(({ label, reports }) => (
            <TreeNode key={label} label={label} icon={Folder}>
              {reports.map((report) => (
                <TreeNode key={report} label={report} icon={FileClock} disabled disabledReason="Report not available yet" />
              ))}
            </TreeNode>
          ))}
        </TreeNode>

        <TreeNode label="Clients & Orders" icon={Users} defaultExpanded>
          {node('Online Users', Users, '/clients/online-users')}
          {node('Clients', User, '/clients')}
          {node('Trading Accounts', User, '/clients/trading-accounts')}
          {node('Positions', Activity, '/analytics/open-positions', 'analytics')}
          {node('Orders', ClipboardCheck, '/clients/orders')}
          {node('Position History', FileClock, '/clients/positions')}
        </TreeNode>

        <TreeNode label="Ultency Matching Engine" icon={Network} disabled disabledReason="Matching engine workspace not available yet" />

        <TreeNode label="Dealing" icon={Gavel} defaultExpanded>
          {node('Dealing Desk', Activity, '/dealing')}
          {node('Dealer Queue', Gavel, '/dealer/queue')}
          <TreeNode label="Price Management" icon={TrendingUp} disabled />
          <TreeNode label="Liquidity Providers" icon={Network} disabled />
        </TreeNode>

        <TreeNode label="IB Management" icon={Handshake} defaultExpanded>
          {node('IB Accounts', Handshake, '/ib')}
          {node('IB Tree', GitBranch, '/ib/tree')}
          <TreeNode label="Commissions" icon={CircleDollarSign} disabled />
          <TreeNode label="Payouts" icon={Landmark} disabled />
        </TreeNode>

        <TreeNode label="Risk Management" icon={Shield} defaultExpanded>
          {node('Exposure', Activity, '/analytics/open-positions')}
          <TreeNode label="Margin Rules" icon={Settings2} disabled />
          {node('Restricted Accounts', Shield, '/dealer/restrictions')}
        </TreeNode>

        <TreeNode label="Compliance" icon={ShieldCheck}>
          <TreeNode label="KYC / AML" icon={ShieldCheck} disabled />
          <TreeNode label="Verification Queue" icon={ClipboardCheck} disabled />
          <TreeNode label="Approval Queue" icon={ClipboardCheck} disabled />
          <TreeNode label="Audit Review" icon={FileClock} disabled />
        </TreeNode>

        <TreeNode label="Finance" icon={Landmark}>
          <TreeNode label="Deposits / Withdrawals" icon={CircleDollarSign} disabled />
          <TreeNode label="Revenue & Payouts" icon={Landmark} disabled />
          <TreeNode label="Cash Flow" icon={Activity} disabled />
        </TreeNode>

        <TreeNode label="Markets" icon={TrendingUp}>
          {node('Symbols Browser', TrendingUp, '/symbols')}
          {node('Symbol Management', Settings2, '/symbol-management')}
        </TreeNode>

        <TreeNode label="Account Groups" icon={Users2} count={loadGroups ? (loading ? '…' : total ?? groups.length) : null} onExpandedChange={(open) => open && setLoadGroups(true)}>
          {groups.map((group) => <TreeNode key={group.name} label={group.name} icon={Folder} path={getGroupDetailsPath(group.name)} activePath={location.pathname} onClickNode={go(getGroupDetailsPath(group.name))} />)}
          {canManageGroups && <TreeNode label="New Group" icon={Users2} onClickNode={() => setNewGroupOpen(true)} />}
        </TreeNode>

        <TreeNode label="Mailbox" icon={Mail} disabled disabledReason="Mailbox not available yet" />

        <TreeNode label="Support Center" icon={Headphones}>
          <TreeNode label="News" icon={Newspaper} disabled disabledReason="Support news not available yet" />
          <TreeNode label="Articles" icon={BookOpen}>
            {SUPPORT_ARTICLE_CATEGORIES.map((category) => (
              <TreeNode key={category} label={category} icon={FileText} disabled disabledReason="Support articles not available yet" />
            ))}
          </TreeNode>
          <TreeNode label="Talks" icon={MessageSquare} disabled disabledReason="Support discussions not available yet" />
          <TreeNode label="Platform Documentation" icon={BookOpen} disabled disabledReason="Platform documentation not available yet" />
          <TreeNode label="API Documentation" icon={Code} disabled disabledReason="API documentation not available yet" />
          <TreeNode label="Workshops" icon={GraduationCap} disabled disabledReason="Workshops not available yet" />
          <TreeNode label="Certification" icon={Award} disabled disabledReason="Certification not available yet" />
          <TreeNode label="Service Desk" icon={Headphones} disabled disabledReason="Service desk not available yet" />
          <TreeNode label="Online Assistant" icon={MessageSquare} disabled disabledReason="Online assistant not available yet" />
          <TreeNode label="Search" icon={Search} disabled disabledReason="Support search not available yet" />
        </TreeNode>

        <TreeNode label="App Store" icon={ShoppingBag}>
          {APP_STORE_CATEGORIES.map((category) => (
            <TreeNode key={category} label={category} icon={ShoppingBag} disabled disabledReason="App store listings not available yet" />
          ))}
        </TreeNode>

        <TreeNode label="System" icon={Settings2}>
          <TreeNode label="Servers" icon={Server} disabled />
          <TreeNode label="Users & Permissions" icon={Users} disabled />
          <TreeNode label="Configuration" icon={Settings2} disabled />
          <TreeNode label="API Connections" icon={Network} disabled />
          <TreeNode label="Audit Logs" icon={FileClock} disabled />
        </TreeNode>
      </div>
      {navigatorContextMenu && (
        <NavigatorContextMenu
          x={navigatorContextMenu.x}
          y={navigatorContextMenu.y}
          isAnalyticsMenu={navigatorContextMenu.type === 'analytics'}
          items={
            navigatorContextMenu.type === 'daily-report'
              ? DAILY_REPORT_CONTEXT_MENU_ITEMS
              : navigatorContextMenu.type === 'analytics'
                ? analyticsContextMenuItems
                : SERVER_CONTEXT_MENU_ITEMS
          }
          ariaLabel={
            navigatorContextMenu.type === 'daily-report'
              ? 'Daily Report actions'
              : navigatorContextMenu.type === 'analytics'
                ? 'Trading Analytics actions'
                : `${serverLabel} connection actions`
          }
          onClose={closeNavigatorContextMenu}
        />
      )}
      {newGroupOpen && canManageGroups && <NewGroupModal onClose={() => setNewGroupOpen(false)} onSuccess={() => setNewGroupOpen(false)} />}
    </div>
  );
}
