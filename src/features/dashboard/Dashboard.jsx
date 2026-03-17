import { useState } from 'react';
import RealAccountsChart from './components/RealAccountsChart';
import RealDepositsChart from './components/RealDepositsChart';
import AccountsBySourceChart from './components/AccountsBySourceChart';
import LiquidityProviders from './components/LiquidityProviders';
import Widechart from './components/Widechart';

const Dashboard = () => {
  const [showWidechart, setShowWidechart] = useState(false);

  return (
    <div className="p-4 md:p-6 w-full h-full flex flex-col gap-6">

      {/* Top Row: Spanning 3 Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Chart */}
        <div className="lg:col-span-1">
          <RealAccountsChart />
        </div>

        {/* Middle Chart */}
        <div className="lg:col-span-1">
          <RealDepositsChart />
        </div>

        {/* Right Chart (Donut) */}
        <div className="lg:col-span-1">
          <AccountsBySourceChart onClick={() => setShowWidechart(true)} />
        </div>

      </div>

      {/* Conditionally rendered Widechart Table */}
      {showWidechart && (
        <Widechart onClose={() => setShowWidechart(false)} />
      )}

      {/* Bottom Row: Logos & Text */}
      <div className="border border-gray-200 dark:border-[#333333] bg-white dark:bg-[#1e1e1e] p-4 shadow-sm rounded-sm transition-colors">
        <LiquidityProviders />
      </div>

    </div>
  );
};

export default Dashboard;
