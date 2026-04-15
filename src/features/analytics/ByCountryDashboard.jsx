import { useState } from 'react';
import ByCountryTradingAccountsMap from './components/ByCountryTradingAccountsMap';
import ByCountryOnlineUsersMap from './components/ByCountryOnlineUsersMap';
import ByCountryLanguagePie from './components/ByCountryLanguagePie';
import AnalyticsContextMenu from './components/AnalyticsContextMenu';
import DashboardHeader, { FilterSelect } from './components/DashboardHeader';
import { ALL_COUNTRIES } from '../../utils/countries';

const ByCountryDashboard = () => {
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
        title="By Country"
        subtitle="Trading accounts, online users, and language distribution geographically."
        filters={filters}
      />

      <div className="ui-card w-full flex flex-col overflow-hidden">
        <div className="w-full relative">
          <ByCountryTradingAccountsMap />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 w-full" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="w-full h-full relative">
            <ByCountryOnlineUsersMap />
          </div>
          <div className="w-full h-full relative" style={{ borderLeft: '1px solid var(--border)' }}>
            <ByCountryLanguagePie />
          </div>
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

export default ByCountryDashboard;
