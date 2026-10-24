import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { ArrowDownRight, ArrowUpRight, Search, X } from 'lucide-react';
import useSymbolStore, {
  ensureSymbolTickSeries,
  getSymbolTickBuffer,
  mergeRemoteSymbolTickHistory,
  subscribeSymbolTicks,
} from '../../store/symbolStore';
import { buildBrokerApiUrl } from '../../config/endpoints';
import authService from '../../services/authService';
import {
  sortMarketWatchQuotes,
} from '../../utils/marketWatchQuotes';
import {
  buildTickChartGeometry,
  MARKET_WATCH_TICK_CHART_LIMIT,
} from './tickChartGeometry';

const MAX_TICKS = MARKET_WATCH_TICK_CHART_LIMIT;
const REMOTE_TICK_FETCH_LIMIT = 180;
const SYMBOL_CLICK_DELAY_MS = 300;
const COMPACT_QUOTE_ROW_HEIGHT = 27;
const COMPACT_QUOTE_OVERSCAN = 10;
const COMPACT_QUOTE_FALLBACK_VIEWPORT_HEIGHT = 540;
const FALLBACK_CHART_SIZE = { width: 320, height: 240, fontSize: 11 };

const remoteTickCache = new Map();
const inFlightTickRequests = new Map();
const unsupportedTickSymbols = new Set();

const isLikelyUnsupportedTickSymbol = (symbol) => /\.[A-Z0-9]{1,5}$|-PERP$/i.test(String(symbol || '').trim());

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatSpread = (bid, ask) => {
  const difference = Math.abs(toNumber(ask) - toNumber(bid));
  return Number.isFinite(difference) ? difference.toFixed(5) : '-';
};

const formatDetailValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && value !== '' && value !== null && value !== undefined
    ? number.toFixed(5)
    : '-';
};

const formatServerDate = (epochMs) => {
  const safeMs = Number.isFinite(epochMs) && epochMs > 0 ? epochMs : Date.now();
  return new Date(safeMs).toISOString().slice(0, 10).replace(/-/g, '.');
};

const formatServerTime = (epochMs) => {
  const safeMs = Number.isFinite(epochMs) && epochMs > 0 ? epochMs : Date.now();
  return new Date(safeMs).toISOString().slice(11, 19);
};

const normalizeHistoryTimestampMs = (row) => {
  if (!row || typeof row !== 'object') return undefined;
  const raw = row.timestamp ?? row.time_msc ?? row.timeMs ?? row.time ?? row.quote_time ?? row.datetime;
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
    if (!timestamp || !Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return;
    points.push({ timestamp, bid, ask });
  });
  return points.sort((a, b) => a.timestamp - b.timestamp);
};

const fetchRemoteTickSeries = (symbol) => {
  const key = String(symbol || '').trim().toUpperCase();
  if (!key || unsupportedTickSymbols.has(key) || isLikelyUnsupportedTickSymbol(key)) {
    return Promise.resolve([]);
  }
  if (remoteTickCache.has(key)) {
    return Promise.resolve(remoteTickCache.get(key));
  }
  if (inFlightTickRequests.has(key)) {
    return inFlightTickRequests.get(key);
  }
  const url = buildBrokerApiUrl(`/api/v2/ticks/${encodeURIComponent(key)}?limit=${REMOTE_TICK_FETCH_LIMIT}`);
  const token = authService.getToken?.() || null;
  const request = fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
    .then((res) => {
      if (res.status === 403 || res.status === 404) {
        unsupportedTickSymbols.add(key);
        return null;
      }
      return res.ok ? res.json() : null;
    })
    .then((payload) => {
      const points = payload ? parseRemoteTickHistory(payload, key) : [];
      if (points.length > 0) {
        remoteTickCache.set(key, points);
        mergeRemoteSymbolTickHistory(key, points);
      }
      return points;
    })
    .catch(() => [])
    .finally(() => {
      inFlightTickRequests.delete(key);
    });
  inFlightTickRequests.set(key, request);
  return request;
};

const MarketQuoteRow = memo(function MarketQuoteRow({
  compact,
  isConnected,
  onOpenTicks,
  onPrefetch,
  onSelect,
  quote,
  selected,
}) {
  const isUp = quote.dir === 'up';

  return (
    <tr
      onPointerEnter={() => onPrefetch?.(quote)}
      onClick={() => onSelect(quote)}
      onDoubleClick={() => onOpenTicks(quote)}
      className={`market-row cursor-pointer ${selected ? 'is-selected' : ''}`}
    >
      <td className={`${compact ? 'px-2 py-1.5 text-center font-medium' : 'px-3 py-2 font-medium'} market-quote-symbol`} style={{ borderRight: '1px solid var(--border)' }}>
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
      <td className={`${compact ? 'px-1 py-1.5 text-center font-mono tabular-nums whitespace-nowrap' : 'px-3 py-2 text-right font-mono tabular-nums'} market-quote-price`} title={String(quote.bid)} style={{ borderRight: '1px solid var(--border)', color: isUp ? 'var(--market-value-up)' : 'var(--market-value-down)' }}>
        <span key={`${quote.symbol}-bid-${quote.bid}`} className={isUp ? 'flash-up' : 'flash-down'}>
          {quote.bid}
        </span>
      </td>
      <td className={`${compact ? 'px-1 py-1.5 text-center font-mono tabular-nums whitespace-nowrap' : 'px-3 py-2 text-right font-mono tabular-nums'} market-quote-price`} title={String(quote.ask)} style={{ borderRight: compact ? '1px solid var(--border)' : undefined, color: isUp ? 'var(--market-value-up)' : 'var(--market-value-down)' }}>
        <span key={`${quote.symbol}-ask-${quote.ask}`} className={isUp ? 'flash-up' : 'flash-down'}>
          {quote.ask}
        </span>
      </td>
      {compact && (
        <td className="market-quote-price market-quote-spread px-1 py-1.5 text-center font-mono tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>
          {formatSpread(quote.bid, quote.ask)}
        </td>
      )}
    </tr>
  );
});

const MarketData = ({ compact = false }) => {
  const [activeTab, setActiveTab] = useState('Symbols');
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [tickHistory, setTickHistory] = useState([]);
  const [remoteHistoryMap, setRemoteHistoryMap] = useState({});
  const [chartElement, setChartElement] = useState(null);
  const [chartSize, setChartSize] = useState(FALLBACK_CHART_SIZE);
  const titleId = useId();
  const descriptionId = useId();
  const selectedSymbolRef = useRef(null);
  const tickCacheRef = useRef(new Map());
  const symbolClickTimer = useRef(null);
  useEffect(() => () => clearTimeout(symbolClickTimer.current), []);
  const symbolsViewportRef = useRef(null);
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [symbolsViewport, setSymbolsViewport] = useState({ height: 0, scrollTop: 0 });

  const handleChartCanvasRef = useCallback((node) => {
    setChartElement(node);
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (width > 0 && height > 0) {
      setChartSize((current) => (
        current.width === width && current.height === height
          ? current
          : { width, height, fontSize: 11 }
      ));
    }
  }, []);

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
    const observer = new ResizeObserver(([entry]) => {
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

  const liveQuotes = useMemo(() => {
    return sortMarketWatchQuotes(Object.values(symbols || {}).filter((quote) => {
      if (!quote?.symbol) return false;
      return !searchRegex || searchRegex.test(quote.symbol);
    }));
  }, [symbols, searchRegex]);

  const columnCount = compact ? 4 : 3;

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

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  useEffect(() => {
    if (!selectedSymbol || activeTab !== 'Ticks') return undefined;
    let cancelled = false;

    const currentQuote = useSymbolStore.getState().symbols?.[selectedSymbol] || null;
    const seeded = ensureSymbolTickSeries(selectedSymbol, currentQuote);
    if (seeded.length > 0) {
      setTickHistory(seeded.slice(-MAX_TICKS));
    }

    const unsubscribeTicks = subscribeSymbolTicks(selectedSymbol, (nextBuffer) => {
      if (!cancelled && Array.isArray(nextBuffer)) {
        const sliced = nextBuffer.slice(-MAX_TICKS);
        tickCacheRef.current.set(selectedSymbol, sliced);
        setTickHistory(sliced);
      }
    });

    fetchRemoteTickSeries(selectedSymbol).then((points) => {
      if (cancelled || !Array.isArray(points) || points.length === 0) return;
      setRemoteHistoryMap((prev) => (
        prev[selectedSymbol] === points ? prev : { ...prev, [selectedSymbol]: points }
      ));
    });

    return () => {
      cancelled = true;
      unsubscribeTicks();
    };
  }, [activeTab, selectedSymbol]);

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
    const nextTick = {
      bid: toNumber(quote.bid),
      ask: toNumber(quote.ask),
      time: quote.lastUpdate || Date.now(),
      timestamp: quote.lastUpdate || Date.now(),
    };

    const previousTicks = tickCacheRef.current.get(symbol) || storeBuffer;
    const last = previousTicks[previousTicks.length - 1];
    const next = last && last.bid === nextTick.bid && last.ask === nextTick.ask
      ? previousTicks
      : [...previousTicks.slice(-(MAX_TICKS - 1)), nextTick];
    tickCacheRef.current.set(symbol, next);
    setTickHistory(next);
  }), []);

  const selectQuote = useCallback((quote, nextTab) => {
    selectedSymbolRef.current = quote.symbol;
    setSelectedSymbol(quote.symbol);
    const latestQuote = useSymbolStore.getState().symbols?.[quote.symbol] || quote;
    const storeBuffer = ensureSymbolTickSeries(quote.symbol, latestQuote);
    const cached = tickCacheRef.current.get(quote.symbol) || [];
    const mergedBase = storeBuffer.length >= cached.length ? storeBuffer : cached;
    const timestamp = latestQuote.lastUpdate || Date.now();
    const latestTick = {
      bid: toNumber(latestQuote.bid),
      ask: toNumber(latestQuote.ask),
      time: timestamp,
      timestamp,
    };
    const last = mergedBase[mergedBase.length - 1];
    const history = last?.bid === latestTick.bid && last?.ask === latestTick.ask
      ? mergedBase
      : [...mergedBase.slice(-(MAX_TICKS - 1)), latestTick];
    tickCacheRef.current.delete(quote.symbol);
    tickCacheRef.current.set(quote.symbol, history);
    if (tickCacheRef.current.size > 32) tickCacheRef.current.delete(tickCacheRef.current.keys().next().value);
    setTickHistory(history);
    setActiveTab(nextTab);
  }, []);

  const handlePrefetchTicks = useCallback((quote) => {
    if (!quote?.symbol) return;
    ensureSymbolTickSeries(quote.symbol, quote);
    fetchRemoteTickSeries(quote.symbol).then((points) => {
      if (Array.isArray(points) && points.length > 0) {
        setRemoteHistoryMap((prev) => (
          prev[quote.symbol] === points ? prev : { ...prev, [quote.symbol]: points }
        ));
      }
    });
  }, []);

  const handleSelectQuote = useCallback((quote) => {
    clearTimeout(symbolClickTimer.current);
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

  const renderSymbols = () => (
    <div className="flex-1 min-h-0 flex flex-col">
      {compact && renderCompactSearch()}
      <div ref={symbolsViewportRef} className="flex-1 min-h-0 overflow-auto">
      <table className={`w-full text-left border-collapse table-fixed ${compact ? 'min-w-[320px]' : ''}`}>
        <thead>
          <tr
            className="select-none sticky top-0 z-10 text-xs"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}
          >
            <th className={compact ? 'px-2 py-1.5 font-medium w-[28%] text-center whitespace-nowrap' : 'px-3 py-2 font-medium w-1/3'} style={{ borderRight: '1px solid var(--border)' }}>Symbol</th>
            <th className={compact ? 'px-1 py-1.5 font-medium w-[27%] text-center whitespace-nowrap' : 'px-3 py-2 font-medium w-1/3 text-right'} style={{ borderRight: '1px solid var(--border)' }}>Bid</th>
            <th className={compact ? 'px-1 py-1.5 font-medium w-[27%] text-center whitespace-nowrap' : 'px-3 py-2 font-medium w-1/3 text-right'} style={{ borderRight: '1px solid var(--border)' }}>Ask</th>
            {compact && <th className="px-1 py-1.5 font-medium w-[18%] text-center whitespace-nowrap">Spread</th>}
          </tr>
          {!compact && <tr>
            <th colSpan={3} className="px-3 py-2">
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
                  onOpenTicks={handleOpenTicks}
                  onPrefetch={handlePrefetchTicks}
                  onSelect={handleSelectQuote}
                  quote={quote}
                  selected={selectedSymbol === quote.symbol}
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
    </div>
  );

  const renderDetails = () => {
    if (!selectedQuote) {
      return (
        <div className="flex-1 flex items-center justify-center h-full text-sm" style={{ color: 'var(--muted)' }}>
          Select a symbol to view its details.
        </div>
      );
    }

    const bid = toNumber(selectedQuote.bid);
    const close = toNumber(selectedQuote.previous_close);
    const dailyChange = bid && close ? `${(((bid - close) / close) * 100).toFixed(2)}%` : '-';
    const isChangeUp = bid && close ? bid >= close : null;
    const session = selectedQuote.session || {};
    const details = [
      { label: 'Bid', value: formatDetailValue(selectedQuote.bid), isUp: selectedQuote.dir === 'up' },
      { label: 'Ask', value: formatDetailValue(selectedQuote.ask), isUp: selectedQuote.dir === 'up' },
      { label: 'Spread', value: formatSpread(selectedQuote.bid, selectedQuote.ask) },
      { label: 'Bid High', value: formatDetailValue(session.high_bid) },
      { label: 'Bid Low', value: formatDetailValue(session.low_bid) },
      { label: 'Ask High', value: formatDetailValue(session.high_ask) },
      { label: 'Ask Low', value: formatDetailValue(session.low_ask) },
      { label: 'Open Price', value: formatDetailValue(selectedQuote.daily_open) },
      { label: 'Previous Close', value: formatDetailValue(selectedQuote.previous_close) },
      { label: 'Daily Change', value: dailyChange, isUp: isChangeUp },
    ];

    return (
      <div className="market-quote-details w-full p-2 bg-[var(--surface)]">
        <div className="font-semibold text-lg pb-3 mb-3 border-b flex justify-between items-center" style={{ color: 'var(--accent-text)', borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={() => handleOpenTicks(selectedQuote)}
            aria-label={`View ticks for ${selectedQuote.symbol}`}
            title={`View ticks for ${selectedQuote.symbol}`}
            className="cursor-pointer text-left hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 rounded-sm"
          >
            {selectedQuote.symbol}
          </button>
          <span className="text-xs px-2 py-1 bg-[var(--surface-2)] rounded font-mono font-normal tracking-wide text-[var(--text-2)]">
            {isConnected && !selectedQuote.isStale ? 'Live' : 'Cached'}
          </span>
        </div>
        <table className="w-full text-left border-collapse text-sm">
          <tbody className="tabular-nums">
            {details.map((item) => (
              <tr key={item.label} className="market-row">
                <td className="py-1.5 text-xs font-medium" style={{ color: 'var(--text-3)' }}>
                  {item.label}
                </td>
                <td className="py-1.5 text-right font-medium flex justify-end items-center gap-1.5" style={{ color: item.isUp === true ? 'var(--market-value-up)' : (item.isUp === false ? 'var(--market-value-down)' : 'var(--text)') }}>
                  {item.isUp === true ? <ArrowUpRight size={14} style={{ color: 'var(--market-direction-up)' }} strokeWidth={1.75} /> : null}
                  {item.isUp === false ? <ArrowDownRight size={14} style={{ color: 'var(--market-direction-down)' }} strokeWidth={1.75} /> : null}
                  <span className="font-mono text-[13px]">{item.value}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTicks = () => {
    if (!selectedQuote) {
      return (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
          Select a symbol to view its tick chart.
        </div>
      );
    }

    const storeBuffer = ensureSymbolTickSeries(selectedQuote.symbol, selectedQuote);
    const liveSource = storeBuffer.length >= tickHistory.length ? storeBuffer : tickHistory;
    const livePoints = liveSource
      .map((tick) => ({
        timestamp: Number(tick.timestamp ?? tick.time) || Date.now(),
        bid: toNumber(tick.bid),
        ask: toNumber(tick.ask),
      }))
      .filter((point) => point.bid > 0 && point.ask > 0);

    const remotePoints = remoteHistoryMap[selectedQuote.symbol] || [];
    const firstLiveTimestamp = livePoints[0]?.timestamp ?? Number.POSITIVE_INFINITY;
    const earlierPoints = remotePoints.filter((point) => point.timestamp < firstLiveTimestamp);
    const combinedPoints = [...earlierPoints, ...livePoints].slice(-MAX_TICKS);

    const digits = Number.isInteger(Number(selectedQuote.digits)) ? Number(selectedQuote.digits) : null;
    const geometry = buildTickChartGeometry(combinedPoints, {
      ...chartSize,
      digits,
      formatDate: formatServerDate,
      formatTime: formatServerTime,
    });
    const chartName = selectedQuote.symbol;

    return (
      <section className="market-quote-ticks rtx-market-tick-chart" aria-label={chartName}>
        <div ref={handleChartCanvasRef} className="rtx-market-tick-chart__canvas">
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
              <rect
                className="rtx-market-tick-chart__plot"
                x={geometry.plot.left}
                y={geometry.plot.top}
                width={geometry.plot.right - geometry.plot.left}
                height={geometry.plot.bottom - geometry.plot.top}
              />
              <g className="rtx-market-tick-chart__grid" aria-hidden="true">
                {geometry.priceTicks.map((tick) => (
                  <line key={`price-${tick.label}`} x1={geometry.plot.left} x2={geometry.plot.right} y1={tick.y} y2={tick.y} />
                ))}
                {geometry.timeTicks.slice(1).map((tick) => (
                  <line key={`time-${tick.x}`} x1={tick.x} x2={tick.x} y1={geometry.plot.top} y2={geometry.plot.bottom} />
                ))}
              </g>
              <g className="rtx-market-tick-chart__separators" aria-hidden="true">
                {geometry.separators.map((x) => (
                  <line key={x} x1={x} x2={x} y1={geometry.plot.top} y2={geometry.plot.bottom} />
                ))}
              </g>
              <path
                data-testid="market-tick-ask-line"
                className="rtx-market-tick-chart__line rtx-market-tick-chart__line--ask"
                d={geometry.askPath}
              />
              <path
                data-testid="market-tick-bid-line"
                className="rtx-market-tick-chart__line rtx-market-tick-chart__line--bid"
                d={geometry.bidPath}
              />
              <rect
                className="rtx-market-tick-chart__frame"
                x={geometry.plot.left}
                y={geometry.plot.top}
                width={geometry.plot.right - geometry.plot.left}
                height={geometry.plot.bottom - geometry.plot.top}
              />
              <text
                className="rtx-market-tick-chart__symbol"
                x={geometry.plot.left + 5}
                y={geometry.plot.top + chartSize.fontSize + 4}
              >
                {chartName}
              </text>
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
                    ? Math.max(geometry.plot.left, Math.min(tick.x - 18, geometry.plot.right - 24))
                    : tick.x + 2;
                  return (
                    <g key={`time-label-${tick.x}`}>
                      <line x1={tick.x} x2={tick.x} y1={geometry.plot.bottom} y2={geometry.plot.bottom + geometry.tickLength} />
                      <text x={textX} y={geometry.plot.bottom + geometry.tickLength + chartSize.fontSize}>{tick.label}</text>
                    </g>
                  );
                })}
              </g>
              {[['ask', geometry.askTag], ['bid', geometry.bidTag]].map(([side, tag]) => (
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
            </svg>
          ) : (
            <div className="rtx-market-tick-chart__empty" role="status">
              <strong>Waiting for live ticks</strong>
              <span>{`The chart will appear when the broker publishes a quote for ${chartName}.`}</span>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className={`market-data market-watch-type workspace-ui flex flex-col h-full w-full overflow-hidden text-sm ${compact ? 'market-data-compact' : ''}`} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
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
        .market-watch-type .rtx-market-tick-chart {
          --rtx-tick-chart-bid: var(--color-quote-up, #1d4ed8);
          --rtx-tick-chart-ask: var(--color-loss, #f04438);
          --rtx-tick-chart-plot: var(--rtx-light-panel, #ffffff);
          --rtx-tick-chart-grid: rgba(16, 24, 40, 0.08);
          --rtx-tick-chart-frame: var(--rtx-light-text-secondary, #344054);
          --rtx-tick-chart-separator: var(--rtx-light-border-strong, #d0d5dd);
          --rtx-tick-chart-text: #0f172a;
          --rtx-tick-chart-tag-text: #ffffff;
          display: flex;
          min-width: 0;
          min-height: 0;
          flex: 1 1 auto;
          flex-direction: column;
          padding: 6px 2px 2px 6px;
          overflow: hidden;
          color: var(--rtx-tick-chart-text);
          background: var(--surface);
        }
        .dark .market-watch-type .rtx-market-tick-chart {
          --rtx-tick-chart-bid: #1d7dfa;
          --rtx-tick-chart-ask: #ff5858;
          --rtx-tick-chart-plot: #14161b;
          --rtx-tick-chart-grid: rgba(255, 255, 255, 0.05);
          --rtx-tick-chart-frame: #d4d4d8;
          --rtx-tick-chart-separator: #606068;
          --rtx-tick-chart-text: #e4e4e4;
          --rtx-tick-chart-tag-text: #111318;
          background: var(--surface);
        }
        .market-watch-type .rtx-market-tick-chart__canvas {
          position: relative;
          min-width: 0;
          min-height: 120px;
          flex: 1 1 auto;
          overflow: hidden;
        }
        .market-watch-type .rtx-market-tick-chart__canvas > svg {
          position: absolute;
          inset: 0;
          display: block;
          font-variant-numeric: tabular-nums;
        }
        .market-watch-type .rtx-market-tick-chart__plot {
          fill: var(--rtx-tick-chart-plot);
        }
        .market-watch-type .rtx-market-tick-chart__grid line {
          stroke: var(--rtx-tick-chart-grid);
          stroke-dasharray: 3 3;
          shape-rendering: crispEdges;
        }
        .market-watch-type .rtx-market-tick-chart__separators line {
          stroke: var(--rtx-tick-chart-separator);
          stroke-dasharray: 4 3;
          shape-rendering: crispEdges;
        }
        .market-watch-type .rtx-market-tick-chart__line {
          fill: none;
          stroke-width: 1.15;
          shape-rendering: crispEdges;
        }
        .market-watch-type .rtx-market-tick-chart__line--bid {
          stroke: var(--rtx-tick-chart-bid);
        }
        .market-watch-type .rtx-market-tick-chart__line--ask {
          stroke: var(--rtx-tick-chart-ask);
        }
        .market-watch-type .rtx-market-tick-chart__frame {
          fill: none;
          stroke: var(--rtx-tick-chart-frame);
          shape-rendering: crispEdges;
        }
        .market-watch-type .rtx-market-tick-chart__axis line {
          stroke: var(--rtx-tick-chart-frame);
          shape-rendering: crispEdges;
        }
        .market-watch-type .rtx-market-tick-chart__axis text,
        .market-watch-type .rtx-market-tick-chart__symbol {
          fill: var(--rtx-tick-chart-text);
        }
        .market-watch-type .rtx-market-tick-chart__tag--bid rect {
          fill: var(--rtx-tick-chart-bid);
        }
        .market-watch-type .rtx-market-tick-chart__tag--ask rect {
          fill: var(--rtx-tick-chart-ask);
        }
        .market-watch-type .rtx-market-tick-chart__tag text {
          fill: var(--rtx-tick-chart-tag-text);
        }
        .market-watch-type .rtx-market-tick-chart__empty {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 5px;
          padding: 18px;
          color: var(--muted);
          background: var(--rtx-tick-chart-plot);
          border: 1px solid var(--rtx-tick-chart-frame);
          text-align: center;
        }
        .market-watch-type .rtx-market-tick-chart__empty strong {
          color: var(--rtx-tick-chart-text);
        }
        .dark .market-watch-type .market-watch-search-field {
          background: var(--surface);
          border-color: #3b3b3b;
        }
        .market-watch-type,
        .market-watch-type * {
          font-size: var(--market-watch-font-size) !important;
          font-weight: var(--workspace-ui-font-weight, 400) !important;
          line-height: 1.35;
        }
        .market-watch-type .market-data-tab {
          font-size: 12px !important;
          font-weight: 500 !important;
          line-height: 1.35 !important;
        }
        .market-watch-type .market-data-tab.is-active {
          font-weight: 600 !important;
          background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
          color: var(--accent-text);
        }
        .market-watch-type .market-watch-search-area {
          flex: 0 0 auto;
          padding: 8px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
        }
        .market-watch-type .market-watch-search-field {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          min-width: 0;
          height: 30px;
          padding: 0 8px 0 9px;
          border: 1px solid var(--border);
          border-radius: 5px;
          background: var(--surface-2);
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

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'Symbols' && renderSymbols()}
        {activeTab === 'Details' && (
          <div className="flex-1 min-h-0 overflow-auto bg-[var(--surface)]">
            {renderDetails()}
          </div>
        )}
        {activeTab === 'Ticks' && renderTicks()}
      </div>

      <div className={compact ? 'flex items-end px-2 pt-1.5' : 'flex items-end px-3 pt-3'} style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
        <div className="flex gap-1 w-full border-b" style={{ borderColor: 'var(--border)' }}>
          {['Symbols', 'Details', 'Ticks'].map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`
                market-data-tab ${compact ? 'px-2 py-1.5' : 'px-4 py-2'} font-medium text-xs rounded-t-md transition-colors relative mb-[-1px] border border-b-0
                ${activeTab === tab
                  ? 'is-active z-10'
                  : 'bg-transparent text-[var(--text-3)] border-transparent hover:text-[var(--text-2)] hover:bg-[var(--surface-hover)]'}
              `}
              style={{
                borderColor: activeTab === tab ? 'color-mix(in srgb, var(--accent) 46%, var(--border))' : 'transparent',
                borderBottom: activeTab === tab ? '2px solid var(--accent)' : 'none',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Skip the workspace-wide re-render on route changes; props are primitives.
export default memo(MarketData);
