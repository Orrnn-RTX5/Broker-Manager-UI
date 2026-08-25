import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import useSymbolStore from '../../store/symbolStore';
import {
  sortMarketWatchQuotes,
  summarizeMarketWatchQuotes,
} from '../../utils/marketWatchQuotes';

const MAX_TICKS = 1000;

const toDisplayPrice = (value, fallback = '0.00000') => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : fallback;
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatDetailValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && value !== '' && value !== null && value !== undefined
    ? number.toFixed(2)
    : '-';
};

const normalizeQuote = (entry = {}) => ({
  ...entry,
  symbol: String(entry.symbol || '').trim(),
  bid: toDisplayPrice(entry.bid),
  ask: toDisplayPrice(entry.ask),
  dir: entry.dir === 'down' ? 'down' : 'up',
  session: entry.session || {},
});

const MarketData = () => {
  const [activeTab, setActiveTab] = useState('Symbols');
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [tickHistory, setTickHistory] = useState([]);
  const chartRef = useRef(null);
  const selectedSymbolRef = useRef(null);

  const {
    feedError,
    initWebSocket,
    isConnected,
    symbols,
  } = useSymbolStore(useShallow((state) => ({
    feedError: state.feedError,
    initWebSocket: state.initWebSocket,
    isConnected: state.isConnected,
    symbols: state.symbols,
  })));

  useEffect(() => {
    initWebSocket();
  }, [initWebSocket]);

  const liveQuotes = useMemo(() => (
    sortMarketWatchQuotes(Object.values(symbols || {})
      .map(normalizeQuote)
      .filter((quote) => quote.symbol))
  ), [symbols]);

  const quoteSummary = useMemo(
    () => summarizeMarketWatchQuotes(liveQuotes),
    [liveQuotes]
  );

  const selectedQuote = useMemo(
    () => liveQuotes.find((quote) => quote.symbol === selectedSymbol) || null,
    [liveQuotes, selectedSymbol]
  );

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

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

    setTickHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.bid === nextTick.bid && last.ask === nextTick.ask) return prev;
      const next = [...prev, nextTick];
      return next.length > MAX_TICKS ? next.slice(-MAX_TICKS) : next;
    });
  }), []);

  const selectQuote = (quote, nextTab = activeTab) => {
    setSelectedSymbol(quote.symbol);
    setTickHistory([{
      bid: toNumber(quote.bid),
      ask: toNumber(quote.ask),
      time: quote.lastUpdate || 0,
    }]);
    setActiveTab(nextTab);
  };

  const renderDirectionIcon = (quote, size = 14) => (
    quote.dir === 'up'
      ? <ArrowUpRight size={size} style={{ color: 'var(--ok-text)' }} strokeWidth={2.5} />
      : <ArrowDownRight size={size} style={{ color: 'var(--danger-text)' }} strokeWidth={2.5} />
  );

  const renderSymbols = () => (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-left border-collapse table-fixed">
        <thead>
          <tr
            className="select-none sticky top-0 z-10 text-xs"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}
          >
            <th className="px-3 py-2 font-medium w-1/3" style={{ borderRight: '1px solid var(--border)' }}>Symbol</th>
            <th className="px-3 py-2 font-medium w-1/3 text-right" style={{ borderRight: '1px solid var(--border)' }}>Bid</th>
            <th className="px-3 py-2 font-medium w-1/3 text-right">Ask</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          <tr>
            <td colSpan={3} className="px-3 py-2 text-[11px]" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: isConnected ? 'var(--ok-text)' : 'var(--muted)' }}
                  aria-hidden="true"
                />
                {isConnected
                  ? `Live feed connected · ${quoteSummary.live} updating · ${quoteSummary.cached} without a fresh tick`
                  : 'Connecting to live feed…'}
              </span>
            </td>
          </tr>
          {feedError && liveQuotes.length > 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-2 text-[11px]" style={{ color: 'var(--warning, var(--muted))', borderBottom: '1px solid var(--border)' }}>
                {feedError}
              </td>
            </tr>
          )}
          {feedError && liveQuotes.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--warning, var(--muted))' }}>
                {feedError}
              </td>
            </tr>
          ) : liveQuotes.map((quote) => (
            <tr
              key={quote.symbol}
              onClick={() => selectQuote(quote, activeTab)}
              onDoubleClick={() => selectQuote(quote, 'Ticks')}
              className={`market-row cursor-pointer ${selectedSymbol === quote.symbol ? 'is-selected' : ''}`}
              title={quote.isStale
                ? (isConnected ? 'Feed connected; this symbol has no fresh tick.' : 'Cached symbol data; live feed is not connected.')
                : 'Live market feed'}
            >
              <td className="px-3 py-2 flex items-center gap-1.5 font-medium" style={{ borderRight: '1px solid var(--border)' }}>
                {renderDirectionIcon(quote)}
                <span>{quote.symbol}</span>
                {quote.isStale && (
                  <span className="ml-1 text-[9px] uppercase font-bold" style={{ color: 'var(--muted)' }}>
                    {isConnected ? 'No fresh tick' : 'Cached'}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ borderRight: '1px solid var(--border)', color: quote.dir === 'up' ? 'var(--ok-text)' : 'var(--danger-text)' }}>
                <span key={`${quote.symbol}-bid-${quote.bid}`} className={quote.dir === 'up' ? 'flash-up' : 'flash-down'}>
                  {quote.bid}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: quote.dir === 'up' ? 'var(--ok-text)' : 'var(--danger-text)' }}>
                <span key={`${quote.symbol}-ask-${quote.ask}`} className={quote.dir === 'up' ? 'flash-up' : 'flash-down'}>
                  {quote.ask}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      { label: 'Bid High', value: formatDetailValue(session.high_bid) },
      { label: 'Bid Low', value: formatDetailValue(session.low_bid) },
      { label: 'Ask High', value: formatDetailValue(session.high_ask) },
      { label: 'Ask Low', value: formatDetailValue(session.low_ask) },
      { label: 'Open Price', value: formatDetailValue(selectedQuote.daily_open) },
      { label: 'Previous Close', value: formatDetailValue(selectedQuote.previous_close) },
      { label: 'Daily Change', value: dailyChange, isUp: isChangeUp },
    ];

    return (
      <div className="ui-card p-5 mx-auto max-w-sm bg-[var(--surface)] shadow-md border" style={{ borderColor: 'var(--border)' }}>
        <div className="font-semibold text-lg pb-3 mb-3 border-b flex justify-between items-center" style={{ color: 'var(--accent)', borderColor: 'var(--border)' }}>
          <span>{selectedQuote.symbol}</span>
          <span className="text-xs px-2 py-1 bg-[var(--surface-2)] rounded font-mono font-normal tracking-wide text-[var(--text-2)]">
            {isConnected ? 'Live' : 'Cached'}
          </span>
        </div>
        <table className="w-full text-left border-collapse text-sm">
          <tbody className="tabular-nums">
            {details.map((item) => (
              <tr key={item.label} className="market-row">
                <td className="py-2.5 text-xs font-medium" style={{ color: 'var(--text-3)' }}>
                  {item.label}
                </td>
                <td className="py-2.5 text-right font-medium flex justify-end items-center gap-1.5" style={{ color: item.isUp === true ? 'var(--ok-text)' : (item.isUp === false ? 'var(--danger-text)' : 'var(--text)') }}>
                  {item.isUp === true ? <ArrowUpRight size={14} strokeWidth={2.5} /> : null}
                  {item.isUp === false ? <ArrowDownRight size={14} strokeWidth={2.5} /> : null}
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
    const lineColor = isUp ? 'var(--ok-text)' : 'var(--danger-text)';

    const points = tickHistory.map((tick, index) => {
      const x = (index / Math.max(tickHistory.length - 1, 1)) * 100;
      const y = 100 - (((tick.bid - minPrice) / finalRange) * 100);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="flex-1 overflow-hidden relative flex flex-col p-3 bg-[var(--surface-2)]">
        <div className="absolute top-5 left-5 px-3 py-1.5 text-xs rounded shadow-sm z-10 ui-card font-mono font-medium" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}>
          {tickHistory.length > 0
            ? `${tickHistory[tickHistory.length - 1].bid.toFixed(2)} / ${tickHistory[tickHistory.length - 1].ask.toFixed(2)}`
            : 'Waiting for ticks...'}
        </div>
        <div className="absolute top-5 left-72 font-bold tracking-wide text-sm z-10" style={{ color: 'var(--accent)' }}>
          {selectedQuote.symbol}
        </div>
        <div
          ref={chartRef}
          className="flex-1 relative mt-[50px] mb-[30px] ml-1 mr-[60px] rounded-lg shadow-inner ui-card"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            backgroundImage: 'radial-gradient(circle, var(--border-3) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        >
          {tickHistory.length > 1 && (
            <svg className="w-full h-full absolute inset-0 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ overflow: 'hidden' }}>
              <polyline fill="none" stroke={lineColor} strokeWidth="0.5" points={points} />
            </svg>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden text-sm" style={{ background: 'var(--surface)', color: 'var(--text)' }}>
      <style>{`
        @keyframes flashTextUp {
          0% { color: var(--ok-text); text-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
          100% { color: var(--ok-text); text-shadow: none; }
        }
        @keyframes flashTextDown {
          0% { color: var(--danger-text); text-shadow: 0 0 8px rgba(239, 68, 68, 0.4); }
          100% { color: var(--danger-text); text-shadow: none; }
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
          <div className="flex-1 overflow-auto p-4 md:p-6 bg-[var(--surface-2)]">
            {renderDetails()}
          </div>
        )}
        {activeTab === 'Ticks' && renderTicks()}
      </div>

      <div className="flex items-end px-3 pt-3" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
        <div className="flex gap-1 w-full border-b" style={{ borderColor: 'var(--border)' }}>
          {['Symbols', 'Details', 'Ticks'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                px-4 py-2 font-medium text-xs rounded-t-md transition-colors relative mb-[-1px] border border-b-0
                ${activeTab === tab
                  ? 'bg-[var(--surface)] text-[var(--accent)] z-10'
                  : 'bg-transparent text-[var(--text-3)] border-transparent hover:text-[var(--text-2)] hover:bg-[var(--surface-hover)]'}
              `}
              style={{
                borderColor: activeTab === tab ? 'var(--border)' : 'transparent',
                borderBottom: activeTab === tab ? '2px solid var(--surface)' : 'none',
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
