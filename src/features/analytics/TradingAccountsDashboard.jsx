import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import {
  CartesianGrid, Cell, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, ArrowUpRight, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DonutChart } from '../../components/ui/donut-chart';
import DateRangePicker from '../../components/Popups/DateRangePicker';
import FilterDropdown from '../../components/FilterDropdown';
import useOwnerConsoleAutoCollapse from '../../hooks/useOwnerConsoleAutoCollapse';
import authService from '../../services/authService';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';
import {
  buildTradingAccountFilterOptions,
  buildTradingAccountReport,
} from '../../utils/tradingAccountAnalytics';
import { getTradingAccountsAnalyticsQueryOptions } from './analyticsQueries';
import worldGeoData from './countries-110m.json';

const EMPTY_ACCOUNTS = [];
const ALL_CAMPAIGNS = 'All Lead Campaign';
const ALL_SOURCES = 'All Lead Source';
const ALL_COUNTRIES = 'All Countries';
const ALL_GROUPS = 'All Groups';
const GROUP_COLORS = ['#008ffb', '#f2c94c', '#8bc34a', '#a987ff', '#e46b95', '#6f98a8'];
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
const percentage = (value, total) => total ? `${((value / total) * 100).toFixed(2)}%` : '0.00%';
const RADIAN = Math.PI / 180;
const renderGroupLabel = ({ cx, cy, midAngle, outerRadius, name, percent }) => {
  if (!Number.isFinite(percent) || percent < .04) return null;
  const cosine = Math.cos(-midAngle * RADIAN);
  const sine = Math.sin(-midAngle * RADIAN);
  const startX = cx + (outerRadius + 2) * cosine;
  const startY = cy + (outerRadius + 2) * sine;
  const middleX = cx + (outerRadius + 13) * cosine;
  const middleY = cy + (outerRadius + 13) * sine;
  const endX = middleX + (cosine >= 0 ? 18 : -18);
  const textX = endX + (cosine >= 0 ? 4 : -4);
  return (
    <g className="trading-analytics-pie-label">
      <path d={`M${startX},${startY}L${middleX},${middleY}L${endX},${middleY}`} />
      <text x={textX} y={middleY} textAnchor={cosine >= 0 ? 'start' : 'end'} dominantBaseline="central">
        {name}: {(percent * 100).toFixed(2)}%
      </text>
    </g>
  );
};

const EmptyReport = ({ children }) => (
  <div className="trading-analytics-empty"><span>{children}</span></div>
);

export default function TradingAccountsDashboard({ title = 'Trading Accounts' } = {}) {
  const navigate = useNavigate();
  const toolbarRef = useOwnerConsoleAutoCollapse(':scope > :last-child');
  const [campaign, setCampaign] = useState(ALL_CAMPAIGNS);
  const [source, setSource] = useState(ALL_SOURCES);
  const [country, setCountry] = useState(ALL_COUNTRIES);
  const [group, setGroup] = useState(ALL_GROUPS);
  const [dateRange, setDateRange] = useState(null);
  const claims = authService.getSessionClaims();
  const scope = buildPermissionSessionFingerprint({
    token: authService.getSessionScopeKey(),
    login: claims.login,
    brokerId: claims.brokerId,
  });
  const accountQuery = useQuery(getTradingAccountsAnalyticsQueryOptions(scope));

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
  const report = useMemo(() => buildTradingAccountReport(accounts, {
    campaign: activeFilter(campaign, ALL_CAMPAIGNS),
    source: activeFilter(source, ALL_SOURCES),
    country: activeFilter(country, ALL_COUNTRIES),
    group: activeFilter(group, ALL_GROUPS),
    start: dateRange?.start,
    end: dateRange?.end,
  }), [accounts, campaign, source, country, group, dateRange]);
  const countryCounts = useMemo(
    () => new Map(report.countries.map((item) => [item.name.toLocaleLowerCase(), item.count])),
    [report.countries],
  );
  const maxCountryCount = report.countries[0]?.count || 0;
  const groupSlices = useMemo(() => {
    if (report.groups.length <= 6) return report.groups;
    const visible = report.groups.slice(0, 5);
    return [...visible, { name: 'Others', count: report.groups.slice(5).reduce((sum, item) => sum + item.count, 0) }];
  }, [report.groups]);
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const donutData = useMemo(() => {
    return groupSlices.map((item, index) => ({
      value: item.count,
      label: item.name,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
    }));
  }, [groupSlices]);
  const activeGroupSegment = useMemo(() => {
    if (!hoveredGroup) return null;
    const key = typeof hoveredGroup === 'object' ? hoveredGroup?.label : hoveredGroup;
    return donutData.find((s) => s.label === key) || null;
  }, [hoveredGroup, donutData]);
  const loading = accountQuery.isLoading && accounts.length === 0;
  const unavailable = accountQuery.isError && accounts.length === 0;
  const empty = !loading && !unavailable && report.total === 0;

  return (
    <main className="trading-analytics-page">
      <header className="trading-analytics-heading">
        <div className="trading-analytics-title">
          <h1>{title}</h1>
        </div>
        <div ref={toolbarRef} className="trading-analytics-toolbar" role="group" aria-label="Report filters">
          <FilterDropdown value={campaign} options={createOptions(ALL_CAMPAIGNS, filterOptions.campaigns)} onChange={setCampaign} className="trading-analytics-filter trading-analytics-filter-campaign" style={{ width: 144 }} loading={loading} />
          <FilterDropdown value={source} options={createOptions(ALL_SOURCES, filterOptions.sources)} onChange={setSource} className="trading-analytics-filter trading-analytics-filter-source" style={{ width: 128 }} loading={loading} />
          <FilterDropdown value={country} options={createOptions(ALL_COUNTRIES, filterOptions.countries)} onChange={setCountry} className="trading-analytics-filter trading-analytics-filter-country" style={{ width: 118 }} loading={loading} />
          <FilterDropdown value={group} options={createOptions(ALL_GROUPS, filterOptions.groups)} onChange={setGroup} className="trading-analytics-filter trading-analytics-filter-group" style={{ width: 108 }} loading={loading} />
          <div className="trading-analytics-date-range"><DateRangePicker onChange={setDateRange} /></div>
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            onClick={() => accountQuery.refetch()}
            title="Refresh analytics data"
            aria-label="Refresh analytics data"
          >
            <RotateCw size={13} className={accountQuery.isFetching ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => navigate('/clients/trading-accounts')}>
            View accounts <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </div>
      </header>

      {accountQuery.isError && (
        <div className="trading-analytics-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{accountQuery.error?.message || 'Trading account reports could not be loaded.'}</span>
          <button type="button" onClick={() => accountQuery.refetch()}>Try again</button>
        </div>
      )}

      <div className="trading-analytics-content">
        <section className="trading-analytics-card trading-analytics-registration" aria-labelledby="registration-chart-title">
          <header>
            <h2 id="registration-chart-title">Trading Accounts by Registration Date</h2>
            <span>{countFormatter.format(report.total)} accounts</span>
          </header>
          <div className="trading-analytics-chart">
            {loading ? <EmptyReport>Loading the complete account catalogue…</EmptyReport>
              : unavailable ? <EmptyReport>Registration data is unavailable.</EmptyReport>
                : empty ? <EmptyReport>No accounts match the selected filters.</EmptyReport>
                  : report.registrations.length === 0 ? <EmptyReport>The server did not provide account registration dates.</EmptyReport>
                    : (
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 960, height: 220 }}>
                        <LineChart data={report.registrations} margin={{ top: 14, right: 16, bottom: 4, left: 2 }}>
                          <CartesianGrid vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="date" axisLine={{ stroke: 'var(--border-3)' }} tickLine={false} minTickGap={40} tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
                          <YAxis allowDecimals={false} width={42} axisLine={{ stroke: 'var(--border-3)' }} tickLine={false} tickFormatter={(value) => compactFormatter.format(value)} tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [countFormatter.format(value), 'Accounts']} />
                          <Line type="linear" dataKey="count" name="Accounts" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--surface)', stroke: 'var(--accent)', strokeWidth: 2 }} activeDot={{ r: 4 }} isAnimationActive={true} animationDuration={600} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
          </div>
        </section>

        <div className="trading-analytics-lower-grid">
          <section className="trading-analytics-card" aria-labelledby="country-map-title">
            <header>
              <h2 id="country-map-title">Trading Accounts by Country</h2>
              <span>{report.countries.length} countries</span>
            </header>
            <div className="trading-analytics-map">
              {loading ? <EmptyReport>Loading country distribution…</EmptyReport>
                : unavailable ? <EmptyReport>Country data is unavailable.</EmptyReport>
                  : empty ? <EmptyReport>No accounts match the selected filters.</EmptyReport>
                    : (
                      <>
                        <div className="trading-analytics-map-canvas">
                          <ComposableMap projection="geoMercator" projectionConfig={{ scale: 120 }} width={800} height={390}>
                            <ZoomableGroup center={[10, 12]} zoom={1.05}>
                              <Geographies geography={worldGeoData}>
                                {({ geographies }) => geographies.map((geo) => {
                                  const name = geo.properties.name || '';
                                  const count = countryCounts.get(name.toLocaleLowerCase()) || 0;
                                  const intensity = count && maxCountryCount ? .42 + .58 * Math.sqrt(count / maxCountryCount) : 1;
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
                                      <title>{name}: {countFormatter.format(count)} accounts</title>
                                    </Geography>
                                  );
                                })}
                              </Geographies>
                            </ZoomableGroup>
                          </ComposableMap>
                        </div>
                        <div className="trading-analytics-country-summary">
                          {report.countries.slice(0, 4).map((item) => (
                            <span key={item.name}><i />{item.name}<b>{countFormatter.format(item.count)}</b></span>
                          ))}
                        </div>
                      </>
                    )}
            </div>
          </section>

          <section className="trading-analytics-card" aria-labelledby="group-chart-title">
            <header>
              <h2 id="group-chart-title">Trading Accounts by Group</h2>
              <span>{report.groups.length} groups</span>
            </header>
            <div className="trading-analytics-group">
              {loading ? <EmptyReport>Loading group distribution…</EmptyReport>
                : unavailable ? <EmptyReport>Group data is unavailable.</EmptyReport>
                  : empty ? <EmptyReport>No accounts match the selected filters.</EmptyReport>
                    : (
                      <div className="trading-analytics-group-layout">
                        <div className="trading-analytics-group-chart">
                          <DonutChart
                            data={donutData}
                            size={180}
                            strokeWidth={22}
                            animationDuration={0.8}
                            animationDelayPerSegment={0.05}
                            highlightOnHover
                            onSegmentHover={setHoveredGroup}
                            centerContent={
                              <AnimatePresence mode="wait">
                                <motion.div
                                  key={activeGroupSegment ? activeGroupSegment.label : 'total'}
                                  initial={{ opacity: 0, scale: 0.92 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.92 }}
                                  transition={{ duration: 0.15, ease: 'easeOut' }}
                                  className="flex flex-col items-center justify-center text-center px-1 pointer-events-none select-none"
                                >
                                  <span className="text-[10px] text-[var(--text-3)] font-medium truncate max-w-[80px] leading-tight">
                                    {activeGroupSegment ? activeGroupSegment.label : 'accounts'}
                                  </span>
                                  <strong className="text-base font-bold text-[var(--text)] leading-tight my-0.5">
                                    {activeGroupSegment ? countFormatter.format(activeGroupSegment.value) : compactFormatter.format(report.total)}
                                  </strong>
                                  {activeGroupSegment && (
                                    <span className="text-[10px] font-semibold text-[var(--accent)] leading-tight">
                                      {percentage(activeGroupSegment.value, report.total)}
                                    </span>
                                  )}
                                </motion.div>
                              </AnimatePresence>
                            }
                          />
                        </div>
                        <div className="trading-analytics-group-breakdown">
                          {donutData.map((segment) => {
                            const isHovered = activeGroupSegment?.label === segment.label;
                            return (
                              <div
                                key={segment.label}
                                onMouseEnter={() => setHoveredGroup(segment)}
                                onMouseLeave={() => setHoveredGroup(null)}
                                className={`trading-analytics-group-row ${isHovered ? 'is-active' : ''}`}
                              >
                                <div className="trading-analytics-group-row-info">
                                  <span className="trading-analytics-group-dot" style={{ backgroundColor: segment.color }} />
                                  <span className="trading-analytics-group-name" title={segment.label}>{segment.label}</span>
                                </div>
                                <div className="trading-analytics-group-row-stats">
                                  <span className="trading-analytics-group-count">{countFormatter.format(segment.value)}</span>
                                  <span className="trading-analytics-group-pct">{percentage(segment.value, report.total)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
