import { createElement, useState } from 'react';
import {
  BarChart3, CalendarDays, ChevronRight, CircleGauge, DollarSign,
  MoreVertical, Server, ShieldCheck, TrendingDown,
  TrendingUp, UserRoundCheck, UsersRound, WalletCards,
} from 'lucide-react';
import {
  Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DASHBOARD_PLACEHOLDER_MODE } from './dashboardState';
import useDashboardMetrics, { useDashboardAccountLimits } from './useDashboardMetrics';
import useDashboardActivity from './useDashboardActivity';
import useDashboardOperationalMetrics from './useDashboardOperationalMetrics';
import useManagerConnection from './useManagerConnection';
import { ACTIVITY_RANGES } from './dashboardActivityData';
import { OPERATIONAL_DASHBOARD_PLACEHOLDERS as preview } from './operationalDashboardAdapter';
import RegionalActivityMap from './RegionalActivityMap';
import AllSymbolsDialog from './AllSymbolsDialog';
import { useDockingContext } from '../../components/docking/DockingContext';
import usePermissions from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';

const integer = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const money = (value, compact = false, currency = 'USD') => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: currency || 'USD', maximumFractionDigits: compact ? 1 : 0,
  notation: compact ? 'compact' : 'standard',
}).format(value);
const moneyExact = (value, currency) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
};
const lots = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
const shortNumber = (value) => new Intl.NumberFormat('en-US', {
  notation: 'compact', maximumFractionDigits: 1,
}).format(value);
const volumeAxisNumber = (value) => Math.abs(value) < 1 ? lots(value) : shortNumber(value);
const intervalLabels = { '1H': '5-minute', '6H': '30-minute', '24H': '2-hour', '7D': '12-hour', '30D': 'Daily' };
const chartTime = (value, range) => new Intl.DateTimeFormat('en-US',
  range === '30D'
    ? { month: 'short', day: 'numeric' }
    : range === '7D'
      ? { weekday: 'short', hour: '2-digit', hour12: false }
    : { hour: '2-digit', minute: '2-digit', hour12: false }
).format(new Date(value));
const chartTooltipTime = (value, range) => new Intl.DateTimeFormat('en-US',
  range === '30D' ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }
).format(new Date(Number(value)));

const MetricCard = ({ icon: Icon, label, value, change, detail, tone = 'success', placeholder, onClick }) => (
  <article className="cc-metric-card" role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={onClick ? `Show ${label.toLowerCase()}` : undefined} onClick={onClick} onKeyDown={onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } } : undefined} data-placeholder={placeholder || undefined} title={placeholder ? 'This aggregate is supplied by the isolated UI adapter until its API is connected.' : undefined}>
    <span className={`cc-metric-icon is-${tone}`}>{createElement(Icon, { size: 17, strokeWidth: 1.7 })}</span>
    <div className="cc-metric-main">
      <small>{label}</small>
      <strong className="tabular">{value}</strong>
      <span className={`is-${tone}`}>{change ? (tone === 'danger' ? <TrendingDown size={11} /> : <TrendingUp size={11} />) : null}{change || detail}</span>
    </div>
  </article>
);

const ChartTooltip = ({ active, payload, label, range }) => {
  if (!active || !payload?.length) return null;
  const values = Object.fromEntries(payload.map((item) => [item.dataKey, item.value]));
  const point = payload.find((item) => item.payload)?.payload;
  const volumeLabel = point?.volumePartial && values.volume != null ? 'Volume (partial)' : 'Volume';
  const equityLabel = point?.equityAsOf
    ? `Equity · ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(point.equityAsOf))}`
    : 'Equity';
  return (
    <div className="cc-chart-tooltip">
      <strong>{chartTooltipTime(point?.bucketStart ?? label, range)}</strong>
      <div className="cc-chart-tooltip-row"><i className="cc-chart-tooltip-swatch is-volume" /><span>{volumeLabel}</span><b>{values.volume == null ? 'Unavailable' : `${lots(values.volume)} lots`}</b></div>
      <div className="cc-chart-tooltip-row"><i className="cc-chart-tooltip-swatch is-equity" /><span>{equityLabel}</span><b>{values.equity == null ? 'No reading' : money(values.equity)}</b></div>
    </div>
  );
};

const PanelTitle = ({ children, meta }) => (
  <div className="cc-panel-title"><strong>{children}</strong>{meta && <span>{meta}</span>}</div>
);

export default function Dashboard() {
  const [showAllSymbols, setShowAllSymbols] = useState(false);
  const { updatePanel } = useDockingContext();
  const showAccounts = (accountType) => {
    updatePanel('owner_console', { visible: false, maximized: false });
    updatePanel('accounts', { visible: true, minimized: false, maximized: false, position: 'right', accountType, title: accountType === 'demo' ? 'Demo Accounts' : 'Real Accounts' });
  };
  const [range, setRange] = useState('24H');
  const { resolved, hasPermission } = usePermissions();
  const canViewPositions = resolved && hasPermission(PERMISSIONS.VIEW_POSITIONS);
  const { data, isLoading } = useDashboardMetrics();
  const { data: limitData } = useDashboardAccountLimits();
  const activity = useDashboardActivity(range, data);
  const operational = useDashboardOperationalMetrics();
  const connection = useManagerConnection();
  const metrics = data?.metrics || {};
  const limits = limitData?.metrics || {};
  const realAccounts = limits.realAccounts ?? metrics.realAccounts;
  const demoAccounts = limits.demoAccounts ?? metrics.demoAccounts;
  const margin = operational.metrics;
  const hasMarginAmount = margin.usedMarginTotal !== null && margin.marginCurrency;
  const marginValue = hasMarginAmount
    ? moneyExact(margin.usedMarginTotal, margin.marginCurrency)
    : margin.accountsWithMargin !== null
      ? integer(margin.accountsWithMargin)
      : operational.loading ? 'Loading…' : '—';
  const marginDetail = hasMarginAmount
    ? `${integer(margin.accountsWithMargin)} real accounts using margin`
    : margin.accountsWithMargin !== null
      ? margin.accountsWithMargin === 0
        ? 'No real accounts using margin'
        : 'Real accounts using margin · currencies differ or are unavailable'
      : operational.restricted ? 'Account access required'
        : operational.loading ? 'Loading account margin data' : 'Complete margin data unavailable';
  const alertValue = margin.marginAlertCount === null
    ? operational.loading ? 'Loading…' : '—'
    : integer(margin.marginAlertCount);
  const alertDetail = margin.marginAlertCount === null
    ? operational.restricted ? 'Account access required'
      : operational.loading ? 'Loading margin alerts' : 'Margin levels or thresholds unavailable'
    : margin.marginAlertCount === 0
      ? 'No accounts at margin-call level'
      : `${integer(margin.stopOutCount)} stop-out · ${integer(margin.marginCallCount)} margin call`;
  const connectionValue = connection.state === 'connected' ? 'Connected'
    : connection.state === 'disconnected' ? 'Disconnected'
      : connection.isLoading ? 'Checking…' : '—';
  const equityValues = activity.series.map((point) => point.equity).filter((value) => value !== null);
  const equityMin = equityValues.length ? Math.min(...equityValues) : 0;
  const equityMax = equityValues.length ? Math.max(...equityValues) : 0;
  const equityPadding = Math.max(1, (equityMax - equityMin) * 0.12, Math.abs(equityMax) * 0.002);
  const equityDomain = [equityMin - equityPadding, equityMax + equityPadding];
  const lastPoint = activity.series.at(-1);
  const volumeEnd = activity.volumeAsOf;
  const intervalMs = ACTIVITY_RANGES[range].bucketMs;
  const chartData = lastPoint && lastPoint.volume !== null && volumeEnd > lastPoint.timestamp &&
    volumeEnd < lastPoint.timestamp + intervalMs
    ? [...activity.series, { ...lastPoint, bucketStart: lastPoint.timestamp, timestamp: volumeEnd, equity: null, equityAsOf: null, volumePartial: true }]
    : activity.series;
  const hasChartData = activity.hasEquity || activity.hasTradeActivity;
  const snapshotTime = Number(activity.asOf) > 0 && Number.isFinite(Number(activity.asOf))
    ? new Date(Number(activity.asOf)).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const chartState = activity.restricted ? 'Access limited'
    : activity.refreshIncomplete ? 'Cached snapshot · refresh incomplete'
      : activity.cached && activity.refreshing ? 'Cached snapshot · updating'
        : activity.cached && activity.error ? 'Cached snapshot · refresh failed'
        : activity.cached ? 'Cached snapshot'
          : activity.refreshing || activity.isLoading || !resolved ? 'Loading broker data'
            : activity.error ? 'Data unavailable'
              : activity.partial ? 'Trade history incomplete' : 'Live broker data';
  const chartStateTone = activity.refreshIncomplete || activity.partial || activity.error ? 'is-warning'
    : activity.cached ? 'is-cached'
      : activity.refreshing || activity.isLoading || !resolved ? 'is-loading' : 'is-live';
  const emptyChartTitle = activity.restricted ? 'Trade activity unavailable for this role'
    : !resolved ? 'Checking account access…'
      : activity.isLoading || activity.refreshing ? 'Loading trading activity…'
        : activity.error && !activity.cached ? 'Trade history unavailable'
          : activity.partial && !activity.cached ? 'Complete trade history unavailable'
            : 'No activity recorded in this range';
  const emptyChartDetail = activity.restricted ? 'Account viewing access is required for trade volume.'
    : activity.error && !activity.cached ? 'Account equity appears when a fresh broker reading arrives.'
      : 'The timeline is ready. Actual broker values appear as they become available.';
  const placeholderTicks = activity.series.length ? [
    activity.series[0],
    activity.series[Math.floor((activity.series.length - 1) / 2)],
    activity.series.at(-1),
  ] : [];
  const snapshotNote = activity.refreshIncomplete
    ? `Showing the last complete cached snapshot${snapshotTime ? ` from ${snapshotTime}` : ''}; the latest refresh was incomplete.`
    : activity.cached && activity.error
      ? `Showing cached broker data${snapshotTime ? ` from ${snapshotTime}` : ''}; the latest refresh failed.`
    : activity.cached
      ? `Showing cached broker data${snapshotTime ? ` from ${snapshotTime}` : ''}${activity.refreshing ? ' while refreshing.' : '.'}`
      : activity.refreshing && hasChartData ? 'Refreshing broker data.' : null;
  const equityNote = activity.firstEquityAt ? equityValues.length < 2
    ? `One equity reading as of ${new Date(activity.firstEquityAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}; the area trend forms as more readings arrive.`
    : `Equity readings recorded in this session since ${new Date(activity.firstEquityAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`
    : 'Equity history begins when the first live broker reading arrives.';

  return (
    <main className="cc-dashboard" data-dashboard-mode={DASHBOARD_PLACEHOLDER_MODE ? 'placeholder' : 'live'}>
      <header className="cc-dashboard-header">
        <div><h1>Dashboard</h1><p>Live brokerage operations, exposure, account activity and infrastructure health.</p></div>
        <div className="cc-dashboard-controls">
          <span className="cc-dashboard-period"><CalendarDays size={13} />Latest snapshot</span>
          <button type="button" aria-label="More dashboard actions" title="More dashboard actions"><MoreVertical size={15} /></button>
        </div>
      </header>

      <section className="cc-metric-grid" aria-label="Brokerage key metrics">
        <MetricCard icon={UserRoundCheck} label="REAL ACCOUNTS" onClick={() => showAccounts('real')} value={realAccounts == null ? (isLoading ? 'Loading…' : '—') : integer(realAccounts)} change="+12 today" />
        <MetricCard icon={UsersRound} label="DEMO ACCOUNTS" onClick={() => showAccounts('demo')} value={demoAccounts == null ? (isLoading ? 'Loading…' : '—') : integer(demoAccounts)} change="+86 today" tone="neutral" />
        <MetricCard icon={DollarSign} label="NET EQUITY" value={metrics.equity == null ? (isLoading ? 'Loading…' : '—') : money(metrics.equity, true)} detail="Real account total" />
        {canViewPositions && <MetricCard icon={BarChart3} label="OPEN POSITIONS" value={metrics.openPositions == null ? (isLoading ? 'Loading…' : '—') : integer(metrics.openPositions)} detail="Currently open" tone="neutral" />}
        <MetricCard icon={WalletCards} label="DEPOSIT FLOW (REPORT DAY)" value={metrics.deposits24h == null ? (isLoading ? 'Loading…' : '—') : money(metrics.deposits24h, false, metrics.reportCurrency)} detail={metrics.deposits24h == null ? (isLoading ? 'Loading latest report' : 'Daily report unavailable') : metrics.reportDate || 'Latest report'} tone={metrics.deposits24h == null ? 'neutral' : 'success'} />
        <MetricCard icon={ShieldCheck} label={hasMarginAmount ? 'USED MARGIN' : 'ACCOUNTS USING MARGIN'} value={marginValue} detail={marginDetail} tone={margin.marginAlertCount > 0 ? 'danger' : 'neutral'} />
        <MetricCard icon={Server} label="MANAGER CONNECTION" value={connectionValue} detail={connection.isLoading ? 'Checking current manager session' : connection.state === 'unavailable' ? 'Connection status unavailable' : 'Current manager session'} tone={connection.state === 'connected' ? 'success' : connection.state === 'disconnected' ? 'danger' : 'neutral'} />
        <MetricCard icon={CircleGauge} label="MARGIN ALERTS" value={alertValue} detail={alertDetail} tone={margin.marginAlertCount === null ? 'neutral' : margin.marginAlertCount > 0 ? 'danger' : 'success'} />
      </section>

      <section className="cc-panel cc-activity-panel">
        <div className="cc-chart-toolbar">
          <div><PanelTitle>Trading Activity & Account Equity</PanelTitle><div className="cc-chart-legend"><span><i className="is-volume" />Trading Volume (Lots)</span><span><i className="is-equity" />Account Equity (USD)</span></div></div>
          <div className="cc-chart-actions">
            <span className={`cc-chart-data-state ${chartStateTone}`} role="status" aria-live="polite">{chartState}</span>
            <div>{['1H','6H','24H','7D','30D'].map((item) => <button key={item} type="button" aria-pressed={range === item} title={`${intervalLabels[item]} intervals`} className={range === item ? 'is-active' : ''} onClick={() => setRange(item)}>{item}</button>)}</div>
            <span className="cc-chart-currency" title="Reporting currency">USD</span>
          </div>
        </div>
        <div className="cc-chart-area">
          {hasChartData ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160} initialDimension={{ width: 320, height: 192 }} debounce={0}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="cc-volume-area-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--cc-volume)" stopOpacity={0.38} />
                    <stop offset="100%" stopColor="var(--cc-volume)" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="cc-equity-area-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--cc-equity)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--cc-equity)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--cc-grid)" vertical={false} />
                <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(value) => chartTime(value, range)} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} minTickGap={28} />
                <YAxis yAxisId="volume" hide={!activity.hasVolume} domain={[0, 'auto']} tickFormatter={volumeAxisNumber} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <YAxis yAxisId="equity" hide={!activity.hasEquity} orientation="right" domain={equityDomain} tickFormatter={shortNumber} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip range={range} />} cursor={{ stroke: 'var(--border-3)', strokeDasharray: '4 4' }} />
                <Area yAxisId="volume" type="stepAfter" dataKey="volume" baseValue={0} connectNulls={false} stroke="var(--cc-volume)" strokeWidth={1.8} fill="url(#cc-volume-area-gradient)" fillOpacity={1} dot={false} activeDot={{ r: 4, fill: 'var(--cc-volume)', strokeWidth: 0 }} isAnimationActive={false} />
                <Area yAxisId="equity" type="linear" dataKey="equity" baseValue="dataMin" connectNulls={false} stroke="var(--cc-equity)" strokeWidth={2.2} fill="url(#cc-equity-area-gradient)" fillOpacity={1} dot={equityValues.length <= 3 ? { r: 3, fill: 'var(--cc-equity)', strokeWidth: 0 } : false} activeDot={{ r: 4, fill: 'var(--cc-equity)', strokeWidth: 0 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="cc-chart-placeholder">
              <div className="cc-chart-placeholder-grid" aria-hidden="true" />
              <div className={`cc-chart-status ${activity.error && !activity.cached ? 'is-error' : ''}`} role="status" aria-live="polite">
                <strong>{emptyChartTitle}</strong>
                <span>{emptyChartDetail}</span>
              </div>
              <div className="cc-chart-placeholder-ticks" aria-hidden="true">
                {placeholderTicks.map((point) => <span key={point.timestamp}>{chartTime(point.timestamp, range)}</span>)}
              </div>
            </div>
          )}
        </div>
        <div className="cc-chart-footnote">
          <span className="cc-chart-range-label">{intervalLabels[range]} intervals</span>{' · '}
          {activity.restricted ? 'Trade volume requires account viewing access.' :
            activity.partial && !activity.cached ? 'Complete deal history is unavailable for this range; volume is hidden.' :
              activity.error && !activity.cached ? 'Trade volume could not be loaded; account equity is still recorded from live broker readings.' :
                [snapshotNote, equityNote].filter(Boolean).join(' ')}
        </div>
      </section>

      <section className="cc-lower-grid">
        <article className="cc-panel cc-data-panel">
          <PanelTitle meta="UI adapter">Top Traded Symbols</PanelTitle>
          <table><thead><tr><th>Symbol</th><th>Volume (Lots)</th><th>Trades</th><th>Contribution</th></tr></thead><tbody>{preview.symbols.map((row) => <tr key={row[0]}>{row.map((cell, i) => <td key={cell} className={i ? 'tabular' : ''}>{cell}</td>)}</tr>)}</tbody></table>
          <button type="button" className="cc-panel-link" onClick={() => setShowAllSymbols(true)}>View All Symbols <ChevronRight size={12} /></button>
        </article>

        <article className="cc-panel cc-region-panel">
          <PanelTitle meta="Account share · Volume share">Regional Activity</PanelTitle>
          <RegionalActivityMap />
          <div className="cc-region-columns"><span>Region</span><b>Accounts</b><em>Volume</em></div>
          <div className="cc-region-list">{preview.regions.map(([name, accounts, volume]) => <div key={name}><span><i />{name}</span><b>{accounts}</b><em>{volume}</em></div>)}</div>
        </article>

        <article className="cc-panel cc-data-panel cc-approvals">
          <PanelTitle meta={`${preview.approvalCount} pending`}>Approval Queue</PanelTitle>
          <table><thead><tr><th>Type</th><th>Details</th><th>Time</th><th>Status</th></tr></thead><tbody>{preview.approvals.map((row) => <tr key={`${row[0]}-${row[2]}`}>{row.map((cell, i) => <td key={cell} className={i === 3 ? `is-status is-${cell.toLowerCase()}` : ''}>{cell}</td>)}</tr>)}</tbody></table>
        </article>
      </section>
      {showAllSymbols && <AllSymbolsDialog onClose={() => setShowAllSymbols(false)} />}
    </main>
  );
}
