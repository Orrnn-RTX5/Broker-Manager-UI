import { useParams, useNavigate } from 'react-router-dom';
import { useGroupList } from '../../hooks/useGroupList';
import { ArrowLeft, Users2, Activity, Settings, Database, Clock } from 'lucide-react';

const GroupDetailsPage = () => {
  const { groupName } = useParams();
  const navigate = useNavigate();
  const { groups, loading, error } = useGroupList();

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-gray-400 dark:text-gray-500 h-full w-full">
        Fetching exact details for {groupName}...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-red-400 h-full w-full gap-2">
        <span>Failed to load group details: {error}</span>
        <button onClick={() => navigate('/groups')} className="text-blue-500 hover:underline">Return to list</button>
      </div>
    );
  }

  const group = groups.find(g => g.name === groupName);

  if (!group) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-gray-400 h-full w-full gap-2">
        <span>Group "{groupName}" not found.</span>
        <button onClick={() => navigate('/groups')} className="text-blue-500 hover:underline">Return to list</button>
      </div>
    );
  }

  const DetailRow = ({ label, value, type = 'text' }) => (
    <div className="grid grid-cols-[200px_1fr] py-1.5 border-b border-gray-100 dark:border-[#2d2d30] items-center">
      <span className="text-[12px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-[13px] text-gray-900 dark:text-gray-200 font-medium">
        {type === 'boolean' ? (value ? 'Enabled' : 'Disabled') : 
         type === 'array' ? (value && value.length > 0 ? value.join(', ') : 'None') : 
         type === 'date' ? new Date(value * 1000).toLocaleString() :
         value}
      </span>
    </div>
  );

  return (
    <div className="p-4 w-full h-full flex flex-col overflow-y-auto bg-[#f8f9fa] dark:bg-[#1e1e1e]">
      
      {/* Header Overlay */}
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-gray-200 dark:border-gray-800">
        <button 
          onClick={() => navigate('/groups')}
          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Users2 size={20} className="text-blue-500" />
          <h1 className="text-[18px] text-gray-900 dark:text-gray-200 font-semibold tracking-tight">
            Group: {group.name}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-[1200px]">
        {/* Core Settings */}
        <div className="bg-white dark:bg-[#252526] border border-gray-200 dark:border-[#333] rounded-md p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100 dark:border-[#333]">
             <Settings size={14} className="text-gray-400" />
             <h2 className="text-[13px] font-bold text-gray-700 dark:text-gray-300">Core Configuration</h2>
          </div>
          <DetailRow label="Description" value={group.description} />
          <DetailRow label="Currency" value={group.currency} />
          <DetailRow label="Account Type" value={group.accountType} />
          <DetailRow label="Demo Group" value={group.demo} type="boolean" />
          <DetailRow label="Status" value={group.enabled} type="boolean" />
        </div>

        {/* Finance Limits */}
        <div className="bg-white dark:bg-[#252526] border border-gray-200 dark:border-[#333] rounded-md p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100 dark:border-[#333]">
             <Activity size={14} className="text-gray-400" />
             <h2 className="text-[13px] font-bold text-gray-700 dark:text-gray-300">Trading Limits & Finances</h2>
          </div>
          <DetailRow label="Leverage" value={`1:${group.leverage}`} />
          <DetailRow label="Margin Call Level" value={`${group.marginCallLevel}%`} />
          <DetailRow label="Stop Out Level" value={`${group.stopOutLevel}%`} />
          <DetailRow label="Commission Rate" value={group.commissionRate} />
          <DetailRow label="Commission Type" value={group.commissionType} />
        </div>

        {/* Trading Parameters */}
        <div className="bg-white dark:bg-[#252526] border border-gray-200 dark:border-[#333] rounded-md p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100 dark:border-[#333]">
             <Database size={14} className="text-gray-400" />
             <h2 className="text-[13px] font-bold text-gray-700 dark:text-gray-300">Execution Parameters</h2>
          </div>
          <DetailRow label="Trading Allowed" value={group.tradeAllowed} type="boolean" />
          <DetailRow label="Execution Mode" value={group.executionMode} />
          <DetailRow label="Book Type" value={group.bookType} />
          <DetailRow label="Spread Markup" value={group.spreadMarkup} />
          <DetailRow label="Lot Divisor" value={group.lotDivisor} />
          <DetailRow label="Max Lot Per Trade" value={group.maxLotPerTrade} />
          <DetailRow label="Max Total Lots" value={group.maxTotalLots} />
          <DetailRow label="Negative Balance Protection" value={group.negativeBalanceProtection} type="boolean" />
        </div>

        {/* Symbol Permissions & Meta */}
        <div className="bg-white dark:bg-[#252526] border border-gray-200 dark:border-[#333] rounded-md p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100 dark:border-[#333]">
             <Clock size={14} className="text-gray-400" />
             <h2 className="text-[13px] font-bold text-gray-700 dark:text-gray-300">Symbols & History</h2>
          </div>
          <DetailRow label="Allowed Symbols" value={group.symbolsAllowed} type="array" />
          <DetailRow label="Blocked Symbols" value={group.symbolsBlocked} type="array" />
          <DetailRow label="Created At" value={group.createdAt} type="date" />
          <DetailRow label="Last Updated" value={group.updatedAt} type="date" />
        </div>
      </div>
      
    </div>
  );
};

export default GroupDetailsPage;
