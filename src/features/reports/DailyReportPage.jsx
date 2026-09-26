import { useState } from 'react';
import { CircleAlert, FileClock, RefreshCw } from 'lucide-react';
import {
  CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import useDailyReport from './useDailyReport';
import './dailyReport.css';

const COLORS = ['#ff914d', '#008ffb', '#00b88a', '#a987ff', '#e9b949', '#e46b95', '#6f98a8'];
const number = (value, digits = 0) => Number.isFinite(value)
  ? value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const clock = (time) => new Date(time).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false });
const compact = (value) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const tooltipStyle = {
  background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: 12,
};

function EmptyChart({ loading, children }) {
  return <div className="daily-report-empty" role="status">
    {loading ? <RefreshCw size={21} className="animate-spin" /> : <CircleAlert size={21} />}
    <strong>{loading ? 'Loading server data…' : 'Data unavailable'}</strong>
    <p>{children}</p>
  </div>;
}

function ReadingStatus({ query, cadence = 30 }) {
  const time = query.data?.timestamp;
  return <p className={`daily-report-status ${query.isError ? 'is-stale' : ''}`} role="status">
    {query.isError
      ? time ? `Refresh failed. Showing the last reading from ${clock(time)} UTC.` : 'Unable to load this report from the server.'
      : time ? `Last reading ${clock(time)} UTC · Refreshes every ${cadence}s` : 'Waiting for the server'}
  </p>;
}

function ObservedRange({ data }) {
  return <p className="daily-report-note">
    {data.length ? `Observed since ${clock(data[0].timestamp)} UTC. ` : ''}
    {data.length === 1 ? 'The first reading is shown; the trend will grow with new readings. ' : ''}
    Earlier intraday history is not supplied by the server.
  </p>;
}

function Metric({ label, value, detail }) {
  return <div className="daily-report-metric">
    <span>{label}</span><strong>{value}</strong><small>{detail}</small>
  </div>;
}

function TrendChart({ data, cash = false }) {
  return <div className="daily-report-chart" role="img"
    aria-label={cash ? 'Observed daily deposit and withdrawal totals over time' : 'Observed real account count over time'}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160} initialDimension={{ width: 320, height: 220 }}>
      <LineChart data={data} margin={{ top: 15, right: 12, bottom: 2, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']}
          tickFormatter={clock} minTickGap={45} axisLine={false} tickLine={false}
          tick={{ fill: 'var(--muted)', fontSize: 10 }} />
        <YAxis allowDecimals={cash} width={55} domain={[0, 'auto']} tickFormatter={compact}
          axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 10 }} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => `${clock(value)} UTC`}
          formatter={(value, name) => [number(value, cash ? 2 : 0), name]} />
        {cash ? <>
          <Line name="Deposits" type="linear" dataKey="deposits" stroke="#008ffb" strokeWidth={2}
            dot={data.length < 3 ? { r: 3 } : false} connectNulls={false} isAnimationActive={false} />
          <Line name="Withdrawals" type="linear" dataKey="withdrawals" stroke="#00b88a" strokeWidth={2}
            dot={data.length < 3 ? { r: 3 } : false} connectNulls={false} isAnimationActive={false} />
        </> : <Line name="Real accounts" type="linear" dataKey="realAccounts" stroke="#008ffb" strokeWidth={2}
          dot={data.length < 3 ? { r: 3 } : false} connectNulls={false} isAnimationActive={false} />}
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

export default function DailyReportPage() {
  const { brokerName, date, accounts, cash, sources, refreshing, refresh } = useDailyReport();
  const [preferredCurrency, setPreferredCurrency] = useState('USD');
  const currencies = cash.data?.rows
    .filter((row) => Number.isFinite(row.deposits) || Number.isFinite(row.withdrawals))
    .map((row) => row.currency) || [];
  const currency = currencies.includes(preferredCurrency) ? preferredCurrency : currencies[0];
  const cashRow = cash.data?.rows.find((row) => row.currency === currency);
  const accountData = accounts.data?.observations || [];
  const hasRealAccounts = accountData.some((row) => Number.isFinite(row.realAccounts));
  const cashData = (cash.data?.observations || []).map((row) => {
    const amounts = row.cash?.find((item) => item.currency === currency);
    return { timestamp: row.timestamp, deposits: amounts?.deposits ?? null, withdrawals: amounts?.withdrawals ?? null };
  });
  const sourceData = sources.data;
  const hasSources = sourceData && !sourceData.unavailableReason && sourceData.items.length > 0;
  const cashUnavailable = cash.error?.code === 'REPORTS_SUMMARY_UNAVAILABLE'
    ? 'Cash-flow reporting is not enabled for this broker.'
    : 'Daily deposits and withdrawals are not available for this date. No estimated amounts are shown.';

  return <main className="daily-report workspace-ui">
    <header className="daily-report-header">
      <div>
        <div className="daily-report-title"><FileClock size={20} /><h1>{brokerName} · Daily Report</h1></div>
        <p>{date} (UTC) · Company performance from server data</p>
      </div>
      <button type="button" className="daily-report-refresh" onClick={refresh} disabled={refreshing}>
        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </header>

    <section className="daily-report-metrics" aria-label="Current company totals">
      <Metric label="Real accounts" value={number(accounts.data?.metrics.realAccounts)}
        detail={accounts.isError && accounts.data ? 'Last successful reading' : 'Current server count'} />
      <Metric label="Demo accounts" value={number(accounts.data?.metrics.demoAccounts)}
        detail={accounts.isError && accounts.data ? 'Last successful reading' : 'Current server count'} />
      <Metric label={`Deposits${currency ? ` · ${currency}` : ''}`} value={number(cashRow?.deposits, 2)}
        detail={cash.isError && cash.data ? 'Last successful reading' : 'Today’s reported total'} />
      <Metric label={`Withdrawals${currency ? ` · ${currency}` : ''}`} value={number(cashRow?.withdrawals, 2)}
        detail={cash.isError && cash.data ? 'Last successful reading' : 'Today’s reported total'} />
      <Metric label={`Net cash flow${currency ? ` · ${currency}` : ''}`} value={number(cashRow?.netFlow, 2)}
        detail={cash.isError && cash.data ? 'Last successful reading' : 'Deposits minus withdrawals'} />
    </section>

    <div className="daily-report-grid">
      <section className="daily-report-panel" aria-labelledby="report-accounts-heading">
        <h2 id="report-accounts-heading">Real Accounts</h2>
        <p className="daily-report-description">Total real accounts at each observed reading</p>
        {hasRealAccounts ? <TrendChart data={accountData} /> : <EmptyChart loading={accounts.isPending}>
          The server must provide a real-account count to draw this chart.
        </EmptyChart>}
        {hasRealAccounts && <ObservedRange data={accountData} />}
        <ReadingStatus query={accounts} />
      </section>

      <section className="daily-report-panel" aria-labelledby="report-cash-heading">
        <div className="daily-report-panel-heading">
          <h2 id="report-cash-heading">Deposits &amp; Withdrawals{currency ? ` · ${currency}` : ''}</h2>
          {currencies.length > 1 && <select aria-label="Report currency" value={currency}
            onChange={(event) => setPreferredCurrency(event.target.value)}>
            {currencies.map((value) => <option key={value}>{value}</option>)}
          </select>}
        </div>
        <p className="daily-report-description">Reported daily totals · Account types as supplied by the server</p>
        {cashData.length ? <>
          <TrendChart data={cashData} cash />
          <div className="daily-report-legend"><span><i style={{ background: '#008ffb' }} />Deposits</span>
            <span><i style={{ background: '#00b88a' }} />Withdrawals</span></div>
          <ObservedRange data={cashData} />
        </> : <EmptyChart loading={cash.isPending}>{cashUnavailable}</EmptyChart>}
        <ReadingStatus query={cash} />
      </section>

      <section className="daily-report-panel" aria-labelledby="report-sources-heading">
        <h2 id="report-sources-heading">All Accounts by Source</h2>
        <p className="daily-report-description">Acquisition source · All accounts visible to this manager</p>
        {hasSources ? <>
          <div className="daily-report-chart daily-report-donut" role="img" aria-label={`Account sources for ${number(sourceData.total)} accounts`}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160} initialDimension={{ width: 320, height: 220 }}>
              <PieChart>
                <Pie data={sourceData.items} dataKey="value" nameKey="name" innerRadius="57%" outerRadius="80%"
                  stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                  {sourceData.items.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [number(value), name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="daily-report-donut-total"><strong>{number(sourceData.total)}</strong><span>Accounts</span></div>
          </div>
          <ul className="daily-report-source-list" aria-label="Account source counts">
            {sourceData.items.map((item, index) => <li key={item.name}>
              <i style={{ background: COLORS[index % COLORS.length] }} /><span>{item.name}</span>
              <strong>{number(item.value)}</strong><small>{number(item.value / sourceData.total * 100, 1)}%</small>
            </li>)}
          </ul>
          {sourceData.coverageNote && <p className="daily-report-note">{sourceData.coverageNote}</p>}
        </> : sourceData?.total === 0 && !sourceData.unavailableReason ? <div className="daily-report-empty" role="status">
          <strong>No accounts yet</strong><p>The server returned an empty account list.</p>
        </div> : <EmptyChart loading={sources.isPending}>
          {sourceData?.unavailableReason || 'A complete account list with source information is required. An incomplete list is never shown as the total.'}
        </EmptyChart>}
        <ReadingStatus query={sources} cadence={60} />
      </section>
    </div>
    <footer className="daily-report-footer">
      Charts use successful server readings collected in this session. A browser or sign-in session refresh starts a new observation history.
      Missing values stay unavailable. Currency totals are displayed separately without conversion.
    </footer>
  </main>;
}
