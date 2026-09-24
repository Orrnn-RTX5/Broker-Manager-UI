import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ChevronRight, Copy, Folder, FolderOpen, FolderPlus, Info, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import NewGroupModal from './components/NewGroupModal';
import GroupPropertiesModal from './components/GroupPropertiesModal';
import { fetchManagerApi } from '../../services/managerFetch';
import { usePermissions } from '../../hooks/usePermissions';
import useWorkspaceNavigation from '../../hooks/useWorkspaceNavigation';
import { useAllGroups } from '../../hooks/useAllGroups';
import { PERMISSIONS } from '../../utils/permissions';
import { showResult } from '../../store/resultDialogStore.js';
import { copyToClipboard, rowsToTSV } from '../../utils/gridUtils';
import { EDIT_MENU_ACTION_EVENT, isEditableElement, publishEditMenuContext } from '../../utils/editMenuActions';
import { getGroupsFolderFromSearch, getGroupsFolderPath, getGroupsSelectedFromSearch } from './groupRoutes';
import {
  GROUP_PATH_SEPARATOR,
  countGroupsUnder,
  getGroupFolderRows,
  getGroupParentPath,
  getGroupRowText,
  groupRowNode,
  isGroupBranch,
  joinGroupPath,
  listGroupContainerPaths,
  listGroupsUnder,
  splitGroupPath,
} from './groupTree.js';
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
const NO_PERMISSION = 'Your role does not have permission to manage groups.';

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

  const [allGroups, setAllGroups] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [newGroup, setNewGroup] = useState(null);
  const [subgroupDraft, setSubgroupDraft] = useState(null);
  const [propertiesGroup, setPropertiesGroup] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const searchInputRef = useRef(null);
  const handlersRef = useRef({});

  // Opening another folder clears the selection and returns to the folder tab.
  useEffect(() => {
    setSelectedId(null);
    setAllGroups(false);
    setContextMenu(null);
  }, [folder]);

  // A group picked in the Navigator is selected in its folder and scrolled into
  // view; the click also asks (through navigation state) for its properties.
  useEffect(() => {
    if (!navigatorGroup) return;
    const rowId = `group:${navigatorGroup}`;
    setSelectedId(rowId);
    const frame = requestAnimationFrame(() => {
      document.querySelector(`[data-node-id="${CSS.escape(rowId)}"]`)?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [folder, navigatorGroup, loading]);

  useEffect(() => {
    if (!navigatorGroup || !location.state?.openGroupProperties) return;
    const group = groups.find((item) => groupRowNode(item).name === navigatorGroup);
    if (!group) return;
    setPropertiesGroup(group);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [navigatorGroup, groups, location.state, location.pathname, location.search, navigate]);

  const folderRows = useMemo(() => getGroupFolderRows(groups, folder), [groups, folder]);
  const allRows = useMemo(() => groups.map(groupRowNode), [groups]);
  const rows = allGroups ? allRows : folderRows;
  const rowIsBranch = useCallback((node) => !allGroups && isGroupBranch(node), [allGroups]);
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((node) => Object.values(rowValues(node, !rowIsBranch(node))).some((value) => String(value).toLowerCase().includes(query)));
  }, [rows, search, rowIsBranch]);
  const columns = allGroups ? ALL_GROUPS_COLUMNS : FOLDER_COLUMNS;
  const selectedNode = visibleRows.find((node) => node.id === selectedId) ?? null;
  const folderCount = countGroupsUnder(groups, folder);
  const segments = splitGroupPath(folder);
  const containers = useMemo(() => listGroupContainerPaths(groups), [groups]);

  const invalidateGroups = () => queryClient.invalidateQueries({ queryKey: ['groups'] });
  const openFolder = useCallback((path) => navigate(getGroupsFolderPath(path)), [navigate]);
  const goUp = () => { if (!isRoot && !allGroups) openFolder(getGroupParentPath(folder)); };
  const openProperties = (node) => { if (node?.group) setPropertiesGroup(node.group); };
  // Folders and main groups open on double-click; a client group opens its properties.
  const activate = (node) => {
    if (!node) return;
    if (rowIsBranch(node)) openFolder(node.path);
    else openProperties(node);
  };

  const requireManage = () => {
    if (canManageGroups) return true;
    showResult.error(NO_PERMISSION);
    return false;
  };
  const containerOf = (node) => (rowIsBranch(node) ? node.path : getGroupParentPath(node.name));
  // The selected row wins over the open folder, so "Add group" lands inside what the user picked.
  const targetContainer = selectedNode ? containerOf(selectedNode) : allGroups ? '' : folder;
  const addGroup = (container = targetContainer) => {
    if (!requireManage()) return;
    setNewGroup({ presetName: container ? `${container}${GROUP_PATH_SEPARATOR}` : '' });
  };
  const askSubgroup = (container = targetContainer) => {
    if (!requireManage()) return;
    setSubgroupDraft({ parent: container, name: 'New subgroup' });
  };
  const submitSubgroup = (event) => {
    event.preventDefault();
    const name = subgroupDraft?.name.trim();
    if (!name) return;
    const presetName = joinGroupPath(subgroupDraft.parent, name);
    setSubgroupDraft(null);
    setNewGroup({ presetName });
  };
  const duplicateGroup = (node) => {
    if (!node?.group || !requireManage()) return;
    setNewGroup({ duplicateData: node.group });
  };

  const deleteGroups = async (names, label) => {
    if (!requireManage() || names.length === 0) return;
    const message = names.length === 1
      ? `Are you sure you want to delete group '${names[0]}'?`
      : `Delete '${label}' and the ${names.length} groups inside it?\n\n${names.join('\n')}`;
    if (!window.confirm(message)) return;
    setDeleting(true);
    const failed = [];
    // Deepest names first, so a parent group never disappears before its subgroups.
    const ordered = [...names].sort((left, right) => right.split(GROUP_PATH_SEPARATOR).length - left.split(GROUP_PATH_SEPARATOR).length);
    for (const name of ordered) {
      try {
        const res = await fetchManagerApi(`/GroupDelete?${new URLSearchParams({ group: name }).toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        failed.push(`${name} (${err.message})`);
      }
    }
    setDeleting(false);
    setSelectedId(null);
    invalidateGroups();
    if (failed.length) showResult.error(`Could not delete: ${failed.join(', ')}`);
    else showResult.success(names.length === 1 ? `Group '${names[0]}' deleted successfully!` : `Deleted ${names.length} groups from '${label}'.`);
  };
  const deleteNode = (node) => {
    if (!node) return;
    const names = rowIsBranch(node) ? listGroupsUnder(groups, node.path).map((group) => group.name) : [node.name];
    deleteGroups(names, node.label);
  };

  const copyNode = async (node) => {
    if (!node) return;
    try {
      await copyToClipboard(rowsToTSV([rowValues(node, true)], columns));
    } catch {
      showResult.error('Unable to copy the selected group.');
    }
  };

  const focusSearch = () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  };

  const handleKeyDown = (event) => {
    if (isEditableElement()) return;
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

  handlersRef.current = { selectedNode, openProperties, duplicateGroup, copyNode, focusSearch };
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
            disabled={isRoot || allGroups}
            onClick={goUp}
          >
            <ArrowUp size={13} />
          </button>
          <nav aria-label="Group folder path" className="groups-explorer-crumbs">
            <button type="button" className={`groups-crumb${isRoot && !allGroups ? ' is-current' : ''}`} onClick={() => openFolder('')}>
              <Users size={13} className="groups-icon-group" />
              <span>Groups</span>
            </button>
            {segments.map((part, index) => {
              const path = segments.slice(0, index + 1).join(GROUP_PATH_SEPARATOR);
              const current = index === segments.length - 1 && !allGroups;
              return (
                <span key={path} className="groups-crumb-segment">
                  <ChevronRight size={11} className="groups-crumb-sep" />
                  <button type="button" className={`groups-crumb${current ? ' is-current' : ''}`} aria-current={current ? 'page' : undefined} onClick={() => openFolder(path)}>
                    <Folder size={13} className="groups-icon-folder" />
                    <span>{part}</span>
                  </button>
                </span>
              );
            })}
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
          <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!canManageGroups} title={canManageGroups ? 'Create a group inside the selected folder' : NO_PERMISSION} onClick={() => addGroup()}>
            <Plus size={13} /> Add group
          </button>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!canManageGroups} title={canManageGroups ? 'Create a subgroup inside a chosen group' : NO_PERMISSION} onClick={() => askSubgroup()}>
            <FolderPlus size={13} /> Add subgroup
          </button>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={!selectedNode?.group} title="Group properties" onClick={() => openProperties(selectedNode)}>
            <Pencil size={12} /> Settings
          </button>
          <button type="button" className="ui-btn ui-btn-danger ui-btn-sm" disabled={!selectedNode || deleting || !canManageGroups} title={canManageGroups ? 'Delete the selected group or folder' : NO_PERMISSION} onClick={() => deleteNode(selectedNode)}>
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
        <table className="ui-grid groups-explorer-grid" aria-label={allGroups ? 'All groups' : isRoot ? 'Groups' : `Groups in ${folder}`}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" style={column.numeric ? { textAlign: 'right' } : undefined}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((node) => {
              const branch = rowIsBranch(node);
              const values = rowValues(node, !branch);
              const selected = node.id === selectedId;
              const Icon = branch ? Folder : Users;
              return (
                <tr
                  key={node.id}
                  className={selected ? 'is-selected' : ''}
                  aria-selected={selected}
                  data-node-id={node.id}
                  onClick={() => setSelectedId(node.id)}
                  onDoubleClick={() => activate(node)}
                  onContextMenu={(event) => openContextMenu(event, node)}
                >
                  {columns.map((column, index) => (
                    <td key={column.key} style={column.numeric ? { textAlign: 'right' } : undefined}>
                      {index === 0 ? (
                        <span className="groups-row-name">
                          <Icon size={14} className={branch ? 'groups-icon-folder' : 'groups-icon-group'} />
                          <span>{values.group}</span>
                          {branch && node.count > 0 && <span className="groups-row-count">{node.count}</span>}
                        </span>
                      ) : values[column.key] !== '' ? values[column.key] : <span className="groups-cell-empty">—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading ? (
          <p className="groups-explorer-empty" role="status">Loading groups...</p>
        ) : !error && visibleRows.length === 0 ? (
          <p className="groups-explorer-empty" role="status">{emptyMessage}</p>
        ) : null}
      </div>

      <div className="groups-explorer-footer">
        <div role="tablist" aria-label="Group list views" className="groups-explorer-tabs">
          <button type="button" role="tab" aria-selected={!allGroups} className={allGroups ? '' : 'is-active'} onClick={() => setAllGroups(false)}>
            Groups {folder ? `${folder} ` : ''}({folderCount})
          </button>
          <button type="button" role="tab" aria-selected={allGroups} className={allGroups ? 'is-active' : ''} onClick={() => { setAllGroups(true); setSelectedId(null); }}>
            All Groups ({groups.length})
          </button>
        </div>
        <div className="groups-explorer-tip" role="status">
          <Info size={12} />
          <span>{allGroups ? 'Double-click a group to open its properties.' : 'Double-click a folder to open it, or a group for its properties. Backspace goes up one level.'}</span>
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
          {rowIsBranch(contextMenu.node) && (
            <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => openFolder(contextMenu.node.path))}>
              <FolderOpen size={14} className="groups-icon-folder" /><span className="flex-1">Open</span>
            </div>
          )}
          {contextMenu.node.group && (
            <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => openProperties(contextMenu.node))}>
              <Pencil size={14} /><span className="flex-1">Settings</span>
            </div>
          )}
          <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(() => copyNode(contextMenu.node))}>
            <Copy size={14} /><span className="flex-1">Copy</span><span className="kbd">Ctrl+C</span>
          </div>
          <div className="ui-ctxmenu-item" role="menuitem" onClick={menuAction(focusSearch)}>
            <Search size={14} /><span className="flex-1">Find</span><span className="kbd">Ctrl+F</span>
          </div>
          <div className="ui-ctxmenu-sep" />
          <div className={`ui-ctxmenu-item${canManageGroups ? '' : ' is-disabled'}`} role="menuitem" onClick={menuAction(() => addGroup(containerOf(contextMenu.node)))}>
            <Plus size={14} /><span className="flex-1">Add group</span>
          </div>
          <div className={`ui-ctxmenu-item${canManageGroups ? '' : ' is-disabled'}`} role="menuitem" onClick={menuAction(() => askSubgroup(containerOf(contextMenu.node)))}>
            <FolderPlus size={14} /><span className="flex-1">Add subgroup</span>
          </div>
          {contextMenu.node.group && (
            <div className={`ui-ctxmenu-item${canManageGroups ? '' : ' is-disabled'}`} role="menuitem" onClick={menuAction(() => duplicateGroup(contextMenu.node))}>
              <Copy size={14} /><span className="flex-1">Duplicate group</span>
            </div>
          )}
          <div className="ui-ctxmenu-sep" />
          <div className={`ui-ctxmenu-item is-danger${canManageGroups && !deleting ? '' : ' is-disabled'}`} role="menuitem" onClick={menuAction(() => deleteNode(contextMenu.node))}>
            <Trash2 size={14} /><span className="flex-1">{rowIsBranch(contextMenu.node) ? 'Delete with subgroups' : 'Delete group'}</span>
          </div>
        </div>
      )}

      {subgroupDraft && (
        <div className="ui-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSubgroupDraft(null); }}>
          <form className="ui-modal groups-subgroup-dialog" role="dialog" aria-modal="true" aria-labelledby="groups-subgroup-title" onSubmit={submitSubgroup}>
            <div className="ui-modal-header" id="groups-subgroup-title">Add subgroup</div>
            <div className="ui-modal-body">
              <p>Choose the group that will contain the new subgroup, then name it. The full name joins both with a backslash.</p>
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
          onSuccess={() => {
            showResult.success('Group Created Successfully!');
            invalidateGroups();
          }}
        />
      )}

      {propertiesGroup && (
        <GroupPropertiesModal
          group={propertiesGroup}
          onClose={() => setPropertiesGroup(null)}
          onSaved={() => {
            showResult.success('Group Updated Successfully!');
            invalidateGroups();
          }}
        />
      )}
    </div>
  );
};

export default GroupsPage;
