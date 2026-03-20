import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGroupList } from '../../hooks/useGroupList';
import { ArrowLeft, Users2, Activity, Settings, Database, Clock, BarChart, ArrowRightLeft } from 'lucide-react';

const GroupDetailsPage = () => {
  const { groupName } = useParams();
  const navigate = useNavigate();
  const { groups, loading, error } = useGroupList();

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);

  const [showMoveInput, setShowMoveInput] = useState(false);
  const [toGroupInput, setToGroupInput] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!groupName) return;
    const fetchStats = async () => {
      setStatsLoading(true);
      setStatsError(null);
      const token = localStorage.getItem('authToken');
      if (!token) {
        setStatsError("Not connected");
        setStatsLoading(false);
        return;
      }
      try {
        const res = await fetch(`http://69.197.178.27/manager/GroupStats?id=${token}&group=${groupName}`, {
          method: 'GET',
          headers: { 'accept': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setStatsError(err.message);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [groupName]);

  const handleMoveAccounts = async () => {
    if (!toGroupInput || !groupName) return;
    setIsMoving(true);
    const token = localStorage.getItem('authToken');
    try {
      const res = await fetch(`http://69.197.178.27/manager/GroupMoveAccounts?id=${token}&from_group=${groupName}&to_group=${toGroupInput}`, {
        method: 'GET',
        headers: { 'accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Assuming success or parsing JSON if needed
      await res.json();
      alert(`Successfully moved accounts from ${groupName} to ${toGroupInput}`);
      setShowMoveInput(false);
      setToGroupInput('');
      // Optionally trigger reload of stats
    } catch (err) {
      alert("Error moving accounts: " + err.message);
    } finally {
      setIsMoving(false);
    }
  };

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

  const DetailRow = ({ label, value, type = 'text', highlight = false }) => (
    <div className={`flex items-center px-2 py-0.5 transition-colors ${highlight ? 'bg-blue-50 dark:bg-[#003366]' : 'hover:bg-[#e6e6e6] dark:hover:bg-[#2a2a2b]'}`}>
      <span className="text-[11px] text-gray-600 dark:text-gray-400 w-[160px] shrink-0">{label}</span>
      <span className={`text-[11px] font-sans truncate ${highlight ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-gray-900 dark:text-gray-200'}`}>
        {type === 'boolean' ? (value ? 'Enabled' : 'Disabled') : 
         type === 'array' ? (value && value.length > 0 ? value.join(', ') : 'None') : 
         type === 'date' ? new Date(value * 1000).toLocaleString() :
         value}
      </span>
    </div>
  );

  const GroupBox = ({ title, icon: Icon, children, extra }) => (
    <div className="bg-white dark:bg-[#1e1e1e] border border-[#a0a0a0] dark:border-[#333333] shadow-[2px_2px_4px_rgba(0,0,0,0.1)] dark:shadow-none flex flex-col rounded-none">
      <div className="h-6 bg-[#d4d0c8] dark:bg-[#2d2d30] border-b border-[#a0a0a0] dark:border-[#333333] flex items-center justify-between px-2 select-none">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={12} className="text-gray-700 dark:text-gray-300" />}
          <span className="text-[10px] font-bold text-gray-800 dark:text-gray-200 tracking-wide uppercase">{title}</span>
        </div>
        {extra && <div>{extra}</div>}
      </div>
      <div className="p-1.5 flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );

  return (
    <div className="p-4 w-full h-full flex flex-col overflow-y-auto bg-[#f8f9fa] dark:bg-[#1e1e1e]">
      
      {/* Header Overlay */}
      <div className="flex items-center gap-3 pb-2 mb-3 border-b border-[#a0a0a0] dark:border-[#333333]">
        <button 
          onClick={() => navigate('/groups')}
          className="p-1 hover:bg-[#d4d0c8] dark:hover:bg-[#2d2d30] text-gray-600 dark:text-gray-300 border border-transparent hover:border-[#a0a0a0] dark:hover:border-[#555]"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <Users2 size={16} className="text-blue-600 dark:text-blue-400" />
          <h1 className="text-[14px] text-gray-900 dark:text-gray-200 font-bold">
            Group: {group.name}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 max-w-[1200px]">
        {/* Core Settings */}
        <GroupBox title="Core Configuration" icon={Settings}>
          <DetailRow label="Description" value={group.description} />
          <DetailRow label="Currency" value={group.currency} highlight={true} />
          <DetailRow label="Account Type" value={group.accountType} />
          <DetailRow label="Demo Group" value={group.demo} type="boolean" />
          <DetailRow label="Status" value={group.enabled} type="boolean" />
        </GroupBox>

        {/* Finance Limits */}
        <GroupBox title="Trading Limits & Finances" icon={Activity}>
          <DetailRow label="Leverage" value={`1:${group.leverage}`} highlight={true} />
          <DetailRow label="Margin Call Level" value={`${group.marginCallLevel}%`} />
          <DetailRow label="Stop Out Level" value={`${group.stopOutLevel}%`} />
          <DetailRow label="Commission Rate" value={group.commissionRate} />
          <DetailRow label="Commission Type" value={group.commissionType} />
        </GroupBox>

        {/* Trading Parameters */}
        <GroupBox title="Execution Parameters" icon={Database}>
          <DetailRow label="Trading Allowed" value={group.tradeAllowed} type="boolean" />
          <DetailRow label="Execution Mode" value={group.executionMode} />
          <DetailRow label="Book Type" value={group.bookType} highlight={true} />
          <DetailRow label="Spread Markup" value={group.spreadMarkup} />
          <DetailRow label="Lot Divisor" value={group.lotDivisor} />
          <DetailRow label="Max Lot Per Trade" value={group.maxLotPerTrade} />
          <DetailRow label="Max Total Lots" value={group.maxTotalLots} />
          <DetailRow label="Negative Balance Protection" value={group.negativeBalanceProtection} type="boolean" />
        </GroupBox>

        {/* Symbol Permissions & Meta */}
        <GroupBox title="Symbols & History" icon={Clock}>
          <DetailRow label="Allowed Symbols" value={group.symbolsAllowed} type="array" />
          <DetailRow label="Blocked Symbols" value={group.symbolsBlocked} type="array" />
          <DetailRow label="Created At" value={group.createdAt} type="date" />
          <DetailRow label="Last Updated" value={group.updatedAt} type="date" />
        </GroupBox>

        {/* Group Statistics */}
        <GroupBox 
          title="Group Statistics" 
          icon={BarChart}
          extra={
            <button 
              onClick={() => setShowMoveInput(!showMoveInput)}
              className="p-0.5 hover:bg-[#a0a0a0] dark:hover:bg-[#3e3e42] text-gray-700 dark:text-gray-300 transition-colors cursor-pointer border border-transparent hover:border-[#555]"
              title="Shift Accounts to Another Group"
            >
              <ArrowRightLeft size={12} />
            </button>
          }
        >
          {showMoveInput && (
            <div className="mb-2 flex flex-col gap-1.5 bg-[#f0f0f0] dark:bg-[#252526] p-2 border border-[#a0a0a0] dark:border-[#333333]">
              <span className="text-[10px] text-gray-600 dark:text-gray-400 uppercase tracking-widest">Move accounts to:</span>
              <div className="flex items-center gap-1.5">
                <input 
                  type="text" 
                  placeholder="Target Group"
                  value={toGroupInput}
                  onChange={(e) => setToGroupInput(e.target.value)}
                  className="flex-1 bg-white dark:bg-[#1e1e1e] border border-[#a0a0a0] dark:border-[#555] px-1.5 h-[20px] text-[11px] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 rounded-none"
                />
                <button 
                  onClick={handleMoveAccounts}
                  disabled={isMoving || !toGroupInput}
                  className="bg-[#d4d0c8] dark:bg-[#333333] hover:bg-[#e6e6e6] dark:hover:bg-[#3e3e42] border border-[#a0a0a0] dark:border-[#555] text-[11px] text-gray-900 dark:text-gray-200 px-3 h-[20px] disabled:opacity-50 transition-colors rounded-none"
                >
                  {isMoving ? 'Moving...' : 'Move'}
                </button>
              </div>
            </div>
          )}
          
          {statsLoading ? (
            <div className="text-[11px] text-gray-500 py-3 flex items-center gap-2 px-2">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Loading stats...
            </div>
          ) : statsError ? (
            <div className="text-[11px] text-red-500 py-3 px-2">Error: {statsError}</div>
          ) : stats ? (
            <>
              <DetailRow label="Account Count" value={stats.accountCount} />
              <DetailRow label="Active Positions" value={stats.activePositions} />
              <DetailRow label="Total Volume" value={stats.totalVolume} />
              <DetailRow label="Total Equity" value={stats.totalEquity !== undefined ? Number(stats.totalEquity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined} highlight={true} />
              <DetailRow label="Total Balance" value={stats.totalBalance !== undefined ? Number(stats.totalBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined} highlight={true} />
            </>
          ) : (
            <div className="text-[11px] text-gray-500 py-3 px-2">No statistics available</div>
          )}
        </GroupBox>
      </div>
      
    </div>
  );
};

export default GroupDetailsPage;
