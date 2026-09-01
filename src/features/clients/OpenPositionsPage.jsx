import { useState, useMemo } from 'react';
import { Search, BarChart3 } from 'lucide-react';
import FilterDropdown from '../../components/FilterDropdown';
import PositionsDataGrid from './components/PositionsDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import AccountRestrictionsModal from '../../components/Popups/AccountRestrictionsModal';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';
import { useDealerMenu } from '../../hooks/useDealerMenu';
import { useAnalyticsRouteTiming } from '../../hooks/useAnalyticsTiming.js';
import { ANALYTICS_VIEWS } from '../../utils/analyticsQueryOptions.js';

const POSITION_COLUMNS = [
  { key: 'position',     label: 'Ticket' },
  { key: 'login',        label: 'Login' },
  { key: 'name',         label: 'User Name' },
  { key: 'email',        label: 'Email' },
  { key: 'symbol',       label: 'Symbol' },
  { key: 'type',         label: 'Action' },
  { key: 'volume',       label: 'Lots' },
  { key: 'priceOpen',    label: 'Open' },
  { key: 'priceCurrent', label: 'Current' },
  { key: 'priceSl',      label: 'S/L' },
  { key: 'priceTp',      label: 'T/P' },
  { key: 'swap',         label: 'Storage' },
  { key: 'profit',       label: 'Profit' },
  { key: 'comment',      label: 'Comment' },
];

const OpenPositionsPage = () => {
  useAnalyticsRouteTiming(ANALYTICS_VIEWS.openPositions);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [symbolFilter, setSymbolFilter] = useState('All Symbols');
  const [reasonFilter, setReasonFilter] = useState('All Reasons');
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [restrictLogin, setRestrictLogin] = useState(null);

  const ctl = useGridPageController({
    columns: POSITION_COLUMNS,
    rowKey: 'position',
    exportName: 'open-positions',
    entityLabel: 'position',
    onClearFilter: () => {
      setSearch(''); setTypeFilter('All Types');
      setSymbolFilter('All Symbols'); setReasonFilter('All Reasons');
    },
  });

  const { getPositionActions, renderDialog } = useDealerMenu(() => {
    ctl.gridProps.onRowsChange?.([]);
  });

  const dealerActions = useMemo(() => {
    if (!ctl.contextMenuProps.selectedRow) return [];
    return getPositionActions(ctl.contextMenuProps.selectedRow);
  }, [ctl.contextMenuProps.selectedRow, getPositionActions]);

  return (
    <div className="open-positions-page p-6 w-full h-full flex flex-col gap-5 overflow-y-auto" {...ctl.pageProps}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="open-positions-title text-xl font-semibold" style={{ color: 'var(--text)' }}>Open Positions</h1>
            <p className="open-positions-subtitle text-xs" style={{ color: 'var(--text-3)' }}>Real-time monitoring of currently open trades</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="open-positions-filters flex flex-wrap items-center gap-3">
        <div className="open-positions-search relative max-w-xs w-full">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search login, position, symbol…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 32 }}
          />
        </div>
        <FilterDropdown value={typeFilter} className="w-[100px]" options={['All Types', 'Buy', 'Sell']} onChange={setTypeFilter} />
        <FilterDropdown value={symbolFilter} className="w-[120px]" options={['All Symbols', 'xauusd.c', 'xauusd', 'Nubjpy.c']} onChange={setSymbolFilter} />
        <FilterDropdown value={reasonFilter} className="w-[120px]" options={['All Reasons', 'Mobile', 'Client', 'Expert']} onChange={setReasonFilter} />
      </div>

      <PositionsDataGrid
        search={search}
        typeFilter={typeFilter}
        symbolFilter={symbolFilter}
        reasonFilter={reasonFilter}
        {...ctl.gridProps}
      />

      {ctl.contextMenuProps.isOpen && (
        <ClientsContextMenu
          {...ctl.contextMenuProps}
          grid={{ ...ctl.grid, extraActions: dealerActions }}
          onNewClient={() => setIsNewAccountOpen(true)}
          onOpenDetails={(row) => setRestrictLogin(row.login)}
        />
      )}

      {renderDialog()}

      {restrictLogin && (
        <AccountRestrictionsModal login={restrictLogin} onClose={() => setRestrictLogin(null)} />
      )}

      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
    </div>
  );
};

export default OpenPositionsPage;
