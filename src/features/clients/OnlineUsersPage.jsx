import { useState } from 'react';
import './OnlineUsersPage.css';
import AccountsOnlineGrid from './components/AccountsOnlineGrid';
import TradingAccountsContextMenu from './components/TradingAccountsContextMenu';
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
  const openAccountDetailWindow = useMultiScreenStore((state) => state.openAccountDetailWindow);

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
        <TradingAccountsContextMenu
          x={ctl.contextMenuProps.x}
          y={ctl.contextMenuProps.y}
          onClose={ctl.contextMenuProps.onClose}
          selectedRow={ctl.contextMenuProps.selectedRow}
          rows={ctl.contextMenuProps.rows}
          grid={ctl.grid}
          showGrid={ctl.grid.showGridlines}
          onNewAccount={() => openAccountScreen()}
          onOpenAccountDetails={(row) => row && openAccountDetailWindow(row, { source: 'trading-accounts', initialTab: 'Overview' })}
          onCopyAs={ctl.contextMenuProps.onCopyAs}
          onExport={ctl.contextMenuProps.onExport}
          onToggleGrid={() => ctl.grid.toggleGridlines()}
          onToggleColumn={(key) => ctl.grid.toggleColumn(key)}
        />
      )}
    </div>
  );
};

export default OnlineUsersPage;
