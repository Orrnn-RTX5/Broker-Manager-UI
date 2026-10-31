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


import useSymbolStore from '../../store/symbolStore';
import { placeManagerOrder } from '../../services/managerTradeApi';
import { TRADE_MUTATION_DENIED_MESSAGE } from './accountTradePermissions';
import DepositDialog from './DepositDialog';
import { COMMENT_PRESETS, normalizeCommentForDefault, detectCommentLanguage } from '../../utils/commentTranslation';
import { resolveTradeSymbol, buildTradeSymbolList } from '../../utils/accountTradeSymbols';

const readTradeQuote = (symbol) => {
  const quote = useSymbolStore.getState().symbols[symbol];
  const bid = Number(quote?.bid), ask = Number(quote?.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null;
  return { symbol, bid, ask, time: quote.lastUpdate || Date.now() };
};
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
  // Tenant symbol catalog (optional). Default empty preserves today's
  // behavior: symbols then come only from the row, positions and live feed.
  symbols = [],
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
  onUpdateState,
}) => {
  // Initial symbol: selected row, else first open-position symbol, else
  // first tenant-catalog entry, else empty (fail-closed, never invented).
  // With the default empty catalog this matches the previous inline chain
  // (row symbol, else first position symbol, else ''), except whitespace-only
  // values count as empty and later positions are scanned past an empty
  // first entry -- both fail-safe, both invent nothing.
  const [modalSymbol, setModalSymbol] = useState(
    resolveTradeSymbol({ selectedTicketRow, positions, catalog: symbols })
  );
  const [tradeSL, setTradeSL] = useState('0.00000');
  const [tradeTP, setTradeTP] = useState('0.00000');
  const [tradeVolume, setTradeVolume] = useState('0.01');
  const [tradeComment, setTradeComment] = useState('');
  const [isAutoPipTrack, setIsAutoPipTrack] = useState(false);
  const [isUpdatingTrade, setIsUpdatingTrade] = useState(false);
  const [isPlacingTrade, setIsPlacingTrade] = useState(false);
  const [tradeConfirmation, setTradeConfirmation] = useState(null);
  const tradeConfirmationRef = useRef(null);
  useEffect(() => () => tradeConfirmationRef.current?.(false), []);
  const finishTradeConfirmation = (confirmed) => {
    const resolve = tradeConfirmationRef.current;
    tradeConfirmationRef.current = null;
    setTradeConfirmation(null);
    resolve?.(confirmed);
  };
  const stopsChanged = Boolean(selectedTicketRow) && (
    Number(tradeSL) !== Number(selectedTicketRow?.priceSl || 0) ||
    Number(tradeTP) !== Number(selectedTicketRow?.priceTp || 0)
  );
  const volumeChanged = Boolean(selectedTicketRow) && Number(tradeVolume) !== Number(selectedTicketRow.volume ?? selectedTicketRow.lots ?? 0);
  // Fail-closed: empty symbol stays empty (no invented fallback) and gates
  // modify/close actions. Generic for all symbols; no symbol source invented here.
  const hasTradeSymbol = Boolean(String(modalSymbol || '').trim());
  const hasTradeTicket = Boolean(selectedTicketRow?.position || selectedTicketRow?.ticket);
  const canUpdateTrade = Boolean(selectedTicketRow) && hasTradeTicket && hasTradeSymbol && (stopsChanged || volumeChanged) && canManipulateTrades && !isUpdatingTrade && !isPlacingTrade;
  useEffect(() => {
    onUpdateState?.({ canUpdate: canUpdateTrade, busy: isUpdatingTrade || isPlacingTrade });
  }, [canUpdateTrade, isUpdatingTrade, isPlacingTrade, onUpdateState]);
  const [tickHistory, setTickHistory] = useState(() => { const tick = readTradeQuote(modalSymbol); return tick ? [tick] : []; });
  const feedError = useSymbolStore((state) => state.feedError);
  const isConnected = useSymbolStore((state) => state.isConnected);
  const isQuoteStale = useSymbolStore((state) => state.symbols[modalSymbol]?.isStale !== false);



  const selectedTicketRowRef = useRef(selectedTicketRow);
  useEffect(() => {
    selectedTicketRowRef.current = selectedTicketRow;
  }, [selectedTicketRow]);

  const isAutoPipTrackRef = useRef(isAutoPipTrack);
  useEffect(() => {
    isAutoPipTrackRef.current = isAutoPipTrack;
  }, [isAutoPipTrack]);
  const lastSyncedRowRef = useRef({});

  const digits = getSymbolDigits(modalSymbol);
  const pipMultiplier = getPipMultiplier(digits);
  const pipSize = 1 / pipMultiplier;

  // Sync state when selected position row changes.
  // Deps are stable primitives, never the row object: useLivePositions
  // (overlayRows) rebuilds the row identity on every live tick, which used to
  // wipe in-progress SL/TP edits within ~250ms so Modify never enabled. Only
  // an actual change of ticket/values resets the edit fields.
  // Numeric deps are Number()-normalized so HTTP-number vs WS-string forms
  // (e.g. 1.1 vs "1.1") compare equal and never resync/wipe edits. Symbol and
  // comment are tracked so server-only changes resync their own field, while
  // field-level guards below keep a comment/symbol/digits-only change from
  // wiping in-progress SL/TP edits. A digits-only change (manual symbol
  // switch) preserves edits; formatting follows the row symbol on ticket or
  // value changes.
  useEffect(() => {
    if (!selectedTicketRow) {
      lastSyncedRowRef.current = {};
      return;
    }
    const ticket = selectedTicketRow.position ?? selectedTicketRow.ticket;
    const ticketKey = String(ticket ?? '');
    const prev = lastSyncedRowRef.current || {};
    const ticketChanged = ticketKey !== prev.ticketKey;
    const rowSymbol = selectedTicketRow.symbol ?? '';
    const rowComment = selectedTicketRow.comment ?? '';
    const rowSl = Number(selectedTicketRow.priceSl ?? 0);
    const rowTp = Number(selectedTicketRow.priceTp ?? 0);
    const rowVolRaw = selectedTicketRow.volume ?? selectedTicketRow.lots;
    const rowVol = Number(rowVolRaw ?? 0);
    // Fail-closed symbol: follow the row exactly and clear on empty so a
    // sparse row never inherits the prior real symbol (stale-symbol bypass).
    if (ticketChanged || rowSymbol !== prev.symbol) {
      setModalSymbol(rowSymbol || '');
    }
    // Formatting follows the row symbol so a ticket switch formats correctly
    // even before modalSymbol state settles.
    const formatDigits = rowSymbol ? getSymbolDigits(rowSymbol) : digits;
    if (ticketChanged || rowSl !== prev.sl) {
      setTradeSL(Number.isFinite(rowSl) ? rowSl.toFixed(formatDigits) : (0).toFixed(formatDigits));
    }
    if (ticketChanged || rowTp !== prev.tp) {
      setTradeTP(Number.isFinite(rowTp) ? rowTp.toFixed(formatDigits) : (0).toFixed(formatDigits));
    }
    // Sparse rows reset to defaults on ticket change instead of carrying over
    // the prior ticket's volume/comment; same-ticket updates only touch the
    // field whose server value actually moved.
    if (ticketChanged) {
      if (rowVolRaw || rowVol) {
        setTradeVolume(String(selectedTicketRow.volume || selectedTicketRow.lots));
      } else {
        setTradeVolume('0.01');
      }
      setTradeComment(rowComment ? String(rowComment) : '');
    } else {
      if (rowVol !== prev.vol) {
        if (rowVolRaw || rowVol) {
          setTradeVolume(String(selectedTicketRow.volume || selectedTicketRow.lots));
        } else {
          setTradeVolume('0.01');
        }
      }
      if (rowComment !== prev.comment) {
        setTradeComment(rowComment ? String(rowComment) : '');
      }
    }
    lastSyncedRowRef.current = {
      ticketKey,
      symbol: rowSymbol,
      comment: rowComment,
      sl: rowSl,
      tp: rowTp,
      vol: rowVol,
    };
  // Intentionally narrowed: exhaustive-deps cannot see that the row object
  // identity churns on every live tick, so the object itself must stay out.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Number(selectedTicketRow?.position ?? selectedTicketRow?.ticket ?? 0), Number(selectedTicketRow?.priceSl ?? 0), Number(selectedTicketRow?.priceTp ?? 0), Number(selectedTicketRow?.volume ?? selectedTicketRow?.lots ?? 0), selectedTicketRow?.symbol, selectedTicketRow?.comment, digits]);

  // Available symbols list
  const availableSymbols = useMemo(() => {
    const set = new Set(buildTradeSymbolList({ catalog: symbols, positions, activeSymbol: modalSymbol }));
    const storeSymbols = useSymbolStore.getState().symbols || {};
    Object.keys(storeSymbols).forEach((s) => set.add(s));
    return Array.from(set).sort();
  }, [modalSymbol, positions, symbols]);
  // Fail-closed: with no symbol from any source (catalog, positions, active
  // symbol, live feed) the order form is replaced by operator guidance below.
  const hasAnySymbol = availableSymbols.length > 0;

  // Reuse the shared feed; opening or switching this tab never creates a socket.
  useEffect(() => {
    let previousQuote;
    const update = (state, seed = false) => {
      const quote = state.symbols[modalSymbol];
      if (!seed && quote === previousQuote) return;
      previousQuote = quote;
      const tick = readTradeQuote(modalSymbol);
      if (seed) setTickHistory(tick ? [tick] : []);
      else if (tick) setTickHistory((history) => [...history.filter((item) => item.symbol === modalSymbol).slice(-79), tick]);
      if (!seed && tick && !quote.isStale && state.isConnected && isAutoPipTrackRef.current && selectedTicketRowRef.current) {
        const type = selectedTicketRowRef.current.type;
        const d = getSymbolDigits(modalSymbol);
        const offset = 5 / getPipMultiplier(d);
        if (type === 'buy') {
          setTradeTP((tick.ask + offset).toFixed(d));
          setTradeSL((tick.bid - offset).toFixed(d));
        } else if (type === 'sell') {
          setTradeTP((tick.bid - offset).toFixed(d));
          setTradeSL((tick.ask + offset).toFixed(d));
        }
      }
    };
    update(useSymbolStore.getState(), true);
    const unsubscribe = useSymbolStore.subscribe((state) => update(state));
    useSymbolStore.getState().initWebSocket();
    return unsubscribe;
  }, [modalSymbol]);
  // Adjust SL / TP values
  const adjustValue = (setter, amount) => {
    isAutoPipTrackRef.current = false;
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

  // Save only edited fields; preserve successful writes if a later request fails.
  const handleUpdateTrade = async () => {
    if (!selectedTicketRow || !canUpdateTrade || !requireTradeMutationPermission()) return;
    if (!String(modalSymbol || '').trim()) {
      showError('Update trade', new Error('Select a symbol before modifying an order.'));
      return;
    }
    const sl = Number(tradeSL), tp = Number(tradeTP), lots = Number(tradeVolume);
    if (!tradeSL.trim() || !tradeTP.trim() || !Number.isFinite(sl) || !Number.isFinite(tp) || sl < 0 || tp < 0) {
      showError('Update trade', new Error('Stop loss and take profit must be zero or positive prices.'));
      return;
    }
    if (!Number.isFinite(lots) || lots <= 0 || lots > 1000) {
      showError('Update trade', new Error('Volume must be greater than 0 and no more than 1,000 lots.'));
      return;
    }
    const ticket = selectedTicketRow.position || selectedTicketRow.ticket;
    if (!ticket) {
      showError('Update trade', new Error('No ticket selected.'));
      return;
    }
    const saved = { ...selectedTicketRow };
    const changed = [];
    const checkResult = (result) => {
      if (result?.success === false || result?.ok === false || result?.error) {
        throw new Error(result.error?.message || result.error || result.message || 'Trade update rejected.');
      }
    };
    setIsUpdatingTrade(true);
    isAutoPipTrackRef.current = false;
    setIsAutoPipTrack(false);
    try {
      if (stopsChanged) {
        if (adapter.modifyStops) {
          checkResult(await adapter.modifyStops({ ticket, stoploss: sl, takeprofit: tp }));
          saved.priceSl = sl;
          saved.priceTp = tp;
          changed.push('SL/TP');
        } else {
          if (sl !== Number(saved.priceSl || 0)) {
            checkResult(await adapter.modifyField({ ticket, field: 'stoploss', value: sl }));
            saved.priceSl = sl;
            changed.push('SL');
          }
          if (tp !== Number(saved.priceTp || 0)) {
            checkResult(await adapter.modifyField({ ticket, field: 'takeprofit', value: tp }));
            saved.priceTp = tp;
            changed.push('TP');
          }
        }
      }
      if (volumeChanged) {
        checkResult(await adapter.modifyField({ ticket, field: 'volume', value: lots }));
        saved.volume = lots;
        saved.lots = lots;
        changed.push('volume');
      }
      setSelectedTicketRow(saved);
      showResult('Update trade', { message: `${changed.join(" and ")} updated successfully for position #${ticket}.` });
      onTradePlaced?.();
    } catch (err) {
      setSelectedTicketRow(saved);
      setTradeSL(Number(saved.priceSl || 0).toFixed(digits));
      setTradeTP(Number(saved.priceTp || 0).toFixed(digits));
      setTradeVolume(String(saved.volume ?? saved.lots ?? '0.01'));
      showError('Update trade', new Error(`${err?.message || "Update failed."} ${changed.length ? `${changed.join(" and ")} already saved. Remaining fields reset to their saved values.` : "Fields reset to their saved values."}`));
      if (changed.length) onTradePlaced?.();
    } finally {
      setIsUpdatingTrade(false);
    }
  };

  const handlePlaceTrade = async (operation) => {
    if (tradeConfirmationRef.current || isPlacingTrade || isUpdatingTrade || selectedTicketRow) return;
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
    const confirmed = await new Promise((resolve) => {
      tradeConfirmationRef.current = resolve;
      setTradeConfirmation({ operation, message: `Place a ${operation.toUpperCase()} market order for ${lots} lots of ${symbol} on account #${login}?` });
    });
    if (!confirmed) return;

    setIsPlacingTrade(true);
    try {
      const result = await placeManagerOrder({
        login,
        symbol,
        operation,
        lots,
        stoploss,
        takeprofit,
        comment: normalizeCommentForDefault(tradeComment.trim()),
      });
      showResult(`Place ${operation.toUpperCase()} order`, { message: `${operation.toUpperCase()} ${lots} lots of ${symbol} submitted successfully for account #${login}. ${typeof result?.message === 'string' ? result.message : ''}` });
      setTradeComment('');
      onTradePlaced?.(result);
    } catch (err) {
      showError(`Place ${operation.toUpperCase()} order`, err);
    } finally {
      setIsPlacingTrade(false);
    }
  };

  // Reuse chart geometry while editing order fields.
  const { recentHistory, currentAsk, currentBid, spreadPips, askY, bidY,
    askBadgeY, bidBadgeY, yAxisTicks, askPoints, bidPoints } = useMemo(() => {
    // Chart scaling calculations
    const recentHistory = tickHistory.filter((tick) => tick.symbol === modalSymbol).slice(-80);
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

    return { recentHistory, currentAsk, currentBid, spreadPips, askY, bidY,
      askBadgeY, bidBadgeY, yAxisTicks, askPoints: getPoints(true), bidPoints: getPoints(false) };
  }, [tickHistory, modalSymbol, digits, pipSize]);

  return (
    <form id="account-trade-update-form" className="account-trade-workspace" onSubmit={(event) => { event.preventDefault(); handleUpdateTrade(); }}>
      {/* ========================================================================= */}
      {/* LEFT: Professional Tick Chart                                              */}
      {/* ========================================================================= */}
      <div className="account-trade-chart w-[340px] shrink-0 border border-[var(--border)] bg-[var(--surface)] rounded-lg flex flex-col relative overflow-hidden shadow-md">
        {/* Top Chart Header */}
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-[var(--surface-2)] border-b border-[var(--border)] z-10 shrink-0">
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
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> {recentHistory.length === 0 ? 'WAITING' : isConnected && !isQuoteStale ? 'LIVE' : 'CACHED'}
              </span>
            )}
            <span className="text-[10px] font-mono font-medium text-gray-300 bg-[var(--surface-2)] border border-[var(--border)] px-1.5 py-0.5 rounded">
              Spread: {spreadPips}
            </span>
          </div>
        </div>

        {/* Chart Canvas & Y-Axis Container */}
        <div className="account-trade-plot flex-1 flex relative overflow-hidden">
          {/* Main SVG Area */}
          <div className="flex-1 relative overflow-hidden bg-[var(--surface)]">
            {/* Background Grid Lines */}
            <div className="absolute inset-0 pointer-events-none">
              {yAxisTicks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-dashed border-[var(--border)]"
                  style={{ top: `${tick.y}%` }}
                />
              ))}
              <div className="absolute top-0 bottom-0 left-1/4 border-l border-dashed border-[var(--border)]" />
              <div className="absolute top-0 bottom-0 left-2/4 border-l border-dashed border-[var(--border)]" />
              <div className="absolute top-0 bottom-0 left-3/4 border-l border-dashed border-[var(--border)]" />
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
                  stroke="var(--danger)"
                  strokeWidth="0.8"
                  strokeDasharray="2,2"
                  opacity="0.5"
                />
                <line
                  x1="0"
                  y1={bidY}
                  x2="100"
                  y2={bidY}
                  stroke="var(--accent)"
                  strokeWidth="0.8"
                  strokeDasharray="2,2"
                  opacity="0.5"
                />

                {/* Polyline Ask (Red) */}
                <polyline
                  fill="none"
                  stroke="var(--danger)"
                  strokeWidth="1.5" vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={askPoints}
                />

                {/* Polyline Bid (Blue) */}
                <polyline
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.5" vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={bidPoints}
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
          <div className="w-[68px] shrink-0 relative bg-[var(--surface)] border-l border-[var(--border)] select-none">
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
                className="account-trade-price-badge absolute right-1 px-1.5 py-0.5 text-white text-[10px] font-mono font-bold rounded shadow z-20 pointer-events-none"
                data-side="ask" style={{ top: `${askBadgeY}%`, transform: 'translateY(-50%)', backgroundColor: 'var(--danger)', color: '#ffffff' }}
              >
                {currentAsk.toFixed(digits)}
              </div>
            )}

            {/* Current Bid Badge (Blue) */}
            {currentBid > 0 && (
              <div
                className="account-trade-price-badge absolute right-1 px-1.5 py-0.5 text-white text-[10px] font-mono font-bold rounded shadow z-20 pointer-events-none"
                data-side="bid" style={{ top: `${bidBadgeY}%`, transform: 'translateY(-50%)', backgroundColor: 'var(--color-quote-up, var(--accent))', color: '#ffffff' }}
              >
                {currentBid.toFixed(digits)}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Legend Bar */}
        <div className="account-trade-chart-quotes px-2.5 py-1 bg-[var(--surface)] border-t border-[var(--border)] flex items-center justify-between text-[10px] font-mono text-gray-400 z-10 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 bg-[var(--surface-2)] rounded-sm inline-block" />
            <span className="font-normal text-[10px]">Ask:</span>
            <strong className="text-red-400 font-bold text-[12px]">{currentAsk ? currentAsk.toFixed(digits) : '--'}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 bg-[var(--surface-2)] rounded-sm inline-block" />
            <span className="font-normal text-[10px]">Bid:</span>
            <strong className="text-blue-400 font-bold text-[12px]">{currentBid ? currentBid.toFixed(digits) : '--'}</strong>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT: Professional MT5 Order / Position Modifier Panel                   */}
      {/* ========================================================================= */}
      <div className="account-trade-order flex-1 flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2.5 text-[12px] overflow-hidden shadow-md h-full">
        {hasAnySymbol ? (
        <>
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)] mb-1.5 shrink-0">
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
                className="text-[10px] font-mono font-medium bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-gray-300 focus:outline-none cursor-pointer"
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
        <div className="account-trade-form flex-1 flex flex-col py-0 min-h-0">
          {/* Symbol */}
          <div className="account-trade-field-row grid items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">Symbol:</span>
            <div className="relative">
              <select
                value={modalSymbol}
                onChange={(e) => {
                  setModalSymbol(e.target.value);
                  setTickHistory([]);
                }}
                className="w-full h-6.5 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 text-white font-bold text-[12px] font-mono focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
              >
                {availableSymbols.length === 0 && (
                  <option value="" disabled>
                    Select symbol…
                  </option>
                )}
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
          <div className="account-trade-field-row grid items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">Type:</span>
            <div className="h-6.5 flex items-center px-2 bg-[var(--surface-2)] border border-[var(--border)] rounded text-gray-200 font-semibold text-[12px] truncate">
              {selectedTicketRow
                ? `${selectedTicketRow.type === 'buy' ? 'Buy' : 'Sell'} Position S/L · T/P Modification`
                : 'Market Order Execution'}
            </div>
          </div>

          {/* Volume */}
          <div className="account-trade-field-row grid items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">Volume:</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[var(--surface-2)] border border-blue-500/40 rounded overflow-hidden h-6.5">
                <button
                  type="button"
                  onClick={() => adjustVolume(-0.01)}
                  className="w-6 h-full flex items-center justify-center bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-gray-300 transition-colors"
                  aria-label="Decrease volume"
                >
                  <Minus size={11} />
                </button>
                <input
                  type="text"
                  value={tradeVolume}
                  aria-label="Volume"
                  onChange={(e) => setTradeVolume(e.target.value)}
                  className="w-14 h-full text-center font-mono font-bold text-blue-400 bg-transparent text-[12px] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustVolume(0.01)}
                  className="w-6 h-full flex items-center justify-center bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-gray-300 transition-colors"
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
                        : 'bg-[var(--surface-2)] text-gray-400 border-[var(--border)] hover:bg-[var(--surface-2)] font-medium'
                    }`}
                  >
                    {vol}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* At Price */}
          <div className="account-trade-field-row grid items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">At Price:</span>
            <div className="flex items-center gap-2.5">
              <div className="h-6.5 px-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded flex items-center font-mono font-bold text-[12px] text-white">
                {currentAsk ? currentAsk.toFixed(digits) : 'Market Price'}
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-300 font-normal cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAutoPipTrack}
                  onChange={(e) => { isAutoPipTrackRef.current = e.target.checked; setIsAutoPipTrack(e.target.checked); }}
                  className="rounded bg-[var(--surface-2)] border-[var(--border)] text-blue-500 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Auto-track live ticks</span>
              </label>
            </div>
          </div>

          {/* Stop Loss & Take Profit Cards */}
          <div className="grid grid-cols-2 gap-2 my-1">
            {/* Stop Loss Card */}
            <div className="bg-[var(--surface-2)] border border-red-500/20 rounded-md p-1.5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                  <ArrowDown size={11} /> Stop Loss
                </span>
                <span className="text-[10px] font-mono font-medium text-gray-400">SL</span>
              </div>
              <div className="flex items-center bg-[var(--surface-2)] border border-[var(--border)] rounded h-6.5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeSL, -1)}
                  className="w-5.5 h-full flex items-center justify-center bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-gray-300 transition-colors"
                  aria-label="Decrease SL"
                >
                  <Minus size={10} />
                </button>
                <input
                  type="text"
                  value={tradeSL}
                  aria-label="Stop loss"
                  onChange={(e) => {
                    setTradeSL(e.target.value);
                    isAutoPipTrackRef.current = false;
                    setIsAutoPipTrack(false);
                  }}
                  className="flex-1 h-full text-center font-mono text-[12px] font-bold text-white bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeSL, 1)}
                  className="w-5.5 h-full flex items-center justify-center bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-gray-300 transition-colors"
                  aria-label="Increase SL"
                >
                  <Plus size={10} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeSL, -5)}
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-red-400 hover:bg-[var(--surface-2)] transition-colors"
                >
                  -5 pips
                </button>
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeSL, -10)}
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-red-400 hover:bg-[var(--surface-2)] transition-colors"
                >
                  -10 pips
                </button>
              </div>
            </div>

            {/* Take Profit Card */}
            <div className="bg-[var(--surface-2)] border border-blue-500/20 rounded-md p-1.5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1 text-[10px] font-bold text-blue-400">
                  <ArrowUp size={11} /> Take Profit
                </span>
                <span className="text-[10px] font-mono font-medium text-gray-400">TP</span>
              </div>
              <div className="flex items-center bg-[var(--surface-2)] border border-[var(--border)] rounded h-6.5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeTP, -1)}
                  className="w-5.5 h-full flex items-center justify-center bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-gray-300 transition-colors"
                  aria-label="Decrease TP"
                >
                  <Minus size={10} />
                </button>
                <input
                  type="text"
                  value={tradeTP}
                  aria-label="Take profit"
                  onChange={(e) => {
                    setTradeTP(e.target.value);
                    isAutoPipTrackRef.current = false;
                    setIsAutoPipTrack(false);
                  }}
                  className="flex-1 h-full text-center font-mono text-[12px] font-bold text-white bg-transparent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeTP, 1)}
                  className="w-5.5 h-full flex items-center justify-center bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-gray-300 transition-colors"
                  aria-label="Increase TP"
                >
                  <Plus size={10} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeTP, 5)}
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-blue-400 hover:bg-[var(--surface-2)] transition-colors"
                >
                  +5 pips
                </button>
                <button
                  type="button"
                  onClick={() => adjustByPips(setTradeTP, 10)}
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-blue-400 hover:bg-[var(--surface-2)] transition-colors"
                >
                  +10 pips
                </button>
              </div>
            </div>
          </div>

          {/* Comment */}
          <div className="account-trade-field-row grid items-center gap-2 mb-1">
            <span className="text-gray-400 text-right font-medium text-[10px]">Comment:</span>
            <div className="flex flex-col gap-1 w-full">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={tradeComment}
                  onChange={(e) => setTradeComment(e.target.value)}
                  placeholder="Order comment (optional)..."
                  className="flex-1 min-w-0 h-6.5 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 text-gray-200 text-[12px] font-normal focus:border-blue-500 focus:outline-none placeholder-gray-500"
                />
                <select
                  aria-label="Comment presets"
                  className="h-6.5 bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 text-gray-300 text-[11px] focus:outline-none cursor-pointer shrink-0"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setTradeComment(e.target.value);
                  }}
                >
                  <option value="">Presets...</option>
                  {COMMENT_PRESETS.map((p) => (
                    <option key={p.id} value={p.en}>
                      {p.en} ({p.zh})
                    </option>
                  ))}
                </select>
              </div>
              {tradeComment && detectCommentLanguage(tradeComment) === 'zh' && (
                <span className="text-[10px] text-blue-400 font-mono">
                  Default EN display: {normalizeCommentForDefault(tradeComment)}
                </span>
              )}
            </div>
          </div>

          <div className="account-trade-prices">
            <div><span className="text-[10px] text-gray-400">BID</span><PricePipsDisplay price={currentBid} digits={digits} colorClass="text-blue-300" /></div>
            <div><span className="text-[10px] text-gray-400">ASK</span><PricePipsDisplay price={currentAsk} digits={digits} colorClass="text-red-300" /></div>
            <span className="account-trade-spread text-[10px] text-gray-400">Spread: {spreadPips} pips</span>
          </div>
          {/* Market execution actions */}
          <div className="grid grid-cols-2 items-center gap-2 my-1 select-none shrink-0">
            {/* SELL Box */}
            <button
              type="button"
              onClick={() => handlePlaceTrade('sell')}
              disabled={Boolean(selectedTicketRow) || isPlacingTrade || !canManipulateTrades || !hasTradeSymbol}
              title={selectedTicketRow ? 'Clear the selected position to place a new order' : (!hasTradeSymbol ? 'Select a symbol before placing an order' : 'Place SELL market order')}
              className="bg-blue-500/10 border border-blue-500/30 rounded-lg py-1 px-2 text-center transition-all hover:bg-blue-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider mb-0.5">
                <ArrowDown size={11} className="inline-block mr-1" /> Sell by Market
              </div>

            </button>

            {/* BUY Box */}
            <button
              type="button"
              onClick={() => handlePlaceTrade('buy')}
              disabled={Boolean(selectedTicketRow) || isPlacingTrade || !canManipulateTrades || !hasTradeSymbol}
              title={selectedTicketRow ? 'Clear the selected position to place a new order' : (!hasTradeSymbol ? 'Select a symbol before placing an order' : 'Place BUY market order')}
              className="bg-red-500/10 border border-red-500/30 rounded-lg py-1 px-2 text-center transition-all hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-[10px] font-extrabold text-red-400 uppercase tracking-wider mb-0.5">
                <ArrowUp size={11} className="inline-block mr-1" /> Buy by Market
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
                disabled={!canUpdateTrade}
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
                  disabled={!hasTradeSymbol}
                  className="h-8 px-3 rounded border border-red-500/50 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-[12px] flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!hasTradeSymbol ? 'Select a symbol before closing' : 'Close Position'}
                >
                  <Trash2 size={13} /> Close
                </button>
              )}
            </div>
          ) : (
            <div className="mt-0.5 p-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] shrink-0">
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
                        className="px-2 py-0.5 rounded bg-[var(--surface-2)] hover:bg-blue-600/25 border border-[var(--border)] text-[10px] font-mono font-medium text-gray-200 flex items-center gap-1.5 transition-colors"
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
        </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 p-4">
            <span className="text-[11px] font-normal text-gray-200">
              No symbol is available for this account.
            </span>
            <span className="text-[11px] font-normal text-gray-400">
              Symbols come from the tenant catalog, the open positions, or the live price feed.
              Ask your administrator to configure symbols for this tenant before placing orders.
            </span>
          </div>
        )}
      </div>
      {tradeConfirmation && (
        <DepositDialog
          status="confirm"
          title="Confirm trade"
          message={tradeConfirmation.message}
          confirmLabel={`Confirm ${tradeConfirmation.operation.toUpperCase()}`}
          onConfirm={() => finishTradeConfirmation(true)}
          onDismiss={() => finishTradeConfirmation(false)}
        />
      )}
    </form>
  );
};

export default AccountTradeTab;
