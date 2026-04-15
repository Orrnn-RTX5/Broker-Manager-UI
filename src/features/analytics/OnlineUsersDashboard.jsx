import DashboardHeader, { FilterSelect } from './components/DashboardHeader';
import ComingSoon from '../../components/ComingSoon';
import { ALL_COUNTRIES } from '../../utils/countries';

const OnlineUsersDashboard = () => {
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
        title="Online Users"
        subtitle="Currently connected users across groups, countries, and builds."
        filters={filters}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComingSoon title="Online Users by Country" />
        <ComingSoon title="Online Users by Type" />
        <ComingSoon title="Online Users by Group" />
        <ComingSoon title="Online Users by Build" />
      </div>
    </div>
  );
};

export default OnlineUsersDashboard;
