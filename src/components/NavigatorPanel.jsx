import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  Activity, BarChart2, ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck,
  FileClock, Folder, Gavel, GitBranch, Handshake, Landmark, LayoutDashboard,
  Award, BookOpen, Code, FileText, Globe, GraduationCap, Headphones, Mail,
  Lock, LogIn, Megaphone, MessageSquare, Network, Newspaper, Plus, RotateCcw, Search, ShoppingBag,
  Server, Settings2, Shield, ShieldCheck, TrendingUp, Unplug, User, Users, Users2, X,
} from 'lucide-react';
import { useAllGroups } from '../hooks/useAllGroups';
import useWorkspaceNavigation from '../hooks/useWorkspaceNavigation';
import { usePermissions } from '../hooks/usePermissions';
import { BROKER_INFO_UPDATED_EVENT, getBrokerInfo } from '../services/brokerAuth';
import NewGroupModal from '../features/groups/components/NewGroupModal';
import GroupPermissionNotice from '../features/groups/components/GroupPermissionNotice';
import { getGroupsFolderPath, getGroupsSelectedFromSearch } from '../features/groups/groupRoutes';
import { buildGroupNavigatorTree, getGroupParentPath } from '../features/groups/groupTree.js';
import { accountsByGroupName, countAccountsByGroup } from '../features/groups/groupAccountRows.js';
import { AccountMark, GroupFolderIcon } from '../features/groups/groupMarks.jsx';
import { getSidebarAccountsQueryOptions } from '../services/sidebarAccounts.js';
import { PERMISSIONS } from '../utils/permissions';
import { preloadAnalyticsDestination } from '../features/analytics/analyticsQueries.js';
import { preloadWorkspaceDestination } from '../features/workspaceQueries.js';
import { SERVER_REPORT_FOLDERS } from './serverReportNavigation.js';
import { APP_STORE_CATEGORIES, SUPPORT_ARTICLE_CATEGORIES } from './supportNavigation.js';
import {
  loadAnalyticsTree,
  saveAnalyticsTree,
  insertNode,
  updateNode,
  deleteNode,
  generateUniqueName,
  findNodeInfo,
  getIconComponent,
  PRESET_ANALYTICS_DEFINITIONS,
  restoreDefaultPresets,
} from './analyticsNavigatorState.js';
import DeleteConfirmModal from './DeleteConfirmModal.jsx';
import UndoToast from './UndoToast.jsx';

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

// Sweep SUI-M7: none of these entries has a real handler in scope (server
// session control lives in MenuBar; no password/delete-account flow exists
// for server/report nodes), so every entry stays disabled with an explicit
// reason instead of rendering a dead clickable item. Do NOT add onClick
// stubs here — wire a real handler or keep the item disabled.
const SERVER_CONTEXT_MENU_ITEMS = [
  { action: 'connect', label: 'Connect to the Server', icon: LogIn, tone: 'connect', shortcut: 'Enter', disabled: true, disabledReason: 'Server connection is not available from the navigator yet' },
  { action: 'disconnect', label: 'Disconnect from the Server', icon: Unplug, disabled: true, disabledReason: 'Server disconnection is not available from the navigator yet' },
];

const DAILY_REPORT_CONTEXT_MENU_ITEMS = [
  { action: 'connect', label: 'Connect to the Server', icon: LogIn, tone: 'connect', shortcut: 'Enter', disabled: true, disabledReason: 'Server connection is not available from the navigator yet' },
  { action: 'disconnect', label: 'Disconnect from the Server', icon: Unplug, tone: 'danger', disabled: true, disabledReason: 'Server disconnection is not available from the navigator yet' },
  { separator: true },
  { action: 'change-password', label: 'Change Password', icon: Lock, tone: 'password', disabled: true, disabledReason: 'Password change is not available yet' },
  { action: 'delete-account', label: 'Delete the Account', icon: X, tone: 'danger', shortcut: 'Delete', disabled: true, disabledReason: 'Account deletion is not available from the navigator yet' },
];

const NavigatorContextMenu = ({ x, y, items, ariaLabel, onClose, isAnalyticsMenu }) => {
  const menuRef = useRef(null);
  const [activeSubmenu, setActiveSubmenu] = useState(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 8;
    const menuWidth = menu.offsetWidth || 272;
    const menuHeight = menu.offsetHeight || 360;
    const clampedLeft = Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin));
    const clampedTop = Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin));
    menu.style.left = `${clampedLeft}px`;
    menu.style.top = `${clampedTop}px`;
    menu.classList.toggle('flip-submenu-left', clampedLeft + menuWidth + 200 > window.innerWidth);
    menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [x, y, isAnalyticsMenu]);

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
      style={{ left: x, top: y }}
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
              title={item.disabled && item.disabledReason ? `${item.label} — ${item.disabledReason}` : undefined}
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
                className="cc-context-submenu"
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

const RenameInput = ({ initialValue, onCommit, onCancel }) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleCommit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = value.trim();
    if (trimmed) {
      onCommit?.(trimmed);
    } else {
      onCancel?.();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      handleCommit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      committedRef.current = true;
      onCancel?.();
    } else {
      event.stopPropagation();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="cc-tree-rename-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
};

const TreeNode = ({
  label,
  icon: Icon,
  children,
  defaultExpanded = false,
  expandedProp,
  count,
  path,
  activePath,
  disabled,
  disabledReason = 'Workspace adapter not connected yet',
  onClickNode,
  onExpandedChange,
  onIntent,
  onContextMenu,
  isEditing = false,
  onRenameCommit,
  onRenameCancel,
  onStartRename,
  onDelete,
  onAddFile,
  onAddFolder,
  iconClassName,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = expandedProp !== undefined;
  const expanded = isControlled ? expandedProp : internalExpanded;
  const hasChildren = Children.count(children) > 0;
  // Clients and IB Tree are separate destinations, not child views of their
  // neighboring list pages. Only detail routes inherit a list highlight.
  const active = path && (
    activePath === path
    || (path === '/symbols' && activePath.startsWith('/symbols/'))
    || (path === '/ib' && /^\/ib\/\d+(?:\/|$)/.test(activePath))
  );
  const activate = (event) => {
    if (disabled || isEditing) return;
    const isChevron = Boolean(event?.target?.closest?.('.cc-tree-chevron'));
    if (hasChildren) {
      if (isChevron) {
        const next = !expanded;
        if (!isControlled) setInternalExpanded(next);
        onExpandedChange?.(next);
        return;
      }
      if (!expanded) {
        if (!isControlled) setInternalExpanded(true);
        onExpandedChange?.(true);
      }
    }
    onClickNode?.(event);
  };
  return (
    <div className={`cc-tree-node ${hasChildren ? 'is-branch' : 'is-leaf'} ${active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <div
        role="treeitem"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-disabled={disabled || undefined}
        aria-haspopup={onContextMenu ? 'menu' : undefined}
        title={disabled ? `${label} — ${disabledReason}` : label}
        onClick={activate}
        onPointerEnter={onIntent}
        onFocus={onIntent}
        onContextMenu={disabled ? undefined : onContextMenu}
        onKeyDown={(event) => {
          if (isEditing) return;
          if (event.key === 'F2') {
            event.preventDefault();
            onStartRename?.();
          } else if (event.key === 'Delete') {
            event.preventDefault();
            onDelete?.();
          } else if (event.key === 'Insert' && event.altKey) {
            event.preventDefault();
            onAddFolder?.();
          } else if (event.key === 'Insert') {
            event.preventDefault();
            onAddFile?.();
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate(event);
          }
        }}
      >
        <span className="cc-tree-chevron">{hasChildren ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
        <span className="cc-tree-icon">{Icon && <Icon size={13} strokeWidth={iconClassName ? 1.25 : 1.65} className={iconClassName} fill={iconClassName ? 'currentColor' : 'none'} />}</span>
        {isEditing ? (
          <RenameInput initialValue={label} onCommit={onRenameCommit} onCancel={onRenameCancel} />
        ) : (
          <span>{label}</span>
        )}
        {count != null && <b>{count}</b>}
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
  const [groupPermissionDenied, setGroupPermissionDenied] = useState(false);
  const { groups, loading } = useAllGroups({ enabled: loadGroups });
  const accountsQuery = useQuery({ ...getSidebarAccountsQueryOptions(''), enabled: loadGroups });
  const accountCounts = useMemo(() => countAccountsByGroup(accountsQuery.data?.rows), [accountsQuery.data]);
  const accountsByGroup = useMemo(() => accountsByGroupName(accountsQuery.data?.rows), [accountsQuery.data]);
  const groupTree = useMemo(() => buildGroupNavigatorTree(groups), [groups]);
  const selectedGroup = getGroupsSelectedFromSearch(location.search);
  const currentWorkspacePath = `${location.pathname}${location.search}`;
  const { canAct, manager } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const canViewPositions = canAct(PERMISSIONS.VIEW_POSITIONS);
  const [brokerInfo, setBrokerInfoState] = useState(() => getBrokerInfo());
  useEffect(() => {
    const syncBrokerInfo = () => setBrokerInfoState(getBrokerInfo());
    window.addEventListener(BROKER_INFO_UPDATED_EVENT, syncBrokerInfo);
    return () => window.removeEventListener(BROKER_INFO_UPDATED_EVENT, syncBrokerInfo);
  }, []);
  const serverLabel = brokerInfo?.broker_name || brokerInfo?.name || brokerInfo?.broker_id || 'Broker';
  const managerLogin = String(manager.login ?? '').trim();
  const dailyReportLabel = managerLogin ? `(${managerLogin})- Daily Report` : 'Daily Report';
  const go = (path) => () => navigate(path);
  // Every group is a folder. Ones with subgroups show how many groups are inside.
  // Ones that hold accounts directly show how many accounts, and open that list.
  const renderGroupTreeNode = (node) => {
    if (node.type === 'group') {
      const groupKey = String(node.group?.name || node.path).trim().toLowerCase();
      const groupPath = getGroupsFolderPath(getGroupParentPath(node.path), node.path);
      const accounts = accountsByGroup.get(groupKey) || [];
      const accountCount = accounts.length || accountCounts.get(groupKey) || 0;
      return (
        <TreeNode
          key={node.id}
          label={node.label}
          icon={GroupFolderIcon}
          iconClassName="groups-icon-folder"
          count={accountCount > 0 ? accountCount : null}
          path={groupPath}
          activePath={currentWorkspacePath}
          defaultExpanded={node.path === selectedGroup}
          onClickNode={() => navigate(groupPath, { state: { openGroupAccounts: true } })}
        >
          {accounts.map((account) => (
            <TreeNode
              key={`${node.id}:${account.login}`}
              label={account.login}
              icon={AccountMark}
              iconClassName="groups-nav-account"
              activePath={currentWorkspacePath}
              onClickNode={() => navigate(groupPath, { state: { openGroupAccounts: true, openAccountLogin: account.login } })}
            />
          ))}
        </TreeNode>
      );
    }
    return (
      <TreeNode key={node.id} label={node.label} icon={GroupFolderIcon} iconClassName="groups-icon-folder" count={node.count} path={getGroupsFolderPath(node.path)} activePath={currentWorkspacePath} onClickNode={go(getGroupsFolderPath(node.path))}>
        {node.children.map((child) => renderGroupTreeNode(child))}
      </TreeNode>
    );
  };

  // Dynamic analytics tree state
  const [analyticsTree, setAnalyticsTree] = useState(() => loadAnalyticsTree());
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set());

  const [navigatorContextMenu, setNavigatorContextMenu] = useState(null);
  const closeNavigatorContextMenu = useCallback(() => setNavigatorContextMenu(null), []);
  const openNavigatorContextMenu = useCallback((event, type, targetItem = null) => {
    event.preventDefault();
    event.stopPropagation();
    setNavigatorContextMenu({ x: event.clientX, y: event.clientY, type, targetItem });
  }, []);
  const openServerContextMenu = useCallback((event) => openNavigatorContextMenu(event, 'server'), [openNavigatorContextMenu]);
  const openDailyReportContextMenu = useCallback((event) => openNavigatorContextMenu(event, 'daily-report'), [openNavigatorContextMenu]);
  const openTradingAnalyticsContextMenu = useCallback((event, targetItem = null) => openNavigatorContextMenu(event, 'analytics', targetItem), [openNavigatorContextMenu]);

  const currentAnalyticsTarget = navigatorContextMenu?.type === 'analytics' ? navigatorContextMenu.targetItem : null;

  const handleAddFile = useCallback((target = null) => {
    const targetItem = target ?? currentAnalyticsTarget;
    const isTargetFolder = targetItem?.type === 'folder';
    const targetId = targetItem?.id || null;
    const newId = 'analytics-file-' + Date.now();
    const newName = generateUniqueName(analyticsTree, 'New Analytics View');
    const newFile = {
      id: newId,
      label: newName,
      iconName: 'FileText',
      path: `/analytics/custom/${newId}`,
      type: 'file',
    };
    setAnalyticsTree((prev) => {
      const updated = insertNode(prev, targetId, newFile, isTargetFolder);
      saveAnalyticsTree(updated);
      return updated;
    });
    if (isTargetFolder && targetId) {
      setExpandedFolderIds((prev) => new Set([...prev, targetId]));
    }
    setEditingNodeId(newId);
  }, [currentAnalyticsTarget, analyticsTree]);

  const handleAddFolder = useCallback((target = null) => {
    const targetItem = target ?? currentAnalyticsTarget;
    const isTargetFolder = targetItem?.type === 'folder';
    const targetId = targetItem?.id || null;
    const newId = 'analytics-folder-' + Date.now();
    const newName = generateUniqueName(analyticsTree, 'New Folder');
    const newFolder = {
      id: newId,
      label: newName,
      iconName: 'Folder',
      type: 'folder',
      children: [],
    };
    setAnalyticsTree((prev) => {
      const updated = insertNode(prev, targetId, newFolder, isTargetFolder);
      saveAnalyticsTree(updated);
      return updated;
    });
    if (isTargetFolder && targetId) {
      setExpandedFolderIds((prev) => new Set([...prev, targetId]));
    }
    setExpandedFolderIds((prev) => new Set([...prev, newId]));
    setEditingNodeId(newId);
  }, [currentAnalyticsTarget, analyticsTree]);

  const handleRename = useCallback((target = null) => {
    const targetItem = target ?? currentAnalyticsTarget;
    if (!targetItem?.id) return;
    setEditingNodeId(targetItem.id);
  }, [currentAnalyticsTarget]);

  // Deletion confirmation & undo state
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [undoToast, setUndoToast] = useState(null);

  const requestDelete = useCallback((target = null) => {
    const targetItem = target ?? currentAnalyticsTarget;
    if (!targetItem?.id) return;
    setDeleteConfirmItem(targetItem);
  }, [currentAnalyticsTarget]);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirmItem?.id) return;
    const itemToDelete = deleteConfirmItem;
    // Push snapshot to undo stack before deleting
    setUndoStack((prev) => [
      ...prev,
      { tree: JSON.parse(JSON.stringify(analyticsTree)), deletedItem: itemToDelete }
    ]);
    setAnalyticsTree((prev) => {
      const updated = deleteNode(prev, itemToDelete.id);
      saveAnalyticsTree(updated);
      return updated;
    });
    if (itemToDelete.path && location.pathname === itemToDelete.path) {
      if (itemToDelete.path === '/analytics/trading-accounts') {
        navigate('/dashboard');
      } else {
        navigate('/analytics/trading-accounts');
      }
    }
    setDeleteConfirmItem(null);
    setUndoToast({
      message: `Deleted "${itemToDelete.label}".`,
      deletedItem: itemToDelete,
      canUndo: true,
    });
  }, [deleteConfirmItem, analyticsTree, location.pathname, navigate, setUndoToast]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirmItem(null);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoStack.length) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setAnalyticsTree(last.tree);
    saveAnalyticsTree(last.tree);
    setUndoToast({
      message: `Restored "${last.deletedItem?.label || 'item'}".`,
      canUndo: false,
    });
  }, [undoStack, setUndoToast]);

  // Auto-heal / restore Trading Analytics if it was accidentally deleted and is missing in current active tree
  useEffect(() => {
    const hasTradingAnalytics = findNodeInfo(analyticsTree, 'analytics-trading-accounts') ||
      analyticsTree.some((item) => item.id === 'analytics-trading-accounts' || item.path === '/analytics/trading-accounts');
    if (!hasTradingAnalytics) {
      const tradingItem = {
        id: 'analytics-trading-accounts',
        label: 'Trading Analytics',
        iconName: 'TrendingUp',
        path: '/analytics/trading-accounts',
        type: 'file',
        isDefault: true,
      };
      const timer = window.setTimeout(() => {
        setAnalyticsTree((prev) => {
          const clone = JSON.parse(JSON.stringify(prev));
          const dashIdx = clone.findIndex((item) => item.id === 'analytics-dashboard');
          if (dashIdx !== -1) {
            clone.splice(dashIdx + 1, 0, tradingItem);
          } else {
            clone.unshift(tradingItem);
          }
          saveAnalyticsTree(clone);
          return clone;
        });
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [analyticsTree]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  const handleRestoreDefaults = useCallback(() => {
    setAnalyticsTree((prev) => {
      const restored = restoreDefaultPresets(prev);
      return restored;
    });
    setUndoToast({
      message: 'Restored default analytics views including Trading Analytics.',
      canUndo: false,
    });
    navigate('/analytics/trading-accounts');
  }, [navigate, setUndoToast]);

  const handlePreset = useCallback((action, defaultPath) => {
    const presetDef = PRESET_ANALYTICS_DEFINITIONS[action];
    if (presetDef) {
      const info = findNodeInfo(analyticsTree, presetDef.id);
      if (!info) {
        setAnalyticsTree((prev) => {
          const clone = JSON.parse(JSON.stringify(prev));
          if (presetDef.id === 'analytics-trading-accounts') {
            const dashIdx = clone.findIndex((item) => item.id === 'analytics-dashboard');
            if (dashIdx !== -1) {
              clone.splice(dashIdx + 1, 0, { ...presetDef });
            } else {
              clone.unshift({ ...presetDef });
            }
          } else {
            clone.push({ ...presetDef });
          }
          saveAnalyticsTree(clone);
          return clone;
        });
      }
    }
    navigate(defaultPath);
  }, [analyticsTree, navigate]);

  // Root "Analytics" node menu: the group itself cannot be renamed or deleted,
  // so only Add actions and the preset catalogue are offered.
  const analyticsRootContextMenuItems = useMemo(() => [
    { action: 'add', label: 'Add', icon: Plus, tone: 'add', shortcut: 'Insert', plainShortcut: true, onClick: () => handleAddFile(null) },
    { action: 'add-folder', label: 'Add Folder', icon: Folder, tone: 'folder', shortcut: 'Alt+Insert', plainShortcut: true, onClick: () => handleAddFolder(null) },
    { action: 'preset-trading-accounts', label: 'Add Preset Trading Accounts', icon: TrendingUp, onClick: () => handlePreset('preset-trading-accounts', '/analytics/trading-accounts') },
    { action: 'preset-online-users', label: 'Add Preset Online Users', onClick: () => handlePreset('preset-online-users', '/analytics/online-users') },
    ...(canViewPositions ? [{ action: 'preset-open-positions', label: 'Add Preset Open Positions', onClick: () => handlePreset('preset-open-positions', '/analytics/open-positions') }] : []),
    { action: 'preset-open-orders', label: 'Add Preset Open Orders', onClick: () => handlePreset('preset-open-orders', '/analytics/open-orders') },
    { action: 'preset-advertising-campaigns', label: 'Add Preset Advertising Campaigns', onClick: () => handlePreset('preset-advertising-campaigns', '/analytics/advertising-campaigns') },
    { action: 'preset-by-country', label: 'Add Preset By Country', onClick: () => handlePreset('preset-by-country', '/analytics/by-country') },
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
  ], [canViewPositions, handleAddFile, handleAddFolder, handlePreset, navigate]);

  const analyticsContextMenuItems = useMemo(() => [
    { action: 'add', label: 'Add', icon: Plus, tone: 'add', shortcut: 'Insert', plainShortcut: true, onClick: () => handleAddFile(currentAnalyticsTarget) },
    { action: 'add-folder', label: 'Add Folder', icon: Folder, tone: 'folder', shortcut: 'Alt+Insert', plainShortcut: true, onClick: () => handleAddFolder(currentAnalyticsTarget) },
    { action: 'rename', label: 'Rename', icon: RenameIcon, tone: 'rename', shortcut: 'F2', plainShortcut: true, onClick: () => handleRename(currentAnalyticsTarget) },
    { action: 'delete', label: 'Delete', icon: X, tone: 'danger', shortcut: 'Delete', plainShortcut: true, onClick: () => requestDelete(currentAnalyticsTarget) },
    { separator: true },
    { action: 'restore-defaults', label: 'Restore Default Analytics', icon: RotateCcw, onClick: handleRestoreDefaults },
    { action: 'preset-trading-accounts', label: 'Restore Trading Analytics', icon: TrendingUp, onClick: () => handlePreset('preset-trading-accounts', '/analytics/trading-accounts') },
    { action: 'preset-online-users', label: 'Add Preset Online Users', onClick: () => handlePreset('preset-online-users', '/analytics/online-users') },
    ...(canViewPositions ? [{ action: 'preset-open-positions', label: 'Add Preset Open Positions', onClick: () => handlePreset('preset-open-positions', '/analytics/open-positions') }] : []),
    { action: 'preset-open-orders', label: 'Add Preset Open Orders', onClick: () => handlePreset('preset-open-orders', '/analytics/open-orders') },
    { action: 'preset-advertising-campaigns', label: 'Add Preset Advertising Campaigns', onClick: () => handlePreset('preset-advertising-campaigns', '/analytics/advertising-campaigns') },
    { action: 'preset-by-country', label: 'Add Preset By Country', onClick: () => handlePreset('preset-by-country', '/analytics/by-country') },
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
  ], [canViewPositions, currentAnalyticsTarget, handleAddFile, handleAddFolder, handleRename, requestDelete, handleRestoreDefaults, handlePreset, navigate]);

  function renderAnalyticsItem(item) {
    if (!canViewPositions && ['/analytics/open-positions', '/clients/positions'].includes(item.path)) return null;
    const isFolder = item.type === 'folder';
    const Icon = getIconComponent(item.iconName, isFolder);
    const isEditing = editingNodeId === item.id;
    const isExpanded = isFolder ? expandedFolderIds.has(item.id) : false;

    if (isFolder) {
      return (
        <TreeNode
          key={item.id}
          label={item.label}
          icon={Icon}
          defaultExpanded={true}
          expandedProp={isExpanded}
          onExpandedChange={(next) => {
            setExpandedFolderIds((prev) => {
              const nextSet = new Set(prev);
              if (next) nextSet.add(item.id);
              else nextSet.delete(item.id);
              return nextSet;
            });
          }}
          isEditing={isEditing}
          onRenameCommit={(newLabel) => {
            setAnalyticsTree((prev) => {
              const updated = updateNode(prev, item.id, { label: newLabel });
              saveAnalyticsTree(updated);
              return updated;
            });
            setEditingNodeId(null);
          }}
          onRenameCancel={() => setEditingNodeId(null)}
          onContextMenu={(e) => openTradingAnalyticsContextMenu(e, item)}
          onStartRename={() => setEditingNodeId(item.id)}
          onDelete={() => requestDelete(item)}
          onAddFile={() => handleAddFile(item)}
          onAddFolder={() => handleAddFolder(item)}
        >
          {Array.isArray(item.children) && item.children.map(renderAnalyticsItem)}
        </TreeNode>
      );
    }

    return (
      <TreeNode
        key={item.id}
        label={item.label}
        icon={Icon}
        path={item.path}
        activePath={location.pathname}
        isEditing={isEditing}
        onRenameCommit={(newLabel) => {
          setAnalyticsTree((prev) => {
            const updated = updateNode(prev, item.id, { label: newLabel });
            saveAnalyticsTree(updated);
            return updated;
          });
          setEditingNodeId(null);
        }}
        onRenameCancel={() => setEditingNodeId(null)}
        onIntent={() => item.path && preloadAnalyticsDestination(queryClient, item.path)}
        onClickNode={() => item.path && navigate(item.path)}
        onContextMenu={(e) => openTradingAnalyticsContextMenu(e, item)}
        onStartRename={() => setEditingNodeId(item.id)}
        onDelete={() => requestDelete(item)}
        onAddFile={() => handleAddFile(item)}
        onAddFolder={() => handleAddFolder(item)}
      />
    );
  }

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
          <TreeNode label="Backup Servers" icon={Network} disabled />
        </TreeNode>

        <TreeNode
          label="Analytics"
          icon={BarChart2}
          defaultExpanded
          path="/analytics"
          activePath={location.pathname}
          onClickNode={() => navigate('/analytics')}
          onIntent={() => preloadAnalyticsDestination(queryClient, '/analytics')}
          onContextMenu={(e) => openTradingAnalyticsContextMenu(e, null)}
        >
          {analyticsTree.map(renderAnalyticsItem)}
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
          {node('Orders', ClipboardCheck, '/clients/orders')}
          {canViewPositions && node('Position History', FileClock, '/clients/positions')}
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
          {node('Exposure', Activity, '/exposure')}
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

        <TreeNode label="Groups" icon={Users2} count={loadGroups ? (loading ? '…' : groups.length) : null} path="/groups" activePath={location.search ? currentWorkspacePath : location.pathname} onClickNode={go('/groups')} onExpandedChange={(open) => open && setLoadGroups(true)}>
          {groupTree.map((node) => renderGroupTreeNode(node))}
          <TreeNode label="New Group" icon={Plus} onClickNode={() => { if (canManageGroups) setNewGroupOpen(true); else setGroupPermissionDenied(true); }} />
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
                ? (currentAnalyticsTarget ? analyticsContextMenuItems : analyticsRootContextMenuItems)
                : SERVER_CONTEXT_MENU_ITEMS
          }
          ariaLabel={
            navigatorContextMenu.type === 'daily-report'
              ? 'Daily Report actions'
              : navigatorContextMenu.type === 'analytics'
                ? 'Analytics actions'
                : `${serverLabel} connection actions`
          }
          onClose={closeNavigatorContextMenu}
        />
      )}
      {newGroupOpen && canManageGroups && <NewGroupModal onClose={() => setNewGroupOpen(false)} onSuccess={() => setNewGroupOpen(false)} />}
      {groupPermissionDenied && <GroupPermissionNotice action="create" onClose={() => setGroupPermissionDenied(false)} />}
      {deleteConfirmItem && (
        <DeleteConfirmModal
          item={deleteConfirmItem}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
      {undoToast && (
        <UndoToast
          message={undoToast.message}
          canUndo={undoToast.canUndo}
          onUndo={handleUndo}
          onClose={() => setUndoToast(null)}
        />
      )}
    </div>
  );
}
