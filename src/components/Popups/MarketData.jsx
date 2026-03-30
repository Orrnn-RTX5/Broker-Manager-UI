import { useState, useRef, useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

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
    <div className="bg-[#1e1e1e] flex flex-col h-full w-full text-gray-200 font-mono">
      <style>{`
        @keyframes flashTextUp {
          0% { color: #ffffff; text-shadow: 0 0 8px rgba(59, 130, 246, 0.8); }
          100% { color: #3b82f6; text-shadow: none; }
        }
        @keyframes flashTextDown {
          0% { color: #ffffff; text-shadow: 0 0 8px rgba(239, 68, 68, 0.8); }
          100% { color: #ef4444; text-shadow: none; }
        }
        .flash-up { animation: flashTextUp 0.8s ease-out forwards; }
        .flash-down { animation: flashTextDown 0.8s ease-out forwards; }
      `}</style>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
        {activeTab === 'Symbols' && (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-[#252526] text-[11px] text-gray-300 h-6 select-none sticky top-0 z-10 border-b border-[#333333]">
                  <th className="px-1.5 py-0.5 font-normal w-1/3 border-r border-[#333333]">Symbol</th>
                  <th className="px-1.5 py-0.5 font-normal w-1/3 border-r border-[#333333] text-right">Bid</th>
                  <th className="px-1.5 py-0.5 font-normal w-1/3 text-right">Ask</th>
                </tr>
              </thead>
              <tbody className="text-[12px]">
                {liveQuotes.map((item) => (
                  <tr 
                    key={item.symbol} 
                    onDoubleClick={() => {
                      setSelectedSymbol(item.symbol);
                      setTickHistory([{ bid: parseFloat(item.bid), ask: parseFloat(item.ask), time: Date.now() }]);
                      setActiveTab('Ticks');
                    }}
                    className={`h-5 border-b border-[#333333] hover:bg-[#2d2d30] cursor-pointer ${selectedSymbol === item.symbol ? 'bg-[#2a2d3e]' : ''}`}
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
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'Details' && (
          <div className="flex-1 overflow-auto">
            {!selectedSymbol ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-[11px] h-full">
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

               const formatVal = (val) => (!isNaN(val) && val !== null && val !== undefined && val !== '') ? Number(val).toFixed(2) : '-';

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
                 <>
                   <div className="p-1 px-2 text-[#3b82f6] text-[12px] tracking-wide">{selectedSymbol}</div>
                   <table className="w-full text-left border-collapse mt-1">
                     <tbody className="text-[12px]">
                       {detailsData.map((item, idx) => (
                         <tr key={idx} className="h-5 border-b border-[#333333] hover:bg-[#2d2d30]">
                           <td className="px-2 py-0.5 border-r border-[#333333] text-gray-300 w-1/2 flex items-center gap-1.5">
                             {item.isUp === true ? (
                               <ArrowUpRight size={10} className="text-[#3b82f6]" strokeWidth={2.5} />
                             ) : item.isUp === false ? (
                               <ArrowDownRight size={10} className="text-[#ef4444]" strokeWidth={2.5} />
                             ) : (
                               <div className="w-2.5 h-2.5 flex items-center justify-center"><div className="w-1 h-1 bg-gray-500 rounded-full"></div></div>
                             )}
                             {item.label}
                           </td>
                           <td className={`px-2 py-0.5 text-right w-1/2 ${item.isUp === true ? 'text-[#3b82f6]' : (item.isUp === false ? 'text-[#ef4444]' : 'text-gray-300')}`}>
                             {item.value}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </>
               );
            })()}
          </div>
        )}

        {activeTab === 'Ticks' && (
          <div className="flex-1 overflow-hidden relative bg-[#1e1e1e] flex flex-col p-1">
            {!selectedSymbol ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-[11px]">
                Double-click a symbol in the Symbols tab to view its live tick chart.
              </div>
            ) : (
              <>
                 <div className="absolute top-1 left-1 bg-[#2d2d30] px-1 text-[11px] text-gray-300 border border-[#404040] z-10 hover:bg-[#333] transition-colors shadow-sm">
                   {tickHistory.length > 0 ? `${tickHistory[tickHistory.length-1].bid.toFixed(5)} / ${tickHistory[tickHistory.length-1].ask.toFixed(5)}` : 'Waiting for ticks...'}
                 </div>
                 <div className="text-[11px] text-gray-300 absolute top-1 left-32 font-bold tracking-wide">{selectedSymbol}</div>
                 
                 {/* MT5 Chart Style */}
                 <div 
                   ref={chartRef}
                   className="flex-1 relative mt-8 mb-5 ml-1 mr-[52px] border border-[#333] bg-[#0a0a0a]" 
                   style={{
                     backgroundImage: `radial-gradient(circle, #333333 1px, transparent 1px)`,
                     backgroundSize: '15px 15px'
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
                     const mainColor = isUp ? "#22c55e" : "#ef4444"; 

                     const currentBid = tickHistory[tickHistory.length - 1].bid;
                     const currentY = Math.max(0, Math.min(100, 100 - (((currentBid - minP) / finalRange) * 100)));

                     const yAxisLabels = [0, 0.25, 0.5, 0.75, 1].map(percent => {
                       const y = 100 - (percent * 100);
                       const val = minP + (finalRange * percent);
                       return (
                         <div key={percent} className="absolute right-[-50px] w-[45px] text-[#777] text-[10px] text-left select-none" style={{ top: `${y}%`, transform: 'translateY(-50%)' }}>
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
                         <div key={percent} className="absolute bottom-[-18px] text-[#777] text-[10px] whitespace-nowrap select-none" style={{ left: `${percent * 100}%`, transform: 'translateX(-50%)' }}>
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

                         <div className="absolute right-[-52px] w-[52px] text-[11px] font-semibold text-white text-center px-0.5 rounded-[2px] z-20 select-none bg-blue-600 shadow-sm"
                           style={{
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
      <div className="h-6 bg-[#252526] flex items-end">
        {['Symbols', 'Details', 'Ticks'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-3 h-[23px] flex items-center justify-center text-[11px] select-none border-t border-r border-[#333333] relative top-[1px]
              ${activeTab === tab 
                ? 'bg-[#1e1e1e] text-gray-200 border-t-blue-500 border-t-[2px] border-b-[#1e1e1e] border-b-[1px] z-10' 
                : 'bg-[#2d2d30] text-gray-400 hover:bg-[#333333] hover:text-gray-300 border-[#333333] border-b-[1px]'}
            `}
          >
            {tab}
          </button>
        ))}
        <div className="flex-1 h-[23px] border-b border-[#333333]"></div>
      </div>
    </div>
  );
};

export default MarketData;
