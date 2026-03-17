import { Settings, Power, ChevronDown } from 'lucide-react';
import DateRangePicker from '../../components/Popups/DateRangePicker';
import PositionsBySentimentChart from './components/PositionsBySentimentChart';
import PositionsBySymbolPie from './components/PositionsBySymbolPie';
import PositionsByReasonPie from './components/PositionsByReasonPie';
import AnalyticsContextMenu from './components/AnalyticsContextMenu';
import { ALL_COUNTRIES } from '../../utils/countries';
import { useState } from 'react';

const Dropdown = ({ value, width = "w-32", options = [] }) => (
  <div className={`relative ${width}`}>
    <select className="appearance-none bg-white dark:bg-[#1e1e1e] border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[10px] py-1 pl-2 pr-6 focus:outline-none focus:border-blue-500 w-full rounded-sm h-[22px]">
      <option>{value}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
    <ChevronDown size={10} className="absolute right-1.5 top-1.5 text-gray-500 pointer-events-none" />
  </div>
);

const OpenPositionsDashboard = () => {
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

      {/* Top Header with title and filters (Dark Theme styling) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          {/* Faking the little blue analytics icon from screenshot */}
          <div className="w-3 h-3 text-blue-500">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
          </div>
          <h1 className="text-[14px] font-bold text-gray-900 dark:text-gray-200 tracking-tight">Open Positions</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <Dropdown value="All Lead Campaign" width="w-[140px]" />
          <Dropdown value="All Lead Source" width="w-[140px]" />
          <Dropdown value="All Countries" width="w-[140px]" options={ALL_COUNTRIES} />
          <Dropdown value="*" width="w-[100px]" />
          <DateRangePicker />

          <button className="text-blue-500 hover:text-blue-400 ml-1 transition-colors">
            <Settings size={14} />
          </button>
          <button className="text-blue-500 hover:text-blue-400 ml-1 transition-colors">
            <Power size={14} />
          </button>
        </div>
      </div>

      {/* Top Half: Stacked Bar Chart */}
      <div className="w-full">
        <PositionsBySentimentChart />
      </div>

      {/* Bottom Half: 2 Pie Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="w-full h-full">
          <PositionsBySymbolPie />
        </div>

        <div className="w-full h-full">
          <PositionsByReasonPie />
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

export default OpenPositionsDashboard;
