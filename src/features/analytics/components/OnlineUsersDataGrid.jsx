import { useState, useMemo } from 'react';
import { User, Monitor, Smartphone, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';
import useDataSource from '../../../hooks/useDataSource';
import { getOnlineUsers } from '../../../services/api';
import { ONLINE_USERS_FALLBACK } from '../../../data/onlineUsers';
const OnlineUsersDataGrid = () => {
  return (
    <div className="bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#333333] shadow-sm rounded-sm flex flex-col w-full h-full min-h-[400px] overflow-hidden transition-colors items-center justify-center">
      <span className="text-gray-500 font-medium tracking-widest text-lg" style={{ color: 'var(--muted)' }}>YET TO COME</span>
    </div>
  );
};

export default OnlineUsersDataGrid;
