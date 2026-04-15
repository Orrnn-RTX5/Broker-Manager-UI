import DashboardHeader, { FilterSelect } from './components/DashboardHeader';
import ComingSoon from '../../components/ComingSoon';
import { ALL_COUNTRIES } from '../../utils/countries';

const ByCountryDashboard = () => {
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
        title="By Country"
        subtitle="Trading accounts, online users, and language distribution geographically."
        filters={filters}
      />

      <ComingSoon title="Trading Accounts by Country" description="Interactive world-map overlay." height={400} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComingSoon title="Online Users by Country" />
        <ComingSoon title="Languages Distribution" />
      </div>
    </div>
  );
};

export default ByCountryDashboard;
