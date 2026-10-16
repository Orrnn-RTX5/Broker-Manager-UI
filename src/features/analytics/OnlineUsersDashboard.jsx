import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Search, ShieldCheck, Users, Wallet } from 'lucide-react';
import OnlineUsersByCountryMap from './components/OnlineUsersByCountryMap';
import OnlineUsersByTypePie from './components/OnlineUsersByTypePie';
import OnlineUsersByGroupPie from './components/OnlineUsersByGroupPie';
import FilterDropdown from '../../components/FilterDropdown';
import useOwnerConsoleAutoCollapse from '../../hooks/useOwnerConsoleAutoCollapse';
import useAfterFirstPaint from '../../hooks/useAfterFirstPaint';
import { useGroupList } from '../../hooks/useGroupList';
import authService from '../../services/authService';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';
import { ALL_COUNTRIES as WORLD_COUNTRIES } from '../../utils/countries';
import {
  buildOnlineUserAnalytics,
  buildOnlineUserFilterOptions,
} from '../../utils/onlineUserAnalytics';
import { useAnalyticsDataTiming, useAnalyticsRouteTiming } from '../../hooks/useAnalyticsTiming.js';
import { ANALYTICS_VIEWS } from '../../utils/analyticsQueryOptions.js';
import {
  getOnlineUsersAnalyticsQueryOptions,
  getTradingAccountsAnalyticsQueryOptions,
} from './analyticsQueries.js';

const EMPTY_ROWS = [];
const EMPTY_ACCOUNTS = [];
const ALL_COUNTRIES = 'All Countries';
const ALL_GROUPS = 'All Groups';
const ALL_TYPES = 'All Types';
const TOP_SLICE_COUNT = 5;

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
  <div title={hint} className="online-users-metric-card ui-card h-full px-3.5 py-2.5 flex items-center gap-3">
    <div
      className="online-users-metric-icon w-8 h-8 rounded flex items-center justify-center shrink-0"
      style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
    >
      {icon}
    </div>
    <div className="online-users-metric-content min-w-0 flex-1 flex flex-col justify-center">
      <div className="online-users-metric-label text-xs leading-4 uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="online-users-metric-value tabular mt-0.5" style={{ color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  </div>
);

const AnalyticsPanel = ({ title, meta, className = '', children }) => (
  <section className={`trading-analytics-card ${className}`.trim()}>
    <header>
      <h2>{title}</h2>
      {meta ? <span>{meta}</span> : null}
    </header>
    {children}
  </section>
);

const OnlineUsersDashboard = () => {
  useAnalyticsRouteTiming(ANALYTICS_VIEWS.onlineUsers);
  const toolbarRef = useOwnerConsoleAutoCollapse(':scope > :last-child');
  const visualsReady = useAfterFirstPaint();
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState(ALL_COUNTRIES);
  const [group, setGroup] = useState(ALL_GROUPS);
  const [type, setType] = useState(ALL_TYPES);

  const claims = authService.getSessionClaims();
  const scope = buildPermissionSessionFingerprint({
    token: authService.getSessionScopeKey(),
    login: claims.login,
    brokerId: claims.brokerId,
  });

  const onlineUsersQuery = useQuery({
    ...getOnlineUsersAnalyticsQueryOptions(ALL_ONLINE_USERS_PARAMS),
    refetchInterval: 10_000,
  });
  const accountQuery = useQuery(getTradingAccountsAnalyticsQueryOptions(scope));
  const { groups: brokerGroups } = useGroupList({ limit: 100, offset: 0, sort_by: 'name', sort_dir: 'asc' });

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

  const allRows = onlineUsersQuery.data?.rows || EMPTY_ROWS;
  const accounts = accountQuery.data || EMPTY_ACCOUNTS;

  const filterOptions = useMemo(
    () => buildOnlineUserFilterOptions(allRows, accounts, brokerGroups),
    [allRows, accounts, brokerGroups]
  );
  const countryList = filterOptions.countries.length > 0 ? filterOptions.countries : WORLD_COUNTRIES;

  const analytics = useMemo(() => buildOnlineUserAnalytics(allRows, {
    country: activeFilter(country, ALL_COUNTRIES),
    group: activeFilter(group, ALL_GROUPS),
    type: activeFilter(type, ALL_TYPES),
    search,
  }, accounts), [allRows, accounts, country, group, type, search]);

  const groupSlices = useMemo(() => topSlices(analytics.groups), [analytics.groups]);
  const typeSlices = useMemo(() => topSlices(analytics.types), [analytics.types]);

  const loading = onlineUsersQuery.isLoading && allRows.length === 0;
  const unavailable = onlineUsersQuery.isError && allRows.length === 0;
  const empty = !loading && !unavailable && analytics.total === 0;

  const timingMetadata = useMemo(() => ({
    rowCount: allRows.length,
    cacheAvailable: onlineUsersQuery.dataUpdatedAt > 0,
  }), [allRows.length, onlineUsersQuery.dataUpdatedAt]);
  useAnalyticsDataTiming(ANALYTICS_VIEWS.onlineUsers, {
    settled: !onlineUsersQuery.isLoading && (onlineUsersQuery.dataUpdatedAt > 0 || onlineUsersQuery.isError),
    outcome: onlineUsersQuery.isError ? 'error' : allRows.length > 0 ? 'success' : 'empty',
    dataVersion: onlineUsersQuery.dataUpdatedAt,
    metadata: timingMetadata,
  });

  return (
    <div className="online-users-page p-3 w-full h-full flex flex-col gap-2.5 overflow-y-auto">
      <div className="online-users-header flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 shrink-0">
        <div className="shrink-0">
          <h1 className="online-users-title" style={{ color: 'var(--text)' }}>
            Online Users
          </h1>
        </div>

        <div ref={toolbarRef} className="online-users-filters flex items-center gap-2 flex-wrap justify-end" role="group" aria-label="Online user filters">
          <FilterDropdown
            value={country}
            options={createOptions(ALL_COUNTRIES, countryList)}
            onChange={setCountry}
            style={{ width: 144 }}
            loading={loading}
          />
          <FilterDropdown
            value={group}
            options={createOptions(ALL_GROUPS, filterOptions.groups)}
            onChange={setGroup}
            style={{ width: 156 }}
            loading={loading}
          />
          <FilterDropdown
            value={type}
            options={createOptions(ALL_TYPES, filterOptions.types)}
            onChange={setType}
            style={{ width: 124 }}
            loading={loading}
          />
          <div className="online-users-search relative" style={{ width: 196 }}>
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--muted)' }}
            />
            <input
              type="text"
              placeholder="Search online users..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="ui-input ui-input-sm placeholder:text-white"
              style={{ paddingLeft: 26 }}
              aria-label="Filter online users"
            />
          </div>
        </div>
      </div>

      <div className="online-users-metrics-grid grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
        <MetricCard
          icon={<Users size={17} />}
          label="Online Users"
          value={formatInteger(analytics.total)}
          hint="Users matching the current filters"
        />
        <MetricCard
          icon={<ShieldCheck size={17} />}
          label="Admin Sessions"
          value={formatInteger(analytics.adminSessions)}
          hint="Backend role flag"
        />
        <MetricCard
          icon={<Monitor size={17} />}
          label="Groups"
          value={formatInteger(analytics.uniqueGroups)}
          hint="Unique account groups"
        />
        <MetricCard
          icon={<Wallet size={17} />}
          label="Visible Equity"
          value={formatMoney(analytics.totalEquity)}
          hint="Sum of filtered users"
        />
      </div>

      <div className="online-users-analytics-grid">
        <AnalyticsPanel
          title="Online Users by Country"
          meta={`${analytics.countries.length} ${analytics.countries.length === 1 ? 'country' : 'countries'}`}
          className="online-users-country-card"
        >
          {loading ? <EmptyReport>Loading online users…</EmptyReport>
            : unavailable ? <EmptyReport>Online user data is unavailable.</EmptyReport>
              : empty ? <EmptyReport>No online users match the selected filters.</EmptyReport>
                : !visualsReady ? <div className="online-users-chart-body" aria-hidden="true" />
                : (
                  <OnlineUsersByCountryMap
                    geoCounts={analytics.geoCountries}
                    summary={analytics.countries}
                    breakdown={analytics.countryBreakdown}
                    total={analytics.total}
                  />
                )}
        </AnalyticsPanel>

        <AnalyticsPanel
          title="Online Users by Type"
          meta={`${analytics.types.length} ${analytics.types.length === 1 ? 'type' : 'types'}`}
        >
          {loading ? <EmptyReport>Loading online users…</EmptyReport>
            : unavailable ? <EmptyReport>Online user data is unavailable.</EmptyReport>
              : empty ? <EmptyReport>No online users match the selected filters.</EmptyReport>
                : !visualsReady ? <div className="online-users-chart-body" aria-hidden="true" />
                : <OnlineUsersByTypePie slices={typeSlices} total={analytics.total} />}
        </AnalyticsPanel>

        <AnalyticsPanel
          title="Online Users by Group"
          meta={`${analytics.groups.length} ${analytics.groups.length === 1 ? 'group' : 'groups'}`}
        >
          {loading ? <EmptyReport>Loading online users…</EmptyReport>
            : unavailable ? <EmptyReport>Online user data is unavailable.</EmptyReport>
              : empty ? <EmptyReport>No online users match the selected filters.</EmptyReport>
                : !visualsReady ? <div className="online-users-chart-body" aria-hidden="true" />
                : <OnlineUsersByGroupPie slices={groupSlices} total={analytics.total} />}
        </AnalyticsPanel>
      </div>
    </div>
  );
};

export default OnlineUsersDashboard;
