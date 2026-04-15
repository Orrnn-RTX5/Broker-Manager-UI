import { useState } from 'react';
import OnlineUsersByCountryMap from './components/OnlineUsersByCountryMap';
import OnlineUsersByTypePie from './components/OnlineUsersByTypePie';
import OnlineUsersByGroupPie from './components/OnlineUsersByGroupPie';
import OnlineUsersByBuildChart from './components/OnlineUsersByBuildChart';
import AnalyticsContextMenu from './components/AnalyticsContextMenu';
import DashboardHeader, { FilterSelect } from './components/DashboardHeader';
import { ALL_COUNTRIES } from '../../utils/countries';

const OnlineUsersDashboard = () => {
  const [contextMenu, setContextMenu] = useState(null);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  const filters = (
    <>
      <FilterSelect value="All Lead Campaign" />
      <FilterSelect value="All Lead Source" />
      <FilterSelect value="All Countries" options={ALL_COUNTRIES} />
    </>
  );

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto" onContextMenu={handleContextMenu}>
      <DashboardHeader
        title="Online Users"
        subtitle="Currently connected users across groups, countries, and builds."
        filters={filters}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OnlineUsersByCountryMap />
        <OnlineUsersByTypePie />
        <OnlineUsersByGroupPie />
        <OnlineUsersByBuildChart />
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
