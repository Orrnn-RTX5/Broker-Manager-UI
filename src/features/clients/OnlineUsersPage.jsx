import { useState } from 'react';
import './OnlineUsersPage.css';
import AccountsOnlineGrid from './components/AccountsOnlineGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import useGridPageController from '../../hooks/useGridPageController';
import { useMultiScreenStore } from '../../store/multiScreenStore';

const ONLINE_COLUMNS = [
  { key: 'login',       label: 'Login ID' },
  { key: 'connectedAt', label: 'Connected Since' },
  { key: 'sessionAge',  label: 'Duration' },
  { key: 'isAdmin',     label: 'Role' },
  { key: 'deviceType',  label: 'Access Type' },
];

const OnlineUsersPage = () => {
  const [search, setSearch] = useState('');
  const openAccountScreen = useMultiScreenStore((state) => state.openAccountScreen);

  const ctl = useGridPageController({
    columns: ONLINE_COLUMNS,
    rowKey: 'login',
    exportName: 'accounts-online',
    entityLabel: 'account',
  });

  return (
    <div className="active-sessions-page" {...ctl.pageProps}>
      <AccountsOnlineGrid
        search={search}
        {...ctl.gridProps}
        searchControl={<div className="active-sessions-search">
          <input
            type="search"
            aria-label="Search active sessions by Login ID or Device"
            placeholder="Search login ID or access type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input ui-input-sm"
          />
        </div>}
      />

      {ctl.contextMenuProps.isOpen && (
        <ClientsContextMenu
          {...ctl.contextMenuProps}
          onNewClient={() => openAccountScreen()}
        />
      )}
    </div>
  );
};

export default OnlineUsersPage;
