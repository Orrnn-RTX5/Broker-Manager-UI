import DashboardHeader, { FilterSelect } from './components/DashboardHeader';
import ComingSoon from '../../components/ComingSoon';
import { ALL_COUNTRIES } from '../../utils/countries';

const AdvertisingCampaignsDashboard = () => {
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
        title="Advertising Campaigns"
        subtitle="Registration trends by source and campaign."
        filters={filters}
      />

      <ComingSoon title="Registrations Over Time" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        <ComingSoon title="Campaigns by Source" />
        <ComingSoon title="Campaigns by Campaign" />
      </div>
    </div>
  );
};

export default AdvertisingCampaignsDashboard;
