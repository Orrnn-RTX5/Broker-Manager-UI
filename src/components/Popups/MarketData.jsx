import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react';
import useSymbolStore from '../../store/symbolStore';
import {
  sortMarketWatchQuotes,
} from '../../utils/marketWatchQuotes';

const MAX_TICKS = 1000;
const SYMBOL_CLICK_DELAY_MS = 300;
const COMPACT_QUOTE_ROW_HEIGHT = 27;
const COMPACT_QUOTE_OVERSCAN = 10;
const COMPACT_QUOTE_FALLBACK_VIEWPORT_HEIGHT = 540;

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

const MarketQuoteRow = memo(function MarketQuoteRow({
  compact,
  isConnected,
  onOpenTicks,
  onSelect,
  quote,
  selected,
}) {
  const isUp = quote.dir === 'up';

  return (
    <tr
      onClick={() => onSelect(quote)}
      onDoubleClick={() => onOpenTicks(quote)}
      className={`market-row cursor-pointer ${selected ? 'is-selected' : ''}`}
    >
      <td className={`${compact ? 'px-2 py-1.5 text-center font-medium' : 'px-3 py-2 font-medium'} market-quote-symbol`} style={{ borderRight: '1px solid var(--border)' }}>
        <div className={compact ? 'flex items-center justify-center gap-1 whitespace-nowrap' : 'flex items-center gap-1.5'}>
          {isUp
            ? <ArrowUpRight size={compact ? 11 : 14} style={{ color: 'var(--market-direction-up)' }} strokeWidth={2.5} />
            : <ArrowDownRight size={compact ? 11 : 14} style={{ color: 'var(--market-direction-down)' }} strokeWidth={2.5} />}
          <span>{quote.symbol}</span>
          {!compact && quote.isStale && (
            <span className="ml-1 text-[9px] uppercase font-bold" style={{ color: 'var(--muted)' }}>
              {isConnected ? 'No fresh tick' : 'Cached'}
            </span>
          )}
        </div>
      </td>
      <td className={`${compact ? 'px-1.5 py-1.5 text-center font-mono tabular-nums whitespace-nowrap' : 'px-3 py-2 text-right font-mono tabular-nums'} market-quote-price`} style={{ borderRight: '1px solid var(--border)', color: isUp ? 'var(--market-value-up)' : 'var(--market-value-down)' }}>
        <span key={`${quote.symbol}-bid-${quote.bid}`} className={isUp ? 'flash-up' : 'flash-down'}>
          {quote.bid}
        </span>
      </td>
      <td className={`${compact ? 'px-1.5 py-1.5 text-center font-mono tabular-nums whitespace-nowrap' : 'px-3 py-2 text-right font-mono tabular-nums'} market-quote-price`} style={{ borderRight: compact ? '1px solid var(--border)' : undefined, color: isUp ? 'var(--market-value-up)' : 'var(--market-value-down)' }}>
        <span key={`${quote.symbol}-ask-${quote.ask}`} className={isUp ? 'flash-up' : 'flash-down'}>
          {quote.ask}
        </span>
      </td>
      {compact && (
        <td className="market-quote-price px-1.5 py-1.5 text-center font-mono tabular-nums whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
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
  const chartRef = useRef(null);
  const selectedSymbolRef = useRef(null);
  const tickCacheRef = useRef(new Map());
  const symbolClickTimer = useRef(null);
  useEffect(() => () => clearTimeout(symbolClickTimer.current), []);
  const symbolsViewportRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [symbolsViewport, setSymbolsViewport] = useState({ height: 0, scrollTop: 0 });

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

    const nextTick = {
      bid: toNumber(quote.bid),
      ask: toNumber(quote.ask),
      time: quote.lastUpdate || Date.now(),
    };

    const previousTicks = tickCacheRef.current.get(symbol) || [];
    const next = [...previousTicks.slice(-(MAX_TICKS - 1)), nextTick];
    tickCacheRef.current.set(symbol, next);
    setTickHistory(next);
  }), []);

  const selectQuote = useCallback((quote, nextTab) => {
    selectedSymbolRef.current = quote.symbol;
    setSelectedSymbol(quote.symbol);
    const latestQuote = useSymbolStore.getState().symbols?.[quote.symbol] || quote;
    const cached = tickCacheRef.current.get(quote.symbol) || [];
    const latestTick = {
      bid: toNumber(latestQuote.bid),
      ask: toNumber(latestQuote.ask),
      time: latestQuote.lastUpdate || 0,
    };
    const last = cached[cached.length - 1];
    const history = last?.bid === latestTick.bid && last?.ask === latestTick.ask
      ? cached : [...cached.slice(-(MAX_TICKS - 1)), latestTick];
    tickCacheRef.current.delete(quote.symbol);
    tickCacheRef.current.set(quote.symbol, history);
    if (tickCacheRef.current.size > 32) tickCacheRef.current.delete(tickCacheRef.current.keys().next().value);
    setTickHistory(history);
    setActiveTab(nextTab);
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
    if (tab !== 'Symbols' && !selectedQuote && liveQuotes.length > 0) {
      selectQuote(liveQuotes[0], tab);
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
    <div
      className="shrink-0 px-2 py-1.5"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--muted)' }}
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSearchSymbol();
          }}
          placeholder="Search symbols…"
          aria-label="Search market symbols"
          className="ui-input ui-input-sm h-7 w-full text-[11px]"
          style={{ paddingLeft: 29 }}
        />
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
            <th className={compact ? 'px-2 py-1.5 font-medium w-[38%] text-center whitespace-nowrap' : 'px-3 py-2 font-medium w-1/3'} style={{ borderRight: '1px solid var(--border)' }}>Symbol</th>
            <th className={compact ? 'px-1.5 py-1.5 font-medium w-[22%] text-center whitespace-nowrap' : 'px-3 py-2 font-medium w-1/3 text-right'} style={{ borderRight: '1px solid var(--border)' }}>Bid</th>
            <th className={compact ? 'px-1.5 py-1.5 font-medium w-[22%] text-center whitespace-nowrap' : 'px-3 py-2 font-medium w-1/3 text-right'} style={{ borderRight: '1px solid var(--border)' }}>Ask</th>
            {compact && <th className="px-1.5 py-1.5 font-medium w-[18%] text-center whitespace-nowrap">Spread</th>}
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
        <div className="font-semibold text-lg pb-3 mb-3 border-b flex justify-between items-center" style={{ color: 'var(--accent)', borderColor: 'var(--border)' }}>
          <span>{selectedQuote.symbol}</span>
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
                  {item.isUp === true ? <ArrowUpRight size={14} style={{ color: 'var(--market-direction-up)' }} strokeWidth={2.5} /> : null}
                  {item.isUp === false ? <ArrowDownRight size={14} style={{ color: 'var(--market-direction-down)' }} strokeWidth={2.5} /> : null}
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

    if (tickHistory.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
          Waiting for ticks...
        </div>
      );
    }

    const bids = tickHistory.map((tick) => tick.bid);
    const minBid = Math.min(...bids);
    const maxBid = Math.max(...bids);
    const range = maxBid - minBid || 0.0001;
    const minPrice = minBid - range * 0.1;
    const maxPrice = maxBid + range * 0.1;
    const finalRange = maxPrice - minPrice;
    const isUp = tickHistory.length > 1 && tickHistory[tickHistory.length - 1].bid >= tickHistory[0].bid;
    const lineColor = isUp ? 'var(--market-value-up)' : 'var(--market-value-down)';

    const points = tickHistory.map((tick, index) => {
      const x = (index / Math.max(tickHistory.length - 1, 1)) * 100;
      const y = 100 - (((tick.bid - minPrice) / finalRange) * 100);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="market-quote-ticks flex-1 min-h-0 min-w-0 overflow-hidden relative flex flex-col gap-2 p-2 bg-[var(--surface-2)]">
        <div className="shrink-0 font-semibold" style={{ color: 'var(--accent)' }}>{selectedQuote.symbol}</div>
        <div className="shrink-0 px-2 py-1.5 text-xs rounded ui-card font-mono font-medium" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}>
          {tickHistory.length > 0
            ? `${tickHistory[tickHistory.length - 1].bid.toFixed(5)} / ${tickHistory[tickHistory.length - 1].ask.toFixed(5)}`
            : 'Waiting for ticks...'}
        </div>
        <div
          ref={chartRef}
          className="flex-1 min-h-0 relative rounded ui-card"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            backgroundImage: 'radial-gradient(circle, var(--border-3) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          {tickHistory.length > 0 && (
            <svg aria-label={`${selectedQuote.symbol} bid price chart`} role="img" className="w-full h-full absolute inset-0 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ overflow: 'hidden' }}>
              {tickHistory.length === 1
                ? <circle cx="50" cy="50" r="1.5" fill={lineColor} />
                : <polyline fill="none" stroke={lineColor} strokeWidth="0.5" points={points} />}
            </svg>
          )}
        </div>
        <div className="shrink-0 flex justify-between gap-2" style={{ color: 'var(--text-3)' }}>
          <span>{isConnected && !selectedQuote.isStale ? 'Live price changes' : 'Cached prices'}</span>
          <span>{tickHistory.length} points</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`market-data market-watch-type workspace-ui flex flex-col h-full w-full overflow-hidden text-sm ${compact ? 'market-data-compact' : ''}`} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
      <style>{`
        /* The compact panel is scanned as one data grid, so all of its
           labels, values and controls share the same visual weight. */
        .market-watch-type {
          --market-watch-font-size: var(--workspace-ui-small-font-size, 10px);
        }
        .dark .market-watch-type {
          /* Lift and soften the green/red bases for small text on charcoal. */
          --market-value-up: rgb(88, 174, 104);
          --market-value-down: rgb(235, 112, 112);
          --market-direction-up: var(--market-value-up);
          --market-direction-down: var(--market-value-down);
          --cc-market-glow-up: rgba(0, 128, 0, 0.12);
          --cc-market-glow-down: rgba(255, 0, 0, 0.10);
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
          background: color-mix(in srgb, var(--accent) 12%, transparent);
          color: var(--accent-text);
        }
        @keyframes flashTextUp {
          0% { color: var(--market-value-up); text-shadow: 0 0 8px var(--cc-market-glow-up, rgba(0, 168, 255, 0.4)); }
          100% { color: var(--market-value-up); text-shadow: none; }
        }
        @keyframes flashTextDown {
          0% { color: var(--market-value-down); text-shadow: 0 0 8px var(--cc-market-glow-down, rgba(255, 59, 82, 0.4)); }
          100% { color: var(--market-value-down); text-shadow: none; }
        }
        .flash-up { animation: flashTextUp 0.8s ease-out forwards; }
        .flash-down { animation: flashTextDown 0.8s ease-out forwards; }
        .market-row { transition: background-color 0.1s ease; border-bottom: 1px solid var(--border); }
        .market-row:hover { background: var(--surface-hover, rgba(120, 120, 120, 0.05)); }
        .market-row.is-selected { background: var(--surface-hover, rgba(120, 120, 120, 0.1)); }
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

export default MarketData;
