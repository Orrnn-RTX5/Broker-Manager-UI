import { memo, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { ArrowDownRight, ArrowUpRight, Search, X } from 'lucide-react';
import { DockTitleSlotContext } from '../docking/DockTitleSlotContext';
import {
  MarketWatchContextMenu,
  MarketWatchSymbolsModal,
} from './MarketWatchSymbolMenu';
import {
  DEFAULT_MW_COLUMNS,
  buildMt5SymbolContextMenuItems,
  buildMt5TickChartContextMenuItems,
  exportMarketWatchCsv,
  exportTickChartImage,
  matchesSymbolProfile,
} from './marketWatchSymbolMenuModel';
import useSymbolStore, {
  getSymbolTickBuffer,
} from '../../store/symbolStore';
import { buildBrokerApiUrl } from '../../config/endpoints';
import { getRuntimeConfigValue } from '../../config/backendTarget';
import authService from '../../services/authService';
import {
  sortMarketWatchQuotes,
} from '../../utils/marketWatchQuotes';
import {
  buildTickChartCrosshair,
  buildTickChartGeometry,
  MARKET_WATCH_TICK_CHART_LIMIT,
} from './tickChartGeometry';
import {
  buildMarketWatchSymbolDetails,
  formatDailyChange,
  formatMarketWatchDetailsNumber,
  formatMarketWatchDetailsPrice,
  readInstrumentDescription,
  readMarketWatchSymbolSpecification,
} from './marketWatchSymbolDetailsModel';
import './market-watch-views.css';

const MAX_TICKS = MARKET_WATCH_TICK_CHART_LIMIT;
const SYMBOL_CLICK_DELAY_MS = 300;
const COMPACT_QUOTE_ROW_HEIGHT = 27;
const COMPACT_QUOTE_OVERSCAN = 10;
const COMPACT_QUOTE_FALLBACK_VIEWPORT_HEIGHT = 540;
const FALLBACK_CHART_SIZE = { width: 320, height: 240, fontSize: 11 };

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getBrokerScopeKey = () => (
  getRuntimeConfigValue(['BROKER_ID', 'VITE_BROKER_ID', 'FEED_BROKER_ID', 'VITE_FEED_BROKER_ID']).toLowerCase() || 'default'
);

const getConfiguredBrokerTimeZone = () => {
  const configured = getRuntimeConfigValue(['BROKER_TIMEZONE', 'VITE_BROKER_TIMEZONE', 'SERVER_TIMEZONE', 'VITE_SERVER_TIMEZONE']);
  return configured && configured.trim() ? configured.trim() : 'UTC';
};

const formatSpread = (bid, ask, digits = null) => {
  const bidNum = Number(bid);
  const askNum = Number(ask);
  if (!Number.isFinite(bidNum) || !Number.isFinite(askNum) || bidNum <= 0 || askNum <= 0) return '—';
  const difference = Math.abs(askNum - bidNum);
  if (!Number.isFinite(difference)) return '—';
  if (Number.isInteger(digits) && digits >= 0 && digits <= 10) {
    return difference.toFixed(digits);
  }
  return formatMarketWatchDetailsNumber(difference) ?? '—';
};

const formatPriceWithDigits = (value, digits = null) => {
  const numeric = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(numeric)) return '—';
  if (Number.isInteger(digits) && digits >= 0 && digits <= 10) {
    return numeric.toFixed(digits);
  }
  return String(value);
};

const serverDateFormatters = new Map();
const serverTimeFormatters = new Map();

const getServerDateFormatter = (timeZone) => {
  let formatter = serverDateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    serverDateFormatters.set(timeZone, formatter);
  }
  return formatter;
};

const getServerTimeFormatter = (timeZone) => {
  let formatter = serverTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    serverTimeFormatters.set(timeZone, formatter);
  }
  return formatter;
};

const formatServerDate = (epochMs, timeZone = 'UTC') => {
  const safeMs = Number.isFinite(epochMs) && epochMs > 0 ? epochMs : Date.now();
  try {
    const parts = getServerDateFormatter(timeZone).formatToParts(new Date(safeMs));
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) return `${year}.${month}.${day}`;
  } catch {
    // Fall back to UTC ISO slice if an invalid timezone is configured.
  }
  return new Date(safeMs).toISOString().slice(0, 10).replace(/-/g, '.');
};

const formatServerTime = (epochMs, timeZone = 'UTC', includeMs = false) => {
  const safeMs = Number.isFinite(epochMs) && epochMs > 0 ? epochMs : Date.now();
  const msSuffix = includeMs ? `.${String(Math.floor(safeMs % 1000)).padStart(3, '0')}` : '';
  try {
    const base = getServerTimeFormatter(timeZone).format(new Date(safeMs));
    return `${base}${msSuffix}`;
  } catch {
    return `${new Date(safeMs).toISOString().slice(11, 19)}${msSuffix}`;
  }
};

const normalizeHistoryTimestampMs = (row) => {
  if (!row || typeof row !== 'object') return undefined;
  const raw = row.timestamp ?? row.time_msc ?? row.timeMs ?? row.time ?? row.quote_time ?? row.datetime ?? row.server_time ?? row.serverTime;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric >= 100_000_000_000_000_000) return Math.floor(numeric / 1_000_000);
    if (numeric >= 100_000_000_000_000) return Math.floor(numeric / 1_000);
    if (numeric >= 100_000_000_000) return Math.floor(numeric);
    return Math.floor(numeric * 1_000);
  }
  const parsed = typeof raw === 'string' ? Date.parse(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
};

const parseRemoteTickHistory = (payload, symbol) => {
  const target = String(symbol || '').trim().toUpperCase();
  const rows = Array.isArray(payload)
    ? payload
    : (payload?.ticks ?? payload?.data ?? payload?.answer ?? []);
  if (!Array.isArray(rows)) return [];
  const points = [];
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    if (row.symbol && String(row.symbol).trim().toUpperCase() !== target) return;
    const timestamp = normalizeHistoryTimestampMs(row);
    const bid = Number(row.bid ?? row.Bid);
    const ask = Number(row.ask ?? row.Ask);
    const last = Number(row.last ?? row.Last ?? row.price_last ?? row.priceLast);
    if (!timestamp || !Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return;
    points.push({
      timestamp,
      bid,
      ask,
      ...(Number.isFinite(last) && last > 0 ? { last } : {}),
    });
  });
  return points.sort((a, b) => a.timestamp - b.timestamp);
};

const extractServerTimeMs = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload.server_time,
    payload.serverTime,
    payload.timestamp,
    payload.data?.server_time,
    payload.data?.serverTime,
  ];
  for (const candidate of candidates) {
    const parsed = normalizeHistoryTimestampMs({ timestamp: candidate });
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};

const useLastChangeDirection = (identity, value, initial = 'none') => {
  const [state, setState] = useState(() => ({ identity, value, direction: initial }));
  if (state.identity !== identity) {
    setState({ identity, value, direction: initial });
    return initial;
  }
  if (value !== state.value) {
    const direction = value !== null && state.value !== null
      ? (value > state.value ? 'up' : 'down')
      : state.direction;
    setState({ identity, value, direction });
    return direction;
  }
  return state.direction;
};

const DirectionMarker = ({ direction }) => {
  if (direction !== 'up' && direction !== 'down') return null;
  return (
    <span className="rtx-market-watch-details__marker" data-direction={direction} aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {direction === 'up'
          ? <path d="M2 8L8 2M4 2h4v4" />
          : <path d="M2 2l6 6M8 4v4H4" />}
      </svg>
    </span>
  );
};

const MarketWatchServerClock = memo(function MarketWatchServerClock({
  offsetMs = 0,
  timeZone = 'UTC',
  showMilliseconds = false,
  onClose,
  onTitleMouseDown,
  slot = null,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, showMilliseconds ? 200 : 1000);
    return () => clearInterval(timer);
  }, [showMilliseconds]);

  const serverNowMs = nowMs + (Number.isFinite(offsetMs) ? offsetMs : 0);
  const formattedTime = formatServerTime(serverNowMs, timeZone, showMilliseconds);

  if (slot) {
    return createPortal(
      <span
        className="rtx-market-watch-header"
        style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {`Market Watch: ${formattedTime}`}
      </span>,
      slot
    );
  }

  return (
    <header
      className="rtx-market-watch-header"
      data-dock-titlebar="true"
      onMouseDown={onTitleMouseDown}
      title="Drag or click to move and dock Market Watch"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '20px',
        minHeight: '20px',
        padding: '0 6px',
        background: 'var(--bg-secondary, var(--surface-2, #131316))',
        borderBottom: '1px solid var(--border-primary, var(--border, #28282e))',
        color: 'var(--text-secondary, var(--text-2, #a0a0ab))',
        fontSize: '11px',
        lineHeight: 1,
        userSelect: 'none',
        cursor: typeof onTitleMouseDown === 'function' ? 'grab' : 'default',
      }}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {`Market Watch: ${formattedTime}`}
      </span>
      {typeof onClose === 'function' && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Market Watch"
          title="Close"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            padding: 0,
            border: 0,
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '13px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </header>
  );
});

const MarketWatchViewTabs = memo(function MarketWatchViewTabs({
  activeTab,
  onSelectTab,
  tabs = ['Symbols', 'Details', 'Ticks'],
}) {
  return (
    <div
      className="rtx-market-watch-view-tabs"
      role="tablist"
      aria-label="Market Watch views"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        minHeight: '22px',
        borderTop: '1px solid var(--border-primary, var(--border, #28282e))',
        background: 'var(--bg-secondary, var(--surface-2, #131316))',
        padding: '0 4px',
        gap: '2px',
        userSelect: 'none',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(tab)}
            className={`market-data-tab${isActive ? ' is-active' : ''}`}
            style={{
              padding: '0 10px',
              fontSize: '12px',
              border: '1px solid transparent',
              borderTopColor: isActive ? 'var(--text-secondary, var(--border-3, #a0a0ab))' : 'transparent',
              borderInlineColor: isActive ? 'var(--text-secondary, var(--border-3, #a0a0ab))' : 'transparent',
              background: isActive ? 'var(--bg-secondary, var(--surface, #131316))' : 'transparent',
              color: isActive ? 'var(--text-primary, var(--text, #f4f4f6))' : 'var(--text-secondary, var(--text-3, #a0a0ab))',
              cursor: 'pointer',
              lineHeight: '20px',
              whiteSpace: 'nowrap',
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
});

const SymbolSpecificationModal = memo(function SymbolSpecificationModal({
  symbol,
  instrument,
  quote,
  onClose,
}) {
  if (!symbol) return null;
  const spec = readMarketWatchSymbolSpecification(instrument, quote);
  const description = readInstrumentDescription(instrument) || readInstrumentDescription(quote);
  const rows = [
    { label: 'Symbol', value: symbol },
    { label: 'Description', value: description || '—' },
    { label: 'Digits', value: spec.digits !== null ? String(spec.digits) : '—' },
    { label: 'Tick Size', value: formatMarketWatchDetailsNumber(spec.tickSize) ?? '—' },
    { label: 'Tick Value', value: formatMarketWatchDetailsNumber(spec.tickValue) ?? '—' },
    { label: 'Category', value: instrument?.category || quote?.category || '—' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Symbol specification for ${symbol}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.52)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, 92vw)',
          background: 'var(--surface, #1e1e22)',
          border: '1px solid var(--border, #383842)',
          borderRadius: '4px',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.48)',
          color: 'var(--text, #e4e4e7)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--surface-2, #27272a)',
            borderBottom: '1px solid var(--border, #383842)',
            fontWeight: 600,
            fontSize: '12px',
          }}
        >
          <span>{description ? `${symbol}, ${description}` : symbol} — Specification</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close specification"
            style={{
              border: 0,
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '14px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '10px 12px' }}>
          <dl style={{ margin: 0, display: 'grid', gap: '6px' }}>
            {rows.map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '3px 0',
                  borderBottom: '1px solid var(--border, rgba(255, 255, 255, 0.06))',
                  fontSize: '12px',
                }}
              >
                <dt style={{ color: 'var(--text-2, #a1a1aa)' }}>{item.label}</dt>
                <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
});

const MarketQuoteRow = memo(function MarketQuoteRow({
  compact,
  isConnected,
  onContextMenu,
  onOpenTicks,
  onSelect,
  quote,
  selected,
  showRawQuotes = false,
  showGrid = true,
  columns = DEFAULT_MW_COLUMNS,
  showMilliseconds = false,
  timeZone = 'UTC',
}) {
  const isUp = quote.dir === 'up';
  const spec = readMarketWatchSymbolSpecification(quote);
  const displayBid = showRawQuotes ? (quote.rawBid ?? quote.bid) : quote.bid;
  const displayAsk = showRawQuotes ? (quote.rawAsk ?? quote.ask) : quote.ask;
  const cellBorderRight = showGrid ? '1px solid var(--border)' : 'none';

  return (
    <tr
      onClick={() => onSelect(quote)}
      onDoubleClick={() => onOpenTicks(quote)}
      onContextMenu={(event) => onContextMenu?.(event, quote)}
      className={`market-row cursor-pointer ${selected ? 'is-selected' : ''}`}
      style={!showGrid ? { borderBottom: 'none' } : undefined}
    >
      <td className={`${compact ? 'px-2 py-1.5 text-center font-medium' : 'px-3 py-2 font-medium'} market-quote-symbol`} style={{ borderRight: cellBorderRight }}>
        <div className={compact ? 'flex items-center justify-center gap-1 whitespace-nowrap' : 'flex items-center gap-1.5'}>
          {isUp
            ? <ArrowUpRight size={compact ? 11 : 14} style={{ color: 'var(--market-direction-up)' }} strokeWidth={1.75} />
            : <ArrowDownRight size={compact ? 11 : 14} style={{ color: 'var(--market-direction-down)' }} strokeWidth={1.75} />}
          <span>{quote.symbol}</span>
          {!compact && quote.isStale && (
            <span className="ml-1 text-[9px] uppercase font-bold" style={{ color: 'var(--muted)' }}>
              {isConnected ? 'No fresh tick' : 'Cached'}
            </span>
          )}
        </div>
      </td>
      {columns.bid !== false && (
        <td className={`${compact ? 'px-1 py-1.5 text-center font-mono tabular-nums whitespace-nowrap' : 'px-3 py-2 text-right font-mono tabular-nums'} market-quote-price`} title={String(displayBid)} style={{ borderRight: cellBorderRight, color: isUp ? 'var(--market-value-up)' : 'var(--market-value-down)' }}>
          <span key={`${quote.symbol}-bid-${displayBid}`} className={isUp ? 'flash-up' : 'flash-down'}>
            {formatPriceWithDigits(displayBid, spec.digits)}
          </span>
        </td>
      )}
      {columns.ask !== false && (
        <td className={`${compact ? 'px-1 py-1.5 text-center font-mono tabular-nums whitespace-nowrap' : 'px-3 py-2 text-right font-mono tabular-nums'} market-quote-price`} title={String(displayAsk)} style={{ borderRight: compact ? cellBorderRight : undefined, color: isUp ? 'var(--market-value-up)' : 'var(--market-value-down)' }}>
          <span key={`${quote.symbol}-ask-${displayAsk}`} className={isUp ? 'flash-up' : 'flash-down'}>
            {formatPriceWithDigits(displayAsk, spec.digits)}
          </span>
        </td>
      )}
      {compact && columns.spread !== false && (
        <td className="market-quote-price market-quote-spread px-1 py-1.5 text-center font-mono tabular-nums whitespace-nowrap" style={{ borderRight: (columns.highLow || columns.time || columns.volume) ? cellBorderRight : undefined, color: 'var(--text)' }}>
          {formatSpread(displayBid, displayAsk, spec.digits)}
        </td>
      )}
      {compact && columns.highLow && (
        <td className="market-quote-price px-1 py-1.5 text-center font-mono tabular-nums whitespace-nowrap" style={{ borderRight: (columns.time || columns.volume) ? cellBorderRight : undefined, color: 'var(--text-2)' }}>
          {`${formatPriceWithDigits(quote.session?.high_bid ?? displayBid, spec.digits)} / ${formatPriceWithDigits(quote.session?.low_bid ?? displayBid, spec.digits)}`}
        </td>
      )}
      {compact && columns.time && (
        <td className="market-quote-price px-1 py-1.5 text-center font-mono tabular-nums whitespace-nowrap" style={{ borderRight: columns.volume ? cellBorderRight : undefined, color: 'var(--text-2)' }}>
          {formatServerTime(quote.lastUpdate || Date.now(), timeZone, showMilliseconds)}
        </td>
      )}
      {compact && columns.volume && (
        <td className="market-quote-price px-1 py-1.5 text-center font-mono tabular-nums whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
          {quote.volume ?? '—'}
        </td>
      )}
    </tr>
  );
});

const MarketWatchSymbolDetails = memo(function MarketWatchSymbolDetails({
  symbol,
  instrument,
  quote,
  isLive,
  showGrid,
  onToggleGrid,
  onOpenSpecification,
  onOpenTickChart,
  onContextMenu,
}) {
  const [selectedRowKey, setSelectedRowKey] = useState('tickSize');
  const rowRefs = useRef([]);

  const details = useMemo(() => buildMarketWatchSymbolDetails({
    symbol,
    instrument,
    tick: isLive ? quote : null,
    lastPrice: quote,
  }), [symbol, instrument, quote, isLive]);

  const quoteIdentity = `${symbol}\u0000${details.hasLiveQuote ? 'live' : 'fallback'}`;
  const bidDirection = useLastChangeDirection(quoteIdentity, details.bid, 'none');
  const bidHighDirection = useLastChangeDirection(quoteIdentity, details.bidHigh, 'none');
  const bidLowDirection = useLastChangeDirection(quoteIdentity, details.bidLow, 'none');
  const askDirection = useLastChangeDirection(quoteIdentity, details.ask, 'none');
  const askHighDirection = useLastChangeDirection(quoteIdentity, details.askHigh, 'none');
  const askLowDirection = useLastChangeDirection(quoteIdentity, details.askLow, 'none');

  const dailyChangePriceDirection = details.dailyChangePrice === null || details.dailyChangePrice === 0
    ? 'none'
    : (details.dailyChangePrice > 0 ? 'up' : 'down');
  const dailyChangeDirection = details.dailyChange === null || details.dailyChange === 0
    ? 'none'
    : (details.dailyChange > 0 ? 'up' : 'down');

  const formatPriceCell = useCallback((val) => (
    formatMarketWatchDetailsPrice(val, details.digits) ?? '—'
  ), [details.digits]);

  const rows = useMemo(() => [
    {
      key: 'tickSize',
      label: 'Tick Size',
      value: formatMarketWatchDetailsNumber(details.tickSize) ?? '—',
      direction: 'static',
    },
    {
      key: 'tickValue',
      label: 'Tick Value',
      value: formatMarketWatchDetailsNumber(details.tickValue) ?? '—',
      direction: 'static',
    },
    {
      key: 'bid',
      label: 'Bid',
      value: formatPriceCell(details.bid),
      direction: bidDirection,
    },
    {
      key: 'bidHigh',
      label: 'Bid High',
      value: formatPriceCell(details.bidHigh),
      direction: bidHighDirection,
    },
    {
      key: 'bidLow',
      label: 'Bid Low',
      value: formatPriceCell(details.bidLow),
      direction: bidLowDirection,
    },
    {
      key: 'ask',
      label: 'Ask',
      value: formatPriceCell(details.ask),
      direction: askDirection,
    },
    {
      key: 'askHigh',
      label: 'Ask High',
      value: formatPriceCell(details.askHigh),
      direction: askHighDirection,
    },
    {
      key: 'askLow',
      label: 'Ask Low',
      value: formatPriceCell(details.askLow),
      direction: askLowDirection,
    },
    {
      key: 'dailyChangePrice',
      label: 'Change',
      value: formatDailyChange(details.dailyChangePrice, details.digits ?? 2, false),
      direction: dailyChangePriceDirection,
    },
    {
      key: 'dailyChange',
      label: 'Change %',
      value: formatDailyChange(details.dailyChange, 2, true),
      direction: dailyChangeDirection,
    },
    {
      key: 'open',
      label: 'Open Price',
      value: formatPriceCell(details.open),
      direction: 'static',
    },
    {
      key: 'close',
      label: 'Close Price',
      value: formatPriceCell(details.close),
      direction: 'static',
    },
  ], [
    details,
    formatPriceCell,
    bidDirection,
    bidHighDirection,
    bidLowDirection,
    askDirection,
    askHighDirection,
    askLowDirection,
    dailyChangePriceDirection,
    dailyChangeDirection,
  ]);

  const handleRowKeyDown = useCallback((event, index) => {
    if (event.key === 'g' || event.key === 'G') {
      event.preventDefault();
      onToggleGrid?.();
      return;
    }
    let nextIndex = null;
    if (event.key === 'ArrowDown') {
      nextIndex = Math.min(rows.length - 1, index + 1);
    } else if (event.key === 'ArrowUp') {
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = rows.length - 1;
    }
    if (nextIndex !== null && rows[nextIndex]) {
      event.preventDefault();
      setSelectedRowKey(rows[nextIndex].key);
      rowRefs.current[nextIndex]?.focus();
    }
  }, [rows, onToggleGrid]);

  const displaySymbol = symbol || quote?.symbol || '';
  const symbolDescription = readInstrumentDescription(instrument) || readInstrumentDescription(quote);
  const headerText = symbolDescription ? `${displaySymbol}, ${symbolDescription}` : displaySymbol;

  return (
    <section
      className="rtx-market-watch-details market-quote-details"
      data-live={isLive}
      data-grid={showGrid}
      onContextMenu={(event) => onContextMenu?.(event, { symbol: displaySymbol, quote, instrument, onOpenTickChart, onOpenSpecification })}
    >
      <div className="rtx-market-watch-details__header">
        <button
          type="button"
          className="rtx-market-watch-details__symbol"
          onClick={() => onOpenSpecification?.(displaySymbol)}
          title={headerText}
        >
          {headerText}
        </button>
        {!isLive && (
          <span className="rtx-market-watch-details__availability-status" role="status">
            Symbol unavailable
          </span>
        )}
      </div>
      <div className="rtx-market-watch-details__scroll mw-scrollbar">
        <dl className="rtx-market-watch-details__list">
          {rows.map((row, index) => (
            <div
              key={row.key}
              ref={(el) => { rowRefs.current[index] = el; }}
              className={`rtx-market-watch-details__row${selectedRowKey === row.key ? ' is-selected' : ''}`}
              data-field={row.key}
              data-direction={row.direction}
              tabIndex={0}
              aria-selected={selectedRowKey === row.key}
              onClick={() => setSelectedRowKey(row.key)}
              onFocus={() => setSelectedRowKey(row.key)}
              onKeyDown={(e) => handleRowKeyDown(e, index)}
            >
              <dt className="rtx-market-watch-details__label">
                <DirectionMarker direction={row.direction} />
                <span>{row.label}</span>
              </dt>
              <dd className="rtx-market-watch-details__value" data-tone={row.direction === 'up' || row.direction === 'down' ? row.direction : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
});

const MarketData = ({ compact = false, onClose }) => {
  const dockTitleSlot = useContext(DockTitleSlotContext);
  const [activeTab, setActiveTab] = useState('Symbols');
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [tickHistory, setTickHistory] = useState([]);
  // Remote (broker-history) points per symbol, merged under the live points
  // in renderTicks. Missing this state crashed the Ticks tab (ReferenceError)
  // whenever a broker returned history, and on every Ticks render.
  const [remoteHistoryMap, setRemoteHistoryMap] = useState({});
  const [instrumentSpecMap, setInstrumentSpecMap] = useState({});
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const [specModalSymbol, setSpecModalSymbol] = useState(null);
  const [detailsShowGrid, setDetailsShowGrid] = useState(true);
  const [activeProfile, setActiveProfile] = useState('Default');
  const [showRawQuotes, setShowRawQuotes] = useState(false);
  const [hiddenSymbols, setHiddenSymbols] = useState(() => new Set());
  const [symbolsModalOpen, setSymbolsModalOpen] = useState(false);
  const [sortField, setSortField] = useState('Default');
  const [useSystemColors, setUseSystemColors] = useState(false);
  const [showMilliseconds, setShowMilliseconds] = useState(false);
  const [trackRequests, setTrackRequests] = useState(true);
  const [autoArrange, setAutoArrange] = useState(true);
  const [mwColumns, setMwColumns] = useState(DEFAULT_MW_COLUMNS);

  // Tick chart interactive state
  const [tickSourceMode, setTickSourceMode] = useState('current');
  const [tickRequestNonce, setTickRequestNonce] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [crosshairEnabled, setCrosshairEnabled] = useState(true);
  const [showBidLine, setShowBidLine] = useState(true);
  const [showAskLine, setShowAskLine] = useState(true);
  const [showLastLine, setShowLastLine] = useState(true);
  const [showTickGrid, setShowTickGrid] = useState(true);
  const [panEndOffset, setPanEndOffset] = useState(0);
  const [pointer, setPointer] = useState(null);

  const [chartElement, setChartElement] = useState(null);
  const [chartSize, setChartSize] = useState(FALLBACK_CHART_SIZE);
  const chartRectRef = useRef(null);
  const pointerRafRef = useRef(null);
  const pendingPointerRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const selectedSymbolRef = useRef(null);
  const tickCacheRef = useRef(new Map());
  const fetchedTickHistoryKeysRef = useRef(new Set());
  const symbolClickTimer = useRef(null);
  useEffect(() => () => {
    clearTimeout(symbolClickTimer.current);
    if (pointerRafRef.current !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(pointerRafRef.current);
    }
  }, []);
  const symbolsViewportRef = useRef(null);
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [symbolsViewport, setSymbolsViewport] = useState({ height: 0, scrollTop: 0 });

  const scopeKey = useMemo(() => getBrokerScopeKey(), []);
  const brokerTimeZone = useMemo(() => getConfiguredBrokerTimeZone(), []);

  const {
    feedError,
    initWebSocket,
    isConnected,
    symbols,
  } = useSymbolStore(useShallow((state) => ({
    feedError: state.feedError,
    initWebSocket: state.initWebSocket,
    isConnected: state.isConnected,
    symbols: activeTab === 'Symbols' ? state.symbols : null,
  })));

  useEffect(() => {
    initWebSocket();
  }, [initWebSocket]);

  useEffect(() => {
    if (!chartElement || typeof ResizeObserver === 'undefined') return undefined;
    chartRectRef.current = chartElement.getBoundingClientRect();
    const observer = new ResizeObserver(([entry]) => {
      chartRectRef.current = chartElement.getBoundingClientRect();
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      if (width <= 0 || height <= 0) return;
      setChartSize((current) => (
        current.width === width && current.height === height
          ? current
          : { width, height, fontSize: 11 }
      ));
    });
    observer.observe(chartElement);
    return () => observer.disconnect();
  }, [chartElement]);

  const searchRegex = useMemo(() => {
    const query = searchQuery.trim();
    if (query) {
      try {
        return new RegExp(query, 'i');
      } catch {
        return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
    }
    return null;
  }, [searchQuery]);

  const allSymbolQuotes = useMemo(
    () => sortMarketWatchQuotes(Object.values(symbols || {}).filter((quote) => Boolean(quote?.symbol))),
    [symbols]
  );

  const liveQuotes = useMemo(() => {
    const filtered = allSymbolQuotes.filter((quote) => {
      if (!quote?.symbol) return false;
      if (hiddenSymbols.has(quote.symbol)) return false;
      if (!matchesSymbolProfile(quote.symbol, activeProfile, quote.category)) return false;
      return !searchRegex || searchRegex.test(quote.symbol);
    });
    if (sortField === 'Symbol') {
      return [...filtered].sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
    }
    if (sortField === 'Bid') {
      return [...filtered].sort((a, b) => Number(b.bid || 0) - Number(a.bid || 0));
    }
    if (sortField === 'Ask') {
      return [...filtered].sort((a, b) => Number(b.ask || 0) - Number(a.ask || 0));
    }
    if (sortField === 'Spread') {
      return [...filtered].sort(
        (a, b) => Math.abs(Number(b.ask || 0) - Number(b.bid || 0)) - Math.abs(Number(a.ask || 0) - Number(a.bid || 0))
      );
    }
    return filtered;
  }, [allSymbolQuotes, hiddenSymbols, activeProfile, searchRegex, sortField]);

  const columnCount = useMemo(() => {
    if (!compact) return 3;
    return (
      1
      + (mwColumns.bid !== false ? 1 : 0)
      + (mwColumns.ask !== false ? 1 : 0)
      + (mwColumns.spread !== false ? 1 : 0)
      + (mwColumns.highLow ? 1 : 0)
      + (mwColumns.time ? 1 : 0)
      + (mwColumns.volume ? 1 : 0)
    );
  }, [compact, mwColumns]);

  const compactQuoteWindow = useMemo(() => {
    if (!compact) {
      return {
        quotes: liveQuotes,
        start: 0,
        end: liveQuotes.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };
    }

    const viewportHeight = symbolsViewport.height || COMPACT_QUOTE_FALLBACK_VIEWPORT_HEIGHT;
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / COMPACT_QUOTE_ROW_HEIGHT));
    const maxStart = Math.max(0, liveQuotes.length - visibleCount);
    const start = Math.min(
      maxStart,
      Math.max(
        0,
        Math.floor(symbolsViewport.scrollTop / COMPACT_QUOTE_ROW_HEIGHT) - COMPACT_QUOTE_OVERSCAN
      )
    );
    const end = Math.min(
      liveQuotes.length,
      start + visibleCount + (COMPACT_QUOTE_OVERSCAN * 2)
    );

    return {
      quotes: liveQuotes.slice(start, end),
      start,
      end,
      topSpacerHeight: start * COMPACT_QUOTE_ROW_HEIGHT,
      bottomSpacerHeight: (liveQuotes.length - end) * COMPACT_QUOTE_ROW_HEIGHT,
    };
  }, [compact, liveQuotes, symbolsViewport.height, symbolsViewport.scrollTop]);

  const selectedQuote = useSymbolStore((state) => state.symbols?.[selectedSymbol] || null);
  const specModalQuote = useSymbolStore((state) => state.symbols?.[specModalSymbol] || null);

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
    setPanEndOffset(0);
    setPointer(null);
  }, [selectedSymbol]);

  useEffect(() => {
    if (autoScroll) {
      setPanEndOffset(0);
    }
  }, [autoScroll]);

  // Sample server_time from live quotes when available
  useEffect(() => {
    const serverMs = extractServerTimeMs(selectedQuote);
    if (serverMs) {
      setServerTimeOffsetMs(serverMs - Date.now());
    }
  }, [selectedQuote]);

  // On-Demand Specification Fetch scoped to `${scopeKey}\0${symbol}`
  useEffect(() => {
    const targetSymbol = specModalSymbol || (activeTab === 'Details' || activeTab === 'Ticks' ? selectedSymbol : null);
    if (!targetSymbol) return undefined;
    const requestScopeId = `${scopeKey}\0${targetSymbol}`;
    let cancelled = false;
    const controller = new AbortController();
    const startedAt = Date.now();
    const url = buildBrokerApiUrl(`/api/v2/instruments/${encodeURIComponent(targetSymbol)}`);
    const token = authService.getToken?.() || null;

    fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled || !payload || !requestScopeId) return;
        const serverMs = extractServerTimeMs(payload);
        if (serverMs) {
          const midpointMs = Math.round((startedAt + Date.now()) / 2);
          setServerTimeOffsetMs(serverMs - midpointMs);
        }
        const resolved = payload?.instrument ?? payload?.data ?? payload;
        if (resolved && typeof resolved === 'object') {
          setInstrumentSpecMap((prev) => ({ ...prev, [targetSymbol]: resolved }));
        }
      })
      .catch(() => {
        // Fall back to loaded instrument catalog if request fails or aborts.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, scopeKey, selectedSymbol, specModalSymbol]);

  // Historical tick fetch once per (scopeKey, exactSymbol)
  useEffect(() => {
    if (!selectedSymbol || activeTab !== 'Ticks') return undefined;
    const fetchKey = `${scopeKey}\0${selectedSymbol}`;
    if (fetchedTickHistoryKeysRef.current.has(fetchKey)) return undefined;

    let cancelled = false;
    const controller = new AbortController();
    const startedAt = Date.now();
    const url = buildBrokerApiUrl(`/api/v2/ticks/${encodeURIComponent(selectedSymbol)}?limit=${MAX_TICKS}`);
    const token = authService.getToken?.() || null;

    fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        fetchedTickHistoryKeysRef.current.add(fetchKey);
        const serverMs = extractServerTimeMs(payload);
        if (serverMs) {
          const midpointMs = Math.round((startedAt + Date.now()) / 2);
          setServerTimeOffsetMs(serverMs - midpointMs);
        }
        const points = parseRemoteTickHistory(payload, selectedSymbol);
        if (points.length > 0) {
          setRemoteHistoryMap((prev) => ({ ...prev, [selectedSymbol]: points }));
        }
      })
      .catch(() => {
        // Brokers without historical tick endpoints still chart live session ticks.
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, scopeKey, selectedSymbol, tickRequestNonce]);

  useEffect(() => {
    if (!compact || activeTab !== 'Symbols') return undefined;

    const viewport = symbolsViewportRef.current;
    if (!viewport) return undefined;

    let frameId = null;
    const measureViewport = () => {
      frameId = null;
      const next = {
        height: viewport.clientHeight,
        scrollTop: viewport.scrollTop,
      };
      setSymbolsViewport((current) => (
        current.height === next.height && current.scrollTop === next.scrollTop
          ? current
          : next
      ));
    };
    const scheduleMeasurement = () => {
      if (frameId !== null) return;
      frameId = typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame(measureViewport)
        : globalThis.setTimeout(measureViewport, 0);
    };

    measureViewport();
    viewport.addEventListener('scroll', scheduleMeasurement, { passive: true });
    const resizeObserver = typeof globalThis.ResizeObserver === 'function'
      ? new globalThis.ResizeObserver(scheduleMeasurement)
      : null;
    resizeObserver?.observe(viewport);
    if (!resizeObserver) globalThis.addEventListener?.('resize', scheduleMeasurement);

    return () => {
      viewport.removeEventListener('scroll', scheduleMeasurement);
      resizeObserver?.disconnect();
      if (!resizeObserver) globalThis.removeEventListener?.('resize', scheduleMeasurement);
      if (frameId !== null) {
        if (typeof globalThis.cancelAnimationFrame === 'function') {
          globalThis.cancelAnimationFrame(frameId);
        } else {
          globalThis.clearTimeout(frameId);
        }
      }
    };
  }, [activeTab, compact]);

  useEffect(() => useSymbolStore.subscribe((state, previousState) => {
    const symbol = selectedSymbolRef.current;
    if (!symbol) return;

    const quote = state.symbols?.[symbol];
    const previousQuote = previousState.symbols?.[symbol];
    if (!quote) return;
    if (quote.bid === previousQuote?.bid && quote.ask === previousQuote?.ask) return;

    const storeBuffer = getSymbolTickBuffer(symbol);
    const cached = tickCacheRef.current.get(symbol) || [];
    const lastPrice = Number(quote.last ?? quote.Last);
    const nextTick = {
      bid: toNumber(quote.bid),
      ask: toNumber(quote.ask),
      ...(Number.isFinite(lastPrice) && lastPrice > 0 ? { last: lastPrice } : {}),
      time: quote.lastUpdate || Date.now(),
      timestamp: quote.lastUpdate || Date.now(),
    };

    const previousTicks = storeBuffer.length > 0 ? storeBuffer : cached;
    const last = previousTicks[previousTicks.length - 1];
    const next = last && last.bid === nextTick.bid && last.ask === nextTick.ask
      ? previousTicks
      : [...previousTicks.slice(-(MAX_TICKS - 1)), nextTick];
    tickCacheRef.current.set(symbol, next);
    setTickHistory(next);
  }), []);

  const selectQuote = useCallback((quote, nextTab) => {
    if (!quote?.symbol) return;
    selectedSymbolRef.current = quote.symbol;
    setSelectedSymbol(quote.symbol);
    const latestQuote = useSymbolStore.getState().symbols?.[quote.symbol] || quote;
    const storeBuffer = getSymbolTickBuffer(quote.symbol);
    const cached = tickCacheRef.current.get(quote.symbol) || [];
    const mergedBase = storeBuffer.length > 0 ? storeBuffer : cached;
    const timestamp = latestQuote.lastUpdate || Date.now();
    const lastPrice = Number(latestQuote.last ?? latestQuote.Last);
    const latestTick = {
      bid: toNumber(latestQuote.bid),
      ask: toNumber(latestQuote.ask),
      ...(Number.isFinite(lastPrice) && lastPrice > 0 ? { last: lastPrice } : {}),
      time: timestamp,
      timestamp,
    };
    const last = mergedBase[mergedBase.length - 1];
    const history = last?.bid === latestTick.bid && last?.ask === latestTick.ask
      ? mergedBase
      : (latestTick.bid > 0 && latestTick.ask > 0 ? [...mergedBase.slice(-(MAX_TICKS - 1)), latestTick] : mergedBase);
    tickCacheRef.current.delete(quote.symbol);
    tickCacheRef.current.set(quote.symbol, history);
    if (tickCacheRef.current.size > 32) tickCacheRef.current.delete(tickCacheRef.current.keys().next().value);
    setTickHistory(history);
    if (nextTab) {
      setActiveTab(nextTab);
    }
  }, []);

  const handleSelectQuote = useCallback((quote) => {
    clearTimeout(symbolClickTimer.current);
    selectedSymbolRef.current = quote.symbol;
    setSelectedSymbol(quote.symbol);
    // Keep the row mounted briefly so the second click can open Ticks.
    symbolClickTimer.current = setTimeout(() => selectQuote(quote, 'Details'), SYMBOL_CLICK_DELAY_MS);
  }, [selectQuote]);

  const handleOpenTicks = useCallback(
    (quote) => {
      clearTimeout(symbolClickTimer.current);
      flushSync(() => selectQuote(quote, 'Ticks'));
    },
    [selectQuote]
  );

  const handleTabChange = useCallback((tab) => {
    clearTimeout(symbolClickTimer.current);
    if (tab !== 'Symbols' && !selectedQuote) {
      const allSymbols = Object.values(useSymbolStore.getState().symbols || {});
      const firstQuote = liveQuotes[0] || sortMarketWatchQuotes(allSymbols)[0];
      if (firstQuote) {
        selectQuote(firstQuote, tab);
        return;
      }
    }
    if (tab === 'Ticks' && selectedQuote) {
      selectQuote(selectedQuote, 'Ticks');
      return;
    }
    if (tab === 'Symbols' && activeTab !== 'Symbols') {
      // The symbols viewport is remounted when returning from Details/Ticks,
      // so its native scroll position starts at the top as well.
      setSymbolsViewport((current) => ({ ...current, scrollTop: 0 }));
    }
    setActiveTab(tab);
  }, [activeTab, selectedQuote, liveQuotes, selectQuote]);

  const handleSearchSymbol = useCallback(() => {
    if (liveQuotes && liveQuotes.length > 0) {
      selectQuote(liveQuotes[0], activeTab);
    }
  }, [activeTab, liveQuotes, selectQuote]);

  const handleHideSymbol = useCallback((sym) => {
    if (!sym) return;
    setHiddenSymbols((prev) => {
      const next = new Set(prev);
      next.add(sym);
      return next;
    });
  }, []);

  const handleToggleSymbolVisibility = useCallback((sym) => {
    if (!sym) return;
    setHiddenSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  }, []);

  const handleHideAllSymbols = useCallback((keepSymbol) => {
    const keep = keepSymbol || selectedSymbolRef.current || liveQuotes[0]?.symbol;
    setHiddenSymbols(
      new Set(
        allSymbolQuotes
          .map((q) => q.symbol)
          .filter((sym) => sym && sym !== keep)
      )
    );
  }, [allSymbolQuotes, liveQuotes]);

  const handleShowAllSymbols = useCallback(() => {
    setHiddenSymbols(new Set());
    setActiveProfile('Default');
  }, []);

  const handleToggleColumn = useCallback((colKey) => {
    setMwColumns((prev) => ({
      ...prev,
      [colKey]: !prev[colKey],
    }));
  }, []);

  const handleExportSymbolsCsv = useCallback(() => {
    const rows = liveQuotes.map((q) => {
      const spec = readMarketWatchSymbolSpecification(q);
      const bidVal = showRawQuotes ? (q.rawBid ?? q.bid) : q.bid;
      const askVal = showRawQuotes ? (q.rawAsk ?? q.ask) : q.ask;
      return {
        symbol: q.symbol,
        bid: formatPriceWithDigits(bidVal, spec.digits),
        ask: formatPriceWithDigits(askVal, spec.digits),
        spread: formatSpread(bidVal, askVal, spec.digits),
        time: formatServerTime(q.lastUpdate || Date.now(), brokerTimeZone, showMilliseconds),
      };
    });
    exportMarketWatchCsv(rows, 'market-watch-quotes.csv');
  }, [brokerTimeZone, liveQuotes, showMilliseconds, showRawQuotes]);

  const openSymbolDetailsContextMenu = useCallback((event, quoteOrTarget) => {
    event.preventDefault();
    const targetQuote = quoteOrTarget?.quote || quoteOrTarget;
    const symbolName = quoteOrTarget?.symbol || targetQuote?.symbol || selectedSymbol || liveQuotes[0]?.symbol || '';
    if (targetQuote?.symbol) {
      selectedSymbolRef.current = targetQuote.symbol;
      setSelectedSymbol(targetQuote.symbol);
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      symbolName,
      targetQuote,
      label: `Context menu for ${symbolName || 'symbol'}`,
      items: buildMt5SymbolContextMenuItems({
        symbolName,
        activeProfile,
        onSelectProfile: (profileId) => setActiveProfile(profileId),
        showRawQuotes,
        onToggleRawQuotes: () => setShowRawQuotes((prev) => !prev),
        onOpenDetails: (sym) => {
          const q = useSymbolStore.getState().symbols?.[sym] || targetQuote || { symbol: sym };
          if (q?.symbol) selectQuote(q, 'Details');
          else handleTabChange('Details');
        },
        onOpenTickChart: (sym) => {
          const q = useSymbolStore.getState().symbols?.[sym] || targetQuote || { symbol: sym };
          if (q?.symbol) selectQuote(q, 'Ticks');
          else handleTabChange('Ticks');
        },
        onOpenSpecification: (sym) => {
          const resolvedSym = sym || symbolName;
          if (resolvedSym) setSpecModalSymbol(resolvedSym);
        },
        onHideSymbol: handleHideSymbol,
        onHideAllSymbols: handleHideAllSymbols,
        onShowAllSymbols: handleShowAllSymbols,
        onOpenSymbolsDialog: () => setSymbolsModalOpen(true),
        sortField,
        onSelectSortField: (field) => setSortField(field),
        onExportCsv: handleExportSymbolsCsv,
        useSystemColors,
        onToggleSystemColors: () => setUseSystemColors((prev) => !prev),
        showMilliseconds,
        onToggleMilliseconds: () => setShowMilliseconds((prev) => !prev),
        trackRequests,
        onToggleTrackRequests: () => setTrackRequests((prev) => !prev),
        autoArrange,
        onToggleAutoArrange: () => setAutoArrange((prev) => !prev),
        showGrid: detailsShowGrid,
        onToggleGrid: () => setDetailsShowGrid((prev) => !prev),
        columns: mwColumns,
        onToggleColumn: handleToggleColumn,
      }),
    });
  }, [
    activeProfile,
    autoArrange,
    detailsShowGrid,
    handleExportSymbolsCsv,
    handleHideAllSymbols,
    handleHideSymbol,
    handleShowAllSymbols,
    handleTabChange,
    handleToggleColumn,
    liveQuotes,
    mwColumns,
    selectQuote,
    selectedSymbol,
    showMilliseconds,
    showRawQuotes,
    sortField,
    trackRequests,
    useSystemColors,
  ]);

  const handleSaveTickChartImage = useCallback(() => {
    const activeSym = selectedQuote?.symbol || selectedSymbol || 'TICK_CHART';
    exportTickChartImage(chartElement, activeSym);
  }, [chartElement, selectedQuote, selectedSymbol]);

  const handleSelectTickSource = useCallback((mode) => {
    setTickSourceMode(mode);
    if (mode === 'request' && selectedSymbol) {
      fetchedTickHistoryKeysRef.current.delete(`${scopeKey}\0${selectedSymbol}`);
      setTickRequestNonce((prev) => prev + 1);
    }
  }, [scopeKey, selectedSymbol]);

  const openTickChartContextMenu = useCallback((event) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      minWidth: 162,
      label: 'Tick Chart options',
      items: buildMt5TickChartContextMenuItems({
        tickSourceMode,
        onSelectTickSource: handleSelectTickSource,
        onSaveTickChart: handleSaveTickChartImage,
        autoScroll,
        onToggleAutoScroll: () => setAutoScroll((prev) => !prev),
        crosshairEnabled,
        onToggleCrosshair: () => setCrosshairEnabled((prev) => !prev),
        showBidLine,
        onToggleBidLine: () => setShowBidLine((prev) => !prev),
        showAskLine,
        onToggleAskLine: () => setShowAskLine((prev) => !prev),
        showLastLine,
        onToggleLastLine: () => setShowLastLine((prev) => !prev),
        showTickGrid,
        onToggleGrid: () => setShowTickGrid((prev) => !prev),
      }),
    });
  }, [
    autoScroll,
    crosshairEnabled,
    handleSaveTickChartImage,
    handleSelectTickSource,
    showAskLine,
    showBidLine,
    showLastLine,
    showTickGrid,
    tickSourceMode,
  ]);

  const handleTickChartKeyDown = useCallback((event) => {
    if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA') return;
    const key = event.key.toUpperCase();
    if (key === 'S') {
      event.preventDefault();
      setAutoScroll((prev) => !prev);
    } else if (key === 'C') {
      event.preventDefault();
      setCrosshairEnabled((prev) => !prev);
    } else if (key === 'B') {
      event.preventDefault();
      setShowBidLine((prev) => !prev);
    } else if (key === 'A') {
      event.preventDefault();
      setShowAskLine((prev) => !prev);
    } else if (key === 'L') {
      event.preventDefault();
      setShowLastLine((prev) => !prev);
    } else if (key === 'G') {
      event.preventDefault();
      setShowTickGrid((prev) => !prev);
    }
  }, []);

  const handleTickChartWheel = useCallback((event) => {
    if (autoScroll) return;
    event.preventDefault();
    const step = Math.max(1, Math.round(Math.max(2, Math.floor((chartSize.width - 68) / 2.2)) * 0.12));
    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    setPanEndOffset((cur) => Math.max(0, cur + (delta > 0 ? step : -step)));
  }, [autoScroll, chartSize.width]);

  const handleTickChartMouseEnter = useCallback(() => {
    if (chartElement) {
      chartRectRef.current = chartElement.getBoundingClientRect();
    }
  }, [chartElement]);

  const handleTickChartMouseMove = useCallback((event) => {
    if (!chartElement) return;
    const rect = chartRectRef.current || chartElement.getBoundingClientRect();
    chartRectRef.current = rect;
    const nextPointer = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    pendingPointerRef.current = nextPointer;
    if (pointerRafRef.current !== null) return;
    if (typeof globalThis.requestAnimationFrame === 'function') {
      pointerRafRef.current = globalThis.requestAnimationFrame(() => {
        pointerRafRef.current = null;
        if (pendingPointerRef.current) {
          setPointer(pendingPointerRef.current);
        }
      });
    } else {
      setPointer(nextPointer);
    }
  }, [chartElement]);

  const handleTickChartMouseLeave = useCallback(() => {
    pendingPointerRef.current = null;
    if (pointerRafRef.current !== null && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(pointerRafRef.current);
      pointerRafRef.current = null;
    }
    setPointer(null);
  }, []);

  const renderCompactSearch = () => (
    <div className="market-watch-search-area">
      <div className="market-watch-search-field">
        <Search size={14} strokeWidth={1.8} className="market-watch-search-icon" aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSearchSymbol();
          }}
          placeholder="Search symbols"
          aria-label="Search market symbols"
          autoComplete="off"
          spellCheck={false}
          className="market-watch-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            className="market-watch-search-clear"
            aria-label="Clear symbol search"
            title="Clear search"
            onClick={() => {
              setSearchQuery('');
              searchInputRef.current?.focus();
            }}
          >
            <X size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  const renderSymbols = () => {
    const headerBorderRight = detailsShowGrid ? '1px solid var(--border)' : 'none';
    return (
    <div
      className="flex-1 min-h-0 flex flex-col"
      onContextMenu={(event) => {
        if (event.defaultPrevented) return;
        openSymbolDetailsContextMenu(event, selectedQuote || liveQuotes[0]);
      }}
    >
      <div ref={symbolsViewportRef} className="flex-1 min-h-0 overflow-auto">
      <table className={`w-full text-left border-collapse ${autoArrange ? 'table-fixed' : 'table-auto'} ${compact ? 'min-w-[200px]' : ''}`}>
        <thead>
          <tr
            className="select-none sticky top-0 z-10 text-xs"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}
          >
            <th className={compact ? 'px-2 py-1 font-medium w-[28%] text-left whitespace-nowrap' : 'px-3 py-2 font-medium w-1/3'} style={{ borderRight: headerBorderRight }}>Symbol</th>
            {mwColumns.bid !== false && (
              <th className={compact ? 'px-1 py-1 font-medium w-[27%] text-right whitespace-nowrap' : 'px-3 py-2 font-medium w-1/3 text-right'} style={{ borderRight: headerBorderRight }}>Bid</th>
            )}
            {mwColumns.ask !== false && (
              <th className={compact ? 'px-1 py-1 font-medium w-[27%] text-right whitespace-nowrap' : 'px-3 py-2 font-medium w-1/3 text-right'} style={{ borderRight: headerBorderRight }}>Ask</th>
            )}
            {compact && mwColumns.spread !== false && (
              <th className="px-1 py-1 font-medium w-[18%] text-right whitespace-nowrap" style={{ borderRight: (mwColumns.highLow || mwColumns.time || mwColumns.volume) ? headerBorderRight : undefined }}>Spread</th>
            )}
            {compact && mwColumns.highLow && (
              <th className="px-1 py-1 font-medium text-right whitespace-nowrap" style={{ borderRight: (mwColumns.time || mwColumns.volume) ? headerBorderRight : undefined }}>High / Low</th>
            )}
            {compact && mwColumns.time && (
              <th className="px-1 py-1 font-medium text-right whitespace-nowrap" style={{ borderRight: mwColumns.volume ? headerBorderRight : undefined }}>Time</th>
            )}
            {compact && mwColumns.volume && (
              <th className="px-1 py-1 font-medium text-right whitespace-nowrap">Volume</th>
            )}
          </tr>
          {!compact && <tr>
            <th colSpan={columnCount} className="px-3 py-2">
              <div
                className="flex items-center h-7 w-full rounded-md transition-colors"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-3)',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <Search size={13} style={{ color: 'var(--muted)' }} className="ml-2" aria-hidden="true" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSearchSymbol();
                  }}
                  placeholder="Search symbols..."
                  aria-label="Search symbols"
                  className="h-full w-full px-2 text-[12px] focus:outline-none focus-visible:shadow-none!"
                  style={{ background: 'transparent', color: 'var(--text)' }}
                />
                <button
                  type="button"
                  onClick={handleSearchSymbol}
                  title="Search symbols"
                  aria-label="Search symbols"
                  className="px-2 h-full flex items-center rounded-r-md transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)]"
                  style={{ color: 'var(--muted)', cursor: 'pointer' }}
                >
                  <span className="text-[11px] font-medium">Go</span>
                </button>
              </div>
            </th>
          </tr>}
        </thead>
        <tbody className={compact ? 'text-[11px]' : 'text-sm'}>
          {feedError && liveQuotes.length > 0 && (
            <tr>
              <td colSpan={columnCount} className="px-3 py-2 text-[11px]" style={{ color: 'var(--warning, var(--muted))', borderBottom: '1px solid var(--border)' }}>
                {feedError}
              </td>
            </tr>
          )}
          {feedError && liveQuotes.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--warning, var(--muted))' }}>
                {feedError}
              </td>
            </tr>
          ) : liveQuotes.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--muted)' }}>
                {searchQuery.trim() ? 'No market symbols match your search.' : 'Waiting for market prices…'}
              </td>
            </tr>
          ) : (
            <>
              {compactQuoteWindow.topSpacerHeight > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={columnCount}
                    style={{ height: compactQuoteWindow.topSpacerHeight, padding: 0, border: 0 }}
                  />
                </tr>
              )}
              {compactQuoteWindow.quotes.map((quote) => (
                <MarketQuoteRow
                  key={quote.symbol}
                  compact={compact}
                  isConnected={isConnected}
                  onContextMenu={openSymbolDetailsContextMenu}
                  onOpenTicks={handleOpenTicks}
                  onSelect={handleSelectQuote}
                  quote={quote}
                  selected={selectedSymbol === quote.symbol}
                  showRawQuotes={showRawQuotes}
                  showGrid={detailsShowGrid}
                  columns={mwColumns}
                  showMilliseconds={showMilliseconds}
                  timeZone={brokerTimeZone}
                />
              ))}
              {compactQuoteWindow.bottomSpacerHeight > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={columnCount}
                    style={{ height: compactQuoteWindow.bottomSpacerHeight, padding: 0, border: 0 }}
                  />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
      </div>
      {compact && renderCompactSearch()}
    </div>
    );
  };

  const renderDetails = () => {
    if (!selectedQuote && !selectedSymbol) {
      return (
        <div className="flex-1 flex items-center justify-center h-full text-sm" style={{ color: 'var(--muted)' }}>
          Select a symbol to view its details.
        </div>
      );
    }

    const activeSymbol = selectedQuote?.symbol || selectedSymbol;
    const isSymbolLive = Boolean(isConnected && selectedQuote && !selectedQuote.isStale);
    const instrument = instrumentSpecMap[activeSymbol] || selectedQuote;

    return (
      <MarketWatchSymbolDetails
        symbol={activeSymbol}
        instrument={instrument}
        quote={selectedQuote}
        isLive={isSymbolLive}
        showGrid={detailsShowGrid}
        onToggleGrid={() => setDetailsShowGrid((prev) => !prev)}
        onOpenSpecification={(sym) => setSpecModalSymbol(sym)}
        onOpenTickChart={() => handleOpenTicks(selectedQuote || { symbol: activeSymbol })}
        onContextMenu={openSymbolDetailsContextMenu}
      />
    );
  };

  const tickChartModel = useMemo(() => {
    if (activeTab !== 'Ticks' || (!selectedQuote && !selectedSymbol)) return null;
    const chartName = selectedQuote?.symbol || selectedSymbol;
    const instrument = instrumentSpecMap[chartName] || selectedQuote;
    const spec = readMarketWatchSymbolSpecification(instrument, selectedQuote);

    const storeBuffer = getSymbolTickBuffer(chartName);
    const liveSource = storeBuffer.length > 0 ? storeBuffer : tickHistory;
    const remotePoints = remoteHistoryMap[chartName] || [];
    const filteredSource = remotePoints.length > 0
      ? liveSource.filter((tick) => !tick?.seeded)
      : liveSource;
    const effectiveSource = filteredSource.length > 0 ? filteredSource : liveSource;
    const livePoints = effectiveSource
      .map((tick) => {
        const lastVal = Number(tick.last ?? tick.Last);
        return {
          timestamp: Number(tick.timestamp ?? tick.time) || Date.now(),
          bid: toNumber(tick.bid),
          ask: toNumber(tick.ask),
          ...(Number.isFinite(lastVal) && lastVal > 0 ? { last: lastVal } : {}),
        };
      })
      .filter((point) => point.bid > 0 && point.ask > 0);

    const firstLiveTimestamp = livePoints[0]?.timestamp ?? Number.POSITIVE_INFINITY;
    const earlierPoints = remotePoints.filter((point) => point.timestamp < firstLiveTimestamp);
    const combinedPoints = [...earlierPoints, ...livePoints].slice(-MAX_TICKS);

    const geometry = buildTickChartGeometry(combinedPoints, {
      ...chartSize,
      digits: spec.digits,
      endOffset: autoScroll ? 0 : panEndOffset,
      includeBid: showBidLine,
      includeAsk: showAskLine,
      includeLast: showLastLine,
      formatDate: (ms) => formatServerDate(ms, brokerTimeZone),
      formatTime: (ms) => formatServerTime(ms, brokerTimeZone),
    });

    const activePriceTags = geometry
      ? [
          ...(showAskLine ? [['ask', geometry.askTag]] : []),
          ...(showBidLine ? [['bid', geometry.bidTag]] : []),
          ...(showLastLine && geometry.lastTag ? [['last', geometry.lastTag]] : []),
        ]
      : [];

    return {
      chartName,
      spec,
      geometry,
      activePriceTags,
    };
  }, [
    activeTab,
    autoScroll,
    brokerTimeZone,
    chartSize,
    instrumentSpecMap,
    panEndOffset,
    remoteHistoryMap,
    selectedQuote,
    selectedSymbol,
    showAskLine,
    showBidLine,
    showLastLine,
    tickHistory,
  ]);

  const tickChartCrosshair = useMemo(() => {
    if (!crosshairEnabled || !pointer || !tickChartModel?.geometry) return null;
    return buildTickChartCrosshair(tickChartModel.geometry, pointer, {
      ...chartSize,
      digits: tickChartModel.spec.digits,
      formatDate: (ms) => formatServerDate(ms, brokerTimeZone),
      formatTime: (ms) => formatServerTime(ms, brokerTimeZone),
    });
  }, [brokerTimeZone, chartSize, crosshairEnabled, pointer, tickChartModel]);

  const renderTicks = () => {
    if (!selectedQuote && !selectedSymbol) {
      return (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
          Select a symbol to view its tick chart.
        </div>
      );
    }

    const chartName = tickChartModel?.chartName || selectedQuote?.symbol || selectedSymbol;
    const isSymbolLive = Boolean(isConnected && selectedQuote && !selectedQuote.isStale);
    const geometry = tickChartModel?.geometry || null;
    const activePriceTags = tickChartModel?.activePriceTags || [];
    const crosshair = tickChartCrosshair;

    return (
      <section
        className="market-quote-ticks rtx-market-tick-chart"
        data-crosshair={crosshairEnabled ? 'true' : 'false'}
        aria-label={chartName}
        tabIndex={0}
        onKeyDown={handleTickChartKeyDown}
        onContextMenu={openTickChartContextMenu}
      >
        <div
          ref={setChartElement}
          className="rtx-market-tick-chart__canvas"
          onWheel={handleTickChartWheel}
          onMouseEnter={handleTickChartMouseEnter}
          onMouseMove={handleTickChartMouseMove}
          onMouseLeave={handleTickChartMouseLeave}
        >
          {geometry ? (
            <svg
              width={chartSize.width}
              height={chartSize.height}
              viewBox={`0 0 ${chartSize.width} ${chartSize.height}`}
              role="img"
              aria-labelledby={`${titleId} ${descriptionId}`}
              data-tick-count={geometry.visibleCount}
              style={{ fontSize: chartSize.fontSize }}
            >
              <title id={titleId}>{chartName}</title>
              <desc id={descriptionId}>
                {`${chartName} live tick chart with ${geometry.visibleCount} recent broker quotes. Bid ${geometry.bidTag.label}, Ask ${geometry.askTag.label}.`}
              </desc>
              {/* 1. Plot Background */}
              <rect
                className="rtx-market-tick-chart__plot"
                x={geometry.plot.left}
                y={geometry.plot.top}
                width={geometry.plot.right - geometry.plot.left}
                height={geometry.plot.bottom - geometry.plot.top}
              />
              {/* 2. Grid */}
              {showTickGrid && (
                <g className="rtx-market-tick-chart__grid" aria-hidden="true">
                  {geometry.priceTicks.map((tick) => (
                    <line key={`price-${tick.label}`} x1={geometry.plot.left} x2={geometry.plot.right} y1={tick.y} y2={tick.y} />
                  ))}
                  {geometry.timeTicks.slice(1).map((tick) => (
                    <line key={`time-${tick.x}`} x1={tick.x} x2={tick.x} y1={geometry.plot.top} y2={geometry.plot.bottom} />
                  ))}
                </g>
              )}
              {/* 3. Period Separators */}
              {showTickGrid && (
                <g className="rtx-market-tick-chart__separators" aria-hidden="true">
                  {geometry.separators.map((x) => (
                    <line key={x} x1={x} x2={x} y1={geometry.plot.top} y2={geometry.plot.bottom} />
                  ))}
                </g>
              )}
              {/* 4. Ask Line */}
              {showAskLine && geometry.askPath && (
                <path
                  data-testid="market-tick-ask-line"
                  className="rtx-market-tick-chart__line rtx-market-tick-chart__line--ask"
                  d={geometry.askPath}
                />
              )}
              {/* 5. Bid Line */}
              {showBidLine && geometry.bidPath && (
                <path
                  data-testid="market-tick-bid-line"
                  className="rtx-market-tick-chart__line rtx-market-tick-chart__line--bid"
                  d={geometry.bidPath}
                />
              )}
              {/* 6. Last Line */}
              {showLastLine && geometry.lastPath && (
                <path
                  data-testid="market-tick-last-line"
                  className="rtx-market-tick-chart__line rtx-market-tick-chart__line--last"
                  d={geometry.lastPath}
                />
              )}
              {/* 7. Current Price Reference Lines */}
              <g className="rtx-market-tick-chart__price-lines" aria-hidden="true">
                {showAskLine && (
                  <line
                    className="rtx-market-tick-chart__price-line--ask"
                    x1={geometry.lastX ?? geometry.plot.right}
                    x2={geometry.plot.right}
                    y1={geometry.askTag.lineY}
                    y2={geometry.askTag.lineY}
                  />
                )}
                {showBidLine && (
                  <line
                    className="rtx-market-tick-chart__price-line--bid"
                    x1={geometry.lastX ?? geometry.plot.right}
                    x2={geometry.plot.right}
                    y1={geometry.bidTag.lineY}
                    y2={geometry.bidTag.lineY}
                  />
                )}
                {showLastLine && geometry.lastTag && (
                  <line
                    className="rtx-market-tick-chart__price-line--last"
                    x1={geometry.lastX ?? geometry.plot.right}
                    x2={geometry.plot.right}
                    y1={geometry.lastTag.lineY}
                    y2={geometry.lastTag.lineY}
                  />
                )}
              </g>
              {/* 8. Plot Frame */}
              <rect
                className="rtx-market-tick-chart__frame"
                x={geometry.plot.left}
                y={geometry.plot.top}
                width={geometry.plot.right - geometry.plot.left}
                height={geometry.plot.bottom - geometry.plot.top}
              />
              {/* 9. Symbol Watermark */}
              <text
                className="rtx-market-tick-chart__symbol"
                x={geometry.plot.left + 5}
                y={geometry.plot.top + chartSize.fontSize + 4}
              >
                {chartName}
              </text>
              {/* 10. Axes */}
              <g className="rtx-market-tick-chart__axis" aria-hidden="true">
                {geometry.priceTicks
                  .filter((tick) => tick.y > geometry.plot.top + chartSize.fontSize / 2 && tick.y < geometry.plot.bottom - chartSize.fontSize / 2)
                  .map((tick) => (
                    <g key={`price-label-${tick.label}`}>
                      <line x1={geometry.plot.right} x2={geometry.plot.right + geometry.tickLength} y1={tick.y} y2={tick.y} />
                      <text x={geometry.plot.right + geometry.tickLength + 3} y={tick.y + chartSize.fontSize * 0.35}>{tick.label}</text>
                    </g>
                  ))}
                {geometry.timeTicks.map((tick) => {
                  const textX = tick.isLast
                    ? Math.max(geometry.plot.left, Math.min(tick.x - 24, geometry.plot.right - 46))
                    : tick.x + 2;
                  return (
                    <g key={`time-label-${tick.x}`}>
                      <line x1={tick.x} x2={tick.x} y1={geometry.plot.bottom} y2={geometry.plot.bottom + geometry.tickLength} />
                      <text x={textX} y={geometry.plot.bottom + geometry.tickLength + chartSize.fontSize}>{tick.label}</text>
                    </g>
                  );
                })}
              </g>
              {/* 11. Right-Axis Price Tags */}
              {activePriceTags.map(([side, tag]) => (
                <g key={side} className={`rtx-market-tick-chart__tag rtx-market-tick-chart__tag--${side}`} data-testid={`market-tick-${side}-tag`}>
                  <rect
                    x={geometry.plot.right}
                    y={tag.y - geometry.tagHeight / 2}
                    width={geometry.axisWidth}
                    height={geometry.tagHeight}
                  />
                  <text x={geometry.plot.right + geometry.tickLength + 3} y={tag.y + chartSize.fontSize * 0.35}>{tag.label}</text>
                </g>
              ))}
              {/* 12. Crosshair Overlay */}
              {crosshair && (
                <g className="rtx-market-tick-chart__crosshair" aria-hidden="true">
                  <line x1={geometry.plot.left} x2={geometry.plot.right} y1={crosshair.y} y2={crosshair.y} />
                  <line x1={crosshair.x} x2={crosshair.x} y1={geometry.plot.top} y2={geometry.plot.bottom} />
                  <g className="rtx-market-tick-chart__tag rtx-market-tick-chart__tag--crosshair">
                    <rect
                      x={geometry.plot.right}
                      y={crosshair.priceTag.y - geometry.tagHeight / 2}
                      width={geometry.axisWidth}
                      height={geometry.tagHeight}
                    />
                    <text x={geometry.plot.right + geometry.tickLength + 3} y={crosshair.priceTag.y + chartSize.fontSize * 0.35}>
                      {crosshair.priceTag.label}
                    </text>
                  </g>
                  <g className="rtx-market-tick-chart__tag rtx-market-tick-chart__tag--crosshair">
                    <rect
                      x={crosshair.timeTag.x}
                      y={crosshair.timeTag.y}
                      width={crosshair.timeTag.width}
                      height={crosshair.timeTag.height}
                    />
                    <text
                      x={crosshair.timeTag.x + crosshair.timeTag.width / 2}
                      y={crosshair.timeTag.y + crosshair.timeTag.height / 2 + chartSize.fontSize * 0.35}
                      textAnchor="middle"
                    >
                      {crosshair.timeTag.label}
                    </text>
                  </g>
                  <g className="rtx-market-tick-chart__quote-pill">
                    <rect
                      x={crosshair.quotePill.x}
                      y={crosshair.quotePill.y}
                      width={crosshair.quotePill.width}
                      height={crosshair.quotePill.height}
                    />
                    <text
                      x={crosshair.quotePill.x + crosshair.quotePill.width / 2}
                      y={crosshair.quotePill.y + crosshair.quotePill.height / 2 + chartSize.fontSize * 0.35}
                      textAnchor="middle"
                    >
                      {crosshair.quotePill.label}
                    </text>
                  </g>
                </g>
              )}
            </svg>
          ) : (
            <div className="rtx-market-tick-chart__empty" role="status">
              <strong>{isSymbolLive ? 'Waiting for live ticks' : 'Symbol unavailable'}</strong>
              <span>
                {isSymbolLive
                  ? `The chart will appear when the broker publishes a quote for ${chartName}.`
                  : `${chartName} is not available in the active broker feed.`}
              </span>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div
      className={`market-data market-watch-type workspace-ui flex flex-col h-full w-full overflow-hidden text-sm ${compact ? 'market-data-compact' : ''} ${useSystemColors ? 'is-system-colors' : ''}`}
      style={{ background: 'var(--surface)', color: 'var(--text)' }}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA') return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'u') {
          event.preventDefault();
          setSymbolsModalOpen(true);
        } else if (event.key === 'Delete' && selectedSymbol) {
          event.preventDefault();
          handleHideSymbol(selectedSymbol);
        }
      }}
    >
      <style>{`
        /* The compact panel is scanned as one data grid, so all of its
           labels, values and controls share the same visual weight. */
        .market-watch-type {
          --market-watch-font-size: var(--workspace-ui-small-font-size, 10px);
          --market-value-up: var(--color-quote-up, #1d4ed8);
          --market-value-down: var(--color-loss, #f04438);
          --market-direction-up: var(--market-value-up);
          --market-direction-down: var(--market-value-down);
          --cc-market-glow-up: rgba(29, 78, 216, 0.12);
          --cc-market-glow-down: rgba(240, 68, 56, 0.10);
        }
        .dark .market-watch-type {
          /* Match the Admin Market Watch palette within this panel. */
          --bg-panel: #1e1e1e;
          --surface: #1e1e1e;
          --surface-2: #292929;
          --surface-hover: #333333;
          --border: #303030;
          --border-3: #575757;
          --text: #e4e4e4;
          --text-2: #c7c7c7;
          --text-3: #c7c7c7;
          --muted: #b2b2b2;
          --ink-strong: #ffffff;
          --ink-2: #c7c7c7;
          --accent: #0075c2;
          --accent-hover: #006eaf;
          --accent-text: #e4e4e4;
          --market-value-up: #00a8ff;
          --market-value-down: #f06464;
          --market-direction-up: var(--market-value-up);
          --market-direction-down: var(--market-value-down);
          --cc-market-glow-up: rgba(0, 168, 255, 0.12);
          --cc-market-glow-down: rgba(240, 100, 100, 0.10);
        }
        .dark .market-watch-type .market-watch-search-field {
          background: var(--surface);
          border-color: #3b3b3b;
        }
        .market-watch-type,
        .market-watch-type * {
          font-size: var(--market-watch-font-size);
          font-weight: var(--workspace-ui-font-weight, 400);
          line-height: 1.35;
        }
        .market-watch-type .market-data-tab {
          font-size: 12px !important;
          font-weight: 500 !important;
          line-height: 20px !important;
        }
        .market-watch-type .market-watch-search-area {
          flex: 0 0 auto;
          padding: 2px 4px;
          border-top: 1px solid var(--border);
          background: var(--surface);
        }
        .market-watch-type .market-watch-search-field {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          min-width: 0;
          height: 22px;
          padding: 0 6px;
          border: 1px solid transparent;
          border-radius: 2px;
          background: transparent;
          transition: border-color 150ms ease, background-color 150ms ease;
        }
        .market-watch-type .market-watch-search-field:hover {
          border-color: var(--border-3);
        }
        .market-watch-type .market-watch-search-field:focus-within {
          border-color: var(--accent);
          background: var(--surface);
        }
        .market-watch-type .market-watch-search-icon {
          flex: 0 0 auto;
          color: var(--muted);
          pointer-events: none;
        }
        .market-watch-type .market-watch-search-field:focus-within .market-watch-search-icon {
          color: var(--accent);
        }
        .market-watch-type .market-watch-search-input {
          flex: 1 1 auto;
          width: 100%;
          min-width: 0;
          height: 100%;
          padding: 0;
          border: 0 !important;
          border-radius: 0;
          outline: 0 !important;
          box-shadow: none !important;
          appearance: none;
          background: transparent;
          color: var(--text);
          font: inherit;
          font-size: 11px !important;
          font-weight: 400 !important;
        }
        .market-watch-type .market-watch-search-input::placeholder {
          color: var(--muted);
          opacity: 1;
        }
        .market-watch-type .market-watch-search-input::-webkit-search-decoration,
        .market-watch-type .market-watch-search-input::-webkit-search-cancel-button {
          -webkit-appearance: none;
        }
        .market-watch-type .market-watch-search-clear {
          display: grid;
          flex: 0 0 18px;
          place-items: center;
          width: 18px;
          height: 18px;
          padding: 0;
          border: 0;
          border-radius: 3px;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
        }
        .market-watch-type .market-watch-search-clear:hover {
          background: var(--surface-3);
          color: var(--text);
        }
        /* A tick only sets the direction colour: no glow or fade, so every
           price in the grid keeps the same weight and strength. */
        @keyframes flashTextUp {
          0%, 100% { color: var(--market-value-up); }
        }
        @keyframes flashTextDown {
          0%, 100% { color: var(--market-value-down); }
        }
        .flash-up { animation: flashTextUp 0.8s ease-out forwards; }
        .flash-down { animation: flashTextDown 0.8s ease-out forwards; }
        .market-row { transition: background-color 0.1s ease; border-bottom: 1px solid var(--border); }
        .market-row:hover { background: var(--surface-hover, rgba(120, 120, 120, 0.05)); }
        .market-row.is-selected { background: var(--surface-hover, rgba(120, 120, 120, 0.1)); }
        .market-data-compact .market-quote-price { overflow: hidden; text-overflow: ellipsis; }
      `}</style>

      <MarketWatchServerClock
        offsetMs={serverTimeOffsetMs}
        timeZone={brokerTimeZone}
        showMilliseconds={showMilliseconds}
        onClose={onClose}
        onTitleMouseDown={dockTitleSlot?.onTitleMouseDown}
        slot={dockTitleSlot?.slot || null}
      />

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === 'Symbols' && renderSymbols()}
        {activeTab === 'Details' && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-[var(--surface)]">
            {renderDetails()}
          </div>
        )}
        {activeTab === 'Ticks' && renderTicks()}
      </div>

      <MarketWatchViewTabs
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        tabs={['Symbols', 'Details', 'Ticks']}
      />

      <MarketWatchContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
      />

      <MarketWatchSymbolsModal
        open={symbolsModalOpen}
        symbols={allSymbolQuotes}
        hiddenSymbols={hiddenSymbols}
        onToggleSymbolVisibility={handleToggleSymbolVisibility}
        onShowAll={handleShowAllSymbols}
        onHideAll={handleHideAllSymbols}
        onOpenSpecification={(sym) => {
          setSymbolsModalOpen(false);
          setSpecModalSymbol(sym);
        }}
        onClose={() => setSymbolsModalOpen(false)}
      />

      <SymbolSpecificationModal
        symbol={specModalSymbol}
        instrument={specModalSymbol ? instrumentSpecMap[specModalSymbol] : null}
        quote={specModalQuote}
        onClose={() => setSpecModalSymbol(null)}
      />
    </div>
  );
};

// Skip the workspace-wide re-render on route changes; props are primitives.
export default memo(MarketData);
