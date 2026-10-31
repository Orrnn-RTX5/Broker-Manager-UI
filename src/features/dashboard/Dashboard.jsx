import { useMemo, useState } from 'react';
import {
  BarChart3,
  CandlestickChart,
  ChevronRight,
  CircleDot,
  GitCommitHorizontal,
  PieChart,
  TrendingUp,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DASHBOARD_PLACEHOLDER_MODE } from './dashboardState';
import useDashboardMetrics, { useDashboardAccountLimits } from './useDashboardMetrics';
import useDashboardActivity from './useDashboardActivity';
import useDashboardOperationalMetrics from './useDashboardOperationalMetrics';
import useManagerConnection from './useManagerConnection';
import {
  ACTIVITY_CHART_TYPES,
  ACTIVITY_RANGES,
  buildActivityChartModel,
} from './dashboardActivityData';
import AllSymbolsDialog from './AllSymbolsDialog';
import { getSidebarAccountsQueryOptions } from '../../services/sidebarAccounts';
import { invalidateGlobalPositionsCache } from '../../services/api';
import { useDockingContext } from '../../components/docking/DockingContext';
import usePermissions from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';
import './Dashboard.css';

const CHART_TYPE_STORAGE_KEY = 'rtx5_dashboard_chart_type_v1';

const CHART_TYPE_ICONS = {
  combo: BarChart3,
  candlestick: CandlestickChart,
  flow: GitCommitHorizontal,
  profile: PieChart,
  bubble: CircleDot,
  cumulative: TrendingUp,
};

const readSavedChartType = () => {
  try {
    const saved = typeof window !== 'undefined' ? window.sessionStorage?.getItem(CHART_TYPE_STORAGE_KEY) : null;
    if (saved && ACTIVITY_CHART_TYPES.some((item) => item.id === saved)) return saved;
  } catch {
    // Ignore storage read error
  }
  return 'combo';
};

const integer = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
const money = (value, compact = false, currency = '') => {
  if (!currency) {
    // No reporting currency in scope (broker-wide multi-currency aggregates):
    // render a currency-agnostic number rather than inventing one.
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: compact ? 1 : 0,
      notation: compact ? 'compact' : 'standard',
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
};
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
const equityAxisNumber = (value) => new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 2 : 1,
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

const MetricCard = ({ label, value, tone = 'neutral', onClick }) => (
  <article className="cc-metric-card" role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={onClick ? `Show ${label.toLowerCase()}` : undefined} onClick={onClick} onKeyDown={onClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } } : undefined}>
    <div className="cc-metric-main">
      <small title={label}>{label}</small>
      <strong className={`cc-metric-value tabular is-${tone}`}>{value}</strong>
    </div>
  </article>
);

const ChartTooltip = ({ active, payload, label, range, chartType }) => {
  if (!active || !payload?.length) return null;
  const point = payload.find((item) => item.payload)?.payload;
  const vol = point?.volume;
  const buyVol = point?.buyVolume;
  const sellVol = point?.sellVolume;
  const buyPct = point?.buyPct ?? 50;
  const sellPct = point?.sellPct ?? 50;
  const deals = point?.deals;
  const cumVol = point?.cumulativeVolume;
  const equityVal = point?.equity ?? point?.equityPlot;
  const volumeLabel = point?.volumePartial && vol != null ? 'Volume (partial)' : 'Volume';
  const equityLabel = point?.equityAsOf
    ? `Equity · ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(point.equityAsOf))}`
    : 'Equity';

  return (
    <div className="cc-chart-tooltip">
      <div className="cc-chart-tooltip-header">
        <strong>{chartTooltipTime(point?.bucketStart ?? label, range)}</strong>
        {point?.isPeakVolume && <span className="cc-chart-tooltip-badge">Peak Interval</span>}
      </div>
      <div className="cc-chart-tooltip-row">
        <i className="cc-chart-tooltip-swatch is-volume" />
        <span>{volumeLabel}</span>
        <b>{vol == null ? 'Unavailable' : `${lots(vol)} lots`}</b>
      </div>
      {vol != null && vol > 0 && (
        <div className="cc-chart-tooltip-flow">
          <div className="cc-chart-tooltip-flow-labels">
            <span className="is-buy">Buy {lots(buyVol ?? 0)} ({buyPct}%)</span>
            <span className="is-sell">Sell {lots(sellVol ?? 0)} ({sellPct}%)</span>
          </div>
          <div className="cc-flow-meter" aria-hidden="true">
            <i className="is-buy" style={{ width: `${buyPct}%` }} />
            <i className="is-sell" style={{ width: `${sellPct}%` }} />
          </div>
        </div>
      )}
      {deals != null && (
        <div className="cc-chart-tooltip-row">
          <i className="cc-chart-tooltip-swatch is-deals" />
          <span>Executed deals</span>
          <b>{integer(deals)}</b>
        </div>
      )}
      {(chartType === 'cumulative' || cumVol != null) && (
        <div className="cc-chart-tooltip-row">
          <i className="cc-chart-tooltip-swatch is-cumulative" />
          <span>Cumulative volume</span>
          <b>{cumVol == null ? '—' : `${lots(cumVol)} lots`}</b>
        </div>
      )}
      <div className="cc-chart-tooltip-row">
        <i className="cc-chart-tooltip-swatch is-equity" />
        <span>{equityLabel}</span>
        <b>{equityVal == null ? 'No reading' : money(equityVal)}</b>
      </div>
    </div>
  );
};

const PanelTitle = ({ children, meta }) => (
  <div className="cc-panel-title"><strong>{children}</strong>{meta && <span>{meta}</span>}</div>
);

const CandlestickActivityChart = ({ data, range, showVolumeSeries, showEquitySeries, showTrendMA }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  const points = useMemo(() => data.filter((pt) => pt.timestamp != null), [data]);
  if (!points.length) return null;

  const width = 940;
  const height = 246;
  const padLeft = 44;
  const padRight = 54;
  const priceTop = 14;
  const priceBottom = showVolumeSeries ? 156 : 214;
  const volTop = 172;
  const volBottom = 222;
  const plotW = width - padLeft - padRight;
  const priceH = priceBottom - priceTop;
  const volH = volBottom - volTop;

  const lows = points.map((p) => p.candleLow).filter((v) => v != null && Number.isFinite(v));
  const highs = points.map((p) => p.candleHigh).filter((v) => v != null && Number.isFinite(v));
  const minPrice = lows.length ? Math.min(...lows) : 0;
  const maxPrice = highs.length ? Math.max(...highs) : 100;
  const priceRange = Math.max(1e-6, maxPrice - minPrice);
  const maxVol = Math.max(1e-6, ...points.map((p) => p.volume || 0));

  const toPriceY = (val) => priceBottom - ((val - minPrice) / priceRange) * priceH;
  const toVolY = (val) => volBottom - ((val || 0) / maxVol) * volH;
  const stepX = points.length > 1 ? plotW / points.length : plotW;
  const candleW = Math.max(6, Math.min(22, stepX * 0.56));

  const priceTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: priceBottom - ratio * priceH,
    val: minPrice + ratio * priceRange,
  }));

  const maPath = points
    .map((pt, idx) => {
      const cx = padLeft + idx * stepX + stepX / 2;
      const cy = toPriceY((pt.candleOpen + pt.candleClose) / 2);
      return `${idx === 0 ? 'M' : 'L'}${cx.toFixed(1)},${cy.toFixed(1)}`;
    })
    .join(' ');

  const hovered = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null;

  return (
    <div className="cc-custom-chart-wrap" onMouseLeave={() => setHoverIdx(null)}>
      <svg className="cc-custom-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="cc-candle-bull" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cc-equity)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--cc-equity)" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="cc-candle-bear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--danger)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--danger)" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {priceTicks.map((tick, i) => (
          <g key={`ptick-${i}`}>
            <line
              x1={padLeft}
              y1={tick.y}
              x2={width - padRight}
              y2={tick.y}
              stroke="var(--cc-grid)"
              strokeDasharray="3 3"
            />
            <text x={width - padRight + 6} y={tick.y + 3} fill="var(--text-tertiary)" fontSize="11">
              {equityAxisNumber(tick.val)}
            </text>
          </g>
        ))}

        {showVolumeSeries && (
          <>
            <line
              x1={padLeft}
              y1={volTop - 8}
              x2={width - padRight}
              y2={volTop - 8}
              stroke="var(--border-2)"
            />
            <text x={padLeft} y={volTop + 2} fill="var(--text-tertiary)" fontSize="11">
              {volumeAxisNumber(maxVol)}
            </text>
            <text x={padLeft} y={volBottom} fill="var(--text-tertiary)" fontSize="11">
              0
            </text>
          </>
        )}

        {showEquitySeries && showTrendMA && points.length > 1 && (
          <path
            d={maPath}
            fill="none"
            stroke="var(--info)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        )}

        {points.map((pt, idx) => {
          const cx = padLeft + idx * stepX + stepX / 2;
          const highY = toPriceY(pt.candleHigh);
          const lowY = toPriceY(pt.candleLow);
          const openY = toPriceY(pt.candleOpen);
          const closeY = toPriceY(pt.candleClose);
          const bodyTop = Math.min(openY, closeY);
          const bodyH = Math.max(3.5, Math.abs(closeY - openY));
          const isBull = pt.candleBullish;
          const color = isBull ? 'var(--cc-equity)' : 'var(--danger)';
          const fillUrl = isBull ? 'url(#cc-candle-bull)' : 'url(#cc-candle-bear)';
          const vY = toVolY(pt.volume || 0);
          const vH = Math.max(1.5, volBottom - vY);
          const showLabel = idx % Math.max(1, Math.floor(points.length / 6)) === 0 || idx === points.length - 1;

          return (
            <g
              key={`candle-${pt.timestamp}`}
              className="cc-candle-group"
              onMouseEnter={() => setHoverIdx(idx)}
            >
              {hoverIdx === idx && (
                <line
                  x1={cx}
                  y1={priceTop}
                  x2={cx}
                  y2={volBottom}
                  stroke="var(--border-3)"
                  strokeDasharray="4 4"
                />
              )}
              {showEquitySeries && (
                <>
                  <line
                    x1={cx}
                    y1={highY}
                    x2={cx}
                    y2={lowY}
                    stroke={color}
                    strokeWidth="1.4"
                  />
                  <rect
                    x={cx - candleW / 2}
                    y={bodyTop}
                    width={candleW}
                    height={bodyH}
                    rx="1.5"
                    fill={fillUrl}
                    stroke={color}
                    strokeWidth="1"
                  />
                </>
              )}
              {showVolumeSeries && pt.volume > 0 && (
                <rect
                  x={cx - candleW / 2}
                  y={vY}
                  width={candleW}
                  height={vH}
                  rx="1"
                  fill={pt.isPeakVolume ? 'var(--accent)' : color}
                  fillOpacity={pt.isPeakVolume ? 0.9 : 0.55}
                />
              )}
              {showLabel && (
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  fill="var(--text-tertiary)"
                  fontSize="11"
                >
                  {chartTime(pt.timestamp, range)}
                </text>
              )}
              <rect
                x={padLeft + idx * stepX}
                y={priceTop}
                width={stepX}
                height={volBottom - priceTop}
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="cc-chart-floating-hud">
          <strong>{chartTooltipTime(hovered.bucketStart ?? hovered.timestamp, range)}</strong>
          <span className="tabular">O {equityAxisNumber(hovered.candleOpen)}</span>
          <span className="tabular">H {equityAxisNumber(hovered.candleHigh)}</span>
          <span className="tabular">L {equityAxisNumber(hovered.candleLow)}</span>
          <span className={`tabular ${hovered.candleBullish ? 'is-buy' : 'is-sell'}`}>
            C {equityAxisNumber(hovered.candleClose)}
          </span>
          <span className="tabular">Vol {lots(hovered.volume ?? 0)} lots</span>
          {hovered.buyPct != null && (
            <span className="tabular is-buy">B {hovered.buyPct}% / S {hovered.sellPct}%</span>
          )}
        </div>
      )}
    </div>
  );
};

const ProfileDonutChart = ({ data, summary, symbolRows, range }) => {
  const activeIntervals = useMemo(() => {
    const withVol = data.filter((pt) => pt.volume != null && pt.volume > 0 && !pt.volumePartial);
    const list = withVol.length ? withVol : data.filter((pt) => pt.volume != null);
    return [...list].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 7);
  }, [data]);

  const maxVol = Math.max(1e-6, summary.peakVolume || 1);
  const buyPct = Math.max(0, Math.min(100, summary.buySharePct || 50));
  const sellPct = Math.max(0, 100 - buyPct);
  const radius = 50;
  const circum = 2 * Math.PI * radius;
  const buyArc = (buyPct / 100) * circum;
  const sellArc = (sellPct / 100) * circum;

  const innerRadius = 36;
  const innerCircum = 2 * Math.PI * innerRadius;
  const utilPct = summary.coveredBuckets > 0
    ? Math.round((summary.activeBuckets / summary.coveredBuckets) * 100)
    : 0;
  const utilArc = (utilPct / 100) * innerCircum;

  const topPalette = ['var(--cc-volume)', 'var(--cc-equity)', 'var(--warning)', 'var(--info)', 'var(--danger)'];
  const symbolSegments = (symbolRows?.length ? symbolRows : activeIntervals.slice(0, 4).map((pt) => ({
    symbol: chartTime(pt.timestamp, range),
    volume: pt.volume || 0,
    share: summary.totalVolume > 0 ? ((pt.volume || 0) / summary.totalVolume) * 100 : 25,
  }))).slice(0, 5);

  return (
    <div className="cc-profile-donut-layout">
      <div className="cc-profile-gauges">
        <div className="cc-profile-donut-card">
          <div className="cc-profile-donut-svg-wrap">
            <svg viewBox="0 0 130 130" className="cc-profile-donut-svg">
              <circle cx="65" cy="65" r={radius} fill="none" stroke="var(--bg-elevated)" strokeWidth="11" />
              <circle
                cx="65"
                cy="65"
                r={radius}
                fill="none"
                stroke="var(--danger)"
                strokeWidth="11"
                strokeDasharray={`${sellArc} ${circum}`}
                strokeDashoffset={-buyArc}
                transform="rotate(-90 65 65)"
              />
              <circle
                cx="65"
                cy="65"
                r={radius}
                fill="none"
                stroke="var(--cc-equity)"
                strokeWidth="11"
                strokeDasharray={`${buyArc} ${circum}`}
                transform="rotate(-90 65 65)"
              />
              <circle cx="65" cy="65" r={innerRadius} fill="none" stroke="var(--bg-elevated)" strokeWidth="6" />
              <circle
                cx="65"
                cy="65"
                r={innerRadius}
                fill="none"
                stroke="var(--cc-volume)"
                strokeWidth="6"
                strokeDasharray={`${utilArc} ${innerCircum}`}
                transform="rotate(-90 65 65)"
              />
              <text x="65" y="61" textAnchor="middle" fill="var(--text-primary)" fontSize="11">
                B {buyPct.toFixed(0)}%
              </text>
              <text x="65" y="75" textAnchor="middle" fill="var(--text-tertiary)" fontSize="11">
                S {sellPct.toFixed(0)}%
              </text>
            </svg>
          </div>
          <div className="cc-profile-donut-meta">
            <strong>Order Flow & Slot Activity</strong>
            <span className="tabular is-buy">Buy: {lots(summary.totalBuyVolume)} lots ({buyPct.toFixed(1)}%)</span>
            <span className="tabular is-sell">Sell: {lots(summary.totalSellVolume)} lots ({sellPct.toFixed(1)}%)</span>
            <span className="tabular">Active Slots: {summary.activeBuckets}/{summary.coveredBuckets} ({utilPct}%)</span>
          </div>
        </div>

        <div className="cc-profile-share-list">
          <small>CONCENTRATION BREAKDOWN</small>
          {symbolSegments.map((seg, i) => (
            <div key={seg.symbol} className="cc-profile-share-item">
              <i style={{ background: topPalette[i % topPalette.length] }} />
              <span>{seg.symbol}</span>
              <strong className="tabular">{lots(seg.volume)} lots</strong>
              <em className="tabular">{seg.share.toFixed(1)}%</em>
            </div>
          ))}
        </div>
      </div>

      <div className="cc-profile-vpvr">
        <div className="cc-profile-vpvr-header">
          <span>INTERVAL VOLUME PROFILE (VPVR)</span>
          <span>BUY / SELL DEPTH</span>
          <span>LOTS</span>
          <span>DEALS</span>
          <span>EQUITY</span>
        </div>
        <div className="cc-profile-vpvr-body">
          {activeIntervals.map((pt) => {
            const widthPct = Math.max(4, ((pt.volume || 0) / maxVol) * 100);
            const bPct = pt.buyPct ?? 50;
            const sPct = 100 - bPct;
            return (
              <div key={`vpvr-${pt.timestamp}`} className={`cc-profile-vpvr-row ${pt.isPeakVolume ? 'is-peak' : ''}`}>
                <span className="cc-profile-vpvr-time tabular">
                  {chartTime(pt.timestamp, range)}
                  {pt.isPeakVolume && <b>PEAK</b>}
                </span>
                <div className="cc-profile-vpvr-track">
                  <div className="cc-profile-vpvr-bar" style={{ width: `${widthPct}%` }}>
                    <i className="is-buy" style={{ width: `${bPct}%` }} title={`Buy ${lots(pt.buyVolume || 0)} lots`} />
                    <i className="is-sell" style={{ width: `${sPct}%` }} title={`Sell ${lots(pt.sellVolume || 0)} lots`} />
                  </div>
                </div>
                <strong className="tabular">{lots(pt.volume || 0)}</strong>
                <span className="tabular">{integer(pt.deals || 0)}</span>
                <span className="tabular cc-profile-vpvr-eq">
                  {pt.equityPlot != null ? equityAxisNumber(pt.equityPlot) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const BubbleMatrixChart = ({ data, range, showVolumeSeries, showEquitySeries }) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  const points = useMemo(() => data.filter((pt) => pt.timestamp != null), [data]);
  if (!points.length) return null;

  const width = 940;
  const height = 246;
  const padLeft = 44;
  const padRight = 54;
  const padTop = 22;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVol = Math.max(1, ...points.map((p) => p.volume || 0));
  const eqVals = points.map((p) => p.equityPlot).filter((v) => v != null && Number.isFinite(v));
  const minEq = eqVals.length ? Math.min(...eqVals) : 0;
  const maxEq = eqVals.length ? Math.max(...eqVals) : 100;
  const eqRange = Math.max(1e-6, maxEq - minEq);

  const stepX = points.length > 1 ? plotW / (points.length - 1) : plotW;
  const toX = (idx) => padLeft + (points.length > 1 ? idx * stepX : plotW / 2);
  const toVolY = (vol) => padTop + plotH - ((vol || 0) / (maxVol * 1.12)) * plotH;
  const toEqY = (eq) => padTop + plotH - ((eq - minEq) / eqRange) * plotH;

  const eqLinePath = points
    .map((pt, idx) => (pt.equityPlot != null ? `${idx === 0 ? 'M' : 'L'}${toX(idx).toFixed(1)},${toEqY(pt.equityPlot).toFixed(1)}` : null))
    .filter(Boolean)
    .join(' ');
  const eqAreaPath = eqLinePath
    ? `${eqLinePath} L${toX(points.length - 1).toFixed(1)},${(padTop + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
    : '';

  const maPath = points
    .map((pt, idx) => (pt.volumeMA != null ? `${idx === 0 ? 'M' : 'L'}${toX(idx).toFixed(1)},${toVolY(pt.volumeMA).toFixed(1)}` : null))
    .filter(Boolean)
    .join(' ');

  const hovered = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null;

  return (
    <div className="cc-custom-chart-wrap" onMouseLeave={() => setHoverIdx(null)}>
      <svg className="cc-custom-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="cc-bubble-eq-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cc-equity)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--cc-equity)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padTop + plotH - ratio * plotH;
          return (
            <g key={`grid-${i}`}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="var(--cc-grid)" strokeDasharray="3 3" />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" fill="var(--text-tertiary)" fontSize="11">
                {volumeAxisNumber(ratio * maxVol * 1.12)}
              </text>
              {eqVals.length > 0 && (
                <text x={width - padRight + 6} y={y + 3} fill="var(--text-tertiary)" fontSize="11">
                  {equityAxisNumber(minEq + ratio * eqRange)}
                </text>
              )}
            </g>
          );
        })}

        {showEquitySeries && eqAreaPath && (
          <>
            <path d={eqAreaPath} fill="url(#cc-bubble-eq-fill)" />
            <path d={eqLinePath} fill="none" stroke="var(--cc-equity)" strokeWidth="2" />
          </>
        )}

        {showVolumeSeries && maPath && (
          <path d={maPath} fill="none" stroke="var(--info)" strokeWidth="1.4" strokeDasharray="4 4" />
        )}

        {points.map((pt, idx) => {
          const cx = toX(idx);
          const cy = toVolY(pt.volume || 0);
          const r = pt.bubbleRadius || 5;
          const isBuyDom = (pt.buyPct ?? 50) >= 52;
          const isSellDom = (pt.buyPct ?? 50) <= 48;
          const strokeColor = pt.isPeakVolume
            ? 'var(--accent)'
            : isBuyDom
              ? 'var(--cc-equity)'
              : isSellDom
                ? 'var(--danger)'
                : 'var(--cc-volume)';
          const showLabel = idx % Math.max(1, Math.floor(points.length / 6)) === 0 || idx === points.length - 1;

          return (
            <g key={`bub-${pt.timestamp}`} onMouseEnter={() => setHoverIdx(idx)} className="cc-bubble-node">
              <line x1={cx} y1={padTop} x2={cx} y2={padTop + plotH} stroke="var(--cc-grid)" strokeOpacity="0.35" />
              {showVolumeSeries && pt.volume > 0 && (
                <>
                  <circle cx={cx} cy={cy} r={r + 4} fill={strokeColor} fillOpacity="0.16" />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={strokeColor}
                    fillOpacity="0.45"
                    stroke={strokeColor}
                    strokeWidth={pt.isPeakVolume ? '2' : '1.4'}
                  />
                  {r >= 11 && pt.deals > 0 && (
                    <text x={cx} y={cy + 3.5} textAnchor="middle" fill="var(--text-primary)" fontSize="11">
                      {pt.deals}d
                    </text>
                  )}
                </>
              )}
              {showLabel && (
                <text x={cx} y={height - 6} textAnchor="middle" fill="var(--text-tertiary)" fontSize="11">
                  {chartTime(pt.timestamp, range)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="cc-chart-floating-hud">
          <strong>{chartTooltipTime(hovered.bucketStart ?? hovered.timestamp, range)}</strong>
          <span className="tabular">Volume: {lots(hovered.volume ?? 0)} lots</span>
          <span className="tabular">Deals: {integer(hovered.deals ?? 0)}</span>
          <span className="tabular is-buy">Buy {hovered.buyPct ?? 50}%</span>
          <span className="tabular is-sell">Sell {hovered.sellPct ?? 50}%</span>
          {hovered.equityPlot != null && (
            <span className="tabular">Equity: {equityAxisNumber(hovered.equityPlot)}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default function Dashboard() {
  const [showAllSymbols, setShowAllSymbols] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [chartType, setChartType] = useState(readSavedChartType);
  const [showVolumeSeries, setShowVolumeSeries] = useState(true);
  const [showEquitySeries, setShowEquitySeries] = useState(true);
  const [showTrendMA, setShowTrendMA] = useState(true);

  const handleSelectChartType = (nextType) => {
    setChartType(nextType);
    try {
      window.sessionStorage?.setItem(CHART_TYPE_STORAGE_KEY, nextType);
    } catch {
      // Ignore storage error
    }
  };

  const queryClient = useQueryClient();
  const refreshDashboard = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      invalidateGlobalPositionsCache();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: getSidebarAccountsQueryOptions('').queryKey }),
        queryClient.invalidateQueries({ queryKey: ['groups', 'dashboard-complete'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
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
  const alertValue = margin.marginAlertCount === null
    ? operational.loading ? 'Loading…' : '—'
    : integer(margin.marginAlertCount);
  const connectionValue = connection.state === 'connected' ? 'Connected'
    : connection.state === 'disconnected' ? 'Disconnected'
      : connection.isLoading ? 'Checking…' : '—';

  const chartModel = useMemo(() => buildActivityChartModel({
    series: activity.series,
    range,
    volumeAsOf: activity.volumeAsOf,
    currentEquity: metrics.equity,
  }), [activity.series, range, activity.volumeAsOf, metrics.equity]);

  const { points: chartData, equityDomain, summary } = chartModel;
  const hasEquityPlot = summary.latestEquity !== null;
  const hasChartData = activity.hasEquity || activity.hasTradeActivity || hasEquityPlot;
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
  const equityNote = activity.firstEquityAt ? summary.equityCount < 2
    ? `One equity reading as of ${new Date(activity.firstEquityAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}; the area trend forms as more readings arrive.`
    : `Equity readings recorded in this session since ${new Date(activity.firstEquityAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`
    : 'Equity history begins when the first live broker reading arrives.';
  const symbolActivity = activity.symbolActivity;
  const symbolRows = symbolActivity?.rows.slice(0, 5) || [];
  const symbolStatus = activity.symbolsRefreshing ? 'Updating…'
    : symbolActivity && activity.error ? 'Last snapshot'
      : symbolActivity ? 'Real accounts' : 'Unavailable';
  const emptySymbolsTitle = activity.restricted ? 'Symbol activity unavailable for this role'
    : activity.symbolsLoading ? 'Loading symbol activity…'
      : activity.symbolsPartial ? 'Complete trade history unavailable'
        : activity.error ? 'Symbol activity unavailable' : 'No trades in this period';
  const emptySymbolsDetail = activity.restricted ? 'Account viewing access is required.'
    : activity.symbolsLoading ? 'Fetching recent executed trades.'
      : activity.symbolsPartial ? 'Rankings appear when the complete trade history is available.'
        : activity.error ? 'Refresh the dashboard to try again.' : 'Choose a longer time range to see earlier activity.';

  const activeChartMeta = ACTIVITY_CHART_TYPES.find((item) => item.id === chartType) || ACTIVITY_CHART_TYPES[0];
  const leftAxisKey = chartType === 'cumulative' ? 'cumulative' : 'volume';
  const showLeftAxis = showVolumeSeries && (activity.hasVolume || activity.hasTradeActivity);
  const showRightAxis = showEquitySeries && hasEquityPlot;

  return (
    <main className="cc-dashboard" data-dashboard-mode={DASHBOARD_PLACEHOLDER_MODE ? 'placeholder' : 'live'}>
      <header className="cc-dashboard-header">
        <h1>Dashboard</h1>
        <div className="cc-dashboard-controls">
          <button type="button" aria-label="Refresh dashboard" title="Refresh dashboard" disabled={refreshing} onClick={refreshDashboard}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="cc-metric-grid" aria-label="Brokerage key metrics">
        <MetricCard label="REAL ACCOUNTS" onClick={() => showAccounts('real')} value={realAccounts == null ? (isLoading ? 'Loading…' : '—') : integer(realAccounts)} />
        <MetricCard label="DEMO ACCOUNTS" onClick={() => showAccounts('demo')} value={demoAccounts == null ? (isLoading ? 'Loading…' : '—') : integer(demoAccounts)} />
        <MetricCard label="NET EQUITY" value={metrics.equity == null ? (isLoading ? 'Loading…' : '—') : money(metrics.equity, true)} />
        {canViewPositions && <MetricCard label="OPEN POSITIONS" value={metrics.openPositions == null ? (isLoading ? 'Loading…' : '—') : integer(metrics.openPositions)} />}
        <MetricCard label="DEPOSIT FLOW (REPORT DAY)" value={metrics.deposits24h == null ? (isLoading ? 'Loading…' : '—') : money(metrics.deposits24h, false, metrics.reportCurrency)} />
        <MetricCard label={hasMarginAmount ? 'USED MARGIN' : 'ACCOUNTS USING MARGIN'} value={marginValue} tone={margin.marginAlertCount > 0 ? 'danger' : 'neutral'} />
        <MetricCard label="MANAGER CONNECTION" value={connectionValue} tone={connection.state === 'disconnected' ? 'danger' : 'neutral'} />
        <MetricCard label="MARGIN ALERTS" value={alertValue} tone={margin.marginAlertCount > 0 ? 'danger' : 'neutral'} />
      </section>

      <section className="cc-panel cc-activity-panel" data-chart-type={chartType}>
        <div className="cc-chart-toolbar">
          <div className="cc-chart-toolbar-heading">
            <PanelTitle meta={activeChartMeta.label}>Trading Activity & Account Equity</PanelTitle>
            <div className="cc-chart-legend" role="group" aria-label="Chart series toggles">
              <button
                type="button"
                className={`cc-chart-legend-btn ${showVolumeSeries ? 'is-active' : 'is-muted'}`}
                aria-pressed={showVolumeSeries}
                onClick={() => setShowVolumeSeries((prev) => !prev)}
                title="Toggle trading volume series"
              >
                <i className="is-volume" />
                <span>{chartType === 'cumulative' ? 'Cumulative Volume (Lots)' : 'Trading Volume (Lots)'}</span>
              </button>
              {chartType === 'flow' && (
                <span className="cc-chart-legend-flow">
                  <span><i className="is-buy-flow" />+Buy Above 0</span>
                  <span><i className="is-sell-flow" />-Sell Below 0</span>
                </span>
              )}
              {(chartType === 'combo' || chartType === 'candlestick' || chartType === 'flow') && (
                <button
                  type="button"
                  className={`cc-chart-legend-btn ${showTrendMA ? 'is-active' : 'is-muted'}`}
                  aria-pressed={showTrendMA}
                  onClick={() => setShowTrendMA((prev) => !prev)}
                  title="Toggle moving average / net delta line"
                >
                  <i className="is-ma" />
                  <span>{chartType === 'flow' ? 'Net Delta Wave' : '3-Period Avg'}</span>
                </button>
              )}
              <button
                type="button"
                className={`cc-chart-legend-btn ${showEquitySeries ? 'is-active' : 'is-muted'}`}
                aria-pressed={showEquitySeries}
                onClick={() => setShowEquitySeries((prev) => !prev)}
                title="Toggle account equity curve"
              >
                <i className="is-equity" />
                <span>Account Equity</span>
              </button>
            </div>
          </div>

          <div className="cc-chart-actions">
            {chartState !== 'Live broker data' && (
              <span className={`cc-chart-data-state ${chartStateTone}`} role="status" aria-live="polite">
                {chartState}
              </span>
            )}
            <div className="cc-chart-type-switcher" role="group" aria-label="Chart visualization type">
              {ACTIVITY_CHART_TYPES.map((typeItem) => {
                const Icon = CHART_TYPE_ICONS[typeItem.id] || BarChart3;
                const active = chartType === typeItem.id;
                return (
                  <button
                    key={typeItem.id}
                    type="button"
                    aria-pressed={active}
                    title={typeItem.description}
                    className={active ? 'is-active' : ''}
                    onClick={() => handleSelectChartType(typeItem.id)}
                  >
                    <Icon size={12} aria-hidden="true" />
                    <span>{typeItem.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="cc-chart-range-switcher" role="group" aria-label="Timeframe intervals">
              {['1H', '6H', '24H', '7D', '30D'].map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={range === item}
                  title={`${intervalLabels[item]} intervals`}
                  className={range === item ? 'is-active' : ''}
                  onClick={() => setRange(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="cc-chart-kpi-strip" aria-label="Selected period trading telemetry">
          <div className="cc-chart-kpi-cell">
            <small>PERIOD VOLUME ({range})</small>
            <strong className="tabular">{activity.hasVolume ? `${lots(summary.totalVolume)} lots` : '—'}</strong>
            <span className="tabular">
              {activity.hasVolume ? `Avg ${lots(summary.avgVolume)} lots / ${intervalLabels[range].toLowerCase()}` : 'Awaiting deal book'}
            </span>
          </div>

          <div className="cc-chart-kpi-cell">
            <small>ORDER FLOW BALANCE</small>
            <div className="cc-chart-kpi-flow-row">
              <strong className="tabular is-buy">B {summary.buySharePct.toFixed(0)}%</strong>
              <div className="cc-flow-meter" aria-hidden="true">
                <i className="is-buy" style={{ width: `${summary.buySharePct}%` }} />
                <i className="is-sell" style={{ width: `${summary.sellSharePct}%` }} />
              </div>
              <strong className="tabular is-sell">S {summary.sellSharePct.toFixed(0)}%</strong>
            </div>
            <span className="tabular">
              {activity.hasVolume
                ? `Net delta ${summary.netVolumeDelta >= 0 ? '+' : ''}${lots(summary.netVolumeDelta)} lots`
                : 'Buy vs. sell lot split'}
            </span>
          </div>

          <div className="cc-chart-kpi-cell">
            <small>EXECUTION VELOCITY</small>
            <strong className="tabular">{activity.hasVolume ? `${integer(summary.totalDeals)} deals` : '—'}</strong>
            <span className="tabular">
              {summary.totalDeals > 0
                ? `Avg ${lots(summary.avgLotPerDeal)} lots / deal · ${summary.activeBuckets}/${summary.coveredBuckets} active slots`
                : `${intervalLabels[range]} buckets`}
            </span>
          </div>

          <div className="cc-chart-kpi-cell">
            <small>PEAK INTERVAL</small>
            <strong className="tabular">
              {summary.peakVolume > 0 ? `${lots(summary.peakVolume)} lots` : '—'}
            </strong>
            <span className="tabular">
              {summary.peakTimestamp ? `Peak at ${chartTime(summary.peakTimestamp, range)}` : 'No volume spikes in range'}
            </span>
          </div>

          <div className="cc-chart-kpi-cell">
            <small>ACCOUNT EQUITY</small>
            <div className="cc-chart-kpi-equity-row">
              <strong className="tabular">{summary.latestEquity !== null ? equityAxisNumber(summary.latestEquity) : '—'}</strong>
              {summary.equityCount >= 2 && (
                <em className={`tabular ${summary.equityDelta >= 0 ? 'is-positive' : 'is-negative'}`}>
                  {summary.equityDelta >= 0 ? '+' : ''}{summary.equityDeltaPct.toFixed(2)}%
                </em>
              )}
            </div>
            <span className="tabular">
              {summary.minEquity !== null && summary.maxEquity !== null
                ? `Range ${equityAxisNumber(summary.minEquity)} – ${equityAxisNumber(summary.maxEquity)}`
                : 'Live real-account equity'}
            </span>
          </div>
        </div>

        <div className="cc-chart-area">
          {hasChartData ? (
            chartType === 'candlestick' ? (
              <CandlestickActivityChart
                data={chartData}
                range={range}
                showVolumeSeries={showVolumeSeries}
                showEquitySeries={showEquitySeries}
                showTrendMA={showTrendMA}
              />
            ) : chartType === 'profile' ? (
              <ProfileDonutChart
                data={chartData}
                summary={summary}
                symbolRows={symbolRows}
                range={range}
              />
            ) : chartType === 'bubble' ? (
              <BubbleMatrixChart
                data={chartData}
                range={range}
                showVolumeSeries={showVolumeSeries}
                showEquitySeries={showEquitySeries}
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180} initialDimension={{ width: 320, height: 210 }} debounce={0}>
                <ComposedChart
                  data={chartData}
                  stackOffset={chartType === 'flow' ? 'sign' : 'none'}
                  margin={{ top: 12, right: 12, bottom: 2, left: -8 }}
                  barCategoryGap="22%"
                >
                  <defs>
                    <linearGradient id="cc-volume-bar-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--cc-volume)" stopOpacity={0.88} />
                      <stop offset="100%" stopColor="var(--cc-volume)" stopOpacity={0.28} />
                    </linearGradient>
                    <linearGradient id="cc-volume-peak-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.98} />
                      <stop offset="100%" stopColor="var(--cc-volume)" stopOpacity={0.45} />
                    </linearGradient>
                    <linearGradient id="cc-volume-area-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--cc-volume)" stopOpacity={0.42} />
                      <stop offset="65%" stopColor="var(--cc-volume)" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="var(--cc-volume)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="cc-equity-area-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--cc-equity)" stopOpacity={0.34} />
                      <stop offset="65%" stopColor="var(--cc-equity)" stopOpacity={0.11} />
                      <stop offset="100%" stopColor="var(--cc-equity)" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="cc-buy-bar-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--cc-equity)" stopOpacity={0.92} />
                      <stop offset="100%" stopColor="var(--cc-equity)" stopOpacity={0.38} />
                    </linearGradient>
                    <linearGradient id="cc-sell-bar-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.92} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid stroke="var(--cc-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(value) => chartTime(value, range)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                    minTickGap={28}
                  />
                  <YAxis
                    yAxisId={leftAxisKey}
                    hide={!showLeftAxis}
                    domain={chartType === 'flow' ? ['auto', 'auto'] : [0, 'auto']}
                    tickFormatter={volumeAxisNumber}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="equity"
                    hide={!showRightAxis}
                    orientation="right"
                    domain={equityDomain}
                    tickFormatter={equityAxisNumber}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                  />

                  <Tooltip
                    content={<ChartTooltip range={range} chartType={chartType} />}
                    cursor={{ stroke: 'var(--border-3)', strokeDasharray: '4 4' }}
                  />

                  {chartType === 'flow' && showLeftAxis && (
                    <ReferenceLine
                      yAxisId="volume"
                      y={0}
                      stroke="var(--text-secondary)"
                      strokeOpacity={0.65}
                    />
                  )}

                  {showRightAxis && summary.avgEquity !== null && (
                    <ReferenceLine
                      yAxisId="equity"
                      y={summary.avgEquity}
                      stroke="var(--cc-equity)"
                      strokeDasharray="3 3"
                      strokeOpacity={0.45}
                    />
                  )}

                  {/* MODE 1: COMBO (Volume Histogram Bars + Moving Avg + Smooth Equity Spline Area) */}
                  {chartType === 'combo' && showVolumeSeries && (
                    <Bar
                      yAxisId="volume"
                      dataKey="volume"
                      maxBarSize={22}
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={false}
                    >
                      {chartData.map((entry) => (
                        <Cell
                          key={`vol-${entry.timestamp}`}
                          fill={entry.isPeakVolume ? 'url(#cc-volume-peak-gradient)' : 'url(#cc-volume-bar-gradient)'}
                          stroke={entry.isPeakVolume ? 'var(--accent)' : 'var(--cc-volume)'}
                          strokeWidth={entry.isPeakVolume ? 1 : 0.5}
                        />
                      ))}
                    </Bar>
                  )}
                  {chartType === 'combo' && showVolumeSeries && showTrendMA && (
                    <Line
                      yAxisId="volume"
                      type="monotone"
                      dataKey="volumeMA"
                      stroke="var(--info)"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                  {chartType === 'combo' && showEquitySeries && (
                    <Area
                      yAxisId="equity"
                      type="monotone"
                      dataKey="equityPlot"
                      baseValue="dataMin"
                      connectNulls
                      stroke="var(--cc-equity)"
                      strokeWidth={2}
                      fill="url(#cc-equity-area-gradient)"
                      fillOpacity={1}
                      dot={summary.equityCount <= 3 ? { r: 3, fill: 'var(--cc-equity)', strokeWidth: 0 } : false}
                      activeDot={{ r: 4, fill: 'var(--cc-equity)', stroke: 'var(--bg-panel)', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}

                  {/* MODE 2: DELTA FLOW (Zero-Axis Diverging Butterfly Oscillator: +Buy Up / -Sell Down + Net Delta) */}
                  {chartType === 'flow' && showVolumeSeries && (
                    <>
                      <Bar
                        yAxisId="volume"
                        dataKey="buyVolume"
                        stackId="delta"
                        maxBarSize={22}
                        radius={[2, 2, 0, 0]}
                        fill="url(#cc-buy-bar-gradient)"
                        stroke="var(--cc-equity)"
                        strokeWidth={0.6}
                        isAnimationActive={false}
                      />
                      <Bar
                        yAxisId="volume"
                        dataKey="sellVolumeNeg"
                        stackId="delta"
                        maxBarSize={22}
                        radius={[0, 0, 2, 2]}
                        fill="url(#cc-sell-bar-gradient)"
                        stroke="var(--danger)"
                        strokeWidth={0.6}
                        isAnimationActive={false}
                      />
                    </>
                  )}
                  {chartType === 'flow' && showVolumeSeries && showTrendMA && (
                    <Line
                      yAxisId="volume"
                      type="monotone"
                      dataKey="netDelta"
                      stroke="var(--warning)"
                      strokeWidth={1.8}
                      dot={{ r: 2.5, fill: 'var(--warning)', strokeWidth: 0 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                  {chartType === 'flow' && showEquitySeries && (
                    <Line
                      yAxisId="equity"
                      type="monotone"
                      dataKey="equityPlot"
                      connectNulls
                      stroke="var(--cc-volume)"
                      strokeWidth={2}
                      dot={summary.equityCount <= 3 ? { r: 3, fill: 'var(--cc-volume)', strokeWidth: 0 } : false}
                      activeDot={{ r: 4, fill: 'var(--cc-volume)', stroke: 'var(--bg-panel)', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}

                  {/* MODE 3: CUMULATIVE (Cumulative Volume Run-Rate Area + Stepped Equity Trajectory) */}
                  {chartType === 'cumulative' && showVolumeSeries && (
                    <Area
                      yAxisId="cumulative"
                      type="monotone"
                      dataKey="cumulativeVolume"
                      baseValue={0}
                      connectNulls
                      stroke="var(--cc-volume)"
                      strokeWidth={2}
                      fill="url(#cc-volume-area-gradient)"
                      fillOpacity={1}
                      dot={false}
                      activeDot={{ r: 4, fill: 'var(--cc-volume)', strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                  )}
                  {chartType === 'cumulative' && showEquitySeries && (
                    <Line
                      yAxisId="equity"
                      type="stepAfter"
                      dataKey="equityPlot"
                      connectNulls
                      stroke="var(--cc-equity)"
                      strokeWidth={2.2}
                      dot={summary.equityCount <= 3 ? { r: 3, fill: 'var(--cc-equity)', strokeWidth: 0 } : false}
                      activeDot={{ r: 4, fill: 'var(--cc-equity)', strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )
          ) : (
            <div className="cc-chart-placeholder">
              <div className="cc-chart-placeholder-grid" aria-hidden="true">
                <svg className="cc-chart-placeholder-svg" viewBox="0 0 600 140" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="cc-placeholder-fade" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--cc-volume)" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="var(--cc-volume)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,112 C90,108 150,92 230,96 C310,100 370,74 450,78 C520,82 560,64 600,60 L600,140 L0,140 Z"
                    fill="url(#cc-placeholder-fade)"
                  />
                  <path
                    d="M0,112 C90,108 150,92 230,96 C310,100 370,74 450,78 C520,82 560,64 600,60"
                    fill="none"
                    stroke="var(--cc-volume)"
                    strokeOpacity="0.25"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                </svg>
              </div>
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
          <span className="cc-chart-range-label">{activeChartMeta.label} view · {intervalLabels[range]} intervals</span>{' · '}
          {activity.restricted ? 'Trade volume requires account viewing access.' :
            activity.partial && !activity.cached ? 'Complete deal history is unavailable for this range; volume is hidden.' :
              activity.error && !activity.cached ? 'Trade volume could not be loaded; account equity is still recorded from live broker readings.' :
                [snapshotNote, equityNote].filter(Boolean).join(' ')}
        </div>
      </section>

      <section className="cc-panel cc-data-panel cc-symbol-activity" aria-labelledby="dashboard-symbols-title">
        <header className="cc-symbol-activity-heading">
          <div><h2 id="dashboard-symbols-title">Top Traded Symbols</h2><p>Executed volume in the selected period.</p></div>
          <span className="cc-symbol-activity-status" role="status">{symbolStatus}<i aria-hidden="true" />{range}</span>
        </header>
        {symbolRows.length ? (
          <div className="cc-symbol-activity-table">
            <table aria-label="Top traded symbols"><thead><tr><th>Symbol</th><th>Volume (Lots)</th><th>Executed deals</th><th>Volume share</th></tr></thead>
              <tbody>{symbolRows.map((row) => <tr key={row.symbol}>
                <td>{row.symbol}</td><td className="tabular">{lots(row.volume)}</td><td className="tabular">{integer(row.deals)}</td>
                <td><span className="cc-symbol-share"><span className="cc-symbol-share-track" aria-hidden="true"><i style={{ width: `${row.share}%` }} /></span><span className="tabular">{row.share.toFixed(1)}%</span></span></td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="cc-symbol-activity-empty" role="status"><BarChart3 size={20} aria-hidden="true" /><strong>{emptySymbolsTitle}</strong><p>{emptySymbolsDetail}</p></div>
        )}
        <footer className="cc-symbol-activity-footer">
          <span>{symbolActivity
            ? `${integer(symbolActivity.totalDeals)} executed deals · ${lots(symbolActivity.totalVolume)} lots${symbolActivity.rows.length > 5 ? ` · Top 5 of ${integer(symbolActivity.rows.length)} symbols` : ''}${activity.error ? ' · Last successful snapshot' : ''}`
            : 'Trade totals appear when available.'}</span>
          <button type="button" onClick={() => setShowAllSymbols(true)}>Browse symbols <ChevronRight size={12} aria-hidden="true" /></button>
        </footer>
      </section>
      {showAllSymbols && <AllSymbolsDialog onClose={() => setShowAllSymbols(false)} />}
    </main>
  );
}
