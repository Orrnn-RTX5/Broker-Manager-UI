import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Download, RefreshCw, Search } from 'lucide-react';
import authService from '../../services/authService';
import { fetchAllPositionsDataset, invalidateGlobalPositionsCache } from '../../services/api';
import { liveTradingState } from '../../services/liveTradingState';
import { useLivePositions } from '../../hooks/useLiveTrading';
import useSymbolStore from '../../store/symbolStore';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';
import { fetchExposure } from './exposureApi';
import { exposureCsv, exposureTotals } from './exposureModel';
import {
  buildMt5AssetExposure,
  buildMt5ExposureChartSlices,
  formatMt5ExposureCompactQty,
  formatMt5ExposureRate,
  formatMt5SpaceGroupedInt,
  formatMt5SpaceGroupedMoney,
  getExposureAssetColor,
  getMt5ExposureDiagramTitle,
  positionCurrentPrice,
  positionLots,
  positionOpenPrice,
  positionSide,
  readNumber,
} from '../terminal/terminalOperationsData';
import { Mt5ExposureGraphBar, Mt5ExposurePieChart } from '../terminal/TerminalTabContent';
import './exposure.css';

const EMPTY = [];
const fmt = (value, digits = 2) => value === null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
const money = (value) => value === null ? '—' : `${value < 0 ? '−' : ''}$${fmt(Math.abs(value))}`;

export default function ExposurePage({ compact = false, needle = '', isAuthenticated } = {}) {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [chartSide, setChartSide] = useState('long');
  const [chartBasis, setChartBasis] = useState('net');
  const [auto, setAuto] = useState(true);
  const [sort, setSort] = useState({ key: null, descending: false });
  const claims = authService.getSessionClaims();
  const enabled = isAuthenticated ?? authService.getSessionStatus().authenticated;
  const scope = buildPermissionSessionFingerprint({ token: authService.getSessionScopeKey(), login: claims.login, brokerId: claims.brokerId });

  const query = useQuery({
    queryKey: ['exposure', scope],
    queryFn: fetchExposure,
    enabled,
    staleTime: 10_000,
    refetchInterval: auto ? 15_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const positionsQuery = useQuery({
    queryKey: ['exposure-positions-book', scope],
    queryFn: async ({ signal }) => {
      const liveRevision = liveTradingState.snapshot();
      const rawRows = await fetchAllPositionsDataset({ signal });
      return {
        rows: rawRows.map((row) => ({
          ...row,
          login: row.login ?? row.Login ?? row.account_login,
          position: row.position ?? row.positionTicket ?? row.Position ?? row.ticket,
          lots: undefined,
          volume_lots: undefined,
          volume: positionLots(row),
          type: positionSide(row),
          priceOpen: positionOpenPrice(row) ?? row.priceOpen,
          priceCurrent: positionCurrentPrice(row) ?? row.priceCurrent,
          profit: readNumber(row, ['profit', 'Profit']),
        })),
        liveRevision,
      };
    },
    enabled,
    staleTime: 2_000,
    refetchInterval: auto ? 15_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const livePositions = useLivePositions(
    enabled ? positionsQuery.data?.rows ?? EMPTY : EMPTY,
    undefined,
    false,
    positionsQuery.data?.liveRevision || 0
  );
  const symbols = useSymbolStore((state) => state.symbols);

  const dynamicExposure = useMemo(
    () =>
      buildMt5AssetExposure({
        positions: livePositions,
        symbols,
        apiExposureRows: query.data?.rows ?? EMPTY,
        currency: 'USD',
      }),
    [livePositions, symbols, query.data?.rows]
  );

  const rows = useMemo(() => {
    if (dynamicExposure.rows.length > 0) {
      return dynamicExposure.rows;
    }
    return (query.data?.rows ?? EMPTY).map((r, idx) => ({
      ...r,
      color: getExposureAssetColor(r.asset, idx),
    }));
  }, [dynamicExposure.rows, query.data?.rows]);

  const filtered = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.asset.toLowerCase().includes((needle || search).trim().toLowerCase()) &&
            (direction === 'all' || (direction === 'long' ? r.netUsd > 0 : r.netUsd !== null && r.netUsd < 0))
        )
        .sort((a, b) => {
          if (!sort.key) return 0;
          if (a[sort.key] === null) return b[sort.key] === null ? 0 : 1;
          if (b[sort.key] === null) return -1;
          const result = sort.key === 'asset' ? a.asset.localeCompare(b.asset) : a[sort.key] - b[sort.key];
          return sort.descending ? -result : result;
        }),
    [rows, needle, search, direction, sort]
  );

  const totals = useMemo(() => {
    if (!needle && !search.trim() && direction === 'all' && dynamicExposure.allRows.length > 0) {
      return {
        net: dynamicExposure.totals.netUsd,
        long: dynamicExposure.totals.positiveUsd,
        short: dynamicExposure.totals.negativeUsd,
        missing: 0,
      };
    }
    return exposureTotals(filtered);
  }, [needle, search, direction, dynamicExposure, filtered]);

  const chartSlices = useMemo(() => {
    const sourceRows = !needle && !search.trim() && direction === 'all' && dynamicExposure.allRows.length > 0
      ? dynamicExposure.allRows
      : filtered;
    return buildMt5ExposureChartSlices(sourceRows, { direction: chartSide, basis: chartBasis });
  }, [needle, search, direction, dynamicExposure.allRows, filtered, chartSide, chartBasis]);

  const diagramTitle = useMemo(
    () => getMt5ExposureDiagramTitle({ direction: chartSide, basis: chartBasis }),
    [chartSide, chartBasis]
  );

  const incomplete = totals.missing > 0 || query.data?.partial;
  const hasData = Boolean(query.data || positionsQuery.data || rows.length > 0);
  const isFetching = query.isFetching || positionsQuery.isFetching;
  const isLoading = query.isLoading && positionsQuery.isLoading && !rows.length;

  const handleRefresh = () => {
    invalidateGlobalPositionsCache();
    void positionsQuery.refetch();
    void query.refetch();
  };

  const exportRows = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF', exposureCsv(filtered)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exposure.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const columns = [
    ['asset', 'Asset'],
    ['clients', 'Clients'],
    ['coverage', 'Coverage'],
    ['net', 'Net Total'],
    ['rate', 'Rate'],
    ['netUsd', 'Net Total (USD)'],
    ['positiveUsd', 'Positive (USD)'],
  ];

  const updatedAt = Math.max(query.dataUpdatedAt || 0, positionsQuery.dataUpdatedAt || 0);

  return (
    <section className={`exposure-page ${compact ? 'exposure-compact' : ''}`} aria-label="Exposure dashboard">
      <header className="exposure-header">
        <div>
          <span className="exposure-eyebrow">
            <Activity size={13} /> RISK OVERVIEW
          </span>
          <h1>Exposure</h1>
          <p>Client positions, hedge coverage and net asset exposure.</p>
        </div>
        <div className="exposure-actions">
          <span className="exposure-status">
            {isFetching ? 'Updating…' : hasData ? 'Live exposure active' : 'Awaiting data'}
          </span>
          <button onClick={handleRefresh} disabled={!enabled || isFetching} aria-label="Refresh exposure">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={exportRows} disabled={!filtered.length}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </header>
      {!enabled && (
        <div className="exposure-notice" role="status">
          Sign in to view exposure.
        </div>
      )}
      {query.isError && positionsQuery.isError && !hasData && (
        <div className="exposure-notice" role="alert">
          Unable to refresh exposure.{' '}
          {query.error?.status === 403
            ? 'Your manager account does not have access.'
            : query.error?.message || positionsQuery.error?.message}
        </div>
      )}
      {hasData && incomplete && (
        <div className="exposure-notice" role="status">
          Incomplete valuation · {totals.missing} visible rows have no USD value. Totals and charts include available
          values only.{query.data?.partial ? ' The server returned an incomplete snapshot.' : ''}
        </div>
      )}
      <div className="exposure-metrics">
        {[
          ['Net exposure', totals.net, 'Signed total in USD'],
          ['Net longs', totals.long, 'Positive asset exposure'],
          ['Net shorts', totals.short, 'Negative asset exposure'],
        ].map(([label, value, hint]) => (
          <article key={label}>
            <span>
              {label}
              {incomplete ? ' · partial' : ''}
            </span>
            <strong className={value < 0 ? 'exposure-negative' : ''}>
              {hasData && (filtered.length === 0 || totals.missing < filtered.length) ? money(value) : '—'}
            </strong>
            <small>{hint}</small>
          </article>
        ))}
        <article>
          <span>Assets / symbols</span>
          <strong>{hasData ? filtered.length : '—'}</strong>
          <small>{hasData ? `${rows.length} in current snapshot` : 'Waiting for snapshot'}</small>
        </article>
      </div>
      <div className="exposure-toolbar">
        <label className="exposure-search">
          <Search size={15} />
          <input
            aria-label="Search exposure"
            placeholder="Search asset or symbol…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select aria-label="Exposure direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="all">All directions</option>
          <option value="long">Net long (USD)</option>
          <option value="short">Net short (USD)</option>
        </select>
        <label className="exposure-auto">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Refresh every 15s
        </label>
      </div>
      <div className="exposure-body">
        <div className="exposure-table-scroll">
          <table aria-label="Asset exposure" className="exposure-equal-table">
            <colgroup>
              <col className="exposure-equal-col" />
              <col className="exposure-equal-col" />
              <col className="exposure-equal-col" />
              <col className="exposure-equal-col" />
              <col className="exposure-equal-col" />
              <col className="exposure-equal-col" />
              <col className="exposure-equal-col" />
              <col className="exposure-equal-col" />
            </colgroup>
            <thead>
              <tr>
                {columns.map(([key, label]) => (
                  <th
                    key={key}
                    aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'}
                  >
                    <button
                      onClick={() =>
                        setSort({ key, descending: sort.key === key ? !sort.descending : true })
                      }
                    >
                      {label}
                    </button>
                  </th>
                ))}
                <th>Graph</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => {
                const swatchColor = r.color || getExposureAssetColor(r.asset, idx);
                return (
                  <tr key={r.asset}>
                    <td>
                      <b>{r.asset}</b>
                    </td>
                    <td>{formatMt5ExposureCompactQty(r.clients)}</td>
                    <td>{formatMt5ExposureCompactQty(r.coverage)}</td>
                    <td>{formatMt5SpaceGroupedInt(r.net)}</td>
                    <td>{formatMt5ExposureRate(r.rate, r.digits)}</td>
                    <td className={r.netUsd < 0 ? 'exposure-negative' : ''}>
                      {r.netUsd !== null ? formatMt5SpaceGroupedMoney(r.netUsd, 2) : '—'}
                    </td>
                    <td>
                      {r.positiveUsd !== null && r.positiveUsd > 0
                        ? formatMt5SpaceGroupedMoney(r.positiveUsd, 2)
                        : ''}
                    </td>
                    <td>
                      <div className="cc-exposure-graph-cell-inner">
                        <Mt5ExposureGraphBar
                          clientsBarPct={r.clientsBarPct ?? (r.clients < 0 ? -70 : r.clients > 0 ? 70 : 0)}
                          netBarPct={r.netBarPct ?? (r.netUsd < 0 ? -70 : r.netUsd > 0 ? 70 : 0)}
                          title={money(r.netUsd)}
                        />
                        <span className="cc-exposure-color-swatch" style={{ backgroundColor: swatchColor }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={8} className="exposure-empty">
                    {isLoading
                      ? 'Loading exposure snapshot…'
                      : !enabled
                        ? 'Sign in to load exposure.'
                        : rows.length
                          ? 'No assets match these filters.'
                          : 'No exposure in the current snapshot.'}
                  </td>
                </tr>
              )}
            </tbody>
            {hasData && (
              <tfoot>
                <tr>
                  <td>
                    <strong>{incomplete ? 'Available subtotal' : 'Total'}</strong>
                  </td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td>
                    <strong>
                      {totals.missing === filtered.length && filtered.length
                        ? '—'
                        : formatMt5SpaceGroupedMoney(totals.net, 2)}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {totals.missing === filtered.length && filtered.length
                        ? '—'
                        : formatMt5SpaceGroupedMoney(totals.long, 2)}
                    </strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <aside className="exposure-chart">
          <div className="exposure-chart-title">
            <h2>{diagramTitle}</h2>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <button aria-pressed={chartSide === 'long'} onClick={() => setChartSide('long')}>
                Long Positions
              </button>
              <button aria-pressed={chartSide === 'short'} onClick={() => setChartSide('short')}>
                Short Positions
              </button>
              <select
                aria-label="Diagram basis"
                value={chartBasis}
                onChange={(e) => setChartBasis(e.target.value)}
                style={{ minHeight: '26px', fontSize: '11px' }}
              >
                <option value="clients">Clients</option>
                <option value="coverage">Coverage</option>
                <option value="net">Net Total</option>
              </select>
            </div>
          </div>
          <Mt5ExposurePieChart
            slices={chartSlices}
            chartMode={chartSide === 'long' ? 'longs' : 'shorts'}
            title={diagramTitle}
            currency="USD"
            onToggleMode={() => setChartSide((prev) => (prev === 'long' ? 'short' : 'long'))}
          />
        </aside>
      </div>
      <footer className="exposure-footer">
        <span>
          Received {updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—'}
          {query.data?.asOf ? ` · Server snapshot: ${query.data.asOf}` : ''}
        </span>
        <span>Dynamic live valuation · Client positions, coverage & live symbol rates</span>
      </footer>
    </section>
  );
}
