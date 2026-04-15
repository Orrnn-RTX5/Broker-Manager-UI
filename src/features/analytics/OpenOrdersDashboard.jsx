import DashboardHeader, { FilterSelect } from './components/DashboardHeader';
import ComingSoon from '../../components/ComingSoon';
import { ALL_COUNTRIES } from '../../utils/countries';

const OpenOrdersDashboard = () => {
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
        title="Open Orders"
        subtitle="Pending order sentiment, symbol distribution, and reason breakdown."
        filters={filters}
      />

      <ComingSoon title="Orders by Sentiment" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ComingSoon title="Orders by Symbol" />
        <ComingSoon title="Orders by Reason" />
      </div>
    </div>
  );
};

export default OpenOrdersDashboard;
