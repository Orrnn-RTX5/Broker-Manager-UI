import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGroupList } from '../../hooks/useGroupList';
import { Search, Plus, Trash2, Edit2, Filter, Loader2 } from 'lucide-react';
import NewGroupModal from './components/NewGroupModal';

const GroupsPage = () => {
  const navigate = useNavigate();
  const { groups, loading } = useGroupList();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeGroupsData, setActiveGroupsData] = useState(null);
  const [editGroup, setEditGroup] = useState(null);
  const [isFiltering, setIsFiltering] = useState(false);

  const filteredGroups = useMemo(() => {
    let source = activeGroupsData || groups;
    if (!search) return source;
    return source.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
  }, [groups, search, activeGroupsData]);

  const handleDelete = async (e, groupName) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete group '${groupName}'?`)) {
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`/api/manager/GroupDelete?id=${token}&group=${groupName}`);
        if (!res.ok) throw new Error('Delete failed');
        alert(`Group '${groupName}' deleted successfully!`);
        window.location.reload();
      } catch (err) {
        alert('Error deleting group: ' + err.message);
      }
    }
  };

  const handleEdit = (e, group) => {
    e.stopPropagation();
    setEditGroup(group);
    setIsModalOpen(true);
  };

  const handleActiveGroupsFilter = async () => {
    if (activeGroupsData) { setActiveGroupsData(null); return; }
    setIsFiltering(true);
    try {
      const id = localStorage.getItem('authToken');
      const res = await fetch(`/api/manager/UserGroups?id=${id}`, {
        method: 'GET', headers: { accept: 'application/json' },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        const formatted = data.map(item => typeof item === 'string'
          ? { name: item, description: '' }
          : { name: item.Group || item.name || 'Unnamed', description: item.Currency || item.description || '' });
        setActiveGroupsData(formatted);
      } else if (data && Array.isArray(data.groups)) {
        setActiveGroupsData(data.groups);
      } else if (data && data.error) {
        throw new Error(data.error);
      } else {
        alert('Unexpected response:\n' + JSON.stringify(data, null, 2));
      }
    } catch (err) {
      alert('Error fetching active groups: ' + err.message);
    } finally {
      setIsFiltering(false);
    }
  };

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>Groups</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Configured trading groups and their settings.
          </p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="ui-btn ui-btn-primary ui-btn-sm">
          <Plus size={14} />
          New Group
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search group names…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 32 }}
          />
        </div>

        <button
          onClick={handleActiveGroupsFilter}
          disabled={isFiltering}
          className={`ui-btn ${activeGroupsData ? 'ui-btn-primary' : 'ui-btn-secondary'} ui-btn-sm`}
        >
          {isFiltering ? <Loader2 size={13} className="animate-spin" /> : <Filter size={13} />}
          {activeGroupsData ? 'Show All' : 'Active Only'}
        </button>
      </div>

      <div className="ui-card flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
            Fetching groups…
          </div>
        ) : (
          <div className="w-full overflow-y-auto">
            <table className="ui-grid">
              <thead>
                <tr>
                  <th>Group Name</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>
                      No groups match your search.
                    </td>
                  </tr>
                ) : filteredGroups.map(group => (
                  <tr
                    key={group.name}
                    onClick={() => navigate(`/groups/${group.name}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ color: 'var(--accent-text)', fontWeight: 500 }}>{group.name}</td>
                    <td style={{ color: 'var(--text-2)' }}>{group.description}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => handleEdit(e, group)}
                          className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                          title="Edit Group"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, group.name)}
                          className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                          style={{ color: 'var(--danger)' }}
                          title="Delete Group"
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
        )}
      </div>

      {isModalOpen && (
        <NewGroupModal
          initialData={editGroup}
          onClose={() => { setIsModalOpen(false); setEditGroup(null); }}
          onSuccess={() => {
            alert(editGroup ? 'Group Updated Successfully!' : 'Group Created Successfully!');
            window.location.reload();
          }}
        />
      )}
    </div>
  );
};

export default GroupsPage;
