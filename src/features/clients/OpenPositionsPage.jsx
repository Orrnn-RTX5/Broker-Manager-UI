import { useState, useMemo } from 'react';
import FilterDropdown from '../../components/FilterDropdown';
import PositionsDataGrid from './components/PositionsDataGrid';
import ClientsContextMenu from './components/ClientsContextMenu';
import AccountRestrictionsModal from '../../components/Popups/AccountRestrictionsModal';
import NewAccountModal from '../../components/Popups/NewAccountModal';
import useGridPageController from '../../hooks/useGridPageController';
import { useDealerMenu } from '../../hooks/useDealerMenu';
import { useAnalyticsRouteTiming } from '../../hooks/useAnalyticsTiming.js';
import { ANALYTICS_VIEWS } from '../../utils/analyticsQueryOptions.js';
import useSymbolStore from '../../store/symbolStore';
import useOwnerConsoleAutoCollapse from '../../hooks/useOwnerConsoleAutoCollapse';

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

const POPULAR_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY',
  'XAUUSD', 'XAGUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD',
  'US30', 'NAS100', 'SPX500', 'GER30', 'UK100',
];
const DEFAULT_REASONS = ['Client', 'Mobile', 'Expert', 'Dealer', 'Web', 'Auto', 'Signal'];

const OpenPositionsPage = () => {
  const headerRef = useOwnerConsoleAutoCollapse('.open-positions-filters');

  useAnalyticsRouteTiming(ANALYTICS_VIEWS.openPositions);
  const symbolsMap = useSymbolStore((state) => state.symbols);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [symbolFilter, setSymbolFilter] = useState('All Symbols');
  const [reasonFilter, setReasonFilter] = useState('All Reasons');
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [restrictLogin, setRestrictLogin] = useState(null);

  const symbolOptions = useMemo(() => {
    const fromStore = Object.keys(symbolsMap || {});
    return Array.from(new Set([
      'All Symbols',
      ...fromStore,
      ...POPULAR_SYMBOLS,
    ])).filter(Boolean);
  }, [symbolsMap]);

  const reasonOptions = useMemo(() => [
    'All Reasons',
    ...DEFAULT_REASONS,
  ], []);

  const ctl = useGridPageController({
    columns: POSITION_COLUMNS,
    rowKey: 'position',
    singleSelect: true,
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
    <div className="open-positions-page pt-4 pb-6 px-3 w-full h-full flex flex-col gap-2 overflow-y-auto" {...ctl.pageProps}>
      {/* Header with Title and Dropdown Filters */}
      <div ref={headerRef} className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <div>
            <h1 className="open-positions-title" style={{ color: 'var(--text)' }}>Open Positions</h1>
            <p className="open-positions-subtitle" style={{ color: 'var(--text-3)' }}>Real-time monitoring of currently open trades</p>
          </div>
        </div>
        <div className="open-positions-filters flex items-center gap-2 mt-2 md:mt-0 flex-nowrap shrink-0">
          <FilterDropdown
            value={typeFilter}
            className="w-[105px]"
            options={['All Types', 'Buy', 'Sell']}
            onChange={setTypeFilter}
          />
          <FilterDropdown
            value={symbolFilter}
            className="w-[130px]"
            options={symbolOptions}
            onChange={setSymbolFilter}
          />
          <FilterDropdown
            value={reasonFilter}
            className="w-[120px]"
            options={reasonOptions}
            onChange={setReasonFilter}
          />
        </div>
      </div>

      {/* Search Bar */}
      <div className="open-positions-search relative w-full max-w-xs">
        <input
          type="text"
          placeholder="Search login, position, symbol…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ui-input ui-input-sm"
        />
      </div>

      <PositionsDataGrid
        grid={ctl.grid}
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
