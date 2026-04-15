import { useState } from 'react';
import RegistrationDateChart from './components/RegistrationDateChart';
import TradingAccountsByCountryMap from './components/TradingAccountsByCountryMap';
import TradingAccountsByGroupPie from './components/TradingAccountsByGroupPie';
import AnalyticsContextMenu from './components/AnalyticsContextMenu';
import DashboardHeader, { FilterSelect } from './components/DashboardHeader';
import { ALL_COUNTRIES } from '../../utils/countries';

const TradingAccountsDashboard = () => {
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
        title="Trading Accounts"
        subtitle="Registration trends, geographic distribution, and group allocation."
        filters={filters}
      />

      <div className="w-full">
        <RegistrationDateChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        <TradingAccountsByCountryMap />
        <TradingAccountsByGroupPie />
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

export default TradingAccountsDashboard;
