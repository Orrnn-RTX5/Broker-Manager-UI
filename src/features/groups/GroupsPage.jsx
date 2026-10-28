import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Check, ChevronDown, ChevronRight, Copy, ExternalLink, Folder, FolderOpen, FolderPlus, Info, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import GroupPropertiesModal from './components/GroupPropertiesModal';
import GroupPermissionNotice from './components/GroupPermissionNotice';
import GroupOperationModal from './components/GroupOperationModal';
import AccountDetailsModal from '../../components/Popups/AccountDetailsModal';
import { GROUP_OPERATIONS_DISABLED_MESSAGE, groupOperationsEnabled, readSavedOperation } from './groupOperations.js';
import {
  extractAccountFields,
  filterAccountRowsBySearch,
  filterGroupRowsBySearch,
  getGroupSearchSuggestions,
  parseGroupSearchRoute,
  resolveGroupSearchRoute,
} from './groupSearchRouter.js';
import { loadAccountDetails, peekAccountDetails, subscribeToAccountDetails } from '../../services/accountDetails.js';
import { getSidebarAccountsQueryOptions } from '../../services/sidebarAccounts.js';
import { usePermissions } from '../../hooks/usePermissions';
import useWorkspaceNavigation from '../../hooks/useWorkspaceNavigation';
import { useAllGroups } from '../../hooks/useAllGroups';
import { PERMISSIONS } from '../../utils/permissions';
import { useMultiScreenStore } from '../../store/multiScreenStore';
import { showResult } from '../../store/resultDialogStore.js';
import { copyToClipboard, rowsToTSV } from '../../utils/gridUtils';
import { EDIT_MENU_ACTION_EVENT, isEditableElement, publishEditMenuContext } from '../../utils/editMenuActions';
import { getGroupsFolderFromSearch, getGroupsFolderPath, getGroupsSelectedFromSearch } from './groupRoutes';
import {
  countGroupsUnder,
  getGroupFolderRows,
  getGroupLeafName,
  getGroupParentPath,
  getGroupRowText,
  groupRowNode,
  isGroupBranch,
  listGroupContainerPaths,
  nestGroupName,
  pathSeparatorOf,
  separatorForContainer,
  splitGroupPath,
} from './groupTree.js';
import { GROUP_ACCOUNT_COLUMNS, accountsInGroup, countAccountsByGroup, groupNameKey } from './groupAccountRows.js';
import { describeGroupSave } from './groupAccountRows.js';
import { AccountMark, GroupFolderIcon } from './groupMarks.jsx';
import './GroupsExplorer.css';

// Folder view columns match the MT5 Manager group list; "All Groups" adds Type and Leverage.
const FOLDER_COLUMNS = [
  { key: 'group', label: 'Group' },
  { key: 'risk', label: 'Risk Management' },
  { key: 'margin', label: 'Margin', numeric: true },
  { key: 'currency', label: 'Currency' },
];
const ALL_GROUPS_COLUMNS = [
  { key: 'group', label: 'Group' },
  { key: 'type', label: 'Type' },
  { key: 'risk', label: 'Risk Management' },
  { key: 'margin', label: 'Margin', numeric: true },
  { key: 'leverage', label: 'Leverage' },
  { key: 'currency', label: 'Currency' },
];
const EMPTY_TEXT = { type: '', risk: '', margin: '', leverage: '', currency: '' };
const rowValues = (node, showFullName) => ({
  group: showFullName ? node.name : node.label,
  ...(node.group ? getGroupRowText(node.group) : EMPTY_TEXT),
});

const mergeDetailedAccount = (baseAccount, detailedPayload) => {
  if (!detailedPayload || typeof detailedPayload !== 'object') return baseAccount;
  if (!baseAccount || typeof baseAccount !== 'object') return detailedPayload;
  return { ...baseAccount, ...detailedPayload, raw: detailedPayload };
};

const GroupsPage = () => {
  const location = useLocation();
  const navigate = useWorkspaceNavigation();
  const queryClient = useQueryClient();
  const { canAct, groupOperationsEnabled: sessionGroupOperationsEnabled, groupOperationsLoading: sessionGroupOperationsLoading } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const openGroupScreen = useMultiScreenStore((state) => state.openGroupScreen);
  const folder = getGroupsFolderFromSearch(location.search);
  const navigatorGroup = getGroupsSelectedFromSearch(location.search);
  const isRoot = !folder;
  const { groups, loading, fetching, error, refetch } = useAllGroups();
  const accountsQuery = useQuery(getSidebarAccountsQueryOptions(''));
  const accountCounts = useMemo(
    () => countAccountsByGroup(accountsQuery.data?.rows),
    [accountsQuery.data],
  );

  const [allGroups, setAllGroups] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [subgroupDraft, setSubgroupDraft] = useState(null);
  const [parentMenuOpen, setParentMenuOpen] = useState(false);
  const [propertiesGroup, setPropertiesGroup] = useState(null);
  const [openedGroup, setOpenedGroup] = useState(null);
  const [openedAccount, setOpenedAccount] = useState(null);
  const [openedAccountTab, setOpenedAccountTab] = useState('Overview');
  const [inspectedFieldRoute, setInspectedFieldRoute] = useState(null);
  const [copiedFieldKey, setCopiedFieldKey] = useState(null);
  const [detailsRevision, setDetailsRevision] = useState(0);
  const [selectedLogin, setSelectedLogin] = useState(null);
  const [deleteSelection, setDeleteSelection] = useState(null);
  const deleting = Boolean(deleteSelection);
  // null while the session answer is still loading: the button stays disabled and no toast is shown.
  const operationsEnabled = groupOperationsEnabled(sessionGroupOperationsEnabled, sessionGroupOperationsLoading);
  const [permissionAction, setPermissionAction] = useState(null);
  const searchInputRef = useRef(null);
  const handlersRef = useRef({});

  // Folder/selection/intent sync as render-phase adjustments (not effects),
  // per React docs ("storing information from previous renders"): router
  // state (location.search/state) flows into local state during render, so no
  // intermediate paint carries stale selection and no set-state-in-effect
  // violation remains. External side-effects (scroll, navigate) stay in the
  // effects below. Application is idempotent (same values), so refetch churn
  // only re-applies identical state and React bails out without re-rendering.
  const [prevFolderKey, setPrevFolderKey] = useState(folder);
  if (prevFolderKey !== folder) {
    // Opening another folder clears the selection and returns to the folder tab.
    setPrevFolderKey(folder);
    setSelectedId(null);
    setSelectedLogin(null);
    setOpenedGroup(null);
    setAllGroups(false);
    setContextMenu(null);
  }

  const [prevNavigatorRowKey, setPrevNavigatorRowKey] = useState(null);
  const navigatorRowKey = `${folder} ${navigatorGroup} ${loading}`;
  if (prevNavigatorRowKey !== navigatorRowKey) {
    // A group picked in the Navigator is selected in its folder. Key mirrors
    // the scroll effect deps below, so reselection timing matches exactly.
    setPrevNavigatorRowKey(navigatorRowKey);
    if (navigatorGroup) setSelectedId(`group:${navigatorGroup}`);
  }
  // A group picked in the Navigator is scrolled into view (external DOM
  // sync stays in the effect); selection itself is applied above.
  useEffect(() => {
    if (!navigatorGroup) return undefined;
    const rowId = `group:${navigatorGroup}`;
    const frame = requestAnimationFrame(() => {
      document.querySelector(`[data-node-id="${CSS.escape(rowId)}"]`)?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [folder, navigatorGroup, loading]);

  // One-shot Navigator intents (open properties / open accounts) arrive via
  // location.state and are consumed below: local state applies during render,
  // the state-clearing navigation stays in the effect.
  const navIntentGroup = navigatorGroup ? groups.find((item) => groupRowNode(item).name === navigatorGroup) : undefined;
  const navIntentGroupName = navIntentGroup ? groupRowNode(navIntentGroup).name : '';
  const [prevNavIntentKey, setPrevNavIntentKey] = useState(null);
  const navIntentKey = `${navigatorGroup} ${location.state?.openGroupProperties ? 'props' : ''}${location.state?.openGroupAccounts ? 'accts' : ''}${location.state?.openAccountLogin ?? ''} ${navIntentGroupName} ${groups.length}`;
  if (prevNavIntentKey !== navIntentKey) {
    setPrevNavIntentKey(navIntentKey);
    if (navIntentGroup && location.state?.openGroupProperties) {
      setPropertiesGroup(navIntentGroup);
    }
    if (navIntentGroup && location.state?.openGroupAccounts) {
      // A leaf group chosen in the Navigator opens its account list, same as the folder view.
      const login = location.state.openAccountLogin ? String(location.state.openAccountLogin) : null;
      setAllGroups(false);
      setOpenedGroup(navIntentGroup);
      setSelectedId(null);
      setSelectedLogin(login);
      setSearch('');
      if (login) setPropertiesGroup(navIntentGroup);
    }
  }
  useEffect(() => {
    if (!navigatorGroup) return undefined;
    if (!location.state?.openGroupProperties && !location.state?.openGroupAccounts) return undefined;
    if (!navIntentGroup) return undefined;
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    return undefined;
  }, [navigatorGroup, location.state, navIntentGroup, location.pathname, location.search, navigate]);

  const folderRows = useMemo(() => getGroupFolderRows(groups, folder), [groups, folder]);
  const allRows = useMemo(() => groups.map(groupRowNode), [groups]);
  const rows = allGroups ? allRows : folderRows;
  const rowIsBranch = useCallback((node) => !allGroups && isGroupBranch(node), [allGroups]);
  const activeFolder = allGroups ? '' : folder;
  const visibleRows = useMemo(
    () => filterGroupRowsBySearch(rows, search, activeFolder),
    [rows, search, activeFolder],
  );
  const columns = allGroups ? ALL_GROUPS_COLUMNS : FOLDER_COLUMNS;
  const selectedNode = useMemo(
    () => visibleRows.find((node) => node.id === selectedId) ?? null,
    [visibleRows, selectedId],
  );
  const folderCount = countGroupsUnder(groups, folder);
  const segments = splitGroupPath(folder);
  const containers = useMemo(() => listGroupContainerPaths(groups), [groups]);

  // Enrich sidebar account rows with any cached full AccountDetails payloads
  const enrichedRawAccountRows = useMemo(() => {
    const rawList = accountsQuery.data?.rows;
    if (!Array.isArray(rawList)) return [];
    void detailsRevision;
    return rawList.map((row) => {
      const login = row?.login ?? row?.Login;
      if (!login) return row;
      const detailed = peekAccountDetails(login);
      return detailed ? mergeDetailedAccount(row, detailed) : row;
    });
  }, [accountsQuery.data, detailsRevision]);

  const accountRows = useMemo(
    () => (openedGroup ? accountsInGroup(enrichedRawAccountRows, openedGroup.name, openedGroup) : []),
    [enrichedRawAccountRows, openedGroup],
  );
  const visibleAccounts = useMemo(
    () => filterAccountRowsBySearch(accountRows, search, GROUP_ACCOUNT_COLUMNS),
    [accountRows, search],
  );
  const parsedSearchRoute = useMemo(() => parseGroupSearchRoute(search, groups), [search, groups]);
  const searchSuggestions = useMemo(
    () => (search.trim()
      ? getGroupSearchSuggestions({
        query: search,
        groups,
        accountRows: enrichedRawAccountRows,
        currentFolder: activeFolder,
        openedGroup,
        selectedLogin,
        limit: 10,
      })
      : []),
    [search, groups, enrichedRawAccountRows, activeFolder, openedGroup, selectedLogin],
  );
  const safeRouteIndex = searchSuggestions.length > 0
    ? Math.min(Math.max(activeRouteIndex, 0), searchSuggestions.length - 1)
    : 0;
  const activeSuggestion = searchSuggestions[safeRouteIndex] || searchSuggestions[0] || null;
  const spotlightFieldRoute = activeSuggestion?.type === 'account-field'
    ? activeSuggestion
    : (searchSuggestions[0]?.type === 'account-field' ? searchSuggestions[0] : null);

  // Automatically load full AccountDetails when an account is targeted in the router or field inspector
  const targetDetailLogin = spotlightFieldRoute?.login || inspectedFieldRoute?.login || null;
  useEffect(() => {
    if (!targetDetailLogin) return undefined;
    const unsubscribe = subscribeToAccountDetails(targetDetailLogin, () => {
      setDetailsRevision((rev) => rev + 1);
    });
    if (!peekAccountDetails(targetDetailLogin)) {
      loadAccountDetails(targetDetailLogin).catch(() => undefined);
    }
    return unsubscribe;
  }, [targetDetailLogin]);

  const resolvedInspector = useMemo(() => {
    if (!inspectedFieldRoute) return null;
    void detailsRevision;
    const login = inspectedFieldRoute.login;
    const baseAccount = enrichedRawAccountRows.find((r) => String(r?.login ?? r?.Login) === String(login))
      || inspectedFieldRoute.account
      || { login };
    const detailed = peekAccountDetails(login);
    const mergedAccount = detailed ? mergeDetailedAccount(baseAccount, detailed) : baseAccount;
    const fields = extractAccountFields(mergedAccount, inspectedFieldRoute.group);
    const activeField = fields.find((f) => f.key === inspectedFieldRoute.fieldKey) || fields[0];
    const nameField = fields.find((f) => f.key === 'name');
    return {
      login,
      account: mergedAccount,
      accountName: nameField?.hasValue ? nameField.value : '',
      group: inspectedFieldRoute.group,
      activeField,
      fields,
    };
  }, [inspectedFieldRoute, enrichedRawAccountRows, detailsRevision]);

  const invalidateGroups = () => queryClient.invalidateQueries({ queryKey: ['groups'] });
  const openFolder = useCallback((path) => navigate(getGroupsFolderPath(path)), [navigate]);
  const goUp = () => {
    if (openedGroup) {
      setOpenedGroup(null);
      setSelectedLogin(null);
      setInspectedFieldRoute(null);
      return;
    }
    if (!isRoot && !allGroups) openFolder(getGroupParentPath(folder));
  };
  const openProperties = (node) => {
    if (!node) return;
    if (!requireManage('change')) return;
    if (node.group) setPropertiesGroup(node.group);
    else setPropertiesGroup({ name: node.path || node.name, isNew: true });
  };
  const openGroupAccounts = (group) => {
    if (!group) return;
    setOpenedGroup(group);
    setSelectedId(null);
    setSelectedLogin(null);
    setInspectedFieldRoute(null);
    setSearch('');
  };
  // A folder with subgroups opens. A group that holds accounts directly lists those accounts.
  const activate = (node) => {
    if (!node) return;
    if (rowIsBranch(node)) openFolder(node.path);
    else openGroupAccounts(node.group);
  };
  const openAccountWindow = () => { if (openedGroup) setPropertiesGroup(openedGroup); };
  const openAccountDetails = (account, tab = 'Overview') => {
    if (!account) return;
    setOpenedAccountTab(tab || 'Overview');
    setOpenedAccount(account);
  };

  const copyFieldValue = async (key, value) => {
    if (!value || value === '—') return;
    try {
      await copyToClipboard(String(value));
      setCopiedFieldKey(key);
      setTimeout(() => setCopiedFieldKey((curr) => (curr === key ? null : curr)), 1600);
    } catch {
      showResult.error('Unable to copy value.');
    }
  };

  const executeSearchRoute = (route) => {
    if (!route) return false;
    if (route.type === 'folder') {
      setAllGroups(false);
      setOpenedGroup(null);
      setSelectedId(null);
      setSelectedLogin(null);
      setInspectedFieldRoute(null);
      setSearch('');
      setSearchFocused(false);
      setActiveRouteIndex(0);
      openFolder(route.folder);
      return true;
    }
    if (route.type === 'group' && route.group) {
      const targetFolder = route.folder ?? getGroupParentPath(route.group.name);
      setPrevFolderKey(targetFolder);
      if (targetFolder !== folder) openFolder(targetFolder);
      setAllGroups(false);
      setOpenedGroup(route.group);
      setSelectedId(null);
      setSelectedLogin(null);
      setInspectedFieldRoute(null);
      setSearch('');
      setSearchFocused(false);
      setActiveRouteIndex(0);
      return true;
    }
    if (route.type === 'account-field' && route.field) {
      const targetGroup = route.group || openedGroup;
      if (targetGroup) {
        const targetFolder = route.folder ?? getGroupParentPath(targetGroup.name);
        setPrevFolderKey(targetFolder);
        if (targetFolder !== folder) openFolder(targetFolder);
        setAllGroups(false);
        setOpenedGroup(targetGroup);
        setSelectedId(null);
      }
      const loginStr = String(route.login ?? '');
      if (loginStr) setSelectedLogin(loginStr);
      setInspectedFieldRoute({
        login: loginStr,
        account: route.account || loginStr,
        group: targetGroup,
        fieldKey: route.field.key,
      });
      setSearchFocused(false);
      setActiveRouteIndex(0);
      return true;
    }
    if (route.type === 'account') {
      const targetGroup = route.group || openedGroup;
      if (targetGroup) {
        const targetFolder = route.folder ?? getGroupParentPath(targetGroup.name);
        setPrevFolderKey(targetFolder);
        if (targetFolder !== folder) openFolder(targetFolder);
        setAllGroups(false);
        setOpenedGroup(targetGroup);
        setSelectedId(null);
      }
      const loginStr = String(route.login ?? '');
      if (loginStr) setSelectedLogin(loginStr);
      openAccountDetails(route.account || loginStr, 'Overview');
      setSearch('');
      setSearchFocused(false);
      setActiveRouteIndex(0);
      return true;
    }
    return false;
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      if (searchSuggestions.length > 0) {
        event.preventDefault();
        setSearchFocused(true);
        setActiveRouteIndex((prev) => Math.min(prev + 1, searchSuggestions.length - 1));
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      if (searchSuggestions.length > 0) {
        event.preventDefault();
        setSearchFocused(true);
        setActiveRouteIndex((prev) => Math.max(prev - 1, 0));
      }
      return;
    }
    if (event.key === 'Tab' && search.trim() && searchSuggestions.length > 0) {
      const candidate = searchSuggestions[safeRouteIndex] || searchSuggestions[0];
      if (candidate?.completionText && candidate.completionText.trim() !== search.trim()) {
        event.preventDefault();
        setSearch(candidate.completionText);
        setActiveRouteIndex(0);
        setSearchFocused(true);
      }
      return;
    }
    if (event.key === 'Escape') {
      if (searchFocused || search) {
        event.preventDefault();
        event.stopPropagation();
        if (searchFocused) setSearchFocused(false);
        else setSearch('');
      }
      return;
    }
    if (event.key === 'Enter') {
      const queryText = search.trim();
      if (!queryText) return;
      event.preventDefault();
      event.stopPropagation();

      if (searchFocused && safeRouteIndex > 0 && searchSuggestions[safeRouteIndex]) {
        executeSearchRoute(searchSuggestions[safeRouteIndex]);
        return;
      }

      const resolved = resolveGroupSearchRoute({
        query: queryText,
        groups,
        accountRows: enrichedRawAccountRows,
        currentFolder: activeFolder,
        openedGroup,
        selectedLogin,
      }) || searchSuggestions[0];

      if (resolved && executeSearchRoute(resolved)) {
        return;
      }

      if (!openedGroup && visibleRows.length === 1) {
        activate(visibleRows[0]);
        setSearch('');
        setSearchFocused(false);
      } else if (openedGroup && visibleAccounts.length === 1) {
        const onlyAccount = visibleAccounts[0];
        setSelectedLogin(onlyAccount.login);
        openAccountDetails(onlyAccount.account || onlyAccount.login, 'Overview');
        setSearch('');
        setSearchFocused(false);
      }
    }
  };

  const requireManage = (action = 'change') => {
    if (canManageGroups) return true;
    setPermissionAction(action);
    return false;
  };
  const containerOf = (node) => (rowIsBranch(node) ? node.path : getGroupParentPath(node.name));
  // The selected row wins over the open folder, so "Add group" lands inside what the user picked.
  const targetContainer = selectedNode ? containerOf(selectedNode) : allGroups ? '' : folder;
  const addGroup = (container = targetContainer) => {
    if (!requireManage('create')) return;
    const separator = separatorForContainer(groups, container);
    openGroupScreen({ presetName: container ? `${container}${separator}` : '' });
  };
  const askSubgroup = (container = targetContainer) => {
    if (!requireManage('create')) return;
    setParentMenuOpen(false);
    setSubgroupDraft({ parent: container, name: 'New subgroup' });
  };
  const submitSubgroup = (event) => {
    event.preventDefault();
    const name = subgroupDraft?.name.trim();
    if (!name) return;
    const presetName = nestGroupName(subgroupDraft.parent, name, separatorForContainer(groups, subgroupDraft.parent));
    setParentMenuOpen(false);
    setSubgroupDraft(null);
    openGroupScreen({ presetName });
  };
  const duplicateGroup = (node) => {
    if (!node?.group || !requireManage('create')) return;
    openGroupScreen({ duplicateData: node.group });
  };

  const deleteNode = (node) => {
    if (!node || !requireManage('delete')) return;
    const saved = readSavedOperation();
    if (saved) { setDeleteSelection(saved.selection); return; }
    if (operationsEnabled === null) return; // still loading: show nothing
    if (!operationsEnabled) { showResult.error(GROUP_OPERATIONS_DISABLED_MESSAGE); return; }
    setDeleteSelection(rowIsBranch(node) ? { folder: node.path } : { sources: [node.name] });
  };

  const copyNode = async (node) => {
    if (!node) return;
    try {
      await copyToClipboard(rowsToTSV([rowValues(node, true)], columns));
    } catch {
      showResult.error('Unable to copy the selected group.');
    }
  };

  // Stable identity: only the stable searchInputRef is closed over, so the
  // edit-menu ref bridge and the Find handler never go stale (and no
  // exhaustive-deps warning is introduced by the stable click handler).
  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  const handleKeyDown = (event) => {
    if (isEditableElement()) return;
    if (openedGroup) {
      const index = visibleAccounts.findIndex((row) => row.login === selectedLogin);
      if (event.key === 'Backspace') {
        event.preventDefault();
        goUp();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedLogin) {
          const selectedRow = visibleAccounts.find((row) => row.login === selectedLogin);
          if (selectedRow?.account) openAccountDetails(selectedRow.account, 'Overview');
          else openAccountWindow();
        }
      } else if (event.key === 'Delete') {
        event.preventDefault();
        deleteNode(groupRowNode(openedGroup));
      } else if (event.key === 'Escape') {
        setSelectedLogin(null);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = visibleAccounts[Math.min(Math.max(index + step, 0), Math.max(visibleAccounts.length - 1, 0))];
        if (next) setSelectedLogin(next.login);
      }
      return;
    }
    const index = visibleRows.findIndex((node) => node.id === selectedId);
    if (event.key === 'Backspace') {
      if (!allGroups) { event.preventDefault(); goUp(); }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      activate(selectedNode);
    } else if (event.key === 'Escape') {
      setSelectedId(null);
      setContextMenu(null);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = visibleRows[Math.min(Math.max(index + step, 0), visibleRows.length - 1)];
      if (next) setSelectedId(next.id);
    } else if (event.key === 'Delete') {
      if (selectedNode) { event.preventDefault(); deleteNode(selectedNode); }
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      if (selectedNode) { event.preventDefault(); copyNode(selectedNode); }
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      focusSearch();
    }
  };

  const activeTargetNode = useMemo(
    () => selectedNode || (openedGroup ? groupRowNode(openedGroup) : null),
    [selectedNode, openedGroup],
  );

  // Keep the top-level Edit menu aware of the explorer selection.
  useEffect(() => {
    publishEditMenuContext({ selectedCount: activeTargetNode ? 1 : 0, view: 'groups' });
    return () => publishEditMenuContext({ selectedCount: 0 });
  }, [activeTargetNode]);

  // Publish the latest selection/handlers to the stable window listener
  // below. A passive no-deps effect (not a render-phase write): menu clicks
  // dispatch in a later task, after effects flush, so every dispatch observes
  // the committed render's values — identical behaviour, safe under
  // StrictMode double-render and concurrent aborted renders.
  useEffect(() => {
    handlersRef.current = { selectedNode: activeTargetNode, openProperties, duplicateGroup, copyNode, focusSearch };
  });
  useEffect(() => {
    const handleEditMenuAction = (event) => {
      const { action } = event.detail || {};
      const { selectedNode: node, ...handlers } = handlersRef.current;
      const hasEditableFocus = isEditableElement();
      if (action === 'find-current-view') {
        handlers.focusSearch();
        event.detail.handled = true;
      } else if (action === 'clear-selection' && !hasEditableFocus) {
        setSelectedId(null);
        event.detail.handled = true;
      } else if (action === 'edit-selected' && node) {
        handlers.openProperties(node);
        event.detail.handled = true;
      } else if (action === 'duplicate-group' && node) {
        handlers.duplicateGroup(node);
        event.detail.handled = true;
      } else if (['copy', 'copy-csv', 'copy-excel', 'copy-json'].includes(action) && node && !hasEditableFocus) {
        handlers.copyNode(node);
        event.detail.handled = true;
      }
    };
    window.addEventListener(EDIT_MENU_ACTION_EVENT, handleEditMenuAction);
    return () => window.removeEventListener(EDIT_MENU_ACTION_EVENT, handleEditMenuAction);
  }, []);

  const openContextMenu = (event, node) => {
    event.preventDefault();
    setSelectedId(node.id);
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  };
  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const handleKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);
  const menuAction = (callback) => () => { setContextMenu(null); callback(); };
  // Stable click handler for the Find menu item. focusSearch reads
  // searchInputRef, so passing it (bare or wrapped) through menuAction during
  // render trips react-hooks/refs. A useCallback with the same body runs only
  // on click — identical behaviour (close menu, then focus), no render-phase
  // ref involvement. Deps mirror the file's per-render closures; the ref
  // object itself is stable so the callback never goes stale.
  const handleFindClick = useCallback(() => { setContextMenu(null); focusSearch(); }, [focusSearch]);

  const emptyMessage = search.trim()
    ? 'No groups match your search.'
    : isRoot
      ? 'No groups yet. Use Add group to create a main group.'
      : `No subgroups in ${segments.at(-1)} yet. Use Add group or Add subgroup to create one.`;

  return (
    <div className="groups-explorer" aria-label="Groups explorer">
      <div className="groups-explorer-toolbar">
        <div className="groups-explorer-path">
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-icon ui-btn-sm"
            title="Up one folder (Backspace)"
            aria-label="Up one folder"
            disabled={(isRoot && !openedGroup) || allGroups}
            onClick={goUp}
          >
            <ArrowUp size={13} />
          </button>
          <nav aria-label="Group folder path" className="groups-explorer-crumbs">
            <button type="button" className={`groups-crumb${isRoot && !allGroups && !openedGroup ? ' is-current' : ''}`} onClick={() => { setOpenedGroup(null); setSelectedLogin(null); setInspectedFieldRoute(null); openFolder(''); }}>
              <Users size={13} className="groups-icon-group" />
              <span>Groups</span>
            </button>
            {segments.map((part, index) => {
              const path = segments.slice(0, index + 1).join(pathSeparatorOf(folder));
              const current = index === segments.length - 1 && !allGroups && !openedGroup;
              return (
                <span key={path} className="groups-crumb-segment">
                  <ChevronRight size={11} className="groups-crumb-sep" />
                  <button type="button" className={`groups-crumb${current ? ' is-current' : ''}`} aria-current={current ? 'page' : undefined} onClick={() => { setOpenedGroup(null); setSelectedLogin(null); setInspectedFieldRoute(null); openFolder(path); }}>
                    <Folder size={13} className="groups-icon-folder" fill="currentColor" strokeWidth={1.25} />
                    <span>{part}</span>
                  </button>
                </span>
              );
            })}
            {openedGroup && (
              <span className="groups-crumb-segment">
                <ChevronRight size={11} className="groups-crumb-sep" />
                <button type="button" className="groups-crumb is-current" aria-current="page">
                  <Folder size={13} className="groups-icon-folder" fill="currentColor" strokeWidth={1.25} />
                  <span>{getGroupLeafName(openedGroup.name)}</span>
                </button>
              </span>
            )}
          </nav>
        </div>

        <div className="groups-explorer-tools" role="toolbar" aria-label="Group actions">
          <div className="relative groups-search-wrap">
            <Search size={13} className="groups-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={openedGroup ? `Route or find in ${getGroupLeafName(openedGroup.name)}...` : 'Route (group / account / field)...'}
              aria-label="Find groups in this view"
              title="Type a route (e.g. group / folder / account / email or leverage) and press Enter"
              value={search}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onChange={(event) => {
                setSearch(event.target.value);
                setActiveRouteIndex(0);
                setSearchFocused(true);
              }}
              onKeyDown={handleSearchKeyDown}
              className="ui-input ui-input-sm groups-search"
            />
            {search && (
              <button
                type="button"
                className="groups-search-clear"
                aria-label="Clear search"
                title="Clear search"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSearch('');
                  setActiveRouteIndex(0);
                  searchInputRef.current?.focus();
                }}
              >
                <X size={11} />
              </button>
            )}
            {searchFocused && search.trim() && (
              <div
                className="groups-search-router-menu"
                role="listbox"
                aria-label="Group router suggestions"
                onMouseDown={(event) => event.preventDefault()}
              >
                <div className="groups-search-router-head">
                  <span className="groups-search-router-crumbs">
                    <span>Route:</span>
                    <strong>{parsedSearchRoute.segments.join(' / ') || search.trim()}</strong>
                  </span>
                  <span>Enter ↵</span>
                </div>

                {spotlightFieldRoute && (
                  <div className="groups-router-field-spotlight" role="region" aria-label="Account property readout">
                    <div className="groups-router-field-spotlight-top">
                      <span className="groups-router-field-spotlight-id">
                        <AccountMark />
                        <span>#{spotlightFieldRoute.login}</span>
                        {spotlightFieldRoute.accountRow?.name ? <span>· {spotlightFieldRoute.accountRow.name}</span> : null}
                        {spotlightFieldRoute.group?.name ? <span>· {spotlightFieldRoute.group.name}</span> : null}
                      </span>
                      <span className="groups-router-field-category">{spotlightFieldRoute.field.category}</span>
                    </div>
                    <div className="groups-router-field-spotlight-main">
                      <span className="groups-router-field-spotlight-label">{spotlightFieldRoute.field.label}</span>
                      <strong className="groups-router-field-spotlight-val">{spotlightFieldRoute.field.value}</strong>
                    </div>
                    <div className="groups-router-field-spotlight-actions">
                      <button
                        type="button"
                        className="groups-router-spotlight-btn"
                        disabled={!spotlightFieldRoute.field.hasValue}
                        onClick={() => copyFieldValue(`spotlight:${spotlightFieldRoute.field.key}`, spotlightFieldRoute.field.value)}
                      >
                        {copiedFieldKey === `spotlight:${spotlightFieldRoute.field.key}` ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copiedFieldKey === `spotlight:${spotlightFieldRoute.field.key}` ? 'Copied' : 'Copy value'}</span>
                      </button>
                      <button
                        type="button"
                        className="groups-router-spotlight-btn is-primary"
                        onClick={() => {
                          executeSearchRoute(spotlightFieldRoute);
                          openAccountDetails(spotlightFieldRoute.account || spotlightFieldRoute.login, spotlightFieldRoute.field.tab);
                        }}
                      >
                        <ExternalLink size={11} />
                        <span>Open {spotlightFieldRoute.field.tab} tab</span>
                      </button>
                    </div>
                  </div>
                )}

                {searchSuggestions.length > 0 ? (
                  <div className="groups-search-router-list">
                    {searchSuggestions.map((item, idx) => {
                      const isActive = idx === safeRouteIndex;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`groups-search-router-item${isActive ? ' is-active' : ''}`}
                          onMouseEnter={() => setActiveRouteIndex(idx)}
                          onClick={() => executeSearchRoute(item)}
                        >
                          <span className="groups-search-router-item-main">
                            <span className="groups-row-glyph" aria-hidden="true">
                              {item.type === 'account' || item.type === 'account-field' ? <AccountMark /> : <GroupFolderIcon />}
                            </span>
                            <span className="groups-search-router-item-title">{item.title}</span>
                          </span>
                          {item.type === 'account-field' ? (
                            <span className="groups-search-router-item-val">
                              <span className="groups-search-router-item-meta">{item.field.label}:</span>
                              <strong>{item.field.value}</strong>
                            </span>
                          ) : (
                            <span className="groups-search-router-item-meta">{item.subtitle}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="groups-search-router-empty">
                    No matching group, folder, account, or field for &ldquo;{search.trim()}&rdquo;
                  </div>
                )}
                <div className="groups-search-router-foot">
                  <span>Path: <code>group / account / email | leverage | balance</code></span>
                  <span>Tab to complete</span>
                </div>
              </div>
            )}
          </div>
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" title="Create a group inside the selected folder" onClick={() => addGroup()}>
            <Plus size={13} /> Add group
          </button>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" title="Create a subgroup inside a chosen group" onClick={() => askSubgroup()}>
            <FolderPlus size={13} /> Add subgroup
          </button>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!selectedNode && !openedGroup} title="Group properties" onClick={() => (openedGroup ? openAccountWindow() : openProperties(selectedNode))}>
            <Pencil size={12} /> Settings
          </button>
          {readSavedOperation() && <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setDeleteSelection(readSavedOperation().selection)}>Operation progress</button>}
          <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" disabled={(!selectedNode && !openedGroup) || deleting || operationsEnabled === null} title="Delete the selected group or folder" onClick={() => deleteNode(selectedNode || (openedGroup ? groupRowNode(openedGroup) : null))}>
            <Trash2 size={12} /> {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {resolvedInspector && (
        <section className="groups-account-field-inspector" aria-label={`Account ${resolvedInspector.login} field inspector`}>
          <div className="groups-inspector-header">
            <div className="groups-inspector-crumbs">
              {resolvedInspector.group?.name && (
                <>
                  <span className="groups-row-glyph" aria-hidden="true"><GroupFolderIcon /></span>
                  <span>{resolvedInspector.group.name}</span>
                  <ChevronRight size={11} className="groups-crumb-sep" />
                </>
              )}
              <span className="groups-inspector-account-tag">
                <AccountMark />
                <span>#{resolvedInspector.login}</span>
                {resolvedInspector.accountName ? <span>· {resolvedInspector.accountName}</span> : null}
              </span>
              <ChevronRight size={11} className="groups-crumb-sep" />
              <strong>{resolvedInspector.activeField.label}</strong>
            </div>
            <div className="groups-inspector-actions">
              <button
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm"
                disabled={!resolvedInspector.activeField.hasValue}
                onClick={() => copyFieldValue(`inspector:${resolvedInspector.activeField.key}`, resolvedInspector.activeField.value)}
              >
                {copiedFieldKey === `inspector:${resolvedInspector.activeField.key}` ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedFieldKey === `inspector:${resolvedInspector.activeField.key}` ? 'Copied' : `Copy ${resolvedInspector.activeField.label}`}</span>
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm"
                onClick={() => openAccountDetails(resolvedInspector.account, resolvedInspector.activeField.tab)}
              >
                <ExternalLink size={12} />
                <span>Open {resolvedInspector.activeField.tab} Details</span>
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-icon ui-btn-sm"
                aria-label="Close field inspector"
                title="Close field inspector"
                onClick={() => setInspectedFieldRoute(null)}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="groups-inspector-body">
            <div className="groups-inspector-primary">
              <div className="groups-inspector-primary-head">
                <span className="groups-inspector-primary-label">{resolvedInspector.activeField.label}</span>
                <span className="groups-router-field-category">{resolvedInspector.activeField.category}</span>
              </div>
              <div className="groups-inspector-primary-value" data-testid="groups-inspector-primary-value">
                {resolvedInspector.activeField.value}
              </div>
            </div>

            <div className="groups-inspector-pills" role="tablist" aria-label="Account properties">
              {resolvedInspector.fields
                .filter((field) => field.hasValue || ['email', 'leverage', 'balance', 'equity', 'margin', 'phone', 'status'].includes(field.key))
                .slice(0, 10)
                .map((field) => {
                  const active = field.key === resolvedInspector.activeField.key;
                  return (
                    <button
                      key={field.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`groups-inspector-pill${active ? ' is-active' : ''}`}
                      onClick={() => setInspectedFieldRoute((prev) => (prev ? { ...prev, fieldKey: field.key } : prev))}
                      onDoubleClick={() => openAccountDetails(resolvedInspector.account, field.tab)}
                    >
                      <span className="groups-inspector-pill-label">{field.label}</span>
                      <span className="groups-inspector-pill-val">{field.value}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      <div className="groups-explorer-table-wrap ui-card" tabIndex={0} onKeyDown={handleKeyDown} aria-busy={loading || fetching}>
        {error && (
          <div className="groups-explorer-error" role="alert">
            <strong>API Error.</strong> {error.message || 'Failed to load groups.'}
            <button type="button" onClick={() => refetch()}>Retry</button>
          </div>
        )}
        {openedGroup ? (
          <table className="ui-grid groups-explorer-grid groups-account-grid" aria-label={`Accounts in ${openedGroup.name}`}>
            <thead>
              <tr>
                {GROUP_ACCOUNT_COLUMNS.map((column) => (
                  <th key={column.key} scope="col" style={column.numeric ? { textAlign: 'right' } : undefined}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((row) => {
                const selected = row.login === selectedLogin;
                return (
                  <tr
                    key={row.login}
                    className={selected ? 'is-selected is-account' : 'is-account'}
                    aria-selected={selected}
                    onClick={() => setSelectedLogin(row.login)}
                    onDoubleClick={() => (row.account ? openAccountDetails(row.account, 'Overview') : openAccountWindow())}
                  >
                    {GROUP_ACCOUNT_COLUMNS.map((column, index) => (
                      <td key={column.key} style={column.numeric ? { textAlign: 'right' } : undefined}>
                        {index === 0 ? (
                          <span className="groups-row-name is-account">
                            <span className="groups-row-glyph" aria-hidden="true">
                              <AccountMark />
                            </span>
                            <span className="groups-row-label">{row.login}</span>
                          </span>
                        ) : row[column.key] !== '' ? row[column.key] : <span className="groups-cell-empty">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className={`ui-grid groups-explorer-grid${allGroups ? ' is-all-groups' : ''}`} aria-label={allGroups ? 'All groups' : isRoot ? 'Groups' : `Groups in ${folder}`}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className={column.key === 'group' ? 'is-name' : 'is-center'}>{column.label}</th>
                ))}
                <th scope="col" className="groups-row-actions-head">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((node) => {
                const branch = rowIsBranch(node);
                const asFolder = !allGroups;
                const values = rowValues(node, !branch);
                const selected = node.id === selectedId;
                const nestedCount = branch ? node.count : (accountCounts.get(groupNameKey(node.name)) || 0);
                return (
                  <tr
                    key={node.id}
                    className={`${selected ? 'is-selected' : ''}${asFolder ? ' is-folder' : ' is-group'}`}
                    aria-selected={selected}
                    data-node-id={node.id}
                    onClick={() => setSelectedId(node.id)}
                    onDoubleClick={() => activate(node)}
                    onContextMenu={(event) => openContextMenu(event, node)}
                  >
                    {columns.map((column, index) => (
                      <td key={column.key} className={column.key === 'group' ? 'is-name' : 'is-center'}>
                        {index === 0 ? (
                          <span className={`groups-row-name${asFolder ? ' is-folder' : ' is-group'}`}>
                            {asFolder && <ChevronRight size={12} className="groups-row-chevron" aria-hidden="true" />}
                            <span className="groups-row-glyph" aria-hidden="true">
                              <GroupFolderIcon />
                            </span>
                            <span className="groups-row-label">{allGroups ? node.name : node.label}</span>
                            {asFolder && nestedCount > 0 && <span className="groups-row-count">({nestedCount})</span>}
                          </span>
                        ) : values[column.key] !== '' ? values[column.key] : asFolder && branch ? null : <span className="groups-cell-empty">—</span>}
                      </td>
                    ))}
                    <td className="groups-row-actions" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="groups-row-action"
                        aria-label={`Edit ${node.label}`}
                        title="Edit group"
                        onClick={() => openProperties(node)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="groups-row-action is-danger"
                        aria-label={`Delete ${node.label}`}
                        title="Delete"
                        disabled={deleting}
                        onClick={() => deleteNode(node)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {openedGroup ? (
          accountsQuery.isLoading ? (
            <p className="groups-explorer-empty" role="status">Loading accounts...</p>
          ) : accountsQuery.error ? (
            <p className="groups-explorer-empty" role="status">{accountsQuery.error.message || 'Failed to load accounts.'}</p>
          ) : visibleAccounts.length === 0 ? (
            <p className="groups-explorer-empty" role="status">{search.trim() ? 'No accounts match your search.' : 'There are no accounts in this group.'}</p>
          ) : null
        ) : loading ? (
          <p className="groups-explorer-empty" role="status">Loading groups...</p>
        ) : !error && visibleRows.length === 0 ? (
          <p className="groups-explorer-empty" role="status">{emptyMessage}</p>
        ) : null}
      </div>

      <div className="groups-explorer-footer">
        <div role="tablist" aria-label="Group list views" className="groups-explorer-tabs">
          <button type="button" role="tab" aria-selected={!allGroups} className={allGroups ? '' : 'is-active'} onClick={() => { setAllGroups(false); }}>
            Groups {folder ? `${folder} ` : ''}({folderCount})
          </button>
          <button type="button" role="tab" aria-selected={allGroups} className={allGroups ? 'is-active' : ''} onClick={() => { setAllGroups(true); setOpenedGroup(null); setSelectedLogin(null); setSelectedId(null); }}>
            All Groups ({groups.length})
          </button>
        </div>
        <div className="groups-explorer-tip" role="status">
          <Info size={12} />
          <span>{openedGroup
            ? 'Double-click an account to open its details, or route / field (e.g. / email, / leverage).'
            : allGroups
              ? 'Double-click a group to open its accounts.'
              : 'Double-click a folder to open it, or route via search (group / account / field) and press Enter.'}</span>
        </div>
      </div>

      {contextMenu && (
        <div
          className="ui-ctxmenu fixed z-[1000]"
          role="menu"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 300), left: Math.min(contextMenu.x, window.innerWidth - 230), minWidth: 210 }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {rowIsBranch(contextMenu.node) ? (
            <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => openFolder(contextMenu.node.path))}>
              <FolderOpen size={14} className="groups-icon-folder" /><span className="flex-1">Open</span>
            </div>
          ) : contextMenu.node.group && (
            <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => openGroupAccounts(contextMenu.node.group))}>
              <FolderOpen size={14} className="groups-icon-folder" /><span className="flex-1">Open accounts</span>
            </div>
          )}
          <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => openProperties(contextMenu.node))}>
            <Pencil size={14} /><span className="flex-1">Settings</span>
          </div>
          <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => copyNode(contextMenu.node))}>
            <Copy size={14} /><span className="flex-1">Copy</span><span className="kbd">Ctrl+C</span>
          </div>
          <div className="ui-ctxmenu-item" role="menuitem" onClick={handleFindClick}>
            <Search size={14} /><span className="flex-1">Find</span><span className="kbd">Ctrl+F</span>
          </div>
          <div className="ui-ctxmenu-sep" />
          <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => addGroup(containerOf(contextMenu.node)))}>
            <Plus size={14} /><span className="flex-1">Add group</span>
          </div>
          <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => askSubgroup(containerOf(contextMenu.node)))}>
            <FolderPlus size={14} /><span className="flex-1">Add subgroup</span>
          </div>
          {contextMenu.node.group && (
            <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => duplicateGroup(contextMenu.node))}>
              <Copy size={14} /><span className="flex-1">Duplicate group</span>
            </div>
          )}
          <div className="ui-ctxmenu-sep" />
          <div className={`ui-ctxmenu-item is-danger${deleting ? ' is-disabled' : ''}`} role="menuitem" onClick={menuAction(() => deleteNode(contextMenu.node))}>
            <Trash2 size={14} /><span className="flex-1">{rowIsBranch(contextMenu.node) ? 'Delete with subgroups' : 'Delete group'}</span>
          </div>
        </div>
      )}

      {subgroupDraft && (() => {
        const subgroupSep = separatorForContainer(groups, subgroupDraft.parent);
        const trimmedSubgroupName = subgroupDraft.name.trim();
        const previewPath = nestGroupName(subgroupDraft.parent, trimmedSubgroupName || 'subgroup-name', subgroupSep);
        const closeSubgroupModal = () => {
          setParentMenuOpen(false);
          setSubgroupDraft(null);
        };
        return (
          <div
            className="ui-modal-backdrop groups-subgroup-backdrop"
            onMouseDown={(event) => { if (event.target === event.currentTarget) closeSubgroupModal(); }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (parentMenuOpen) setParentMenuOpen(false);
                else closeSubgroupModal();
              }
            }}
          >
            <form
              className="ui-modal groups-subgroup-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="groups-subgroup-title"
              onSubmit={submitSubgroup}
            >
              <div className="ui-modal-header groups-subgroup-header">
                <span className="groups-subgroup-header-icon" aria-hidden="true">
                  <FolderPlus size={15} />
                </span>
                <div className="groups-subgroup-heading">
                  <span id="groups-subgroup-title" className="groups-subgroup-title">New subgroup</span>
                  <small className="groups-subgroup-subtitle">Place a nested group inside an existing folder hierarchy</small>
                </div>
                <button
                  type="button"
                  className="groups-subgroup-close"
                  aria-label="Close subgroup dialog"
                  onClick={closeSubgroupModal}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="ui-modal-body groups-subgroup-body">
                <div className="groups-subgroup-section-heading">
                  <h2>Hierarchy &amp; naming</h2>
                  <p>Select the parent container folder and define the subgroup identifier.</p>
                </div>

                <div className="groups-subgroup-fields">
                  <div className="groups-subgroup-field">
                    <div className="groups-subgroup-field-label">
                      <label id="groups-subgroup-parent-label">Inside group</label>
                      <span>Parent container</span>
                    </div>
                    <div className="groups-subgroup-select-wrap">
                      <button
                        type="button"
                        id="groups-subgroup-parent"
                        className="groups-subgroup-control groups-subgroup-select-btn"
                        aria-haspopup="listbox"
                        aria-expanded={parentMenuOpen}
                        aria-labelledby="groups-subgroup-parent-label"
                        onClick={() => setParentMenuOpen((open) => !open)}
                      >
                        <span className="groups-subgroup-select-value">
                          {subgroupDraft.parent ? (
                            <span className="groups-row-glyph" aria-hidden="true">
                              <GroupFolderIcon />
                            </span>
                          ) : (
                            <Users size={13} className="groups-icon-group" aria-hidden="true" />
                          )}
                          <span>{subgroupDraft.parent || 'Groups (top level)'}</span>
                        </span>
                        <ChevronDown size={13} className="groups-subgroup-select-chevron" aria-hidden="true" />
                      </button>

                      {parentMenuOpen && (
                        <div
                          className="groups-subgroup-menu"
                          role="listbox"
                          aria-labelledby="groups-subgroup-parent-label"
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={!subgroupDraft.parent}
                            className={!subgroupDraft.parent ? 'is-selected' : ''}
                            onClick={() => {
                              setSubgroupDraft((draft) => ({ ...draft, parent: '' }));
                              setParentMenuOpen(false);
                            }}
                          >
                            <span className="groups-subgroup-option-label">
                              <Users size={13} className="groups-icon-group" aria-hidden="true" />
                              <span>Groups (top level)</span>
                            </span>
                            {!subgroupDraft.parent ? <Check size={12} aria-hidden="true" /> : null}
                          </button>
                          {containers.map((container) => {
                            const isSelected = subgroupDraft.parent === container;
                            return (
                              <button
                                key={container}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={isSelected ? 'is-selected' : ''}
                                onClick={() => {
                                  setSubgroupDraft((draft) => ({ ...draft, parent: container }));
                                  setParentMenuOpen(false);
                                }}
                              >
                                <span className="groups-subgroup-option-label">
                                  <span className="groups-row-glyph" aria-hidden="true">
                                    <GroupFolderIcon />
                                  </span>
                                  <span>{container}</span>
                                </span>
                                {isSelected ? <Check size={12} aria-hidden="true" /> : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="groups-subgroup-field">
                    <div className="groups-subgroup-field-label">
                      <label htmlFor="groups-subgroup-name">
                        Subgroup name <span className="groups-subgroup-required">*</span>
                      </label>
                      <span>Leaf identifier</span>
                    </div>
                    <input
                      id="groups-subgroup-name"
                      className="ui-input groups-subgroup-control"
                      placeholder="e.g. pro-ecn, vip-usd, standard"
                      autoFocus
                      value={subgroupDraft.name}
                      onFocus={() => setParentMenuOpen(false)}
                      onChange={(event) => setSubgroupDraft((draft) => ({ ...draft, name: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="groups-subgroup-preview" aria-live="polite">
                  <div className="groups-subgroup-preview-head">
                    <span className="groups-subgroup-preview-label">Target group path</span>
                    <span className="groups-subgroup-preview-sep">Separator: <code>{subgroupSep}</code></span>
                  </div>
                  <div className="groups-subgroup-preview-box">
                    <span className="groups-row-glyph" aria-hidden="true">
                      <GroupFolderIcon />
                    </span>
                    <code className="groups-subgroup-preview-code">
                      {subgroupDraft.parent ? (
                        <>
                          <span className="groups-subgroup-preview-parent">{subgroupDraft.parent}{subgroupSep}</span>
                          <span>{trimmedSubgroupName || 'subgroup-name'}</span>
                        </>
                      ) : (
                        <>
                          <span className="groups-subgroup-preview-parent">Groups{subgroupSep}</span>
                          <span>{ previewPath }</span>
                        </>
                      )}
                    </code>
                  </div>
                </div>
              </div>

              <div className="ui-modal-footer groups-subgroup-footer">
                <span className="groups-subgroup-footer-note">Opens group parameters next</span>
                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={closeSubgroupModal}>Cancel</button>
                <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!trimmedSubgroupName}>Continue</button>
              </div>
            </form>
          </div>
        );
      })()}

      {permissionAction && <GroupPermissionNotice action={permissionAction} onClose={() => setPermissionAction(null)} />}
      {deleteSelection && <GroupOperationModal
        selection={deleteSelection}
        onClose={() => setDeleteSelection(null)}
        onComplete={() => {
          setSelectedId(null);
          invalidateGroups();
          queryClient.invalidateQueries({ queryKey: ['sidebar-accounts'] });
        }}
      />}

      {propertiesGroup && (
        <GroupPropertiesModal
          group={propertiesGroup}
          onClose={() => setPropertiesGroup(null)}
          onSaved={(saved) => {
            const notice = describeGroupSave(saved);
            showResult.success(notice.message, { title: notice.title });
            invalidateGroups();
            queryClient.invalidateQueries({ queryKey: ['sidebar-accounts'] });
          }}
        />
      )}

      {openedAccount && (
        <AccountDetailsModal
          account={openedAccount}
          initialTab={openedAccountTab}
          onClose={() => setOpenedAccount(null)}
        />
      )}
    </div>
  );
};

export default GroupsPage;
