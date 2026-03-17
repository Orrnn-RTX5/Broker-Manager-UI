import { Settings, Power, ChevronDown } from 'lucide-react';
import OnlineUsersByCountryMap from './components/OnlineUsersByCountryMap';
import OnlineUsersByTypePie from './components/OnlineUsersByTypePie';
import OnlineUsersByGroupPie from './components/OnlineUsersByGroupPie';
import OnlineUsersByBuildChart from './components/OnlineUsersByBuildChart';
import AnalyticsContextMenu from './components/AnalyticsContextMenu';
import { ALL_COUNTRIES } from '../../utils/countries';
import { useState } from 'react';

const Dropdown = ({ value, width = "w-32", options = [] }) => (
  <div className={`relative ${width}`}>
    <select className="appearance-none bg-white dark:bg-[#1e1e1e] border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[10px] py-1 pl-2 pr-6 focus:outline-none focus:border-blue-400 w-full rounded-sm h-[22px]">
      <option>{value}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
    <ChevronDown size={10} className="absolute right-1.5 top-1.5 text-gray-500 pointer-events-none" />
  </div>
);

const OnlineUsersDashboard = () => {
  const [contextMenu, setContextMenu] = useState(null);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
    });
  };

  return (
    <div 
      className="p-4 w-full h-full flex flex-col gap-4 overflow-y-auto bg-white dark:bg-[#1e1e1e]"
      onContextMenu={handleContextMenu}
    >

      {/* Top Header with title and filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 text-blue-500">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h1 className="text-[14px] text-gray-900 dark:text-gray-200 tracking-tight">Online Users</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <Dropdown value="All Lead Campaign" width="w-[140px]" />
          <Dropdown value="All Lead Source" width="w-[140px]" />
          <Dropdown value="All Countries" width="w-[140px]" options={ALL_COUNTRIES} />
          <Dropdown value="*" width="w-[100px]" />

          <button className="text-blue-500 hover:text-blue-400 ml-1 transition-colors">
            <Settings size={14} />
          </button>
          <button className="text-blue-500 hover:text-blue-400 ml-1 transition-colors">
            <Power size={14} />
          </button>
        </div>
      </div>

      {/* 2x2 Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="w-full h-full">
          <OnlineUsersByCountryMap />
        </div>
        <div className="w-full h-full">
          <OnlineUsersByTypePie />
        </div>
        <div className="w-full h-full">
          <OnlineUsersByGroupPie />
        </div>
        <div className="w-full h-full">
          <OnlineUsersByBuildChart />
        </div>
      </div>

      {contextMenu && (
        <AnalyticsContextMenu
          x={contextMenu.mouseX}
          y={contextMenu.mouseY}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default OnlineUsersDashboard;
