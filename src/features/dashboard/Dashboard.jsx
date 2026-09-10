import { createElement, useState } from 'react';
import {
  Activity, BarChart3, CalendarDays, ChevronRight, CircleGauge, DollarSign,
  MoreVertical, Server, ShieldCheck, TrendingDown,
  TrendingUp, UserRoundCheck, UsersRound, WalletCards,
} from 'lucide-react';
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { DASHBOARD_PLACEHOLDER_MODE } from './dashboardState';
import useDashboardMetrics, { useDashboardAccountLimits } from './useDashboardMetrics';
import { OPERATIONAL_DASHBOARD_PLACEHOLDERS as preview } from './operationalDashboardAdapter';
import RegionalActivityMap from './RegionalActivityMap';
import { useDockingContext } from '../../components/docking/DockingContext';

const integer = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const money = (value, compact = false, currency = 'USD') => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: currency || 'USD', maximumFractionDigits: compact ? 1 : 0,
  notation: compact ? 'compact' : 'standard',
}).format(value);

const Sparkline = ({ points, tone = 'success' }) => {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const path = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 92 + 4;
    const y = 28 - ((point - min) / (max - min || 1)) * 22;
    return `${index ? 'L' : 'M'} ${x} ${y}`;
  }).join(' ');
  return <svg className={`cc-sparkline is-${tone}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path d={path} /></svg>;
};

const MetricCard = ({ icon: Icon, label, value, change, detail, tone = 'success', points, placeholder, onClick }) => (
  <article className="cc-metric-card" role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={onClick ? `Show ${label.toLowerCase()}` : undefined} onClick={onClick} onKeyDown={onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } } : undefined} data-placeholder={placeholder || undefined} title={placeholder ? 'This aggregate is supplied by the isolated UI adapter until its API is connected.' : undefined}>
    <span className={`cc-metric-icon is-${tone}`}>{createElement(Icon, { size: 17, strokeWidth: 1.7 })}</span>
    <div className="cc-metric-main">
      <small>{label}</small>
      <strong className="tabular">{value}</strong>
      <span className={`is-${tone}`}>{tone === 'danger' ? <TrendingDown size={11} /> : <TrendingUp size={11} />}{change || detail}</span>
    </div>
    {points && <Sparkline points={points} tone={tone} />}
  </article>
);

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const values = Object.fromEntries(payload.map((item) => [item.dataKey, item.value]));
  return (
    <div className="cc-chart-tooltip">
      <strong>{label}</strong><span>Volume: {integer(values.volume || 0)} lots</span><span>Equity: {money(values.equity || 0)}</span>
    </div>
  );
};

const PanelTitle = ({ children, meta }) => (
  <div className="cc-panel-title"><strong>{children}</strong>{meta && <span>{meta}</span>}</div>
);

export default function Dashboard() {
  const { updatePanel } = useDockingContext();
  const showAccounts = (accountType) => {
    updatePanel('owner_console', { visible: false, maximized: false });
    updatePanel('accounts', { visible: true, minimized: false, maximized: false, position: 'right', accountType, title: accountType === 'demo' ? 'Demo Accounts' : 'Real Accounts' });
  };
  const [range, setRange] = useState('24H');
  const { data, isLoading } = useDashboardMetrics();
  const { data: limitData } = useDashboardAccountLimits();
  const metrics = data?.metrics || {};
  const limits = limitData?.metrics || {};
  const realAccounts = limits.realAccounts ?? metrics.realAccounts;
  const demoAccounts = limits.demoAccounts ?? metrics.demoAccounts;

  return (
    <main className="cc-dashboard" data-dashboard-mode={DASHBOARD_PLACEHOLDER_MODE ? 'placeholder' : 'live'}>
      <header className="cc-dashboard-header">
        <div><h1>Dashboard</h1><p>Live brokerage operations, exposure, account activity and infrastructure health.</p></div>
        <div className="cc-dashboard-controls">
          <button type="button"><CalendarDays size={13} />Last 24 Hours</button>
          <button type="button" aria-label="More dashboard actions" title="More dashboard actions"><MoreVertical size={15} /></button>
        </div>
      </header>

      {data?.errors?.length > 0 && <div className="cc-data-notice"><Activity size={12} />Some live aggregates are unavailable; cached values and clearly marked UI adapters remain visible.</div>}

      <section className="cc-metric-grid" aria-label="Brokerage key metrics">
        <MetricCard icon={UserRoundCheck} label="REAL ACCOUNTS" onClick={() => showAccounts('real')} value={realAccounts == null ? (isLoading ? 'Loading…' : '—') : integer(realAccounts)} change="+12 today" points={[3,5,4,8,6,11,9,15]} />
        <MetricCard icon={UsersRound} label="DEMO ACCOUNTS" onClick={() => showAccounts('demo')} value={demoAccounts == null ? (isLoading ? 'Loading…' : '—') : integer(demoAccounts)} change="+86 today" points={[8,6,9,5,11,8,14,12]} tone="neutral" />
        <MetricCard icon={DollarSign} label="NET EQUITY" value={metrics.equity == null ? '—' : money(metrics.equity, true)} change="+3.5%" points={[2,5,4,7,6,9,8,13]} />
        <MetricCard icon={BarChart3} label="OPEN POSITIONS" value={metrics.openPositions == null ? '—' : integer(metrics.openPositions)} change="−6.2%" points={[12,9,11,7,8,5,6,3]} tone="danger" />
        <MetricCard icon={WalletCards} label="DEPOSIT FLOW (REPORT DAY)" value={metrics.deposits24h == null ? '—' : money(metrics.deposits24h, false, metrics.reportCurrency)} detail={metrics.reportDate || 'Latest report'} points={[4,7,5,11,8,14,10,16]} placeholder={metrics.deposits24h == null} />
        <MetricCard icon={ShieldCheck} label="MARGIN EXPOSURE" value={`${preview.marginExposure}%`} detail="Used $1.2M / $1.8M" points={[10,8,12,5,9,4,7,3]} tone="danger" placeholder />
        <MetricCard icon={Server} label="ACTIVE SERVERS" value={`${preview.activeServers} / ${preview.totalServers}`} detail="All systems operational" points={[3,3,4,4,4,5,5,5]} placeholder />
        <MetricCard icon={CircleGauge} label="RISK SCORE" value={`${preview.riskScore} / 100`} detail="Low Risk" points={[2,3,3,4,5,4,6,7]} placeholder />
      </section>

      <section className="cc-panel cc-activity-panel">
        <div className="cc-chart-toolbar">
          <div><PanelTitle meta="Preview trend">Trading Activity & Account Equity</PanelTitle><div className="cc-chart-legend"><span><i className="is-volume" />Trading Volume (Lots)</span><span><i className="is-equity" />Account Equity (USD)</span></div></div>
          <div className="cc-chart-actions">
            <div>{['1H','6H','24H','7D','30D'].map((item) => <button key={item} type="button" className={range === item ? 'is-active' : ''} onClick={() => setRange(item)}>{item}</button>)}</div>
            <button type="button">USD⌄</button>
          </div>
        </div>
        <div className="cc-chart-area">
          <ResponsiveContainer width="100%" height="100%" debounce={0}>
            <ComposedChart data={preview.activity} margin={{ top: 8, right: 10, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--cc-grid)" vertical={false} />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} interval={1} />
              <YAxis yAxisId="volume" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
              <YAxis yAxisId="equity" orientation="right" domain={['dataMin - 50000', 'dataMax + 50000']} axisLine={false} tickLine={false} tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`} tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
              <Bar yAxisId="volume" dataKey="volume" fill="var(--cc-bar)" barSize={8} radius={[1,1,0,0]} isAnimationActive={false} />
              <Line yAxisId="equity" type="monotone" dataKey="equity" stroke="var(--success)" strokeWidth={1.8} dot={false} isAnimationActive={false} activeDot={{ r: 3, fill: 'var(--success)', strokeWidth: 0 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="cc-lower-grid">
        <article className="cc-panel cc-data-panel">
          <PanelTitle meta="UI adapter">Top Traded Symbols</PanelTitle>
          <table><thead><tr><th>Symbol</th><th>Volume (Lots)</th><th>Trades</th><th>Contribution</th></tr></thead><tbody>{preview.symbols.map((row) => <tr key={row[0]}>{row.map((cell, i) => <td key={cell} className={i ? 'tabular' : ''}>{cell}</td>)}</tr>)}</tbody></table>
          <button type="button" className="cc-panel-link">View All Symbols <ChevronRight size={12} /></button>
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
    </main>
  );
}
