import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, RotateCw, Search, ShieldCheck, Users, Wallet } from 'lucide-react';
import OnlineUsersDataGrid from './components/OnlineUsersDataGrid';
import OnlineUsersByCountryMap from './components/OnlineUsersByCountryMap';
import OnlineUsersByTypePie from './components/OnlineUsersByTypePie';
import OnlineUsersByGroupPie from './components/OnlineUsersByGroupPie';
import OnlineUsersByBuildChart from './components/OnlineUsersByBuildChart';
import FilterDropdown from '../../components/FilterDropdown';
import useOwnerConsoleAutoCollapse from '../../hooks/useOwnerConsoleAutoCollapse';
import useAfterFirstPaint from '../../hooks/useAfterFirstPaint';
import {
  buildOnlineUserAnalytics,
  buildOnlineUserFilterOptions,
} from '../../utils/onlineUserAnalytics';
import { useAnalyticsRouteTiming } from '../../hooks/useAnalyticsTiming.js';
import { ANALYTICS_VIEWS } from '../../utils/analyticsQueryOptions.js';
import { getOnlineUsersAnalyticsQueryOptions } from './analyticsQueries.js';

const EMPTY_ROWS = [];
const ALL_COUNTRIES = 'All Countries';
const ALL_GROUPS = 'All Groups';
const ALL_TYPES = 'All Types';
const ALL_BUILDS = 'All Builds';
const TOP_SLICE_COUNT = 5;
const BUILD_BAR_LIMIT = 12;

const ALL_ONLINE_USERS_PARAMS = Object.freeze({
  search: '',
  sort_by: 'login',
  sort_dir: 'asc',
  limit: 100000,
  offset: 0,
});

// Formatters are built once; constructing Intl formatters per call is costly.
const INTEGER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const MONEY_FORMAT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatInteger = (value) => INTEGER_FORMAT.format(value);
const formatMoney = (value) => MONEY_FORMAT.format(value);

const createOptions = (allLabel, values) => [allLabel, ...values];
const activeFilter = (value, allLabel) => (value === allLabel ? '' : value);

const topSlices = (items, limit = TOP_SLICE_COUNT) => {
  if (items.length <= limit + 1) return items;
  const visible = items.slice(0, limit);
  const rest = items.slice(limit).reduce((sum, item) => sum + item.count, 0);
  return [...visible, { name: 'Others', count: rest }];
};

const EmptyReport = ({ children }) => (
  <div className="trading-analytics-empty"><span>{children}</span></div>
);

const MetricCard = ({ icon, label, value, hint }) => (
  <div title={hint} className="online-users-metric-card ui-card h-full px-3 py-2 flex items-center gap-2">
    <div
      className="online-users-metric-icon w-7 h-7 rounded flex items-center justify-center shrink-0"
      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
    >
      {icon}
    </div>
    <div className="online-users-metric-content min-w-0 flex-1 flex flex-col self-stretch">
      <div className="online-users-metric-label text-xs leading-4 uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="online-users-metric-value tabular" style={{ color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  </div>
);

const AnalyticsPanel = ({ title, meta, children }) => (
  <section className="trading-analytics-card">
    <header>
      <h2>{title}</h2>
      {meta ? <span>{meta}</span> : null}
    </header>
    {children}
  </section>
);

const OnlineUsersDashboard = () => {
  useAnalyticsRouteTiming(ANALYTICS_VIEWS.onlineUsers);
  const queryClient = useQueryClient();
  const toolbarRef = useOwnerConsoleAutoCollapse(':scope > :last-child');
  // The grid and figures paint first; the SVG map and charts draw right after.
  const visualsReady = useAfterFirstPaint();
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState(ALL_COUNTRIES);
  const [group, setGroup] = useState(ALL_GROUPS);
  const [type, setType] = useState(ALL_TYPES);
  const [build, setBuild] = useState(ALL_BUILDS);

  const onlineUsersQuery = useQuery({
    ...getOnlineUsersAnalyticsQueryOptions(ALL_ONLINE_USERS_PARAMS),
    refetchInterval: 10_000,
  });

  const allRows = onlineUsersQuery.data?.rows || EMPTY_ROWS;
  const filterOptions = useMemo(() => buildOnlineUserFilterOptions(allRows), [allRows]);
  const analytics = useMemo(() => buildOnlineUserAnalytics(allRows, {
    country: activeFilter(country, ALL_COUNTRIES),
    group: activeFilter(group, ALL_GROUPS),
    type: activeFilter(type, ALL_TYPES),
    build: activeFilter(build, ALL_BUILDS),
    search,
  }), [allRows, country, group, type, build, search]);

  const groupSlices = useMemo(() => topSlices(analytics.groups), [analytics.groups]);
  const typeSlices = useMemo(() => topSlices(analytics.types), [analytics.types]);
  const buildBars = useMemo(
    () => analytics.builds.slice(0, BUILD_BAR_LIMIT).map((item) => ({ build: item.name, count: item.count })),
    [analytics.builds],
  );

  const loading = onlineUsersQuery.isLoading && allRows.length === 0;
  const unavailable = onlineUsersQuery.isError && allRows.length === 0;
  const empty = !loading && !unavailable && analytics.total === 0;

  const handleRefresh = () => queryClient.invalidateQueries({ queryKey: ['online-users'] });

  return (
    <div className="online-users-page p-3 w-full h-full flex flex-col gap-2 overflow-y-auto">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 shrink-0">
        <div className="shrink-0">
          <h1 className="online-users-title" style={{ color: 'var(--text)' }}>
            Online Users
          </h1>
          <p className="online-users-subtitle text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
            Live connected users from the manager backend.
          </p>
        </div>

        <div ref={toolbarRef} className="online-users-filters flex items-center gap-1.5 flex-wrap justify-end" role="group" aria-label="Online user filters">
          <FilterDropdown
            value={country}
            options={createOptions(ALL_COUNTRIES, filterOptions.countries)}
            onChange={setCountry}
            style={{ width: 124 }}
            loading={loading}
          />
          <FilterDropdown
            value={group}
            options={createOptions(ALL_GROUPS, filterOptions.groups)}
            onChange={setGroup}
            style={{ width: 150 }}
            loading={loading}
          />
          <FilterDropdown
            value={type}
            options={createOptions(ALL_TYPES, filterOptions.types)}
            onChange={setType}
            style={{ width: 106 }}
            loading={loading}
          />
          <FilterDropdown
            value={build}
            options={createOptions(ALL_BUILDS, filterOptions.builds)}
            onChange={setBuild}
            style={{ width: 104 }}
            loading={loading}
          />
          <div className="online-users-search relative" style={{ width: 140 }}>
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--muted)' }}
            />
            <input
              type="text"
              placeholder="*"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="ui-input ui-input-sm"
              style={{ paddingLeft: 26 }}
              aria-label="Filter online users"
            />
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            onClick={handleRefresh}
            title="Refresh online users"
            aria-label="Refresh online users"
          >
            <RotateCw size={13} className={onlineUsersQuery.isFetching ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        <MetricCard
          icon={<Users size={18} />}
          label="Online Users"
          value={formatInteger(analytics.total)}
          hint="Users matching the current filters"
        />
        <MetricCard
          icon={<ShieldCheck size={18} />}
          label="Admin Sessions"
          value={formatInteger(analytics.adminSessions)}
          hint="Backend role flag"
        />
        <MetricCard
          icon={<Monitor size={18} />}
          label="Groups"
          value={formatInteger(analytics.uniqueGroups)}
          hint="Unique account groups"
        />
        <MetricCard
          icon={<Wallet size={18} />}
          label="Visible Equity"
          value={formatMoney(analytics.totalEquity)}
          hint="Sum of filtered users"
        />
      </div>

      <div className="online-users-analytics-grid">
        <AnalyticsPanel title="Online Users by Country" meta={`${analytics.countries.length} countries`}>
          {loading ? <EmptyReport>Loading online users…</EmptyReport>
            : unavailable ? <EmptyReport>Online user data is unavailable.</EmptyReport>
              : empty ? <EmptyReport>No online users match the selected filters.</EmptyReport>
                : !visualsReady ? <div className="online-users-chart-body" aria-hidden="true" />
                : <OnlineUsersByCountryMap geoCounts={analytics.geoCountries} summary={analytics.countries} />}
        </AnalyticsPanel>

        <AnalyticsPanel title="Online Users by Type" meta={`${analytics.types.length} types`}>
          {loading ? <EmptyReport>Loading online users…</EmptyReport>
            : unavailable ? <EmptyReport>Online user data is unavailable.</EmptyReport>
              : empty ? <EmptyReport>No online users match the selected filters.</EmptyReport>
                : !visualsReady ? <div className="online-users-chart-body" aria-hidden="true" />
                : <OnlineUsersByTypePie slices={typeSlices} total={analytics.total} />}
        </AnalyticsPanel>

        <AnalyticsPanel title="Online Users by Group" meta={`${analytics.groups.length} groups`}>
          {loading ? <EmptyReport>Loading online users…</EmptyReport>
            : unavailable ? <EmptyReport>Online user data is unavailable.</EmptyReport>
              : empty ? <EmptyReport>No online users match the selected filters.</EmptyReport>
                : !visualsReady ? <div className="online-users-chart-body" aria-hidden="true" />
                : <OnlineUsersByGroupPie slices={groupSlices} total={analytics.total} />}
        </AnalyticsPanel>

        <AnalyticsPanel title="Online Users by Build" meta={`${analytics.builds.length} builds`}>
          {loading ? <EmptyReport>Loading online users…</EmptyReport>
            : unavailable ? <EmptyReport>Online user data is unavailable.</EmptyReport>
              : empty ? <EmptyReport>No online users match the selected filters.</EmptyReport>
                : !visualsReady ? <div className="online-users-chart-body" aria-hidden="true" />
                : <div className="online-users-chart-body"><OnlineUsersByBuildChart data={buildBars} /></div>}
        </AnalyticsPanel>
      </div>

      <OnlineUsersDataGrid search={search} />
    </div>
  );
};

export default OnlineUsersDashboard;
