import { useState } from 'react';
import { Settings, Power } from 'lucide-react';
import DateRangePicker from '../../../components/Popups/DateRangePicker';
import FilterDropdown from '../../../components/FilterDropdown';

export const FilterSelect = ({ value, width = 140, options = [] }) => {
  const [selectedValue, setSelectedValue] = useState(value);

  return (
    <FilterDropdown
      value={selectedValue}
      options={[value, ...options]}
      style={{ width }}
      disabled={options.length === 0}
      onChange={setSelectedValue}
    />
  );
};

export default function DashboardHeader({ title, subtitle, filters = null }) {
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-4 gap-3">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{title}</h1>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filters}
        <DateRangePicker />
        <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" title="Settings">
          <Settings size={14} />
        </button>
        <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" title="Power">
          <Power size={14} />
        </button>
      </div>
    </div>
  );
}
