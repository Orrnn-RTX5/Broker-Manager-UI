import DashboardHeader, { FilterSelect } from './components/DashboardHeader';
import ComingSoon from '../../components/ComingSoon';
import { ALL_COUNTRIES } from '../../utils/countries';

const TradingAccountsDashboard = () => {
  const filters = (
    <>
      <FilterSelect value="All Lead Campaign" />
      <FilterSelect value="All Lead Source" />
      <FilterSelect value="All Countries" options={ALL_COUNTRIES} />
    </>
  );

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      <DashboardHeader
        title="Trading Accounts"
        subtitle="Registration trends, geographic distribution, and group allocation."
        filters={filters}
      />

      <ComingSoon title="Registration Date" description="Daily account-registration trend." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        <ComingSoon title="Accounts by Country" description="Geographic distribution on world map." />
        <ComingSoon title="Accounts by Group" description="Allocation across trading groups." />
      </div>
    </div>
  );
};

export default TradingAccountsDashboard;
