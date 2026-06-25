import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Trash2, Edit2, Filter, Loader2 } from 'lucide-react';
import NewGroupModal from './components/NewGroupModal';
import { fetchManagerApi } from '../../services/managerFetch';
import { getActiveGroupsPage, getGroupsPage } from '../../services/api';
import { usePermissions } from '../../hooks/usePermissions';
import usePagedData from '../../hooks/usePagedData';
import { PERMISSIONS } from '../../utils/permissions';

const GroupsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canAct } = usePermissions();
  const canManageGroups = canAct(PERMISSIONS.MANAGE_GROUPS);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editGroup, setEditGroup] = useState(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const pageSize = 100;

  const params = useMemo(() => ({
    search,
    sort_by: 'name',
    sort_dir: 'asc',
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
    setEditGroup(group);
    setIsModalOpen(true);
  };

  const handleNewGroup = () => {
    if (!canManageGroups) { alert('Your role does not have permission to manage groups.'); return; }
    setEditGroup(null);
    setIsModalOpen(true);
  };

  const handleActiveGroupsFilter = () => {
    resetPage();
    setActiveOnly((value) => !value);
  };

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
                    <th>Group Name</th>
                    <th>Description</th>
                    <th>Routing</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>
                        No groups match your search.
                      </td>
                    </tr>
                  ) : groups.map((group) => (
                    <tr
                      key={group.name}
                      onClick={() => navigate(`/groups/${group.name}`)}
                      style={{ cursor: 'pointer' }}
                    >
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
                  ))}
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
                <span className="tabular px-1" style={{ color: 'var(--text-2)' }}>{page + 1} / {totalPages ?? '?'}</span>
                <button onClick={nextPage} disabled={!hasMore || isFetching} className="ui-btn ui-btn-secondary ui-btn-xs">Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      {isModalOpen && (
        <NewGroupModal
          initialData={editGroup}
          onClose={() => { setIsModalOpen(false); setEditGroup(null); }}
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
