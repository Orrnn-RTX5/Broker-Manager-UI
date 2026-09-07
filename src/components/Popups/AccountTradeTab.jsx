import { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Activity,
  CheckCircle2,
  Edit3,
  FileText,
  Minus,
  Plus,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { buildFeedWsUrl, getFeedWsDisabledMessage } from '../../config/endpoints';
import { extractFeedTicks } from '../../utils/feedMessages';
import useSymbolStore from '../../store/symbolStore';
import { placeManagerOrder } from '../../services/managerTradeApi';
import { TRADE_MUTATION_DENIED_MESSAGE } from './accountTradePermissions';

const getSymbolDigits = (sym) => {
  const s = String(sym || '').toUpperCase();
  if (s.includes('JPY')) return 3;
  if (/(BTC|ETH|LTC|XAU|GOLD|US30|NAS100|SPX500|GER30|UK100|OIL|WTI|BRENT)/.test(s)) return 2;
  return 5;
};

const getPipMultiplier = (digits) => {
  if (digits === 3) return 100;
  if (digits === 2) return 10;
  return 10000;
};

const formatPipDiff = (diff, digits) => {
  const pips = Math.abs(diff) * getPipMultiplier(digits);
  return pips.toFixed(1);
};

const PricePipsDisplay = ({ price, digits = 5, colorClass = 'text-white' }) => {
  const num = Number(price);
  if (!Number.isFinite(num) || num <= 0) {
    return <span className={`font-mono font-bold text-[12px] ${colorClass}`}>--</span>;
  }
  const str = num.toFixed(digits);
  if (digits >= 5 && str.length >= 2) {
    const main = str.slice(0, -2);
    const pips = str.slice(-2, -1);
    const frac = str.slice(-1);
    return (
      <span className={`font-mono ${colorClass} tracking-tight select-none inline-flex items-baseline`}>
        <span className="text-[12px] font-bold opacity-90">{main}</span>
        <span className="text-[13px] font-extrabold">{pips}</span>
        <span className="text-[10px] font-semibold opacity-85 ml-0.5">{frac}</span>
      </span>
    );
  }
  return <span className={`font-mono font-bold text-[12px] ${colorClass} select-none`}>{str}</span>;
};

const AccountTradeTab = ({
  loginId,
  positions = [],
  selectedTicketRow,
  setSelectedTicketRow,
  adapter,
  canManipulateTrades,
  canCloseTrades,
  handleModifySLTP,
  requestTradeClose,
  showResult,
  showError,
  requireTradeMutationPermission,
  onTradePlaced,
}) => {
  const [modalSymbol, setModalSymbol] = useState(
    selectedTicketRow?.symbol || positions[0]?.symbol || 'EURUSD'
  );
  const [tradeSL, setTradeSL] = useState('0.00000');
  const [tradeTP, setTradeTP] = useState('0.00000');
  const [tradeVolume, setTradeVolume] = useState('0.01');
  const [tradeComment, setTradeComment] = useState('');
  const [isAutoPipTrack, setIsAutoPipTrack] = useState(true);
  const [isUpdatingTrade, setIsUpdatingTrade] = useState(false);
  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  const [tickHistory, setTickHistory] = useState([]);
  const [feedError, setFeedError] = useState('');

  const modalSymbolRef = useRef(modalSymbol);
  useEffect(() => {
    modalSymbolRef.current = modalSymbol;
  }, [modalSymbol]);

  const selectedTicketRowRef = useRef(selectedTicketRow);
  useEffect(() => {
    selectedTicketRowRef.current = selectedTicketRow;
  }, [selectedTicketRow]);

  const isAutoPipTrackRef = useRef(isAutoPipTrack);
  useEffect(() => {
    isAutoPipTrackRef.current = isAutoPipTrack;
  }, [isAutoPipTrack]);

  const digits = getSymbolDigits(modalSymbol);
  const pipMultiplier = getPipMultiplier(digits);
  const pipSize = 1 / pipMultiplier;

  // Sync state when selected position row changes
  useEffect(() => {
    if (selectedTicketRow) {
      if (selectedTicketRow.symbol) {
        setModalSymbol(selectedTicketRow.symbol);
      }
      setTradeSL(
        selectedTicketRow.priceSl
          ? Number(selectedTicketRow.priceSl).toFixed(digits)
          : (0).toFixed(digits)
      );
      setTradeTP(
        selectedTicketRow.priceTp
          ? Number(selectedTicketRow.priceTp).toFixed(digits)
          : (0).toFixed(digits)
      );
      if (selectedTicketRow.volume || selectedTicketRow.lots) {
        setTradeVolume(String(selectedTicketRow.volume || selectedTicketRow.lots));
      }
      if (selectedTicketRow.comment) {
        setTradeComment(String(selectedTicketRow.comment));
      }
    }
  }, [selectedTicketRow, digits]);

  // Available symbols list
  const availableSymbols = useMemo(() => {
    const set = new Set();
    if (modalSymbol) set.add(modalSymbol);
    positions.forEach((p) => {
      if (p.symbol) set.add(p.symbol);
    });
    const storeSymbols = useSymbolStore.getState().symbols || {};
    Object.keys(storeSymbols).forEach((s) => set.add(s));
    [
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD',
      'AUDUSD', 'NZDUSD', 'XAUUSD', 'BTCUSD', 'ETHUSD',
    ].forEach((s) => set.add(s));
    return Array.from(set).sort();
  }, [modalSymbol, positions]);

  // Seed tick history from store if available
  useEffect(() => {
    const storeSymbols = useSymbolStore.getState().symbols || {};
    const quote = storeSymbols[modalSymbol];
    if (quote && quote.bid != null && quote.ask != null) {
      setTickHistory((prev) => {
        if (prev.length === 0 || prev[prev.length - 1].symbol !== modalSymbol) {
          return [{ symbol: modalSymbol, bid: parseFloat(quote.bid), ask: parseFloat(quote.ask), time: Date.now() }];
        }
        return prev;
      });
    }
  }, [modalSymbol]);

  // WebSocket connection for real-time market ticks
  useEffect(() => {
    let ws;
    let reconnectTimeout;

    const connectWebSocket = () => {
      let wsUrl;
      try {
        wsUrl = buildFeedWsUrl();
      } catch (err) {
        setFeedError(getFeedWsDisabledMessage(err));
        return;
      }

      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setFeedError('');
        ws.send(JSON.stringify({ type: 'subscribe', symbols: ['*'] }));
      };

      ws.onmessage = (e) => {
        try {
          let newTick = null;
          extractFeedTicks(e.data).forEach((msg) => {
            if (msg.symbol === modalSymbolRef.current && msg.bid != null && msg.ask != null) {
              newTick = {
                symbol: msg.symbol,
                bid: parseFloat(msg.bid),
                ask: parseFloat(msg.ask),
                time: Date.now(),
              };
            }
          });

          if (newTick) {
            setTickHistory((prev) => {
              const updated = [...prev, newTick];
              if (updated.length > 300) return updated.slice(-300);
              return updated;
            });

            // Auto-track SL/TP if enabled
            if (isAutoPipTrackRef.current && selectedTicketRowRef.current) {
              const type = selectedTicketRowRef.current.type;
              const d = getSymbolDigits(modalSymbolRef.current);
              const pSize = 1 / getPipMultiplier(d);
              const offset = pSize * 5; // 5 pips
              if (type === 'buy') {
                setTradeTP((newTick.ask + offset).toFixed(d));
                setTradeSL((newTick.bid - offset).toFixed(d));
              } else if (type === 'sell') {
                setTradeTP((newTick.bid - offset).toFixed(d));
                setTradeSL((newTick.ask + offset).toFixed(d));
              }
            }
          }
        } catch {
          // Ignore malformed tick payloads
        }
      };

      ws.onerror = () => {
        setFeedError('Market feed unavailable: websocket connection failed.');
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
  }, [modalSymbol]);

  // Adjust SL / TP values
  const adjustValue = (setter, amount) => {
    setIsAutoPipTrack(false);
    setter((prev) => {
      const val = parseFloat(prev);
      const next = Number.isNaN(val) ? 0 : val + amount;
      return Math.max(0, next).toFixed(digits);
    });
  };

  const adjustByPips = (setter, pips) => {
    adjustValue(setter, pips * pipSize);
  };

  const adjustVolume = (delta) => {
    setTradeVolume((prev) => {
      const v = Math.max(0.01, +(parseFloat(prev || '0.01') + delta).toFixed(2));
      return v.toFixed(2);
    });
  };

  // Commit SL / TP modifications
  const handleUpdateTrade = async () => {
    if (!requireTradeMutationPermission()) return;
    if (!selectedTicketRow) return;
    const ticket = selectedTicketRow.position || selectedTicketRow.ticket;
    if (!ticket) {
      alert('No ticket selected.');
      return;
    }

    setIsUpdatingTrade(true);
    try {
      const sl = parseFloat(tradeSL);
      const tp = parseFloat(tradeTP);
      const results = [];
      if (adapter.editableFields.stoploss && !Number.isNaN(sl)) {
        results.push(await adapter.modifyField({ ticket, field: 'stoploss', value: sl }));
      }
      if (adapter.editableFields.takeprofit && !Number.isNaN(tp)) {
        results.push(await adapter.modifyField({ ticket, field: 'takeprofit', value: tp }));
      }
      showResult(`Modify ${adapter.label} #${ticket}`, results[results.length - 1] || { message: 'no changes' });
    } catch (err) {
      showError(`Modify ${adapter.label}`, err);
    } finally {
      setIsUpdatingTrade(false);
    }
  };

  const handlePlaceTrade = async (operation) => {
    if (!requireTradeMutationPermission()) return;

    const login = Number(loginId);
    const lots = Number(tradeVolume);
    const stoploss = Number(tradeSL || 0);
    const takeprofit = Number(tradeTP || 0);
    const symbol = String(modalSymbol || '').trim();
    if (!Number.isSafeInteger(login) || login <= 0) {
      showError('Place manager order', new Error('Account login must be a positive integer.'));
      return;
    }
    if (!symbol) {
      showError('Place manager order', new Error('Select a symbol before placing an order.'));
      return;
    }
    if (!Number.isFinite(lots) || lots <= 0 || lots > 1000) {
      showError('Place manager order', new Error('Volume must be greater than 0 and no more than 1,000 lots.'));
      return;
    }
    if (!Number.isFinite(stoploss) || stoploss < 0 || !Number.isFinite(takeprofit) || takeprofit < 0) {
      showError('Place manager order', new Error('Stop loss and take profit must be zero or positive prices.'));
      return;
    }
    if (!window.confirm(`Place a ${operation.toUpperCase()} market order for ${lots} ${symbol} on account ${login}?`)) return;

    setIsPlacingTrade(true);
    try {
      const result = await placeManagerOrder({
        login,
        symbol,
        operation,
        lots,
        stoploss,
        takeprofit,
        comment: tradeComment.trim(),
      });
      showResult(`Place ${operation.toUpperCase()} order`, result);
      setTradeComment('');
      onTradePlaced?.(result);
    } catch (err) {
      showError(`Place ${operation.toUpperCase()} order`, err);
    } finally {
      setIsPlacingTrade(false);
    }
  };

  // Chart scaling calculations
  const recentHistory = tickHistory.slice(-80);
  const latestTick = recentHistory.length > 0 ? recentHistory[recentHistory.length - 1] : null;
  const currentAsk = latestTick ? latestTick.ask : 0;
  const currentBid = latestTick ? latestTick.bid : 0;
  const spread = Math.max(0.00002, (currentAsk - currentBid) || 0.00002);
  const spreadPips = (currentAsk && currentBid)
    ? formatPipDiff(currentAsk - currentBid, digits)
    : '-';

  const asks = recentHistory.map((t) => t.ask);
  const bids = recentHistory.map((t) => t.bid);
  const minVal = recentHistory.length > 0 ? Math.min(...bids) : 0;
  const maxVal = recentHistory.length > 0 ? Math.max(...asks) : 0;

  const rawRange = maxVal - minVal;
  // Ensure lines have at least 20% margin from the top and bottom edges
  const effectiveRange = Math.max(rawRange, spread * 3.5, pipSize * 15);
  const padding = effectiveRange * 0.20;
  const minP = minVal - padding;
  const maxP = maxVal + padding;
  const finalRange = Math.max(maxP - minP, 0.00001);

  // SVG polyline coordinates
  const getPoints = (isAsk) => {
    if (recentHistory.length === 0) return '';
    if (recentHistory.length === 1) {
      const val = isAsk ? recentHistory[0].ask : recentHistory[0].bid;
      const y = Math.max(4, Math.min(96, 100 - (((val - minP) / finalRange) * 100)));
      return `0,${y.toFixed(1)} 100,${y.toFixed(1)}`;
    }
    return recentHistory
      .map((t, i) => {
        const x = (i / (recentHistory.length - 1)) * 100;
        const val = isAsk ? t.ask : t.bid;
        const y = Math.max(4, Math.min(96, 100 - (((val - minP) / finalRange) * 100)));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  // Current price line Y coordinates
  const rawAskY = 100 - (((currentAsk - minP) / finalRange) * 100);
  const rawBidY = 100 - (((currentBid - minP) / finalRange) * 100);
  const askY = Math.max(6, Math.min(94, rawAskY));
  const bidY = Math.max(6, Math.min(94, rawBidY));

  // Badge collision prevention: ensure badges don't overlap on Y-axis
  let askBadgeY = askY;
  let bidBadgeY = bidY;
  if (Math.abs(askY - bidY) < 9) {
    askBadgeY = Math.max(5, askY - 4.5);
    bidBadgeY = Math.min(95, bidY + 4.5);
  }

  // 5 distinct non-overlapping Y-axis price labels
  const yAxisTicks = [0.85, 0.65, 0.50, 0.35, 0.15].map((pct) => {
    const y = 100 - (pct * 100);
    const val = minP + (finalRange * pct);
    return { y, val: val.toFixed(digits) };
  });

  return (
    <div className="flex-1 flex gap-2 overflow-hidden p-0.5 select-none h-full min-h-0">
      {/* ========================================================================= */}
      {/* LEFT: Professional Tick Chart                                              */}
      {/* ========================================================================= */}
      <div className="w-[340px] shrink-0 border border-[#232733] bg-[#0c0e14] rounded-lg flex flex-col relative overflow-hidden shadow-md">
        {/* Top Chart Header */}
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#131620] border-b border-[#232733] z-10 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[12px] text-white tracking-wide font-sans">{modalSymbol}</span>
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 rounded">
              Tick
            </span>
          </div>

          <div className="flex items-center gap-2">
            {feedError ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-semibold">
                <AlertCircle size={11} /> Offline
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 font-mono font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> LIVE
              </span>
            )}
            <span className="text-[10px] font-mono font-medium text-gray-300 bg-[#1b1f2b] border border-[#2c3245] px-1.5 py-0.5 rounded">
              Spread: {spreadPips}
            </span>
          </div>
        </div>

        {/* Chart Canvas & Y-Axis Container */}
        <div className="flex-1 flex relative overflow-hidden">
          {/* Main SVG Area */}
          <div className="flex-1 relative overflow-hidden bg-[#0c0e14]">
            {/* Background Grid Lines */}
            <div className="absolute inset-0 pointer-events-none">
              {yAxisTicks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-dashed border-[#1a1e2b]"
                  style={{ top: `${tick.y}%` }}
                />
              ))}
              <div className="absolute top-0 bottom-0 left-1/4 border-l border-dashed border-[#161a26]" />
              <div className="absolute top-0 bottom-0 left-2/4 border-l border-dashed border-[#161a26]" />
              <div className="absolute top-0 bottom-0 left-3/4 border-l border-dashed border-[#161a26]" />
            </div>

            {/* SVG Tick Curves */}
            {recentHistory.length > 0 ? (
              <svg
                className="w-full h-full absolute inset-0 pointer-events-none"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                {/* Horizontal price tracking lines */}
                <line
                  x1="0"
                  y1={askY}
                  x2="100"
                  y2={askY}
                  stroke="#ef4444"
                  strokeWidth="0.8"
                  strokeDasharray="2,2"
                  opacity="0.5"
                />
                <line
                  x1="0"
                  y1={bidY}
                  x2="100"
                  y2={bidY}
                  stroke="#3b82f6"
                  strokeWidth="0.8"
                  strokeDasharray="2,2"
                  opacity="0.5"
                />

                {/* Polyline Ask (Red) */}
                <polyline
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={getPoints(true)}
                />

                {/* Polyline Bid (Blue) */}
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={getPoints(false)}
                />
              </svg>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 text-[12px] gap-2">
                <Activity size={20} className="text-blue-400 animate-pulse" />
                <span className="font-mono text-[10px] text-gray-400 font-medium">
                  Waiting for ticks on {modalSymbol}...
                </span>
              </div>
            )}
          </div>

          {/* Right Y-Axis Column (Fixed width: 68px) */}
          <div className="w-[68px] shrink-0 relative bg-[#10131a] border-l border-[#232733] select-none">
            {/* 5 Distinct Price Levels */}
            {yAxisTicks.map((tick, i) => (
              <div
                key={i}
                className="absolute right-1 text-[#6b7280] text-[10px] font-mono font-normal text-right pointer-events-none"
                style={{ top: `${tick.y}%`, transform: 'translateY(-50%)' }}
              >
                {tick.val}
              </div>
            ))}

            {/* Current Ask Badge (Red) */}
            {currentAsk > 0 && (
              <div
                className="absolute right-1 px-1.5 py-0.5 bg-[#ef4444] text-white text-[10px] font-mono font-bold rounded shadow z-20 pointer-events-none"
                style={{ top: `${askBadgeY}%`, transform: 'translateY(-50%)' }}
              >
                {currentAsk.toFixed(digits)}
              </div>
            )}

            {/* Current Bid Badge (Blue) */}
            {currentBid > 0 && (
              <div
                className="absolute right-1 px-1.5 py-0.5 bg-[#3b82f6] text-white text-[10px] font-mono font-bold rounded shadow z-20 pointer-events-none"
                style={{ top: `${bidBadgeY}%`, transform: 'translateY(-50%)' }}
              >
                {currentBid.toFixed(digits)}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Legend Bar */}
        <div className="px-2.5 py-1 bg-[#10131a] border-t border-[#232733] flex items-center justify-between text-[10px] font-mono text-gray-400 z-10 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 bg-[#ef4444] rounded-sm inline-block" />
            <span className="font-normal text-[10px]">Ask:</span>
            <strong className="text-red-400 font-bold text-[12px]">{currentAsk ? currentAsk.toFixed(digits) : '--'}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 bg-[#3b82f6] rounded-sm inline-block" />
            <span className="font-normal text-[10px]">Bid:</span>
            <strong className="text-blue-400 font-bold text-[12px]">{currentBid ? currentBid.toFixed(digits) : '--'}</strong>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT: Professional MT5 Order / Position Modifier Panel                   */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col bg-[#111319] border border-[#232733] rounded-lg p-2.5 text-[12px] overflow-hidden shadow-md h-full">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-1.5 border-b border-[#232733] mb-1.5 shrink-0">
          {selectedTicketRow ? (
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Edit3 size={13} />
              </span>
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold block leading-none">
                  Modify Position
                </span>
                <span className="font-mono font-bold text-[12px] text-blue-400 leading-tight">
                  #{selectedTicketRow.position || selectedTicketRow.ticket}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-gray-500/10 text-gray-300 border border-gray-500/20">
                <FileText size={13} />
              </span>
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold block leading-none">
                  Order Parameters
                </span>
                <span className="font-bold text-[12px] text-white leading-tight">
                  Account #{loginId}
                </span>
              </div>
            </div>
          )}

          {/* Right badges */}
          <div className="flex items-center gap-1.5">
            {selectedTicketRow && (
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  selectedTicketRow.type === 'buy'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
              >
                {selectedTicketRow.type} {selectedTicketRow.volume || selectedTicketRow.lots || ''} Lots
              </span>
            )}
            {positions.length > 1 && (
              <select
                value={selectedTicketRow ? (selectedTicketRow.position || selectedTicketRow.ticket) : ''}
                onChange={(e) => {
                  const pos = positions.find((p) => String(p.position || p.ticket) === e.target.value);
                  if (pos) handleModifySLTP(pos);
                }}
                className="text-[10px] font-mono font-medium bg-[#1a1e2b] border border-[#2d3347] rounded px-1.5 py-0.5 text-gray-300 focus:outline-none cursor-pointer"
                title="Switch position"
              >
                <option value="" disabled>Switch Position</option>
                {positions.map((p) => (
                  <option key={p.position || p.ticket} value={p.position || p.ticket}>
                    #{p.position || p.ticket} ({p.symbol} {p.type})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Middle Form: Compact, Clean 2-Column Grid */}
        <div className="flex-1 flex flex-col justify-between py-0 overflow-hidden min-h-0">
          {/* Symbol */}
          <div className="grid grid-cols-[70px_1fr] items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">Symbol:</span>
            <div className="relative">
              <select
                value={modalSymbol}
                onChange={(e) => {
                  setModalSymbol(e.target.value);
                  setTickHistory([]);
                }}
                className="w-full h-6.5 bg-[#171a24] border border-[#2a2f42] rounded px-2 text-white font-bold text-[12px] font-mono focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
              >
                {availableSymbols.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Type */}
          <div className="grid grid-cols-[70px_1fr] items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">Type:</span>
            <div className="h-6.5 flex items-center px-2 bg-[#141720] border border-[#262b3b] rounded text-gray-200 font-semibold text-[12px] truncate">
              {selectedTicketRow
                ? `${selectedTicketRow.type === 'buy' ? 'Buy' : 'Sell'} Position S/L · T/P Modification`
                : 'Market Order Execution'}
            </div>
          </div>

          {/* Volume */}
          <div className="grid grid-cols-[70px_1fr] items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">Volume:</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#171a24] border border-blue-500/40 rounded overflow-hidden h-6.5">
                <button
                  type="button"
                  onClick={() => adjustVolume(-0.01)}
                  className="w-6 h-full flex items-center justify-center bg-[#1c212e] hover:bg-[#252b3d] text-gray-300 transition-colors"
                  aria-label="Decrease volume"
                >
                  <Minus size={11} />
                </button>
                <input
                  type="text"
                  value={tradeVolume}
                  onChange={(e) => setTradeVolume(e.target.value)}
                  className="w-14 h-full text-center font-mono font-bold text-blue-400 bg-transparent text-[12px] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustVolume(0.01)}
                  className="w-6 h-full flex items-center justify-center bg-[#1c212e] hover:bg-[#252b3d] text-gray-300 transition-colors"
                  aria-label="Increase volume"
                >
                  <Plus size={11} />
                </button>
              </div>

              {/* Quick volume presets */}
              <div className="flex items-center gap-1">
                {['0.01', '0.05', '0.10', '1.00'].map((vol) => (
                  <button
                    key={vol}
                    type="button"
                    onClick={() => setTradeVolume(vol)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                      tradeVolume === vol
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 font-bold'
                        : 'bg-[#171a24] text-gray-400 border-[#2a2f42] hover:bg-[#202533] font-medium'
                    }`}
                  >
                    {vol}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* At Price */}
          <div className="grid grid-cols-[70px_1fr] items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">At Price:</span>
            <div className="flex items-center gap-2.5">
              <div className="h-6.5 px-2.5 bg-[#141720] border border-[#262b3b] rounded flex items-center font-mono font-bold text-[12px] text-white">
                {currentAsk ? currentAsk.toFixed(digits) : 'Market Price'}
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-300 font-normal cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAutoPipTrack}
                  onChange={(e) => setIsAutoPipTrack(e.target.checked)}
                  className="rounded bg-[#171a24] border-[#2a2f42] text-blue-500 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Auto-track live ticks</span>
              </label>
            </div>
          </div>

          {/* Stop Loss & Take Profit Cards */}
          <div className="grid grid-cols-2 gap-2 my-1">
            {/* Stop Loss Card */}
            <div className="bg-[#151822] border border-red-500/20 rounded-md p-1.5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                  <ArrowDown size={11} /> Stop Loss
                </span>
                <span className="text-[10px] font-mono font-medium text-gray-400">SL</span>
              </div>
              <div className="flex items-center bg-[#0e1017] border border-[#2a2f42] rounded h-6.5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeSL, -1)}
                  className="w-5.5 h-full flex items-center justify-center bg-[#181c27] hover:bg-[#222838] text-gray-300 transition-colors"
                  aria-label="Decrease SL"
                >
                  <Minus size={10} />
                </button>
                <input
                  type="text"
                  value={tradeSL}
                  onChange={(e) => {
                    setTradeSL(e.target.value);
                    setIsAutoPipTrack(false);
                  }}
                  className="flex-1 h-full text-center font-mono text-[12px] font-bold text-white bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeSL, 1)}
                  className="w-5.5 h-full flex items-center justify-center bg-[#181c27] hover:bg-[#222838] text-gray-300 transition-colors"
                  aria-label="Increase SL"
                >
                  <Plus size={10} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-[#1f2433]">
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeSL, -5)}
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#1e2230] text-red-400 hover:bg-[#272d40] transition-colors"
                >
                  -5 pips
                </button>
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeSL, -10)}
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#1e2230] text-red-400 hover:bg-[#272d40] transition-colors"
                >
                  -10 pips
                </button>
              </div>
            </div>

            {/* Take Profit Card */}
            <div className="bg-[#151822] border border-blue-500/20 rounded-md p-1.5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-400">
                  <ArrowUp size={11} /> Take Profit
                </span>
                <span className="text-[10px] font-mono font-medium text-gray-400">TP</span>
              </div>
              <div className="flex items-center bg-[#0e1017] border border-[#2a2f42] rounded h-6.5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeTP, -1)}
                  className="w-5.5 h-full flex items-center justify-center bg-[#181c27] hover:bg-[#222838] text-gray-300 transition-colors"
                  aria-label="Decrease TP"
                >
                  <Minus size={10} />
                </button>
                <input
                  type="text"
                  value={tradeTP}
                  onChange={(e) => {
                    setTradeTP(e.target.value);
                    setIsAutoPipTrack(false);
                  }}
                  className="flex-1 h-full text-center font-mono text-[12px] font-bold text-white bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeTP, 1)}
                  className="w-5.5 h-full flex items-center justify-center bg-[#181c27] hover:bg-[#222838] text-gray-300 transition-colors"
                  aria-label="Increase TP"
                >
                  <Plus size={10} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-[#1f2433]">
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeTP, 5)}
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#1e2230] text-blue-400 hover:bg-[#272d40] transition-colors"
                >
                  +5 pips
                </button>
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeTP, 10)}
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#1e2230] text-blue-400 hover:bg-[#272d40] transition-colors"
                >
                  +10 pips
                </button>
              </div>
            </div>
          </div>

          {/* Comment */}
          <div className="grid grid-cols-[70px_1fr] items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">Comment:</span>
            <input
              type="text"
              value={tradeComment}
              onChange={(e) => setTradeComment(e.target.value)}
              placeholder="Order comment (optional)..."
              className="w-full h-6.5 bg-[#171a24] border border-[#2a2f42] rounded px-2 text-gray-200 text-[12px] font-normal focus:border-blue-500 focus:outline-none placeholder-gray-500"
            />
          </div>

          {/* Dual Quote Tiles (SELL / BUY) */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 my-1 select-none shrink-0">
            {/* SELL Box */}
            <button
              type="button"
              onClick={() => handlePlaceTrade('sell')}
              disabled={Boolean(selectedTicketRow) || isPlacingTrade || !canManipulateTrades}
              title={selectedTicketRow ? 'Clear the selected position to place a new order' : 'Place SELL market order'}
              className="bg-blue-500/10 border border-blue-500/30 rounded-lg py-1 px-2 text-center transition-all hover:bg-blue-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider mb-0.5">
                SELL / BID
              </div>
              <div className="flex items-center justify-center">
                <PricePipsDisplay price={currentBid} digits={digits} colorClass="text-blue-300" />
              </div>
            </button>

            {/* Spread pill */}
            <div className="flex flex-col items-center px-1">
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">SPREAD</span>
              <span className="text-[12px] font-mono font-bold text-gray-200">{spreadPips}</span>
            </div>

            {/* BUY Box */}
            <button
              type="button"
              onClick={() => handlePlaceTrade('buy')}
              disabled={Boolean(selectedTicketRow) || isPlacingTrade || !canManipulateTrades}
              title={selectedTicketRow ? 'Clear the selected position to place a new order' : 'Place BUY market order'}
              className="bg-red-500/10 border border-red-500/30 rounded-lg py-1 px-2 text-center transition-all hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-[10px] font-extrabold text-red-400 uppercase tracking-wider mb-0.5">
                BUY / ASK
              </div>
              <div className="flex items-center justify-center">
                <PricePipsDisplay price={currentAsk} digits={digits} colorClass="text-red-300" />
              </div>
            </button>
          </div>

          {/* Action Button Section */}
          {selectedTicketRow ? (
            <div className="flex items-center gap-2 mt-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedTicketRow(null)}
                disabled={isUpdatingTrade || isPlacingTrade}
                className="h-8 px-3 rounded border border-gray-500/50 bg-gray-500/10 hover:bg-gray-500/20 text-gray-300 font-semibold text-[12px] flex items-center gap-1 transition-colors disabled:opacity-50"
                title="Clear the selected position and prepare a new market order"
              >
                <Plus size={13} /> New order
              </button>
              <button
                type="button"
                onClick={handleUpdateTrade}
                disabled={isUpdatingTrade || !canManipulateTrades}
                title={!canManipulateTrades ? TRADE_MUTATION_DENIED_MESSAGE : undefined}
                className="flex-1 h-8 rounded bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-[12px] flex items-center justify-center gap-1.5 shadow-md transition-colors disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                {isUpdatingTrade
                  ? 'Modifying…'
                  : `Modify Position #${selectedTicketRow.position || selectedTicketRow.ticket}`}
              </button>

              {canCloseTrades && (
                <button
                  type="button"
                  onClick={() =>
                    requestTradeClose({ position: selectedTicketRow.position || selectedTicketRow.ticket })
                  }
                  className="h-8 px-3 rounded border border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-[12px] flex items-center gap-1 transition-colors"
                  title="Close Position"
                >
                  <Trash2 size={13} /> Close
                </button>
              )}
            </div>
          ) : (
            <div className="mt-0.5 p-1.5 rounded bg-[#151822] border border-[#232733] shrink-0">
              {positions.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between text-[10px] mb-1 text-gray-400">
                    <span className="font-medium">Select an open position to modify:</span>
                    <span className="font-mono text-gray-500">{positions.length} open</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-[52px] overflow-y-auto custom-scrollbar">
                    {positions.map((p) => (
                      <button
                        key={p.position || p.ticket}
                        type="button"
                        onClick={() => handleModifySLTP(p)}
                        className="px-2 py-0.5 rounded bg-[#1d2230] hover:bg-blue-600/25 border border-[#2c3347] text-[10px] font-mono font-medium text-gray-200 flex items-center gap-1.5 transition-colors"
                      >
                        <span
                          className={`font-bold ${
                            p.type === 'buy' ? 'text-blue-400' : 'text-red-400'
                          }`}
                        >
                          {p.type?.toUpperCase()}
                        </span>
                        <span className="text-gray-300">#{p.position || p.ticket}</span>
                        <span className="text-gray-400 font-semibold">{p.symbol}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-400 py-1 text-[10px] font-normal">
                  Use the SELL or BUY quote above to place a new market order for account #{loginId}.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountTradeTab;
