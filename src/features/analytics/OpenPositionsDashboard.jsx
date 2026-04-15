import DashboardHeader, { FilterSelect } from './components/DashboardHeader';
import ComingSoon from '../../components/ComingSoon';
import { ALL_COUNTRIES } from '../../utils/countries';

const OpenPositionsDashboard = () => {
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
        title="Open Positions"
        subtitle="Live sentiment, symbol breakdown, and reason classification."
        filters={filters}
      />

      <ComingSoon title="Positions by Sentiment" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComingSoon title="Positions by Symbol" />
        <ComingSoon title="Positions by Reason" />
      </div>
    </div>
  );
};

export default OpenPositionsDashboard;
