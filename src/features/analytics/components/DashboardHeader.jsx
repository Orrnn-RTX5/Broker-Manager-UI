import { Settings, Power, ChevronDown } from 'lucide-react';
import DateRangePicker from '../../../components/Popups/DateRangePicker';

export const FilterSelect = ({ value, width = 140, options = [] }) => (
  <div className="relative" style={{ width }}>
    <select
      className="appearance-none w-full h-7 pl-2.5 pr-7 text-xs rounded-md transition-colors focus:outline-none"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-3)',
        color: 'var(--text-2)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <option>{value}</option>
      {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
    <ChevronDown size={11} className="absolute right-2 top-2 pointer-events-none" style={{ color: 'var(--muted)' }} />
  </div>
);

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
