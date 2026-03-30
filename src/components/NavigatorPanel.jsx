import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGroupList } from '../hooks/useGroupList';
import NewGroupModal from '../features/groups/components/NewGroupModal';
import {
  Server,
  FolderOpen,
  Folder,
  BarChart2,
  FileText,
  Users,
  User,
  Building2,
  ListOrdered,
  ShoppingCart,
  CreditCard,
  Banknote,
  History,
  Target,
  RefreshCw,
  Activity,
  Percent,
  Users2,
  Blocks,
  Mail,
  Headphones,
  ShoppingBag,
  ChevronRight,
  ChevronDown
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
    <div className="flex flex-col text-[#333333] dark:text-gray-300 font-sans text-[12px] select-none transition-colors">
      <div
        className="flex items-center py-0.5 hover:bg-[#e6f0fa] dark:hover:bg-[#2d2d30] cursor-pointer"
        onClick={handleClick}
      >
        {/* Indentation guide and expander */}
        <div className="w-4 h-full flex justify-center items-center shrink-0">
          {hasChildren && (
            isExpanded ?
              <ChevronDown size={14} className="text-gray-500 dark:text-gray-400" /> :
              <ChevronRight size={14} className="text-gray-500 dark:text-gray-400" />
          )}
        </div>

        {/* Icon */}
        <div className="w-5 flex justify-center items-center shrink-0">
          {Icon && <Icon size={14} className={iconColor} />}
        </div>

        {/* Label */}
        <span className="whitespace-nowrap flex-1 truncate pr-2">
          {label} {count && <span className="text-gray-500 dark:text-gray-400">({count})</span>}
        </span>
      </div>

      {/* Children with tree line */}
      {hasChildren && isExpanded && (
        <div className="flex">
          <div className="w-4 flex justify-center">
            <div className="w-px h-full bg-[#cccccc] dark:bg-[#404040] border-l border-dotted border-[#aaaaaa] dark:border-[#555555]"></div>
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
    <div className="bg-white dark:bg-[#1e1e1e] h-full w-full flex flex-col transition-colors">

      {/* Toolbar inside Navigator */}
      <div className="h-6 flex items-center bg-[#f8f8f8] dark:bg-[#1e1e24] border-b border-[#e0e0e0] dark:border-[#333333] transition-colors">
        {/* Icons can go here if needed in future */}
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 bg-white dark:bg-[#1e1e1e] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">

        <TreeNode label="MetaTrader 5 Manager" icon={Server} iconColor="text-blue-400" defaultExpanded>

          <TreeNode label="Servers" icon={Server} iconColor="text-green-500" defaultExpanded>
            <TreeNode label="FlexyMarkets-Server" icon={Folder} iconColor="text-yellow-500" defaultExpanded>

              <TreeNode label="Analytics" icon={BarChart2} iconColor="text-blue-500" defaultExpanded>
                <TreeNode
                  label="Trading Accounts"
                  icon={BarChart2}
                  iconColor="text-blue-400"
                  onClickNode={() => { navigate('/analytics/trading-accounts'); }}
                />
                <TreeNode
                  label="Online Users"
                  icon={BarChart2}
                  iconColor="text-blue-400"
                  onClickNode={() => { navigate('/analytics/online-users'); }}
                />
                <TreeNode
                  label="Open Positions"
                  icon={BarChart2}
                  iconColor="text-blue-400"
                  onClickNode={() => { navigate('/analytics/open-positions'); }}
                />
                <TreeNode
                  label="Open Orders"
                  icon={BarChart2}
                  iconColor="text-blue-400"
                  onClickNode={() => { navigate('/analytics/open-orders'); }}
                />
                <TreeNode
                  label="Advertising Campaigns"
                  icon={BarChart2}
                  iconColor="text-blue-400"
                  onClickNode={() => { navigate('/analytics/advertising-campaigns'); }}
                />
                <TreeNode
                  label="By Country"
                  icon={BarChart2}
                  iconColor="text-blue-400"
                  onClickNode={() => { navigate('/analytics/by-country'); }}
                />
              </TreeNode>

              <TreeNode label="Server Reports" icon={FileText} iconColor="text-blue-500" />

              <TreeNode label="Clients & Orders" icon={Users} iconColor="text-blue-500" defaultExpanded>
                <TreeNode label="Online Users" count="19" icon={User} iconColor="text-blue-400" onClickNode={() => { navigate('/clients/online-users'); }} />
                <TreeNode label="Clients" count="339" icon={User} iconColor="text-blue-400" onClickNode={() => { navigate('/clients'); }} />
                <TreeNode label="Trading Accounts" count="9 740" icon={User} iconColor="text-blue-400" onClickNode={() => { navigate('/clients/trading-accounts'); }} />
                <TreeNode label="Positions" count="1 763" icon={User} iconColor="text-blue-400" onClickNode={() => { navigate('/clients/positions'); }} />
                <TreeNode label="Orders" count="130" icon={User} iconColor="text-blue-400" onClickNode={() => { navigate('/clients/orders'); }} />
              </TreeNode>

              <TreeNode label="Payments" icon={CreditCard} iconColor="text-blue-500" defaultExpanded>
                <TreeNode label="Processing" icon={Banknote} iconColor="text-blue-400" />
                <TreeNode label="Active" icon={Banknote} iconColor="text-blue-400" />
                <TreeNode label="History" icon={Banknote} iconColor="text-blue-400" />
              </TreeNode>

              <TreeNode label="Ultency Matching Engine" icon={Target} iconColor="text-purple-500" />
              <TreeNode label="Subscriptions" icon={RefreshCw} iconColor="text-green-500" />
              <TreeNode label="Dealing" icon={Activity} iconColor="text-red-500" onClickNode={() => navigate('/dealing')} />
              <TreeNode label="Leverages" icon={Percent} iconColor="text-green-500" />
              <TreeNode label="Groups" count={groupsLoading ? '...' : (groups?.length || 0).toString()} icon={Users2} iconColor="text-blue-500" onClickNode={() => navigate('/groups')}>
                {groups?.map(g => (
                  <TreeNode key={g.name} label={g.name} iconColor="text-gray-400" onClickNode={(e) => { navigate(`/groups/${g.name}`); }} />
                ))}
                <TreeNode label="+ New Group" iconColor="text-green-500" onClickNode={(e) => { e?.stopPropagation(); setIsNewGroupOpen(true); }} />
              </TreeNode>
              <TreeNode label="Plugins" icon={Blocks} iconColor="text-blue-600" />
              <TreeNode label="Mailbox" icon={Mail} iconColor="text-yellow-600" />
            </TreeNode>
          </TreeNode>

          <TreeNode label="Support Center" icon={Headphones} iconColor="text-blue-500">
            {/* Keeping collapsed for now */}
          </TreeNode>

          <TreeNode label="App Store" icon={ShoppingBag} iconColor="text-yellow-600" />

        </TreeNode>

      </div>
      {isNewGroupOpen && <NewGroupModal onClose={() => setIsNewGroupOpen(false)} onSuccess={() => alert('Group Created!')} />}
    </div>
  );
};

export default NavigatorPanel;

