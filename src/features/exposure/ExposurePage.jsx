import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Download, RefreshCw, Search } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import authService from '../../services/authService';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';
import { fetchExposure } from './exposureApi';
import { exposureCsv, exposureTotals } from './exposureModel';
import './exposure.css';

const EMPTY = [];
const COLORS = ['#5c8dff', '#8b7cf8', '#3fc7b5', '#f0b45c', '#cf7bc8', '#67bddb'];
const fmt = (value, digits = 2) => value === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
const money = (value) => value === null ? '—' : `${value < 0 ? '−' : ''}$${fmt(Math.abs(value))}`;

export default function ExposurePage({ compact = false, needle = '', isAuthenticated } = {}) {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [chartSide, setChartSide] = useState('long');
  const [auto, setAuto] = useState(true);
  const [sort, setSort] = useState({ key: 'netUsd', descending: true });
  const claims = authService.getSessionClaims();
  const enabled = isAuthenticated ?? authService.getSessionStatus().authenticated;
  const scope = buildPermissionSessionFingerprint({ token: authService.getSessionScopeKey(), login: claims.login, brokerId: claims.brokerId });
  const query = useQuery({ queryKey: ['exposure', scope], queryFn: fetchExposure, enabled,
    staleTime: 10_000, refetchInterval: auto ? 15_000 : false, refetchIntervalInBackground: false, retry: false });
  const rows = query.data?.rows ?? EMPTY;
  const filtered = useMemo(() => rows.filter((r) => r.asset.toLowerCase().includes((needle || search).trim().toLowerCase()) &&
    (direction === 'all' || (direction === 'long' ? r.netUsd > 0 : r.netUsd !== null && r.netUsd < 0)))
    .sort((a, b) => {
      if (a[sort.key] === null) return b[sort.key] === null ? 0 : 1;
      if (b[sort.key] === null) return -1;
      const result = sort.key === 'asset' ? a.asset.localeCompare(b.asset) : a[sort.key] - b[sort.key];
      return sort.descending ? -result : result;
    }), [rows, needle, search, direction, sort]);
  const totals = exposureTotals(filtered);
  const chartRows = filtered.filter((r) => chartSide === 'long' ? r.netUsd > 0 : r.netUsd < 0)
    .map((r) => ({ ...r, value: Math.abs(r.netUsd) })).sort((a, b) => b.value - a.value);
  const chartTotal = chartRows.reduce((sum, r) => sum + r.value, 0);
  const max = Math.max(1, ...filtered.map((r) => Math.abs(r.netUsd ?? 0)));
  const incomplete = totals.missing > 0 || query.data?.partial;
  const hasData = Boolean(query.data);
  const exportRows = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF', exposureCsv(filtered)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'exposure.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const columns = [['asset', 'Asset / symbol'], ['clients', 'Clients'], ['coverage', 'Coverage'], ['net', 'Net total'], ['rate', 'USD rate'], ['netUsd', 'Net total (USD)'], ['positiveUsd', 'Positive (USD)']];
  return <section className={`exposure-page ${compact ? 'exposure-compact' : ''}`} aria-label="Exposure dashboard">
    <header className="exposure-header">
      <div><span className="exposure-eyebrow"><Activity size={13} /> RISK OVERVIEW</span><h1>Exposure</h1><p>Client positions, hedge coverage and net asset exposure.</p></div>
      <div className="exposure-actions"><span className="exposure-status">{query.isError ? 'Refresh failed' : query.isFetching ? 'Updating…' : hasData ? 'Snapshot loaded' : 'Awaiting data'}</span>
        <button onClick={() => query.refetch()} disabled={!enabled || query.isFetching} aria-label="Refresh exposure"><RefreshCw size={14} /> Refresh</button>
        <button onClick={exportRows} disabled={!filtered.length}><Download size={14} /> Export CSV</button></div>
    </header>
    {!enabled && <div className="exposure-notice" role="status">Sign in to view exposure.</div>}
    {query.isError && <div className="exposure-notice" role="alert">{hasData ? 'Showing the last successful snapshot. ' : ''}Unable to refresh exposure. {query.error?.status === 403 ? 'Your manager account does not have access.' : query.error?.status === 404 ? 'The exposure endpoint is not available on this server.' : query.error?.message}</div>}
    {hasData && incomplete && <div className="exposure-notice" role="status">Incomplete valuation · {totals.missing} visible rows have no USD value. Totals and charts include available values only.{query.data.partial ? ' The server returned an incomplete snapshot.' : ''}</div>}
    <div className="exposure-metrics">
      {[['Net exposure', totals.net, 'Signed total in USD'], ['Net longs', totals.long, 'Positive asset exposure'], ['Net shorts', totals.short, 'Negative asset exposure']].map(([label, value, hint]) => <article key={label}><span>{label}{incomplete ? ' · partial' : ''}</span><strong className={value < 0 ? 'exposure-negative' : ''}>{hasData && (filtered.length === 0 || totals.missing < filtered.length) ? money(value) : '—'}</strong><small>{hint}</small></article>)}
      <article><span>Assets / symbols</span><strong>{hasData ? filtered.length : '—'}</strong><small>{hasData ? `${rows.length} in current snapshot` : 'Waiting for snapshot'}</small></article>
    </div>
    <div className="exposure-toolbar"><label className="exposure-search"><Search size={15} /><input aria-label="Search exposure" placeholder="Search asset or symbol…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <select aria-label="Exposure direction" value={direction} onChange={(e) => setDirection(e.target.value)}><option value="all">All directions</option><option value="long">Net long (USD)</option><option value="short">Net short (USD)</option></select>
      <label className="exposure-auto"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Refresh every 15s</label>
    </div>
    <div className="exposure-body"><div className="exposure-table-scroll"><table aria-label="Asset exposure"><thead><tr>{columns.map(([key, label]) => <th key={key} aria-sort={sort.key === key ? sort.descending ? 'descending' : 'ascending' : 'none'}><button onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : true })}>{label} {sort.key === key ? sort.descending ? '↓' : '↑' : ''}</button></th>)}<th>Net USD distribution</th></tr></thead>
      <tbody>{filtered.map((r) => <tr key={r.asset}><td><b>{r.asset}</b><small>{r.unit || (r.netLots !== null ? `Net lots: ${fmt(r.netLots, 4)}` : 'Unit not supplied')}</small></td>{['clients', 'coverage', 'net', 'rate', 'netUsd', 'positiveUsd'].map((key) => <td key={key} title={r[key] === null ? 'Not supplied by the exposure API' : undefined} className={r[key] < 0 ? 'exposure-negative' : ''}>{fmt(r[key], key === 'rate' ? 6 : 2)}</td>)}<td><div className="exposure-bar" title={money(r.netUsd)}><i /><span style={{ left: r.netUsd < 0 ? `${50 - Math.abs(r.netUsd) / max * 50}%` : '50%', width: `${Math.abs(r.netUsd ?? 0) / max * 50}%`, background: r.netUsd < 0 ? 'var(--danger)' : 'var(--accent)' }} /></div></td></tr>)}
      {!filtered.length && <tr><td colSpan={8} className="exposure-empty">{query.isLoading ? 'Loading exposure snapshot…' : !enabled ? 'Sign in to load exposure.' : query.isError ? 'Exposure data is unavailable.' : rows.length ? 'No assets match these filters.' : 'No exposure in the current snapshot.'}</td></tr>}</tbody>
      {hasData && <tfoot><tr><td>{incomplete ? 'Available subtotal' : 'Total'}<small>Current filters · USD only</small></td><td colSpan={4}>—</td><td>{totals.missing === filtered.length && filtered.length ? '—' : fmt(totals.net)}</td><td>{totals.missing === filtered.length && filtered.length ? '—' : fmt(totals.long)}</td><td /></tr></tfoot>}</table></div>
      <aside className="exposure-chart"><div className="exposure-chart-title"><h2>Exposure composition</h2><div><button aria-pressed={chartSide === 'long'} onClick={() => setChartSide('long')}>Longs</button><button aria-pressed={chartSide === 'short'} onClick={() => setChartSide('short')}>Shorts</button></div></div>
        {chartRows.length ? <><div className="exposure-donut"><ResponsiveContainer width="100%" height={220}><PieChart><Pie isAnimationActive={false} data={chartRows} dataKey="value" nameKey="asset" innerRadius={65} outerRadius={88} paddingAngle={2} stroke="none">{chartRows.map((r, i) => <Cell key={r.asset} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => money(value)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} /></PieChart></ResponsiveContainer><div className="exposure-donut-center"><small>{chartSide === 'long' ? 'NET LONGS' : 'NET SHORTS'}</small><b>{money(chartTotal)}</b></div></div>
        <ul>{chartRows.map((r, i) => <li key={r.asset}><span><i style={{ background: COLORS[i % COLORS.length] }} />{r.asset}</span><b>{fmt(r.value / chartTotal * 100, 1)}%</b><small>{money(r.value)}</small></li>)}</ul></> : <div className="exposure-empty">No valued net {chartSide} exposure.</div>}
      </aside></div>
    <footer className="exposure-footer"><span>Received {query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString() : '—'}{query.data?.asOf ? ` · Server snapshot: ${query.data.asOf}` : ''}</span><span>— Unavailable · Quantities follow each row’s unit · USD totals follow current filters</span></footer>
  </section>;
}
