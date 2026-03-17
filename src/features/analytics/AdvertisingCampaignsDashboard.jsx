import { Settings, Power, ChevronDown } from 'lucide-react';
import DateRangePicker from '../../components/Popups/DateRangePicker';
import AdvCampaignsRegistrationChart from './components/AdvCampaignsRegistrationChart';
import AdvCampaignsBySourcePie from './components/AdvCampaignsBySourcePie';
import AdvCampaignsByCampaignPie from './components/AdvCampaignsByCampaignPie';
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

const AdvertisingCampaignsDashboard = () => {
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
      className="p-4 w-full h-full flex flex-col gap-4 overflow-y-auto bg-white dark:bg-[#1e1e1e] transition-colors"
      onContextMenu={handleContextMenu}
    >

      {/* Top Header with title and filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800 transition-colors">
        <h1 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 tracking-tight">Advertising Campaigns</h1>

        <div className="flex flex-col items-end gap-2 mt-2 md:mt-0">
          <div className="flex flex-wrap items-center gap-2">
            <Dropdown value="All Lead Source" width="w-[140px]" />
            <Dropdown value="All Countries" width="w-[140px]" options={ALL_COUNTRIES} />
            <Dropdown value="*" width="w-[160px]" />

            <DateRangePicker />

            <button className="text-blue-500 hover:text-blue-700 ml-1 transition-colors">
              <Settings size={14} />
            </button>
            <button className="text-blue-500 hover:text-blue-700 ml-1 transition-colors">
              <Power size={14} />
            </button>
          </div>

          <div className="flex justify-end w-full pr-[60px]">
            <Dropdown value="All Lead Campaign" width="w-[140px]" />
          </div>
        </div>
      </div>

      {/* Top Row: Full Width Line Chart */}
      <div className="w-full">
        <AdvCampaignsRegistrationChart />
      </div>

      {/* Bottom Row: 50/50 Split (Two Donuts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">

        {/* Left Chart (Donut) */}
        <div className="w-full h-full">
          <AdvCampaignsBySourcePie />
        </div>

        {/* Right Chart (Donut) */}
        <div className="w-full h-full">
          <AdvCampaignsByCampaignPie />
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

export default AdvertisingCampaignsDashboard;
