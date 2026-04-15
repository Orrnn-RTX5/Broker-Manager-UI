import { useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import OnlineUsersDataGrid from '../analytics/components/OnlineUsersDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';
import { ALL_COUNTRIES } from '../../utils/countries';

const ONLINE_COLUMNS = [
  { key: 'login',   label: 'Login' },
  { key: 'name',    label: 'Name' },
  { key: 'group',   label: 'Group' },
  { key: 'country', label: 'Country' },
  { key: 'build',   label: 'Build' },
  { key: 'ip',      label: 'IP' },
  { key: 'device',  label: 'Device' },
  { key: 'balance', label: 'Balance' },
  { key: 'equity',  label: 'Equity' },
  { key: 'profit',  label: 'Profit' },
];

const Dropdown = ({ value, width = 'w-32', options = [] }) => (
  <div className={`relative ${width}`}>
    <select
      className="appearance-none w-full h-7 pl-2.5 pr-7 text-xs rounded-md transition-colors focus:outline-none"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-3)', color: 'var(--text-2)', boxShadow: 'var(--shadow-xs)' }}
    >
      <option>{value}</option>
      {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
    <ChevronDown size={11} className="absolute right-2 top-2 pointer-events-none" style={{ color: 'var(--muted)' }} />
  </div>
);

const OnlineUsersPage = () => {
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);

  const ctl = useGridPageController({
    columns: ONLINE_COLUMNS,
    rowKey: 'login',
    exportName: 'online-users',
    entityLabel: 'user',
  });

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto" {...ctl.pageProps}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Users size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Online Users</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Right-click for actions</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <Dropdown value="All Groups"    width="w-[130px]" />
          <Dropdown value="All Countries" width="w-[140px]" options={ALL_COUNTRIES} />
        </div>
      </div>

      <OnlineUsersDataGrid {...ctl.gridProps} />

      {ctl.contextMenuProps.isOpen && (
        <ClientsContextMenu
          {...ctl.contextMenuProps}
          onNewClient={() => setIsNewAccountOpen(true)}
        />
      )}

      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
    </div>
  );
};

export default OnlineUsersPage;
