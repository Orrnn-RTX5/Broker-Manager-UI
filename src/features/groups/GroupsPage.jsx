import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ChevronRight, Copy, Folder, FolderOpen, FolderPlus, Info, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import NewGroupModal from './components/NewGroupModal';
import GroupPropertiesModal from './components/GroupPropertiesModal';
import GroupPermissionNotice from './components/GroupPermissionNotice';
import GroupOperationModal from './components/GroupOperationModal';
import { groupOperationsEnabled, readSavedOperation } from './groupOperations.js';
import { getSidebarAccountsQueryOptions } from '../../services/sidebarAccounts.js';
import { usePermissions } from '../../hooks/usePermissions';
import useWorkspaceNavigation from '../../hooks/useWorkspaceNavigation';
import { useAllGroups } from '../../hooks/useAllGroups';
import { PERMISSIONS } from '../../utils/permissions';
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
import { GROUP_ACCOUNT_COLUMNS, accountsInGroup, countAccountsByGroup } from './groupAccountRows.js';
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

const GroupsPage = () => {
  const location = useLocation();
  const navigate = useWorkspaceNavigation();
  const queryClient = useQueryClient();
  const { canAct } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
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
  const [selectedId, setSelectedId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [newGroup, setNewGroup] = useState(null);
  const [subgroupDraft, setSubgroupDraft] = useState(null);
  const [propertiesGroup, setPropertiesGroup] = useState(null);
  const [openedGroup, setOpenedGroup] = useState(null);
  const [selectedLogin, setSelectedLogin] = useState(null);
  const [deleteSelection, setDeleteSelection] = useState(null);
  const deleting = Boolean(deleteSelection);
  const operationsEnabled = groupOperationsEnabled();
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
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((node) => {
      const values = rowValues(node, true);
      return [node.name, node.label, ...Object.values(values)].some((value) => String(value).toLowerCase().includes(query));
    });
  }, [rows, search]);
  const columns = allGroups ? ALL_GROUPS_COLUMNS : FOLDER_COLUMNS;
  const selectedNode = visibleRows.find((node) => node.id === selectedId) ?? null;
  const folderCount = countGroupsUnder(groups, folder);
  const segments = splitGroupPath(folder);
  const containers = useMemo(() => listGroupContainerPaths(groups), [groups]);
  const accountRows = useMemo(
    () => (openedGroup ? accountsInGroup(accountsQuery.data?.rows, openedGroup.name, openedGroup) : []),
    [accountsQuery.data, openedGroup],
  );
  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accountRows;
    return accountRows.filter((row) => GROUP_ACCOUNT_COLUMNS.some((column) => String(row[column.key]).toLowerCase().includes(query)));
  }, [accountRows, search]);

  const invalidateGroups = () => queryClient.invalidateQueries({ queryKey: ['groups'] });
  const openFolder = useCallback((path) => navigate(getGroupsFolderPath(path)), [navigate]);
  const goUp = () => {
    if (openedGroup) {
      setOpenedGroup(null);
      setSelectedLogin(null);
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
    setSearch('');
  };
  // A folder with subgroups opens. A group that holds accounts directly lists those accounts.
  const activate = (node) => {
    if (!node) return;
    if (rowIsBranch(node)) openFolder(node.path);
    else openGroupAccounts(node.group);
  };
  const openAccountWindow = () => { if (openedGroup) setPropertiesGroup(openedGroup); };

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
    setNewGroup({ presetName: container ? `${container}${separator}` : '' });
  };
  const askSubgroup = (container = targetContainer) => {
    if (!requireManage('create')) return;
    setSubgroupDraft({ parent: container, name: 'New subgroup' });
  };
  const submitSubgroup = (event) => {
    event.preventDefault();
    const name = subgroupDraft?.name.trim();
    if (!name) return;
    const presetName = nestGroupName(subgroupDraft.parent, name, separatorForContainer(groups, subgroupDraft.parent));
    setSubgroupDraft(null);
    setNewGroup({ presetName });
  };
  const duplicateGroup = (node) => {
    if (!node?.group || !requireManage('create')) return;
    setNewGroup({ duplicateData: node.group });
  };

  const deleteNode = (node) => {
    if (!node || !requireManage('delete')) return;
    const saved = readSavedOperation();
    if (saved) { setDeleteSelection(saved.selection); return; }
    if (!operationsEnabled) { showResult.error('Group operations are not enabled for this broker.'); return; }
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
        if (selectedLogin) openAccountWindow();
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

  // Keep the top-level Edit menu aware of the explorer selection.
  useEffect(() => {
    publishEditMenuContext({ selectedCount: selectedNode ? 1 : 0, view: 'groups' });
    return () => publishEditMenuContext({ selectedCount: 0 });
  }, [selectedNode]);

  // Publish the latest selection/handlers to the stable window listener
  // below. A passive no-deps effect (not a render-phase write): menu clicks
  // dispatch in a later task, after effects flush, so every dispatch observes
  // the committed render's values — identical behaviour, safe under
  // StrictMode double-render and concurrent aborted renders.
  useEffect(() => {
    handlersRef.current = { selectedNode, openProperties, duplicateGroup, copyNode, focusSearch };
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
            <button type="button" className={`groups-crumb${isRoot && !allGroups && !openedGroup ? ' is-current' : ''}`} onClick={() => { setOpenedGroup(null); setSelectedLogin(null); openFolder(''); }}>
              <Users size={13} className="groups-icon-group" />
              <span>Groups</span>
            </button>
            {segments.map((part, index) => {
              const path = segments.slice(0, index + 1).join(pathSeparatorOf(folder));
              const current = index === segments.length - 1 && !allGroups && !openedGroup;
              return (
                <span key={path} className="groups-crumb-segment">
                  <ChevronRight size={11} className="groups-crumb-sep" />
                  <button type="button" className={`groups-crumb${current ? ' is-current' : ''}`} aria-current={current ? 'page' : undefined} onClick={() => { setOpenedGroup(null); setSelectedLogin(null); openFolder(path); }}>
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
          <div className="relative">
            <Search size={13} className="groups-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Find in this view..."
              aria-label="Find groups in this view"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="ui-input ui-input-sm groups-search"
            />
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
          <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" disabled={!selectedNode || deleting || !operationsEnabled} title="Delete the selected group or folder" onClick={() => deleteNode(selectedNode)}>
            <Trash2 size={12} /> {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

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
                    onClick={() => { setSelectedLogin(row.login); openAccountWindow(); }}
                    onDoubleClick={openAccountWindow}
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
                const nestedCount = branch ? node.count : (accountCounts.get(String(node.name || '').trim().toLowerCase()) || 0);
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
            ? 'Click an account to open its group window. Backspace returns to the folder.'
            : allGroups
              ? 'Double-click a group to open its accounts.'
              : 'Double-click a folder to open it. A group with no subgroups opens its accounts. Backspace goes up one level.'}</span>
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

      {subgroupDraft && (
        <div className="ui-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSubgroupDraft(null); }}>
          <form className="ui-modal groups-subgroup-dialog" role="dialog" aria-modal="true" aria-labelledby="groups-subgroup-title" onSubmit={submitSubgroup}>
            <div className="ui-modal-header" id="groups-subgroup-title">Add subgroup</div>
            <div className="ui-modal-body">
              <p>Choose the folder that will contain the new subgroup, then name it. The full group name keeps that folder's separator.</p>
              <label>
                Inside group
                <select className="ui-input ui-input-sm" value={subgroupDraft.parent} onChange={(event) => setSubgroupDraft((draft) => ({ ...draft, parent: event.target.value }))}>
                  <option value="">Groups (top level)</option>
                  {containers.map((container) => <option key={container} value={container}>{container}</option>)}
                </select>
              </label>
              <label>
                Subgroup name
                <input className="ui-input ui-input-sm" autoFocus value={subgroupDraft.name} onChange={(event) => setSubgroupDraft((draft) => ({ ...draft, name: event.target.value }))} />
              </label>
            </div>
            <div className="ui-modal-footer">
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setSubgroupDraft(null)}>Cancel</button>
              <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!subgroupDraft.name.trim()}>Continue</button>
            </div>
          </form>
        </div>
      )}

      {newGroup && (
        <NewGroupModal
          presetName={newGroup.presetName}
          duplicateData={newGroup.duplicateData}
          onClose={() => setNewGroup(null)}
          onSuccess={(saved) => {
            const notice = describeGroupSave(saved, { created: true });
            showResult.success(notice.message, { title: notice.title });
            invalidateGroups();
          }}
        />
      )}

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
    </div>
  );
};

export default GroupsPage;
