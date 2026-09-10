import { createElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Globe2, Layers3 } from 'lucide-react';
import { FilterSelect } from './components/DashboardHeader';
import DateRangePicker from '../../components/Popups/DateRangePicker';
import { ALL_COUNTRIES } from '../../utils/countries';
import useOwnerConsoleAutoCollapse from '../../hooks/useOwnerConsoleAutoCollapse';

const REPORTS = [
  { title: 'Registration Date', description: 'Daily account registrations', icon: BarChart3 },
  { title: 'Accounts by Country', description: 'Geographic distribution', icon: Globe2 },
  { title: 'Accounts by Group', description: 'Allocation across trading groups', icon: Layers3 },
];

export default function TradingAccountsDashboard() {
  const navigate = useNavigate();
  const toolbarRef = useOwnerConsoleAutoCollapse(':scope > :last-child');
  return (
    <main className="trading-analytics-page">
      <header className="trading-analytics-heading">
        <div>
          <h1>Trading Accounts</h1>
          <p>Registration trends and account distribution.</p>
        </div>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => navigate('/clients/trading-accounts')}>
          View accounts <ArrowUpRight size={13} aria-hidden="true" />
        </button>
      </header>

      <div ref={toolbarRef} className="trading-analytics-toolbar" role="group" aria-label="Report filters">
        <FilterSelect value="All Lead Campaign" width={156} />
        <FilterSelect value="All Lead Source" width={140} />
        <FilterSelect value="All Countries" width={140} options={ALL_COUNTRIES} />
        <div className="trading-analytics-date-range"><DateRangePicker /></div>
      </div>

      <section className="trading-analytics-reports" aria-labelledby="trading-report-title">
        <header>
          <h2 id="trading-report-title">Account reports</h2>
          <span>Overview</span>
        </header>
        {REPORTS.map(({ title, description, icon: Icon }) => (
          <div className="trading-analytics-report" key={title}>
            <span className="trading-analytics-report-icon">{createElement(Icon, { size: 16, 'aria-hidden': true })}</span>
            <div><h3>{title}</h3><p>{description}</p></div>
            <span className="trading-analytics-report-value" aria-label="Report unavailable">—</span>
          </div>
        ))}
        <footer>These reports are not available yet. Filters will apply once reporting is connected; individual accounts are available in the account list.</footer>
      </section>
    </main>
  );
}
