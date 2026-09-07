import { useState } from 'react';
import { Users, Search } from 'lucide-react';
import AccountsOnlineGrid from './components/AccountsOnlineGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';

const ONLINE_COLUMNS = [
  { key: 'login',       label: 'Login ID' },
  { key: 'connectedAt', label: 'Connected' },
  { key: 'sessionAge',  label: 'Age' },
  { key: 'isAdmin',     label: 'Is Admin' },
  { key: 'deviceType',  label: 'Device' },
];

const OnlineUsersPage = () => {
  const [search, setSearch] = useState('');
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);

  const ctl = useGridPageController({
    columns: ONLINE_COLUMNS,
    rowKey: 'login',
    exportName: 'accounts-online',
    entityLabel: 'account',
  });

  return (
    <div className="active-sessions-page p-6 w-full h-full flex flex-col gap-4 overflow-y-auto" {...ctl.pageProps}>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center border" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-border)', color: 'var(--accent-text)' }}>
            <Users size={16} />
          </div>
          <div>
            <h1 className="active-sessions-title" style={{ color: 'var(--text)' }}>Active Sessions</h1>
            <p className="active-sessions-subtitle" style={{ color: 'var(--text-3)' }}>Real-time monitoring of currently connected accounts</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search by Login ID or Device…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 32 }}
          />
        </div>
      </div>

      <AccountsOnlineGrid 
        search={search}
        {...ctl.gridProps} 
      />

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
