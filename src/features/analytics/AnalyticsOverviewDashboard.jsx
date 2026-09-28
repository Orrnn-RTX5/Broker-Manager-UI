import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import DateRangePicker from '../../components/Popups/DateRangePicker';
import FilterDropdown from '../../components/FilterDropdown';
import useOwnerConsoleAutoCollapse from '../../hooks/useOwnerConsoleAutoCollapse';
import usePermissions from '../../hooks/usePermissions';
import authService from '../../services/authService';
import { getOrdersPage } from '../../services/api';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';
import { PERMISSIONS } from '../../utils/permissions';
import { ANALYTICS_QUERY_META } from '../../utils/analyticsQueryOptions';
import {
  buildTradingAccountFilterOptions,
  buildTradingAccountReport,
} from '../../utils/tradingAccountAnalytics';
import { buildOnlineUserAnalytics } from '../../utils/onlineUserAnalytics';
import {
  getOnlineUsersAnalyticsQueryOptions,
  getOpenPositionsAnalyticsQueryOptions,
  getTradingAccountsAnalyticsQueryOptions,
} from './analyticsQueries';
import worldGeoData from './countries-110m.json';

const EMPTY_ACCOUNTS = [];
const EMPTY_PAGE = { rows: [] };
const ALL_CAMPAIGNS = 'All Lead Campaign';
const ALL_SOURCES = 'All Lead Source';
const ALL_COUNTRIES = 'All Countries';
const SENTIMENT_SYMBOL_LIMIT = 10;
const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border-3)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 10,
};

const createOptions = (allLabel, values) => [allLabel, ...values];
const activeFilter = (value, allLabel) => value === allLabel ? '' : value;

const OVERVIEW_ONLINE_USERS_PARAMS = Object.freeze({
  search: '',
  sort_by: 'login',
  sort_dir: 'asc',
  limit: 100000,
  offset: 0,
});

const OVERVIEW_POSITIONS_PARAMS = Object.freeze({
  search: '',
  sort_by: 'position',
  sort_dir: 'asc',
  filters: Object.freeze({}),
  limit: 100000,
  offset: 0,
});

const OVERVIEW_ORDERS_QUERY = Object.freeze({
  queryKey: ['analytics', 'overview', 'broker-orders'],
  staleTime: 30_000,
  meta: ANALYTICS_QUERY_META,
});

const EmptyReport = ({ children }) => (
  <div className="trading-analytics-empty"><span>{children}</span></div>
);

const matchesAccountSearch = (account, query) => {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  return [account.login, account.name, account.email, account.group, account.country]
    .some((value) => String(value || '').toLowerCase().includes(needle));
};

const buildCountryCounts = (items) => {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.name.toLowerCase(), item.count);
  }
  return counts;
};

const buildSentimentBars = (rows, limit = SENTIMENT_SYMBOL_LIMIT) => {
  const perSymbol = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const symbol = String(row?.symbol || '').trim();
    if (!symbol) continue;
    const type = String(row?.type || row?.side || '').toLowerCase();
    const side = type.includes('sell') ? 'sell' : type.includes('buy') ? 'buy' : null;
    if (!side) continue;
    const bucket = perSymbol.get(symbol) || { symbol, buy: 0, sell: 0 };
    bucket[side] += 1;
    perSymbol.set(symbol, bucket);
  }
  return [...perSymbol.values()]
    .sort((a, b) => (b.buy + b.sell) - (a.buy + a.sell) || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)
    .map((item) => {
      const total = item.buy + item.sell;
      const buyPct = Math.round((item.buy / total) * 100);
      return {
        symbol: item.symbol,
        buyPct,
        sellPct: 100 - buyPct,
        buyCount: item.buy,
        sellCount: item.sell,
      };
    });
};

const RegistrationsLine = ({ data }) => (
  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 480, height: 180 }}>
    <LineChart data={data} margin={{ top: 12, right: 14, bottom: 2, left: 0 }}>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="date" axisLine={{ stroke: 'var(--border-3)' }} tickLine={false} minTickGap={40} tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
      <YAxis allowDecimals={false} width={40} axisLine={{ stroke: 'var(--border-3)' }} tickLine={false} tickFormatter={(value) => compactFormatter.format(value)} tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
      <Tooltip contentStyle={tooltipStyle} formatter={(value) => [countFormatter.format(value), 'Accounts']} cursor={{ stroke: 'var(--border-3)', strokeWidth: 1 }} isAnimationActive={false} />
      <Line type="linear" dataKey="count" name="Accounts" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5, fill: 'var(--surface)', stroke: 'var(--accent)', strokeWidth: 2 }} activeDot={{ r: 4 }} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer>
);

const OverviewMap = ({ counts, emptyLabel }) => {
  const maxCount = Math.max(0, ...counts.values());
  if (counts.size === 0) return <EmptyReport>{emptyLabel}</EmptyReport>;
  return (
    <ComposableMap projection="geoMercator" projectionConfig={{ scale: 120 }} width={800} height={390}>
      <ZoomableGroup center={[10, 12]} zoom={1.05}>
        <Geographies geography={worldGeoData}>
          {({ geographies }) => geographies.map((geo) => {
            const name = geo.properties.name || '';
            const count = counts.get(name.toLowerCase()) || 0;
            const intensity = count && maxCount ? .42 + .58 * Math.sqrt(count / maxCount) : 1;
            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={count ? 'var(--accent)' : 'var(--cc-map-land-bottom, #3c4140)'}
                fillOpacity={count ? intensity : .82}
                stroke="var(--bg-panel)"
                strokeWidth={.55}
                style={{
                  default: { outline: 'none' },
                  hover: { fill: count ? 'var(--accent-hover)' : 'var(--cc-map-land-top, #505654)', outline: 'none' },
                  pressed: { outline: 'none' },
                }}
              >
                <title>{name}: {countFormatter.format(count)}</title>
              </Geography>
            );
          })}
        </Geographies>
      </ZoomableGroup>
    </ComposableMap>
  );
};

const SentimentTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div style={{ ...tooltipStyle, padding: '6px 10px' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <i style={{ width: 8, height: 8, background: 'var(--accent)', display: 'inline-block' }} />
        <span>Buy: {row.buyPct}% ({countFormatter.format(row.buyCount)})</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <i style={{ width: 8, height: 8, background: '#f2c94c', display: 'inline-block' }} />
        <span>Sell: {row.sellPct}% ({countFormatter.format(row.sellCount)})</span>
      </div>
    </div>
  );
};

const SentimentBars = ({ data, buyLabel, sellLabel }) => (
  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 480, height: 180 }}>
    <BarChart data={data} margin={{ top: 12, right: 14, bottom: 2, left: 0 }} barCategoryGap="28%">
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="symbol" axisLine={{ stroke: 'var(--border-3)' }} tickLine={false} interval={0} tick={{ fill: 'var(--text-3)', fontSize: 8 }} />
      <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={32} axisLine={{ stroke: 'var(--border-3)' }} tickLine={false} tickFormatter={(value) => `${value}%`} tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
      <Tooltip content={<SentimentTooltip />} cursor={{ fill: 'var(--surface-2)', fillOpacity: 0.5 }} isAnimationActive={false} />
      <Legend verticalAlign="bottom" height={20} iconType="rect" iconSize={9} wrapperStyle={{ fontSize: 9, color: 'var(--text-3)' }} />
      <Bar dataKey="buyPct" stackId="side" fill="var(--accent)" name={buyLabel} isAnimationActive={false} maxBarSize={34} />
      <Bar dataKey="sellPct" stackId="side" fill="#f2c94c" name={sellLabel} isAnimationActive={false} maxBarSize={34} radius={[1.5, 1.5, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

// When the backend does not report a country for online sessions, fall back to
// a per-group breakdown so the panel still reflects live data.
const OnlineUsersFallback = ({ groups, total }) => (
  <div className="analytics-overview-groups">
    {groups.slice(0, 6).map((item) => (
      <div key={item.name} className="analytics-overview-groups-row">
        <span title={item.name}>{item.name}</span>
        <div className="analytics-overview-groups-bar">
          <i style={{ width: `${total ? (item.count / total) * 100 : 0}%` }} />
        </div>
        <b>{countFormatter.format(item.count)}</b>
      </div>
    ))}
  </div>
);

const OverviewPanel = ({ title, meta, onOpen, children }) => (
  <section
    className="trading-analytics-card analytics-overview-card"
    role="link"
    tabIndex={0}
    title={`Open ${title}`}
    onClick={onOpen}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpen?.();
      }
    }}
  >
    <header>
      <h2>{title}</h2>
      {meta ? <span>{meta}</span> : null}
    </header>
    <div className="analytics-overview-body">{children}</div>
  </section>
);

export default function AnalyticsOverviewDashboard() {
  const navigate = useNavigate();
  const { resolved, hasPermission } = usePermissions();
  const canViewPositions = resolved && hasPermission(PERMISSIONS.VIEW_POSITIONS);
  const toolbarRef = useOwnerConsoleAutoCollapse(':scope > :last-child');
  const [campaign, setCampaign] = useState(ALL_CAMPAIGNS);
  const [source, setSource] = useState(ALL_SOURCES);
  const [country, setCountry] = useState(ALL_COUNTRIES);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const claims = authService.getSessionClaims();
  const scope = buildPermissionSessionFingerprint({
    token: authService.getSessionScopeKey(),
    login: claims.login,
    brokerId: claims.brokerId,
  });

  const accountQuery = useQuery(getTradingAccountsAnalyticsQueryOptions(scope));
  const onlineUsersQuery = useQuery(getOnlineUsersAnalyticsQueryOptions(OVERVIEW_ONLINE_USERS_PARAMS));
  const positionsQuery = useQuery({
    ...getOpenPositionsAnalyticsQueryOptions(OVERVIEW_POSITIONS_PARAMS),
    enabled: canViewPositions,
  });
  const ordersQuery = useQuery({
    ...OVERVIEW_ORDERS_QUERY,
    queryFn: ({ signal }) => getOrdersPage({ limit: 100000, offset: 0 }, { signal }),
  });

  // Reactive listener for external account updates or deletions
  useEffect(() => {
    const handleAccountsChanged = () => {
      accountQuery.refetch();
    };
    window.addEventListener('trading-accounts-changed', handleAccountsChanged);
    window.addEventListener('accounts-updated', handleAccountsChanged);
    return () => {
      window.removeEventListener('trading-accounts-changed', handleAccountsChanged);
      window.removeEventListener('accounts-updated', handleAccountsChanged);
    };
  }, [accountQuery]);

  const accounts = accountQuery.data || EMPTY_ACCOUNTS;
  const filterOptions = useMemo(() => buildTradingAccountFilterOptions(accounts), [accounts]);
  const searchedAccounts = useMemo(
    () => accounts.filter((account) => matchesAccountSearch(account, search)),
    [accounts, search],
  );
  const report = useMemo(() => buildTradingAccountReport(searchedAccounts, {
    campaign: activeFilter(campaign, ALL_CAMPAIGNS),
    source: activeFilter(source, ALL_SOURCES),
    country: activeFilter(country, ALL_COUNTRIES),
    start: dateRange?.start,
    end: dateRange?.end,
  }), [searchedAccounts, campaign, source, country, dateRange]);

  const accountCountryCounts = useMemo(() => buildCountryCounts(report.countries), [report.countries]);
  const onlineUserRows = onlineUsersQuery.data?.rows || EMPTY_PAGE.rows;
  const onlineAnalytics = useMemo(
    () => buildOnlineUserAnalytics(onlineUserRows, { country: activeFilter(country, ALL_COUNTRIES) }),
    [onlineUserRows, country],
  );
  const positionRows = canViewPositions ? positionsQuery.data?.rows || EMPTY_PAGE.rows : EMPTY_PAGE.rows;
  const orderRows = ordersQuery.data?.rows || EMPTY_PAGE.rows;
  const positionBars = useMemo(() => buildSentimentBars(positionRows), [positionRows]);
  const orderBars = useMemo(() => buildSentimentBars(orderRows), [orderRows]);

  const open = (path) => () => navigate(path);
  const accountsLoading = accountQuery.isLoading && accounts.length === 0;

  return (
    <main className="trading-analytics-page analytics-overview-page">
      <header className="trading-analytics-heading">
        <div className="trading-analytics-title">
          <h1>Analytics</h1>
        </div>
        <div ref={toolbarRef} className="trading-analytics-toolbar" role="group" aria-label="Analytics filters">
          <FilterDropdown value={campaign} options={createOptions(ALL_CAMPAIGNS, filterOptions.campaigns)} onChange={setCampaign} className="trading-analytics-filter" style={{ width: 144 }} loading={accountsLoading} />
          <FilterDropdown value={source} options={createOptions(ALL_SOURCES, filterOptions.sources)} onChange={setSource} className="trading-analytics-filter" style={{ width: 128 }} loading={accountsLoading} />
          <FilterDropdown value={country} options={createOptions(ALL_COUNTRIES, filterOptions.countries)} onChange={setCountry} className="trading-analytics-filter" style={{ width: 118 }} loading={accountsLoading} />
          <input
            type="text"
            className="ui-input ui-input-sm analytics-overview-search"
            placeholder="*"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Filter accounts"
          />
          <div className="trading-analytics-date-range"><DateRangePicker onChange={setDateRange} /></div>
        </div>
      </header>

      <div className="analytics-overview-grid">
        <OverviewPanel title="Trading Accounts" meta={`${countFormatter.format(report.total)} accounts`} onOpen={open('/analytics/trading-accounts')}>
          {accountsLoading ? <EmptyReport>Loading the complete account catalogue…</EmptyReport>
            : accountQuery.isError ? <EmptyReport>Registration data is unavailable.</EmptyReport>
              : report.registrations.length === 0 ? <EmptyReport>No accounts match the selected filters.</EmptyReport>
                : <RegistrationsLine data={report.registrations} />}
        </OverviewPanel>

        <OverviewPanel title="Online Users" meta={`${countFormatter.format(onlineAnalytics.total)} online`} onOpen={open('/analytics/online-users')}>
          {onlineUsersQuery.isLoading ? <EmptyReport>Loading online users…</EmptyReport>
            : onlineUsersQuery.isError ? <EmptyReport>Online user data is unavailable.</EmptyReport>
              : onlineAnalytics.total === 0 ? <EmptyReport>No online users match the selected filters.</EmptyReport>
                : onlineAnalytics.geoCountries.size > 0
                  ? <OverviewMap counts={onlineAnalytics.geoCountries} emptyLabel="No online users match the selected filters." />
                  : <OnlineUsersFallback groups={onlineAnalytics.groups} total={onlineAnalytics.total} />}
        </OverviewPanel>

        {canViewPositions && <OverviewPanel title="Open Positions" meta={`${countFormatter.format(positionRows.length)} positions`} onOpen={open('/analytics/open-positions')}>
          {positionsQuery.isLoading ? <EmptyReport>Loading open positions…</EmptyReport>
            : positionsQuery.isError ? <EmptyReport>Position data is unavailable.</EmptyReport>
              : positionBars.length === 0 ? <EmptyReport>No open positions.</EmptyReport>
                : <SentimentBars data={positionBars} buyLabel="Buy" sellLabel="Sell" />}
        </OverviewPanel>}

        <OverviewPanel title="Open Orders" meta={`${countFormatter.format(orderRows.length)} orders`} onOpen={open('/analytics/open-orders')}>
          {ordersQuery.isLoading ? <EmptyReport>Loading open orders…</EmptyReport>
            : ordersQuery.isError ? <EmptyReport>Order data is unavailable.</EmptyReport>
              : orderBars.length === 0 ? <EmptyReport>No open orders.</EmptyReport>
                : <SentimentBars data={orderBars} buyLabel="Buy" sellLabel="Sell" />}
        </OverviewPanel>

        <OverviewPanel title="Advertising Campaigns" meta={`${countFormatter.format(filterOptions.campaigns.length)} campaigns`} onOpen={open('/analytics/advertising-campaigns')}>
          {accountsLoading ? <EmptyReport>Loading campaign registrations…</EmptyReport>
            : accountQuery.isError ? <EmptyReport>Campaign data is unavailable.</EmptyReport>
              : report.registrations.length === 0 ? <EmptyReport>No registrations match the selected filters.</EmptyReport>
                : <RegistrationsLine data={report.registrations} />}
        </OverviewPanel>

        <OverviewPanel title="By Country" meta={`${countFormatter.format(report.countries.length)} countries`} onOpen={open('/analytics/by-country')}>
          {accountsLoading ? <EmptyReport>Loading country distribution…</EmptyReport>
            : accountQuery.isError ? <EmptyReport>Country data is unavailable.</EmptyReport>
              : <OverviewMap counts={accountCountryCounts} emptyLabel="No accounts match the selected filters." />}
        </OverviewPanel>
      </div>
    </main>
  );
}
