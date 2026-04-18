import { useState, useRef, useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { buildFeedWsUrl } from '../../config/endpoints';

// ─── MEASUREMENT ────────────────────────────────────────────────────────────
// These counters are module-level so they survive re-renders and are shared
// between QuoteRow and MarketData without prop drilling.
const perf = {
  rowRenders: 0,      // how many times any QuoteRow function body ran
  ticks: 0,           // how many price tick messages were processed
  messages: 0,        // how many onmessage events fired
  windowStart: Date.now(),
};

// Flush stats to console every 5 seconds so you see REAL numbers.
// Open DevTools → Console and watch this while the feed is live.
let _statsTimer = null;
const startPerfTimer = () => {
  if (_statsTimer) return;
  _statsTimer = setInterval(() => {
    const elapsed = (Date.now() - perf.windowStart) / 1000;
    const symbolCount = document.querySelectorAll('[data-quote-row]').length;
    console.table({
      'Symbols in table':       { value: symbolCount },
      'WS messages / 5 s':      { value: perf.messages },
      'Price ticks / 5 s':      { value: perf.ticks },
      'Row renders / 5 s':      { value: perf.rowRenders },
      'Row renders / tick':     { value: perf.ticks ? (perf.rowRenders / perf.ticks).toFixed(1) : '-' },
      'Row renders / sec':      { value: (perf.rowRenders / elapsed).toFixed(1) },
      // If memo is working: "Row renders / tick" should be ≈ 1
      // Without memo it equals the symbol count (e.g. 150)
    });
    perf.rowRenders  = 0;
    perf.ticks       = 0;
    perf.messages    = 0;
    perf.windowStart = Date.now();
  }, 5000);
};
const stopPerfTimer = () => { clearInterval(_statsTimer); _statsTimer = null; };

// ─── MEMOIZED ROW ────────────────────────────────────────────────────────────
// Problem A fix: each row is its own isolated component.
// React.memo means: "if item + selected + onSelect are the same as last render,
// skip running this function entirely."
// Because the parent only replaces the ONE changed slot in the quotes array,
// all other rows get the same object reference → memo skips them → 0 work.
const QuoteRow = memo(({ item, selected, onSelect }) => {
  // Every time this line executes, the row actually ran (was not skipped by memo).
  perf.rowRenders++;

  return (
    <tr
      data-quote-row
      onDoubleClick={() => onSelect(item)}
      className={`h-5 border-b border-[#333333] hover:bg-[#2d2d30] cursor-pointer ${selected ? 'bg-[#2a2d3e]' : ''}`}
    >
      <td className="px-1.5 py-0.5 border-r border-[#333333] flex items-center gap-1">
        {item.dir === 'up' ? (
          <ArrowUpRight size={10} className="text-[#3b82f6]" strokeWidth={2.5} />
        ) : (
          <ArrowDownRight size={10} className="text-[#ef4444]" strokeWidth={2.5} />
        )}
        <span>{item.symbol}</span>
      </td>
      <td className={`px-1.5 py-0.5 border-r border-[#333333] text-right ${item.dir === 'up' ? 'text-[#3b82f6]' : 'text-[#ef4444]'}`}>
        <span key={`${item.symbol}-bid-${item.bid}`} className={item.dir === 'up' ? 'flash-up' : 'flash-down'}>
          {item.bid}
        </span>
      </td>
      <td className={`px-1.5 py-0.5 text-right ${item.dir === 'up' ? 'text-[#3b82f6]' : 'text-[#ef4444]'}`}>
        <span key={`${item.symbol}-ask-${item.ask}`} className={item.dir === 'up' ? 'flash-up' : 'flash-down'}>
          {item.ask}
        </span>
      </td>
    </tr>
  );
});

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const MarketData = () => {
  const [activeTab, setActiveTab] = useState('Symbols');
  const [liveQuotes, setLiveQuotes] = useState([]);

  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [tickHistory, setTickHistory] = useState([]);
  const selectedSymbolRef = useRef(selectedSymbol);

  const chartRef = useRef(null);

  useEffect(() => {
    selectedSymbolRef.current = selectedSymbol;
  }, [selectedSymbol]);

  useEffect(() => {
    let ws;
    let reconnectTimeout;

    const connectWebSocket = () => {
      ws = new WebSocket('ws://69.197.178.27/ws/feed');

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', symbols: ["*"] }));
      };

      ws.onmessage = (e) => {
        try {
          const messages = e.data.trim().split('\n');
          
          setLiveQuotes(prevQuotes => {
            let hasUpdates = false;
            const nextQuotes = [...prevQuotes];

            messages.forEach(msgStr => {
              if (!msgStr) return;
              const msg = JSON.parse(msgStr);
              if (msg.symbol && msg.bid && msg.ask) {
                const index = nextQuotes.findIndex(q => q.symbol === msg.symbol);
                if (index !== -1) {
                  const oldQuote = nextQuotes[index];
                  const oldBidNum = parseFloat(oldQuote.bid);
                  const newBidNum = msg.bid;
                  
                  const newBidStr = msg.bid.toFixed(5);
                  const newAskStr = msg.ask.toFixed(5);
                  
                  if (msg.symbol === selectedSymbolRef.current) {
                    setTickHistory(prev => {
                      const newTick = { bid: newBidNum, ask: msg.ask, time: Date.now() };
                      const updated = [...prev, newTick];
                      if (updated.length > 1000) return updated.slice(-1000); 
                      return updated;
                    });
                  }

                  if (newBidStr !== oldQuote.bid || newAskStr !== oldQuote.ask) {
                    nextQuotes[index] = {
                      ...oldQuote,
                      bid: newBidStr,
                      ask: newAskStr,
                      dir: newBidNum > oldBidNum ? 'up' : (newBidNum < oldBidNum ? 'down' : oldQuote.dir),
                      session: msg.session || oldQuote.session,
                      daily_open: msg.daily_open || oldQuote.daily_open,
                      previous_close: msg.previous_close || oldQuote.previous_close
                    };
                    hasUpdates = true;
                  }
                } else {
                  nextQuotes.push({
                    symbol: msg.symbol,
                    bid: msg.bid.toFixed(5),
                    ask: msg.ask.toFixed(5),
                    dir: 'up',
                    session: msg.session,
                    daily_open: msg.daily_open,
                    previous_close: msg.previous_close
                  });
                  hasUpdates = true;
                }
              }
            });

            if (hasUpdates) {
              if (nextQuotes.length > prevQuotes.length) {
                nextQuotes.sort((a, b) => a.symbol.localeCompare(b.symbol));
              }
              return nextQuotes;
            }
            return prevQuotes;
          });
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error', err);
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        }
      }
    };
  }, []);

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

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'Symbols' && (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="select-none sticky top-0 z-10 text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
                  <th className="px-3 py-2 font-medium w-1/3" style={{ borderRight: '1px solid var(--border)' }}>Symbol</th>
                  <th className="px-3 py-2 font-medium w-1/3 text-right" style={{ borderRight: '1px solid var(--border)' }}>Bid</th>
                  <th className="px-3 py-2 font-medium w-1/3 text-right">Ask</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {liveQuotes.map((item) => (
                  <tr 
                    key={item.symbol} 
                    onDoubleClick={() => {
                      setSelectedSymbol(item.symbol);
                      setTickHistory([{ bid: parseFloat(item.bid), ask: parseFloat(item.ask), time: Date.now() }]);
                      setActiveTab('Ticks');
                    }}
                    className={`market-row cursor-pointer ${selectedSymbol === item.symbol ? 'is-selected' : ''}`}
                  >
                    <td className="px-3 py-2 flex items-center gap-1.5 font-medium" style={{ borderRight: '1px solid var(--border)' }}>
                      {item.dir === 'up' ? (
                        <ArrowUpRight size={14} style={{ color: 'var(--ok-text)' }} strokeWidth={2.5} />
                      ) : (
                        <ArrowDownRight size={14} style={{ color: 'var(--danger-text)' }} strokeWidth={2.5} />
                      )}
                      <span>{item.symbol}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ borderRight: '1px solid var(--border)', color: item.dir === 'up' ? 'var(--ok-text)' : 'var(--danger-text)' }}>
                      <span key={`${item.symbol}-bid-${item.bid}`} className={item.dir === 'up' ? 'flash-up' : 'flash-down'}>
                        {item.bid}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: item.dir === 'up' ? 'var(--ok-text)' : 'var(--danger-text)' }}>
                      <span key={`${item.symbol}-ask-${item.ask}`} className={item.dir === 'up' ? 'flash-up' : 'flash-down'}>
                        {item.ask}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'Details' && (
          <div className="flex-1 overflow-auto p-4 md:p-6 bg-[var(--surface-2)]">
            {!selectedSymbol ? (
              <div className="flex-1 flex items-center justify-center h-full text-sm" style={{ color: 'var(--muted)' }}>
                Double-click a symbol in the Symbols tab to view its details.
              </div>
            ) : (() => {
               const quote = liveQuotes.find(q => q.symbol === selectedSymbol) || {};
               const session = quote.session || {};
               const bid = parseFloat(quote.bid) || 0;
               const close = parseFloat(quote.previous_close) || 0;
               
               let dailyChange = '-';
               let isChangeUp = null;
               
               if (bid && close) {
                 const changeCalc = ((bid - close) / close) * 100;
                 dailyChange = changeCalc.toFixed(2) + '%';
                 isChangeUp = changeCalc >= 0;
               }

               const formatVal = (val) => (!isNaN(val) && val !== null && val !== undefined && val !== '') ? Number(val).toFixed(5) : '-';

               const detailsData = [
                 { label: 'Bid', value: formatVal(quote.bid), isUp: quote.dir === 'up' },
                 { label: 'Ask', value: formatVal(quote.ask), isUp: quote.dir === 'up' },
                 { label: 'Bid High', value: formatVal(session.high_bid) },
                 { label: 'Bid Low', value: formatVal(session.low_bid) },
                 { label: 'Ask High', value: formatVal(session.high_ask) },
                 { label: 'Ask Low', value: formatVal(session.low_ask) },
                 { label: 'Open Price', value: formatVal(quote.daily_open) },
                 { label: 'Previous Close', value: formatVal(quote.previous_close) },
                 { label: 'Daily Change', value: dailyChange, isUp: isChangeUp }
               ];

               return (
                 <div className="ui-card p-5 mx-auto max-w-sm bg-[var(--surface)] shadow-md border" style={{ borderColor: 'var(--border)' }}>
                   <div className="font-semibold text-lg pb-3 mb-3 border-b flex justify-between items-center" style={{ color: 'var(--accent)', borderColor: 'var(--border)' }}>
                     <span>{selectedSymbol}</span>
                     <span className="text-xs px-2 py-1 bg-[var(--surface-2)] rounded font-mono font-normal tracking-wide text-[var(--text-2)]">Details</span>
                   </div>
                   <table className="w-full text-left border-collapse text-sm">
                     <tbody className="tabular-nums">
                       {detailsData.map((item, idx) => (
                         <tr key={idx} className="market-row" style={{ borderBottom: idx !== detailsData.length - 1 ? '1px solid var(--border-3)' : 'none' }}>
                           <td className="py-2.5 text-xs font-medium" style={{ color: 'var(--text-3)' }}>
                             {item.label}
                           </td>
                           <td className="py-2.5 text-right font-medium flex justify-end items-center gap-1.5" style={{ color: item.isUp === true ? 'var(--ok-text)' : (item.isUp === false ? 'var(--danger-text)' : 'var(--text)') }}>
                             {item.isUp === true ? (
                               <ArrowUpRight size={14} strokeWidth={2.5} />
                             ) : item.isUp === false ? (
                               <ArrowDownRight size={14} strokeWidth={2.5} />
                             ) : null}
                             <span className="font-mono text-[13px]">{item.value}</span>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               );
            })()}
          </div>
        )}

        {activeTab === 'Ticks' && (
          <div className="flex-1 overflow-hidden relative flex flex-col p-3 bg-[var(--surface-2)]">
            {!selectedSymbol ? (
              <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--muted)' }}>
                Double-click a symbol in the Symbols tab to view its live tick chart.
              </div>
            ) : (
              <>
                 <div className="absolute top-5 left-5 px-3 py-1.5 text-xs rounded shadow-sm z-10 ui-card font-mono font-medium" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                   {tickHistory.length > 0 ? `${tickHistory[tickHistory.length-1].bid.toFixed(5)} / ${tickHistory[tickHistory.length-1].ask.toFixed(5)}` : 'Waiting for ticks...'}
                 </div>
                 <div className="absolute top-5 left-48 font-bold tracking-wide text-sm z-10" style={{ color: 'var(--accent)' }}>{selectedSymbol}</div>
                 
                 <div 
                   ref={chartRef}
                   className="flex-1 relative mt-[50px] mb-[30px] ml-1 mr-[60px] rounded-lg shadow-inner ui-card" 
                   style={{
                     border: '1px solid var(--border)',
                     background: 'var(--surface)',
                     backgroundImage: `radial-gradient(circle, var(--border-3) 1px, transparent 1px)`,
                     backgroundSize: '20px 20px'
                 }}>
                   {(() => {
                     if (tickHistory.length < 2) return null;
                     
                     const bids = tickHistory.map(t => t.bid);
                     const minBid = Math.min(...bids);
                     const maxBid = Math.max(...bids);
                     
                     const range = maxBid - minBid || 0.0001;
                     const padding = range * 0.10;
                     const minP = minBid - padding;
                     const maxP = maxBid + padding;
                     const finalRange = maxP - minP;

                     const width = 100;

                     const getPoints = (isAsk) => {
                       return tickHistory.map((t, i) => {
                         const x = (i / Math.max(tickHistory.length - 1, 1)) * width;
                         const val = isAsk ? t.ask : t.bid;
                         const y = 100 - (((val - minP) / finalRange) * 100);
                         return `${x},${y}`;
                       }).join(' ');
                     };

                     const isUp = tickHistory[tickHistory.length - 1].bid >= tickHistory[0].bid;
                     const mainColor = isUp ? "var(--ok-text)" : "var(--danger-text)"; 

                     const currentBid = tickHistory[tickHistory.length - 1].bid;
                     const currentY = Math.max(0, Math.min(100, 100 - (((currentBid - minP) / finalRange) * 100)));

                     const yAxisLabels = [0, 0.25, 0.5, 0.75, 1].map(percent => {
                       const y = 100 - (percent * 100);
                       const val = minP + (finalRange * percent);
                       return (
                         <div key={percent} className="absolute right-[-58px] w-[50px] text-[10px] text-left select-none font-mono" style={{ color: 'var(--text-3)', top: `${y}%`, transform: 'translateY(-50%)' }}>
                           {val.toFixed(2)}
                         </div>
                       );
                     });

                     const startTime = tickHistory[0].time;
                     const endTime = tickHistory[tickHistory.length - 1].time;
                     const xTimeLabels = [0, 0.2, 0.4, 0.6, 0.8, 1].map(percent => {
                       const time = startTime + (endTime - startTime) * percent;
                       const dateObj = new Date(time);
                       return (
                         <div key={percent} className="absolute bottom-[-24px] text-[10px] whitespace-nowrap select-none font-mono" style={{ color: 'var(--text-3)', left: `${percent * 100}%`, transform: 'translateX(-50%)' }}>
                           {dateObj.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                         </div>
                       );
                     });

                     return (
                       <>
                         <svg className="w-full h-full absolute inset-0 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ overflow: 'hidden' }}>
                           <polyline 
                             fill="none" 
                             stroke={mainColor} 
                             strokeWidth="0.5"
                             points={getPoints(false)}
                           />
                           <line 
                             x1="0" y1={currentY} x2="100" y2={currentY} 
                             stroke={mainColor} 
                             strokeWidth="0.2" 
                             strokeDasharray="1,2" 
                           />
                         </svg>

                         {yAxisLabels}
                         {xTimeLabels}

                         <div className="absolute right-[-64px] w-[58px] text-[11px] font-semibold text-white text-center py-0.5 rounded shadow-sm z-20 select-none font-mono"
                           style={{
                             backgroundColor: 'var(--accent)',
                             top: `${currentY}%`,
                             transform: 'translateY(-50%)'
                           }}>
                           {currentBid.toFixed(2)}
                         </div>
                       </>
                     );
                   })()}
                 </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
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
                borderBottom: activeTab === tab ? '2px solid var(--surface)' : 'none'
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
