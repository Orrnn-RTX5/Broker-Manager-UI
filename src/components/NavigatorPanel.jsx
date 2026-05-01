import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGroupList } from '../hooks/useGroupList';
import NewGroupModal from '../features/groups/components/NewGroupModal';
import {
  Server, Folder, BarChart2, Users, User, Activity, Users2, ChevronRight, ChevronDown, Gavel, Shield, GitBranch, Handshake, TrendingUp, Settings2
} from 'lucide-react';

// Reusable Tree Node Component
const TreeNode = ({ label, icon: Icon, iconColor, children, defaultExpanded = false, count = null, onClickNode }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const hasChildren = React.Children.count(children) > 0;

  const handleClick = () => {
    if (hasChildren) setIsExpanded(!isExpanded);
    if (onClickNode) onClickNode();
  };

  return (
    <div className="flex flex-col text-[13px] select-none" style={{ color: 'var(--text-2)' }}>
      <div
        className="flex items-center py-1 px-1 cursor-pointer rounded-md transition-colors"
        onClick={handleClick}
        onMouseOver={(e) => e.currentTarget.style.background = 'var(--accent-soft)'}
        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <div className="w-4 h-full flex justify-center items-center shrink-0">
          {hasChildren && (
            isExpanded
              ? <ChevronDown size={13} style={{ color: 'var(--muted)' }} />
              : <ChevronRight size={13} style={{ color: 'var(--muted)' }} />
          )}
        </div>

        <div className="w-5 flex justify-center items-center shrink-0">
          {Icon && <Icon size={14} className={iconColor} strokeWidth={1.75} />}
        </div>

        <span className="whitespace-nowrap flex-1 truncate pr-2">
          {label}
          {count && <span className="ml-1 tabular" style={{ color: 'var(--muted)' }}>({count})</span>}
        </span>
      </div>

      {hasChildren && isExpanded && (
        <div className="flex">
          <div className="w-4 flex justify-center">
            <div className="w-px h-full" style={{ background: 'var(--border)' }} />
          </div>
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

const NavigatorPanel = () => {
  const navigate = useNavigate();
  const { groups, loading: groupsLoading } = useGroupList();
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);

  return (
    <div className="h-full w-full flex flex-col" style={{ background: 'var(--surface)' }}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <TreeNode label="MetaTrader 5 Manager" icon={Server} iconColor="text-blue-400" defaultExpanded>

          <TreeNode label="Servers" icon={Server} iconColor="text-green-500" defaultExpanded>
            <TreeNode label="FlexyMarkets-Server" icon={Folder} iconColor="text-yellow-500" defaultExpanded>

              <TreeNode label="Analytics" icon={BarChart2} iconColor="text-blue-500" defaultExpanded>

                <TreeNode label="Online Users" icon={BarChart2} iconColor="text-blue-400" onClickNode={() => navigate('/analytics/online-users')} />
                <TreeNode label="Open Positions" icon={BarChart2} iconColor="text-blue-400" onClickNode={() => navigate('/analytics/open-positions')} />
                <TreeNode label="Open Orders" icon={BarChart2} iconColor="text-blue-400" onClickNode={() => navigate('/analytics/open-orders')} />


              </TreeNode>

              <TreeNode label="Clients & Orders" icon={Users} iconColor="text-blue-500" defaultExpanded>
                <TreeNode label="Online Users" icon={User} iconColor="text-blue-400" onClickNode={() => navigate('/clients/online-users')} />
                <TreeNode label="Clients" icon={User} iconColor="text-blue-400" onClickNode={() => navigate('/clients')} />
                <TreeNode label="Trading Accounts" icon={User} iconColor="text-blue-400" onClickNode={() => navigate('/clients/trading-accounts')} />
                <TreeNode label="Position History" icon={User} iconColor="text-blue-400" onClickNode={() => navigate('/clients/positions')} />
                <TreeNode label="Orders" icon={User} iconColor="text-blue-400" onClickNode={() => navigate('/clients/orders')} />
              </TreeNode>

              <TreeNode label="Dealing" icon={Activity} iconColor="text-red-500" onClickNode={() => navigate('/dealing')} />

              <TreeNode label="Dealer Operations" icon={Gavel} iconColor="text-orange-500" defaultExpanded>
                <TreeNode label="Dealer Queue" icon={Gavel} iconColor="text-orange-400" onClickNode={() => navigate('/dealer/queue')} />
                <TreeNode label="Restricted Accounts" icon={Shield} iconColor="text-red-400" onClickNode={() => navigate('/dealer/restrictions')} />
              </TreeNode>

              <TreeNode label="IB Management" icon={Handshake} iconColor="text-emerald-500" defaultExpanded>
                <TreeNode label="IB Accounts" icon={Handshake} iconColor="text-emerald-400" onClickNode={() => navigate('/ib')} />
                <TreeNode label="IB Tree" icon={GitBranch} iconColor="text-emerald-400" onClickNode={() => navigate('/ib/tree')} />
              </TreeNode>

              <TreeNode label="Market Overview" icon={TrendingUp} iconColor="text-indigo-500" defaultExpanded>
                <TreeNode label="Symbols Browser" icon={BarChart2} iconColor="text-indigo-400" onClickNode={() => navigate('/symbols')} />
                <TreeNode label="Symbol Management" icon={Settings2} iconColor="text-indigo-400" onClickNode={() => navigate('/symbol-management')} />
              </TreeNode>

              <TreeNode
                label="Groups"
                count={groupsLoading ? '…' : (groups?.length || 0).toString()}
                icon={Users2}
                iconColor="text-blue-500"
                onClickNode={() => navigate('/groups')}
              >
                {groups?.map(g => (
                  <TreeNode key={g.name} label={g.name} iconColor="text-gray-400" onClickNode={() => navigate(`/groups/${g.name}`)} />
                ))}
                <TreeNode label="+ New Group" iconColor="text-green-500" onClickNode={(e) => { e?.stopPropagation(); setIsNewGroupOpen(true); }} />
              </TreeNode>

            </TreeNode>
          </TreeNode>

        </TreeNode>
      </div>
      {isNewGroupOpen && <NewGroupModal onClose={() => setIsNewGroupOpen(false)} onSuccess={() => alert('Group Created!')} />}
    </div>
  );
};

export default NavigatorPanel;

