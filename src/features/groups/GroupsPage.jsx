import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGroupList } from '../../hooks/useGroupList';
import { Search, Users2, Plus, Trash2, Edit2 } from 'lucide-react';
import NewGroupModal from './components/NewGroupModal';

const GroupsPage = () => {
  const navigate = useNavigate();
  const { groups, loading } = useGroupList();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const filteredGroups = useMemo(() => {
    if (!search) return groups;
    return groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));
  }, [groups, search]);

  const handleDelete = async (e, groupName) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete group '${groupName}'?`)) {
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`http://69.197.178.27/manager/GroupDelete?id=${token}&group=${groupName}`);
        if (!res.ok) throw new Error("Delete failed");
        alert(`Group '${groupName}' deleted successfully!`);
        // Ideally trigger a refresh of groups here via context or reload
        window.location.reload();
      } catch (err) {
        alert("Error deleting group: " + err.message);
      }
    }
  };

  const [editGroup, setEditGroup] = useState(null);

  const handleEdit = (e, group) => {
    e.stopPropagation();
    setEditGroup(group);
    setIsModalOpen(true);
  };

  return (
    <div className="p-4 w-full h-full flex flex-col gap-4 bg-[#f8f9fa] dark:bg-[#1e1e1e]">
      
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="text-blue-500"><Users2 size={16} /></div>
          <h1 className="text-[14px] text-gray-900 dark:text-gray-200 tracking-tight font-medium">Configured Groups</h1>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-sm transition-colors mt-2 md:mt-0"
        >
          <Plus size={14} />
          New Group
        </button>
      </div>
      
      <div className="relative w-full max-w-xs">
        <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search group names..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-7 pr-3 py-0.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#252526] text-gray-800 dark:text-gray-200 text-[11px] rounded-sm focus:outline-none focus:border-blue-400 h-[24px] transition-colors"
        />
      </div>

      <div className="flex-1 bg-white dark:bg-[#252526] border border-gray-200 dark:border-[#333] rounded-sm shadow-sm overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Fetching groups...</div>
        ) : (
          <div className="w-full overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f0f0f0] dark:bg-[#2d2d30] border-b border-gray-200 dark:border-[#333] text-[11px] text-gray-700 dark:text-gray-300 h-8">
                  <th className="px-4 py-1 font-medium w-64 border-r border-gray-200 dark:border-[#333]">Group Name</th>
                  <th className="px-4 py-1 font-medium">Description</th>
                  <th className="px-4 py-1 font-medium w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[12px] text-gray-800 dark:text-gray-200">
                {filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-10 text-gray-400">No groups found mapping your search.</td>
                  </tr>
                ) : filteredGroups.map(group => (
                  <tr 
                    key={group.name} 
                    onClick={() => navigate(`/groups/${group.name}`)}
                    className="border-b border-gray-100 dark:border-[#333] h-8 cursor-pointer hover:bg-blue-50 dark:hover:bg-[#2a2d33] transition-colors"
                  >
                    <td className="px-4 py-1 border-r border-gray-100 dark:border-[#333] text-blue-600 dark:text-blue-400 font-medium">
                      {group.name}
                    </td>
                    <td className="px-4 py-1 text-gray-600 dark:text-gray-400">{group.description}</td>
                    <td className="px-4 py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                           onClick={(e) => handleEdit(e, group)}
                           className="p-1 flex items-center justify-center rounded-sm text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                           title="Edit Group"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button 
                           onClick={(e) => handleDelete(e, group.name)}
                           className="p-1 flex items-center justify-center rounded-sm text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
          onClose={() => {
            setIsModalOpen(false);
            setEditGroup(null);
          }}
          onSuccess={(res) => {
            alert(editGroup ? "Group Updated Successfully!" : "Group Created Successfully!");
            window.location.reload();
          }}
        />
      )}

    </div>
  );
};

export default GroupsPage;
