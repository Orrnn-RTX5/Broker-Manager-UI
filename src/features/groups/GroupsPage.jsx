import { formatPageLabel } from '../../utils/pageLabel.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Trash2, Edit2, Filter, Loader2 } from 'lucide-react';
import NewGroupModal from './components/NewGroupModal';
import { fetchManagerApi } from '../../services/managerFetch';
import { getActiveGroupsPage, getGroupsPage } from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';
import usePagedData from '../../hooks/usePagedData';
import { PERMISSIONS } from '../../utils/permissions';
import { getGroupDetailsPath } from './groupRoutes';
import { copyToClipboard, rowsToCSV, rowsToJSON, rowsToTSV } from '../../utils/gridUtils';
import { EDIT_MENU_ACTION_EVENT, isEditableElement, publishEditMenuContext } from '../../utils/editMenuActions';
import {
  GROUPS_INITIAL_PARAMS,
  WORKSPACE_DATA_STALE_MS,
  WORKSPACE_QUERY_META,
} from '../../utils/workspaceQueryOptions.js';

const GROUP_EXPORT_COLUMNS = [
  { key: 'name', label: 'Group Name' },
  { key: 'description', label: 'Description' },
  { key: 'routingMode', label: 'Routing' },
];

const GroupsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canAct } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState(null);
  const [duplicateGroup, setDuplicateGroup] = useState(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedGroupNames, setSelectedGroupNames] = useState(() => new Set());
  const searchInputRef = useRef(null);
  const pageSize = GROUPS_INITIAL_PARAMS.limit;

  const params = useMemo(() => ({
    search,
    sort_by: GROUPS_INITIAL_PARAMS.sort_by,
    sort_dir: GROUPS_INITIAL_PARAMS.sort_dir,
  }), [search]);

  const {
    rows: groups,
    total,
    hasMore,
    page,
    offset,
    isLoading,
    isFetching,
    isError,
    error,
    nextPage,
    prevPage,
    resetPage,
  } = usePagedData({
    queryKey: ['groups', activeOnly ? 'active' : 'all'],
    queryFn: activeOnly ? getActiveGroupsPage : getGroupsPage,
    params,
    pageSize,
    staleTime: WORKSPACE_DATA_STALE_MS,
    meta: WORKSPACE_QUERY_META,
  });

  const handleDelete = async (e, groupName) => {
    e.stopPropagation();
    if (!canManageGroups) { alert('Your role does not have permission to manage groups.'); return; }
    if (window.confirm(`Are you sure you want to delete group '${groupName}'?`)) {
      try {
        const params = new URLSearchParams({ group: String(groupName) });
        const res = await fetchManagerApi(`/GroupDelete?${params.toString()}`);
        if (!res.ok) throw new Error('Delete failed');
        alert(`Group '${groupName}' deleted successfully!`);
        queryClient.invalidateQueries({ queryKey: ['groups'] });
      } catch (err) {
        alert('Error deleting group: ' + err.message);
      }
    }
  };

  const handleEdit = (e, group) => {
    e.stopPropagation();
    if (!canManageGroups) { alert('Your role does not have permission to manage groups.'); return; }
    setDuplicateGroup(null);
    setEditGroup(group);
    setIsModalOpen(true);
  };

  const handleNewGroup = () => {
    if (!canManageGroups) { alert('Your role does not have permission to manage groups.'); return; }
    setEditGroup(null);
    setIsModalOpen(true);
  };

  const selectedGroups = useMemo(
    () => groups.filter((group) => selectedGroupNames.has(group.name)),
    [groups, selectedGroupNames],
  );

  const clearSelectedGroups = useCallback(() => {
    setSelectedGroupNames(new Set());
  }, []);

  const selectVisibleGroups = useCallback(() => {
    setSelectedGroupNames(new Set(groups.map((group) => group.name)));
  }, [groups]);

  const toggleGroupSelection = useCallback((groupName) => {
    setSelectedGroupNames((previous) => {
      const next = new Set(previous);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  const handleEditSelected = useCallback(() => {
    if (selectedGroups.length !== 1) return;
    if (!canManageGroups) { alert('Your role does not have permission to manage groups.'); return; }
    setDuplicateGroup(null);
    setEditGroup(selectedGroups[0]);
    setIsModalOpen(true);
  }, [canManageGroups, selectedGroups]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedGroups.length !== 1) return;
    if (!canManageGroups) { alert('Your role does not have permission to manage groups.'); return; }
    setEditGroup(null);
    setDuplicateGroup(null);
    setDuplicateGroup(selectedGroups[0]);
    setIsModalOpen(true);
  }, [canManageGroups, selectedGroups]);

  const copySelectedGroups = useCallback(async (format = 'tsv') => {
    if (selectedGroups.length === 0) return;
    const normalizedGroups = selectedGroups.map((group) => ({
      ...group,
      routingMode: group.routingMode === 'a_book' ? 'A-Book' : group.routingMode === 'hybrid' ? 'Hybrid' : 'B-Book',
    }));
    const text = format === 'csv'
      ? rowsToCSV(normalizedGroups, GROUP_EXPORT_COLUMNS)
      : format === 'json'
        ? rowsToJSON(normalizedGroups, GROUP_EXPORT_COLUMNS)
        : rowsToTSV(normalizedGroups, GROUP_EXPORT_COLUMNS);
    await copyToClipboard(text);
  }, [selectedGroups]);

  const handleActiveGroupsFilter = () => {
    resetPage();
    setActiveOnly((value) => !value);
  };

  // Keep the top-level Edit menu aware of the Groups grid selection.
  useEffect(() => {
    publishEditMenuContext({ selectedCount: selectedGroups.length, view: 'groups' });
    return () => publishEditMenuContext({ selectedCount: 0 });
  }, [selectedGroups.length]);

  // Drop selections which are no longer displayed after a search, filter, or page change.
  useEffect(() => {
    const visibleNames = new Set(groups.map((group) => group.name));
    setSelectedGroupNames((previous) => {
      const next = new Set([...previous].filter((name) => visibleNames.has(name)));
      return next.size === previous.size ? previous : next;
    });
  }, [groups]);

  useEffect(() => {
    const handleEditMenuAction = (event) => {
      const { action } = event.detail || {};
      const hasEditableFocus = isEditableElement();

      if (action === 'select-all' && !hasEditableFocus) {
        selectVisibleGroups();
        event.detail.handled = true;
      } else if (action === 'clear-selection' && !hasEditableFocus) {
        clearSelectedGroups();
        event.detail.handled = true;
      } else if (action === 'copy' && selectedGroups.length > 0 && !hasEditableFocus) {
        copySelectedGroups().catch(() => alert('Unable to copy the selected groups.'));
        event.detail.handled = true;
      } else if (action === 'copy-csv' && selectedGroups.length > 0) {
        copySelectedGroups('csv').catch(() => alert('Unable to copy the selected groups.'));
        event.detail.handled = true;
      } else if (action === 'copy-excel' && selectedGroups.length > 0) {
        copySelectedGroups('tsv').catch(() => alert('Unable to copy the selected groups.'));
        event.detail.handled = true;
      } else if (action === 'copy-json' && selectedGroups.length > 0) {
        copySelectedGroups('json').catch(() => alert('Unable to copy the selected groups.'));
        event.detail.handled = true;
      } else if (action === 'edit-selected') {
        handleEditSelected();
        event.detail.handled = true;
      } else if (action === 'duplicate-group') {
        handleDuplicateSelected();
        event.detail.handled = true;
      } else if (action === 'find-current-view') {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        event.detail.handled = true;
      }
    };

    window.addEventListener(EDIT_MENU_ACTION_EVENT, handleEditMenuAction);
    return () => window.removeEventListener(EDIT_MENU_ACTION_EVENT, handleEditMenuAction);
  }, [clearSelectedGroups, copySelectedGroups, handleDuplicateSelected, handleEditSelected, selectVisibleGroups, selectedGroups.length]);

  useEffect(() => {
    const handleKeyboardShortcut = (event) => {
      if (isEditableElement()) return;
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault();
        selectVisibleGroups();
      } else if ((event.ctrlKey || event.metaKey) && key === 'c' && selectedGroups.length > 0) {
        event.preventDefault();
        copySelectedGroups().catch(() => alert('Unable to copy the selected groups.'));
      } else if (event.key === 'Escape' && selectedGroups.length > 0) {
        event.preventDefault();
        clearSelectedGroups();
      } else if (event.key === 'Enter' && selectedGroups.length === 1) {
        event.preventDefault();
        handleEditSelected();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcut, true);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut, true);
  }, [clearSelectedGroups, copySelectedGroups, handleEditSelected, selectVisibleGroups, selectedGroups.length]);

  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = groups.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + groups.length;

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Groups</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Configured trading groups and their settings.
          </p>
        </div>
        <button
          onClick={handleNewGroup}
          disabled={!canManageGroups}
          title={canManageGroups ? 'New Group' : 'No permission to manage groups'}
          className="ui-btn ui-btn-primary ui-btn-sm"
        >
          <Plus size={14} />
          New Group
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search group names..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 32 }}
          />
        </div>

        <button
          onClick={handleActiveGroupsFilter}
          disabled={isFetching}
          className={`ui-btn ${activeOnly ? 'ui-btn-primary' : 'ui-btn-secondary'} ui-btn-sm`}
        >
          {isFetching ? <Loader2 size={13} className="animate-spin" /> : <Filter size={13} />}
          {activeOnly ? 'Show All' : 'Active Only'}
        </button>
      </div>

      <div className="ui-card flex-1 overflow-hidden flex flex-col">
        {isError && (
          <div
            className="px-4 py-2 text-xs break-all"
            style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}
          >
            <strong>API Error.</strong> {error?.message || 'Failed to load groups.'}
          </div>
        )}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
            Fetching groups...
          </div>
        ) : (
          <>
            <div className="w-full overflow-y-auto">
              <table className="ui-grid">
                <thead>
                  <tr>
                    <th className="w-10 text-center">
                      <input
                        type="checkbox"
                        aria-label="Select all visible groups"
                        checked={groups.length > 0 && selectedGroups.length === groups.length}
                        onChange={(event) => event.target.checked ? selectVisibleGroups() : clearSelectedGroups()}
                        className="accent-[var(--accent)]"
                      />
                    </th>
                    <th>Group Name</th>
                    <th>Description</th>
                    <th>Routing</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>
                        No groups match your search.
                      </td>
                    </tr>
                  ) : groups.map((group) => {
                    const isSelected = selectedGroupNames.has(group.name);
                    return (
                    <tr
                      key={group.name}
                      onClick={() => navigate(getGroupDetailsPath(group.name))}
                      style={{ cursor: 'pointer', background: isSelected ? 'var(--accent-soft)' : undefined }}
                    >
                      <td className="text-center" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          aria-label={`Select ${group.name}`}
                          onChange={() => toggleGroupSelection(group.name)}
                          className="accent-[var(--accent)]"
                        />
                      </td>
                      <td style={{ color: 'var(--accent-text)', fontWeight: 500 }}>{group.name}</td>
                      <td style={{ color: 'var(--text-2)' }}>{group.description}</td>
                      <td>
                        <span className={`ui-badge text-[10px] uppercase font-bold px-2 py-0.5 ${
                          group.routingMode === 'a_book' ? 'ui-badge-warning' :
                          group.routingMode === 'hybrid' ? 'ui-badge-primary' :
                          'ui-badge-success'
                        }`}>
                          {group.routingMode === 'a_book' ? 'A-Book' :
                           group.routingMode === 'hybrid' ? 'Hybrid' :
                           'B-Book'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => handleEdit(e, group)}
                            className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                            title={canManageGroups ? 'Edit Group' : 'No permission to manage groups'}
                            disabled={!canManageGroups}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, group.name)}
                            className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                            style={{ color: 'var(--danger)' }}
                            title={canManageGroups ? 'Delete Group' : 'No permission to manage groups'}
                            disabled={!canManageGroups}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <div
              className="flex items-center justify-between px-4 py-2.5 text-xs shrink-0"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}
            >
              <span>
                Showing <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{rangeStart}-{rangeEnd}</span>
                {' '}of{' '}
                <span className="tabular font-medium" style={{ color: 'var(--text-2)' }}>{total ?? 'many'}</span> groups
              </span>
              <div className="flex items-center gap-2">
                <button onClick={prevPage} disabled={page === 0 || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs">Prev</button>
                <span className="tabular px-1" style={{ color: 'var(--text-2)' }}>{formatPageLabel(page, totalPages)}</span>
                <button onClick={nextPage} disabled={!hasMore || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs">Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      {isModalOpen && (
        <NewGroupModal
          initialData={editGroup}
          duplicateData={duplicateGroup}
          onClose={() => { setIsModalOpen(false); setEditGroup(null); setDuplicateGroup(null); }}
          onSuccess={() => {
            alert(editGroup ? 'Group Updated Successfully!' : 'Group Created Successfully!');
            queryClient.invalidateQueries({ queryKey: ['groups'] });
          }}
        />
      )}
    </div>
  );
};

export default GroupsPage;
