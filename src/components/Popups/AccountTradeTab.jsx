import { useState, useEffect, useRef, useMemo } from 'react';
import {
  CheckCircle2,
  Plus,
  Trash2,
} from 'lucide-react';

import useSymbolStore, { ensureSymbolTickSeries } from '../../store/symbolStore';
import { placeManagerOrder, placePendingOrder } from '../../services/managerTradeApi';
import { TRADE_MUTATION_DENIED_MESSAGE } from './accountTradePermissions';
import DepositDialog from './DepositDialog';
import { COMMENT_PRESETS, normalizeCommentForDefault, detectCommentLanguage } from '../../utils/commentTranslation';
import { resolveTradeSymbol, buildTradeSymbolList } from '../../utils/accountTradeSymbols';
import {
  PENDING_ORDER_TYPE_OPTIONS,
  alignOrderTypeToSide,
  formatDialogPrice,
  isLimitOrderType,
  isPendingSideValid,
  isStopLimitOrderType,
  isStopOrderType,
  normalizePendingOrderWireType,
  resolveDialogExpirationTimestamp,
  resolveSideForOrderType,
  resolveSymbolDigits,
  resolveSymbolPriceStep,
  resolveSymbolStopsLevel,
  stepPriceFieldValue,
} from '../../utils/pendingOrderValidation';

const readTradeQuote = (symbol) => {
  const quote = useSymbolStore.getState().symbols[symbol];
  const bid = Number(quote?.bid), ask = Number(quote?.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null;
  return { symbol, bid, ask, time: quote.lastUpdate || Date.now() };
};

const readSeededTradeTicks = (symbol) => {
  if (!symbol) return [];
  const tick = readTradeQuote(symbol);
  if (!tick) return [];
  const series = ensureSymbolTickSeries(symbol, useSymbolStore.getState().symbols[symbol], 90);
  if (Array.isArray(series) && series.length > 0) {
    return series.map((pt) => ({
      symbol,
      bid: Number(pt.bid),
      ask: Number(pt.ask),
      time: pt.timestamp || tick.time,
    }));
  }
  return [tick];
};

const getSymbolDigits = (sym) => {
  const quote = useSymbolStore.getState().symbols?.[sym];
  const resolved = resolveSymbolDigits({ quote, fallbackPrice: quote?.bid ?? quote?.ask });
  if (resolved !== null && Number.isInteger(resolved)) return resolved;
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

const CURRENCY_NAMES = {
  EUR: 'Euro',
  USD: 'US Dollar',
  GBP: 'Great Britain Pound',
  JPY: 'Japanese Yen',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  NZD: 'New Zealand Dollar',
  SGD: 'Singapore Dollar',
  HKD: 'Hong Kong Dollar',
  NOK: 'Norwegian Krone',
  SEK: 'Swedish Krona',
  PLN: 'Polish Zloty',
  TRY: 'Turkish Lira',
  ZAR: 'South African Rand',
  MXN: 'Mexican Peso',
  CNH: 'Chinese Yuan',
  XAU: 'Gold',
  XAG: 'Silver',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  LTC: 'Litecoin',
  XRP: 'Ripple',
  ADA: 'Cardano',
  SOL: 'Solana',
  DOT: 'Polkadot',
  BNB: 'Binance Coin',
};

const getSymbolDisplayLabel = (sym) => {
  if (!sym) return '';
  const quote = useSymbolStore.getState().symbols?.[sym];
  const explicitDesc = quote?.description || quote?.Description || quote?.specification?.description;
  if (explicitDesc && typeof explicitDesc === 'string' && explicitDesc.trim()) {
    return `${sym}, ${explicitDesc.trim()}`;
  }
  const clean = String(sym).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length === 6) {
    const base = clean.slice(0, 3);
    const counter = clean.slice(3, 6);
    if (CURRENCY_NAMES[base] && CURRENCY_NAMES[counter]) {
      return `${sym}, ${CURRENCY_NAMES[base]} vs ${CURRENCY_NAMES[counter]}`;
    }
  }
  return sym;
};

const getContractVolumeSummary = (sym, volumeStr) => {
  const lots = Number(volumeStr);
  if (!sym || !Number.isFinite(lots) || lots <= 0) return '';
  const quote = useSymbolStore.getState().symbols?.[sym];
  const clean = String(sym).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const baseUnit = clean.length >= 6 ? clean.slice(0, 3) : clean;
  const explicitContract = Number(
    quote?.contract_size
    ?? quote?.contractSize
    ?? quote?.specification?.contract_size
    ?? quote?.specification?.contractSize
  );
  let contractSize = explicitContract;
  if (!Number.isFinite(contractSize) || contractSize <= 0) {
    if (clean.startsWith('XAU')) contractSize = 100;
    else if (clean.startsWith('XAG')) contractSize = 5000;
    else if (/^(BTC|ETH|LTC|SOL|BNB)/.test(clean)) contractSize = 1;
    else if (clean.length === 6 && CURRENCY_NAMES[clean.slice(0, 3)]) contractSize = 100000;
    else contractSize = 100;
  }
  const units = lots * contractSize;
  const formattedUnits = Number.isInteger(units)
    ? String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    : units.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formattedUnits} ${baseUnit}`;
};

const formatChartDate = (timestampMs) => {
  const d = new Date(timestampMs || Date.now());
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
};

const formatChartTime = (timestampMs, includeSeconds = false) => {
  const d = new Date(timestampMs || Date.now());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (!includeSeconds) return `${hh}:${mm}`;
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const Mt5DualPricePart = ({ price, digits = 5, side = 'bid' }) => {
  const num = Number(price);
  const str = Number.isFinite(num) && num > 0 ? num.toFixed(digits) : (0).toFixed(digits);
  if (digits >= 3 && str.length >= 2) {
    const main = str.slice(0, -1);
    const frac = str.slice(-1);
    return (
      <span className={`mt5-trade-quote-side is-${side}`}>
        <span className="mt5-trade-quote-main">{main}</span>
        <span className="mt5-trade-quote-frac">{frac}</span>
      </span>
    );
  }
  return (
    <span className={`mt5-trade-quote-side is-${side}`}>
      <span className="mt5-trade-quote-main">{str}</span>
    </span>
  );
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
  const [orderCategory, setOrderCategory] = useState('Market Order');
  const [pendingOrderType, setPendingOrderType] = useState('Buy Limit');
  const [selectedSide, setSelectedSide] = useState('buy');
  const [priceStr, setPriceStr] = useState('');
  const [stopLimitPriceStr, setStopLimitPriceStr] = useState('');
  const [expiration, setExpiration] = useState('GTC');
  const [expirationDateStr, setExpirationDateStr] = useState('');
  const [tradeSL, setTradeSL] = useState('0.00000');
  const [tradeTP, setTradeTP] = useState('0.00000');
  const [tradeVolume, setTradeVolume] = useState('0.01');
  const [tradeComment, setTradeComment] = useState('');
  const [manualAtPrice, setManualAtPrice] = useState('');
  const [isAutoPipTrack, setIsAutoPipTrack] = useState(true);
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
  const [tickHistory, setTickHistory] = useState(() => readSeededTradeTicks(modalSymbol));

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

  const liveSymbolQuote = useSymbolStore((state) => state.symbols?.[modalSymbol]);
  const specDigits = useMemo(
    () => resolveSymbolDigits({ quote: liveSymbolQuote, fallbackPrice: liveSymbolQuote?.bid ?? liveSymbolQuote?.ask }) ?? digits,
    [liveSymbolQuote, digits]
  );
  const priceStep = useMemo(
    () => resolveSymbolPriceStep({ quote: liveSymbolQuote, specDigits }),
    [liveSymbolQuote, specDigits]
  );
  const specStopsLevel = useMemo(
    () => resolveSymbolStopsLevel({ quote: liveSymbolQuote }),
    [liveSymbolQuote]
  );

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

  useEffect(() => {
    if (!selectedTicketRow && !modalSymbol && availableSymbols.length > 0) {
      setModalSymbol(availableSymbols[0]);
    }
  }, [selectedTicketRow, modalSymbol, availableSymbols]);

  // Reuse the shared feed; opening or switching this tab never creates a socket.
  useEffect(() => {
    let previousQuote;
    const update = (state, seed = false) => {
      const quote = state.symbols[modalSymbol];
      if (!seed && quote === previousQuote) return;
      previousQuote = quote;
      const tick = readTradeQuote(modalSymbol);
      if (seed) {
        setTickHistory(readSeededTradeTicks(modalSymbol));
      } else if (tick) {
        setTickHistory((history) => {
          const filtered = history.filter((item) => item.symbol === modalSymbol);
          if (filtered.length < 15) {
            return readSeededTradeTicks(modalSymbol);
          }
          return [...filtered.slice(-89), tick];
        });
      }
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

  // Reuse chart geometry while editing order fields.
  const { recentHistory, currentAsk, currentBid, spreadPips, askY, bidY,
    askBadgeY, bidBadgeY, yAxisTicks, askPoints, bidPoints, xAxisTimes } = useMemo(() => {
    const recentHistory = tickHistory.filter((tick) => tick.symbol === modalSymbol).slice(-85);
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
    const effectiveRange = Math.max(rawRange, spread * 3.2, pipSize * 12);
    const padding = effectiveRange * 0.14;
    const minP = minVal - padding;
    const maxP = maxVal + padding;
    const finalRange = Math.max(maxP - minP, 0.00001);

    // Stepped MT5 SVG polyline coordinates
    const getPoints = (isAsk) => {
      if (recentHistory.length === 0) return '';
      if (recentHistory.length === 1) {
        const val = isAsk ? recentHistory[0].ask : recentHistory[0].bid;
        const y = Math.max(3, Math.min(97, 100 - (((val - minP) / finalRange) * 100)));
        return `0,${y.toFixed(2)} 100,${y.toFixed(2)}`;
      }
      const pts = [];
      for (let i = 0; i < recentHistory.length; i += 1) {
        const t = recentHistory[i];
        const x = (i / (recentHistory.length - 1)) * 100;
        const val = isAsk ? t.ask : t.bid;
        const y = Math.max(3, Math.min(97, 100 - (((val - minP) / finalRange) * 100)));
        if (i > 0) {
          const prevVal = isAsk ? recentHistory[i - 1].ask : recentHistory[i - 1].bid;
          const prevY = Math.max(3, Math.min(97, 100 - (((prevVal - minP) / finalRange) * 100)));
          pts.push(`${x.toFixed(2)},${prevY.toFixed(2)}`);
        }
        pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      return pts.join(' ');
    };

    const rawAskY = 100 - (((currentAsk - minP) / finalRange) * 100);
    const rawBidY = 100 - (((currentBid - minP) / finalRange) * 100);
    const askY = Math.max(5, Math.min(95, rawAskY));
    const bidY = Math.max(5, Math.min(95, rawBidY));

    let askBadgeY = askY;
    let bidBadgeY = bidY;
    if (Math.abs(askY - bidY) < 8) {
      askBadgeY = Math.max(4, askY - 4);
      bidBadgeY = Math.min(96, bidY + 4);
    }

    const yAxisTicks = [0.84, 0.62, 0.40, 0.18].map((pct) => {
      const y = 100 - (pct * 100);
      const val = minP + (finalRange * pct);
      return { y, val: val.toFixed(digits) };
    });

    const firstTime = recentHistory[0]?.time || Date.now();
    const lastTime = latestTick?.time || Date.now();
    const pickTime = (ratio) => {
      if (recentHistory.length === 0) return Date.now();
      const idx = Math.min(recentHistory.length - 1, Math.max(0, Math.floor(ratio * (recentHistory.length - 1))));
      return recentHistory[idx]?.time || lastTime;
    };
    const xAxisTimes = {
      date: formatChartDate(firstTime),
      t1: formatChartTime(pickTime(0.32), false),
      t2: formatChartTime(pickTime(0.56), false),
      t3: formatChartTime(pickTime(0.78), false),
      t4: formatChartTime(lastTime, true),
    };

    return { recentHistory, currentAsk, currentBid, spreadPips, askY, bidY,
      askBadgeY, bidBadgeY, yAxisTicks, askPoints: getPoints(true), bidPoints: getPoints(false), xAxisTimes };
  }, [tickHistory, modalSymbol, digits, pipSize]);

  const isPendingMode = !selectedTicketRow && orderCategory === 'Pending Order';

  const computeValidSeedPriceForPending = (targetOrderType, bidVal = currentBid, askVal = currentAsk) => {
    const numBid = Number(bidVal) || 0;
    const numAsk = Number(askVal) || 0;
    if (numBid <= 0 && numAsk <= 0) return null;

    const impliedSide = resolveSideForOrderType(targetOrderType) ?? selectedSide ?? 'buy';
    const minDist =
      specStopsLevel !== null && specStopsLevel > 0 && priceStep !== null
        ? specStopsLevel * priceStep
        : 0;
    const unit =
      priceStep !== null && priceStep > 0
        ? priceStep
        : Math.pow(10, -(specDigits ?? 5));
    const spread = numAsk > 0 && numBid > 0 && numAsk > numBid ? numAsk - numBid : 0;
    const offset = Math.max(minDist + unit * 10, spread * 2, (pipSize || unit) * 10, unit * 10);

    const isBelowMarket =
      (isLimitOrderType(targetOrderType) && impliedSide === 'buy') ||
      ((isStopOrderType(targetOrderType) || isStopLimitOrderType(targetOrderType)) && impliedSide === 'sell');

    if (isBelowMarket) {
      const base = numBid > 0 ? numBid : numAsk;
      return Math.max(unit, base - offset);
    }
    const base = numAsk > 0 ? numAsk : numBid;
    return base + offset;
  };

  useEffect(() => {
    if (!isPendingMode) return;
    if (priceStr.trim() !== '') return;
    const seedPrice = computeValidSeedPriceForPending(pendingOrderType, currentBid, currentAsk);
    if (seedPrice !== null && seedPrice > 0) {
      const formatted = formatDialogPrice(seedPrice, specDigits);
      setPriceStr(formatted);
      if (isStopLimitOrderType(pendingOrderType) && stopLimitPriceStr.trim() === '') {
        setStopLimitPriceStr(formatted);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPendingMode, currentBid, currentAsk, specDigits]);

  const handleOrderCategoryChange = (value) => {
    if (value.startsWith('pos:')) {
      const ticketId = value.slice(4);
      const pos = positions.find((p) => String(p.position || p.ticket) === ticketId);
      if (pos) handleModifySLTP(pos);
      return;
    }
    setSelectedTicketRow(null);
    setOrderCategory(value);
    if (value === 'Pending Order') {
      const impliedSide = resolveSideForOrderType(pendingOrderType) ?? selectedSide ?? 'buy';
      const currentValidForTarget = isPendingSideValid({
        side: impliedSide,
        orderType: alignOrderTypeToSide(pendingOrderType, impliedSide),
        volume: tradeVolume || '0.01',
        price: priceStr,
        stopLimitPrice: stopLimitPriceStr,
        stopLoss: tradeSL,
        takeProfit: tradeTP,
        bid: currentBid,
        ask: currentAsk,
        specDigits,
        unitStep: priceStep,
        specStopsLevel,
        expiration,
        expirationDateStr,
      });
      if (priceStr.trim() === '' || !currentValidForTarget) {
        const seedPrice = computeValidSeedPriceForPending(pendingOrderType, currentBid, currentAsk);
        if (seedPrice !== null && seedPrice > 0) {
          const formatted = formatDialogPrice(seedPrice, specDigits);
          setPriceStr(formatted);
          if (isStopLimitOrderType(pendingOrderType) && stopLimitPriceStr.trim() === '') {
            setStopLimitPriceStr(formatted);
          }
        }
      }
    }
  };

  const handlePendingOrderTypeChange = (nextType) => {
    setPendingOrderType(nextType);
    const impliedSide = resolveSideForOrderType(nextType);
    if (impliedSide === 'buy' || impliedSide === 'sell') {
      setSelectedSide(impliedSide);
    }
    const effectiveSide = impliedSide ?? selectedSide ?? 'buy';
    const currentValidForNext = isPendingSideValid({
      side: effectiveSide,
      orderType: alignOrderTypeToSide(nextType, effectiveSide),
      volume: tradeVolume || '0.01',
      price: priceStr,
      stopLimitPrice: stopLimitPriceStr,
      stopLoss: tradeSL,
      takeProfit: tradeTP,
      bid: currentBid,
      ask: currentAsk,
      specDigits,
      unitStep: priceStep,
      specStopsLevel,
      expiration,
      expirationDateStr,
    });
    if (priceStr.trim() === '' || !currentValidForNext) {
      const seedPrice = computeValidSeedPriceForPending(nextType, currentBid, currentAsk);
      if (seedPrice !== null && seedPrice > 0) {
        const formatted = formatDialogPrice(seedPrice, specDigits);
        setPriceStr(formatted);
        if (isStopLimitOrderType(nextType)) {
          setStopLimitPriceStr(formatted);
        }
      }
    } else if (isStopLimitOrderType(nextType) && stopLimitPriceStr.trim() === '') {
      setStopLimitPriceStr(priceStr);
    }
  };

  const stepPendingPriceField = (field, direction) => {
    const anchorPrice = direction > 0 ? (currentAsk || currentBid) : (currentBid || currentAsk);
    if (field === 'price') {
      setPriceStr((prev) =>
        stepPriceFieldValue({
          currentValueStr: prev,
          direction,
          anchorPrice,
          specDigits,
          priceStep,
        })
      );
    } else if (field === 'stopLimitPrice') {
      setStopLimitPriceStr((prev) =>
        stepPriceFieldValue({
          currentValueStr: prev,
          direction,
          anchorPrice,
          specDigits,
          priceStep,
        })
      );
    }
  };

  const handleBlurPendingPrice = (setter) => (e) => {
    const raw = String(e.target.value ?? '').trim();
    const num = Number(raw);
    if (raw !== '' && Number.isFinite(num) && num >= 0) {
      setter(formatDialogPrice(num, specDigits));
    } else {
      setter('');
    }
  };

  const isPendingSideValidForSide = (side) =>
    isPendingSideValid({
      side,
      orderType: alignOrderTypeToSide(pendingOrderType, side),
      volume: tradeVolume,
      price: priceStr,
      stopLimitPrice: stopLimitPriceStr,
      stopLoss: tradeSL,
      takeProfit: tradeTP,
      bid: currentBid,
      ask: currentAsk,
      specDigits,
      unitStep: priceStep,
      specStopsLevel,
      expiration,
      expirationDateStr,
    });

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

    if (isPendingMode) {
      if (!isPendingSideValidForSide(operation)) {
        showError('Place pending order', new Error('Invalid pending order price, SL/TP geometry, or expiration for the selected side.'));
        return;
      }
      const alignedType = alignOrderTypeToSide(pendingOrderType, operation);
      const wireType = normalizePendingOrderWireType(alignedType, operation);
      const entryPrice = Number(priceStr);
      const stopLimitPrice = isStopLimitOrderType(alignedType) ? Number(stopLimitPriceStr) : undefined;
      const expiryResolved = resolveDialogExpirationTimestamp(expiration, expirationDateStr);
      if (expiryResolved.invalid) {
        showError('Place pending order', new Error('Specify a valid future expiration date/time.'));
        return;
      }

      const confirmed = await new Promise((resolve) => {
        tradeConfirmationRef.current = resolve;
        setTradeConfirmation({
          operation,
          message: `Place a ${alignedType.toUpperCase()} pending order for ${lots} lots of ${symbol} at ${entryPrice.toFixed(specDigits)} on account #${login}?`,
        });
      });
      if (!confirmed) return;

      setIsPlacingTrade(true);
      try {
        const result = await placePendingOrder({
          account_login: login,
          symbol,
          side: operation,
          volume: lots,
          type: wireType,
          price: entryPrice,
          ...(stopLimitPrice !== undefined && stopLimitPrice > 0 ? { price_limit: stopLimitPrice } : {}),
          ...(stoploss > 0 ? { sl: stoploss } : {}),
          ...(takeprofit > 0 ? { tp: takeprofit } : {}),
          ...(expiryResolved.seconds !== undefined ? { expiry: expiryResolved.seconds } : {}),
          comment: normalizeCommentForDefault(tradeComment.trim()),
        });
        showResult(`Place ${alignedType} order`, {
          message: `${alignedType} ${lots} lots of ${symbol} at ${entryPrice.toFixed(specDigits)} submitted successfully for account #${login}. ${typeof result?.message === 'string' ? result.message : ''}`,
        });
        setTradeComment('');
        onTradePlaced?.(result);
      } catch (err) {
        showError(`Place ${alignedType} order`, err);
      } finally {
        setIsPlacingTrade(false);
      }
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

  const liveAtPrice = currentBid > 0
    ? currentBid.toFixed(digits)
    : (currentAsk > 0 ? currentAsk.toFixed(digits) : (0).toFixed(digits));
  const displayedAtPrice = isAutoPipTrack || !manualAtPrice ? liveAtPrice : manualAtPrice;
  const contractVolumeLabel = getContractVolumeSummary(modalSymbol, tradeVolume);

  const adjustAtPrice = (direction) => {
    isAutoPipTrackRef.current = false;
    setIsAutoPipTrack(false);
    const base = parseFloat(displayedAtPrice);
    const next = Number.isNaN(base) ? 0 : Math.max(0, base + direction * pipSize);
    setManualAtPrice(next.toFixed(digits));
  };

  const adjustAtPriceByPoints = (pointsDelta) => {
    const pointUnit = priceStep !== null && priceStep > 0 ? priceStep : Math.pow(10, -digits);
    if (isPendingMode) {
      const anchorPrice = pointsDelta >= 0 ? (currentAsk || currentBid) : (currentBid || currentAsk);
      setPriceStr((prev) => {
        const parsed = parseFloat(String(prev ?? '').trim());
        const base = Number.isFinite(parsed) && parsed > 0 ? parsed : (anchorPrice || 0);
        const next = Math.max(pointUnit, base + pointsDelta * pointUnit);
        return formatDialogPrice(next, specDigits);
      });
      return;
    }
    isAutoPipTrackRef.current = false;
    setIsAutoPipTrack(false);
    const base = parseFloat(displayedAtPrice);
    const fallback = pointsDelta >= 0 ? (currentAsk || currentBid || 0) : (currentBid || currentAsk || 0);
    const startVal = Number.isFinite(base) && base > 0 ? base : fallback;
    const next = Math.max(0, startVal + pointsDelta * pointUnit);
    setManualAtPrice(next.toFixed(digits));
  };
  // Manual point adjustments clear auto-track synchronously (mirror: isAutoPipTrackRef.current = e.target.checked).

  const pendingHintText = useMemo(() => {
    if (!isPendingMode) return '';
    if (!priceStr.trim() || Number(priceStr) <= 0) {
      return 'Enter a trigger price or use ▲/▼ to seed from live market.';
    }
    const explicitSide = resolveSideForOrderType(pendingOrderType);
    const preferredSide = explicitSide || selectedSide || 'buy';
    const fallbackSide = preferredSide === 'buy' ? 'sell' : 'buy';
    const activeValidSide = isPendingSideValidForSide(preferredSide)
      ? preferredSide
      : isPendingSideValidForSide(fallbackSide)
        ? fallbackSide
        : null;
    if (activeValidSide) {
      return `Ready: ${alignOrderTypeToSide(pendingOrderType, activeValidSide)} ${tradeVolume} lots @ ${priceStr}`;
    }
    if (isLimitOrderType(pendingOrderType)) {
      return preferredSide === 'buy'
        ? `Buy Limit price must be below Ask (${currentAsk ? currentAsk.toFixed(digits) : '--'})`
        : `Sell Limit price must be above Bid (${currentBid ? currentBid.toFixed(digits) : '--'})`;
    }
    if (isStopOrderType(pendingOrderType) || isStopLimitOrderType(pendingOrderType)) {
      return preferredSide === 'buy'
        ? `Buy Stop price must be above Ask (${currentAsk ? currentAsk.toFixed(digits) : '--'})`
        : `Sell Stop price must be below Bid (${currentBid ? currentBid.toFixed(digits) : '--'})`;
    }
    return '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPendingMode, priceStr, stopLimitPriceStr, pendingOrderType, selectedSide, tradeVolume, tradeSL, tradeTP, currentBid, currentAsk, digits, expiration, expirationDateStr]);

  return (
    <form id="account-trade-update-form" className="account-trade-workspace mt5-trade-workspace" onSubmit={(event) => { event.preventDefault(); handleUpdateTrade(); }}>
      {/* ========================================================================= */}
      {/* LEFT: Native MT5 Tick Chart                                               */}
      {/* ========================================================================= */}
      <div className="account-trade-chart mt5-trade-chart-box">
        {/* Chart Canvas & Y-Axis Container */}
        <div className="account-trade-plot mt5-trade-plot-row">
          {/* Main SVG Plot Frame */}
          <div className="mt5-trade-plot-canvas">
            <span className="mt5-trade-plot-symbol">{modalSymbol || '—'}</span>

            {/* Background Dashed Grid Lines */}
            <div className="mt5-trade-plot-grid" aria-hidden="true">
              {yAxisTicks.map((tick, i) => (
                <div
                  key={i}
                  className="mt5-trade-grid-h"
                  style={{ top: `${tick.y}%` }}
                />
              ))}
              <div className="mt5-trade-grid-v" style={{ left: '22%' }} />
              <div className="mt5-trade-grid-v" style={{ left: '46%' }} />
              <div className="mt5-trade-grid-v" style={{ left: '70%' }} />
              <div className="mt5-trade-grid-v" style={{ left: '92%' }} />
            </div>

            {/* SVG Stepped Tick Curves */}
            {recentHistory.length > 0 && (
              <svg
                className="mt5-trade-svg"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                {/* Current Ask Line (Red) */}
                <line
                  x1="0"
                  y1={askY}
                  x2="100"
                  y2={askY}
                  stroke="var(--danger)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.85"
                />
                {/* Current Bid Line (Blue) */}
                <line
                  x1="0"
                  y1={bidY}
                  x2="100"
                  y2={bidY}
                  stroke="var(--color-quote-up, var(--accent))"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  opacity="0.85"
                />

                {/* Polyline Ask (Red) */}
                <polyline
                  fill="none"
                  stroke="var(--danger)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  shapeRendering="crispEdges"
                  points={askPoints}
                />

                {/* Polyline Bid (Blue) */}
                <polyline
                  fill="none"
                  stroke="var(--color-quote-up, var(--accent))"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  shapeRendering="crispEdges"
                  points={bidPoints}
                />
              </svg>
            )}
          </div>

          {/* Right Y-Axis Column */}
          <div className="mt5-trade-yaxis">
            {yAxisTicks.map((tick, i) => (
              <div
                key={i}
                className="mt5-trade-yaxis-tick"
                style={{ top: `${tick.y}%` }}
              >
                <span className="mt5-trade-yaxis-mark" />
                <span className="mt5-trade-yaxis-label">{tick.val}</span>
              </div>
            ))}

            {/* Current Ask Badge (Red) */}
            {currentAsk > 0 && (
              <div
                className="account-trade-price-badge mt5-trade-price-badge"
                data-side="ask"
                style={{ top: `${askBadgeY}%`, transform: 'translateY(-50%)', backgroundColor: 'var(--danger)', color: '#ffffff' }}
              >
                {currentAsk.toFixed(digits)}
              </div>
            )}

            {/* Current Bid Badge (Blue) */}
            {currentBid > 0 && (
              <div
                className="account-trade-price-badge mt5-trade-price-badge"
                data-side="bid"
                style={{ top: `${bidBadgeY}%`, transform: 'translateY(-50%)', backgroundColor: 'var(--color-quote-up, var(--accent))', color: '#ffffff' }}
              >
                {currentBid.toFixed(digits)}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Legend Bar */}
        <div className="account-trade-chart-quotes mt5-trade-xaxis" title={`Spread: ${spreadPips}`}>
          <span className="mt5-trade-xaxis-date">{xAxisTimes.date}</span>
          <span className="mt5-trade-xaxis-time">{xAxisTimes.t1}</span>
          <span className="mt5-trade-xaxis-time">{xAxisTimes.t2}</span>
          <span className="mt5-trade-xaxis-time">{xAxisTimes.t3}</span>
          <span className="mt5-trade-xaxis-time is-last">{xAxisTimes.t4}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT: Native MT5 Order Form Panel                                        */}
      {/* ========================================================================= */}
      <div className="account-trade-order mt5-trade-order-panel">
        {hasAnySymbol ? (
          <div className={`account-trade-form mt5-trade-form ${isPendingMode ? 'is-pending' : ''}`}>
            {/* Symbol */}
            <div className="mt5-trade-row">
              <label className="mt5-trade-label">Symbol:</label>
              <div className="mt5-trade-control-full">
                <select
                  value={modalSymbol}
                  onChange={(e) => {
                    setModalSymbol(e.target.value);
                    setTickHistory([]);
                    setPriceStr('');
                    setStopLimitPriceStr('');
                  }}
                  className="mt5-trade-select"
                  aria-label="Symbol"
                >
                  {availableSymbols.length === 0 && (
                    <option value="" disabled>
                      Select symbol…
                    </option>
                  )}
                  {availableSymbols.map((sym) => (
                    <option key={sym} value={sym}>
                      {getSymbolDisplayLabel(sym)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Type (Market Order / Pending Order / Open Positions) */}
            <div className={`mt5-trade-row ${isPendingMode ? '' : 'mt5-trade-row-spaced'}`}>
              <label className="mt5-trade-label">Type:</label>
              <div className="mt5-trade-control-full">
                <select
                  value={selectedTicketRow ? `pos:${selectedTicketRow.position || selectedTicketRow.ticket}` : orderCategory}
                  onChange={(e) => handleOrderCategoryChange(e.target.value)}
                  className="mt5-trade-select"
                  aria-label="Order type"
                >
                  <option value="Market Order">Market Order</option>
                  <option value="Pending Order">Pending Order</option>
                  {positions.map((p) => {
                    const ticketId = p.position || p.ticket;
                    return (
                      <option key={ticketId} value={`pos:${ticketId}`}>
                        Position #{ticketId} ({String(p.type || '').toUpperCase()} {p.volume || p.lots} {p.symbol})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Pending Order Subtype & Expiration when Pending Order is selected */}
            {isPendingMode && (
              <div className="mt5-trade-row">
                <label className="mt5-trade-label">Order:</label>
                <div className="mt5-trade-sltp-group">
                  <select
                    value={pendingOrderType}
                    onChange={(e) => handlePendingOrderTypeChange(e.target.value)}
                    className="mt5-trade-select mt5-trade-select-compact"
                    aria-label="Pending order type"
                  >
                    {PENDING_ORDER_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>

                  <label className="mt5-trade-label-inline">Expiration:</label>
                  <select
                    value={expiration}
                    onChange={(e) => setExpiration(e.target.value)}
                    className="mt5-trade-select mt5-trade-select-compact"
                    aria-label="Expiration"
                  >
                    <option value="GTC">GTC</option>
                    <option value="Today">Today</option>
                    <option value="Specified">Specified</option>
                    <option value="Specified day">Specified day</option>
                  </select>
                </div>
              </div>
            )}

            {/* Volume */}
            <div className="mt5-trade-row">
              <label className="mt5-trade-label">Volume:</label>
              <div className="mt5-trade-inline-group">
                <div className="mt5-trade-spinbox">
                  <input
                    type="text"
                    value={tradeVolume}
                    aria-label="Volume"
                    onChange={(e) => setTradeVolume(e.target.value)}
                    className="mt5-trade-spinbox-input"
                  />
                  <div className="mt5-trade-spinbox-btns">
                    <button
                      type="button"
                      onClick={() => adjustVolume(0.01)}
                      className="mt5-trade-spin-btn"
                      aria-label="Increase volume"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustVolume(-0.01)}
                      className="mt5-trade-spin-btn"
                      aria-label="Decrease volume"
                    >
                      ▼
                    </button>
                  </div>
                </div>
                {contractVolumeLabel && (
                  <span className="mt5-trade-volume-units">{contractVolumeLabel}</span>
                )}
              </div>
            </div>

            {/* Fill Policy (and Specified Date/Time when Pending Order Expiration is Specified) */}
            <div className="mt5-trade-row">
              <label className="mt5-trade-label is-disabled">Fill Policy:</label>
              <div className="mt5-trade-sltp-group">
                <select
                  disabled
                  value="fok"
                  aria-label="Fill policy"
                  className="mt5-trade-select mt5-trade-select-compact is-disabled"
                >
                  <option value="fok">{isPendingMode ? 'Return' : 'Fill or Kill'}</option>
                </select>

                {isPendingMode && (expiration === 'Specified' || expiration === 'Specified day') && (
                  <>
                    <label className="mt5-trade-label-inline">Expires:</label>
                    <input
                      type={expiration === 'Specified day' ? 'date' : 'datetime-local'}
                      value={expirationDateStr}
                      onChange={(e) => setExpirationDateStr(e.target.value)}
                      aria-label="Expiration date"
                      className="mt5-trade-date-input"
                    />
                  </>
                )}
              </div>
            </div>

            {/* At Price (Market vs Pending Order Price + Stop Limit Price) */}
            <div className="mt5-trade-row">
              <label className="mt5-trade-label">At Price:</label>
              <div className="mt5-trade-inline-group">
                {isPendingMode ? (
                  <>
                    <div className="mt5-trade-spinbox">
                      <input
                        type="text"
                        value={priceStr}
                        placeholder={currentAsk ? currentAsk.toFixed(specDigits) : '0.00000'}
                        aria-label="Pending price"
                        onChange={(e) => setPriceStr(e.target.value)}
                        onBlur={handleBlurPendingPrice(setPriceStr)}
                        className="mt5-trade-spinbox-input"
                      />
                      <div className="mt5-trade-spinbox-btns">
                        <button
                          type="button"
                          onClick={() => stepPendingPriceField('price', 1)}
                          className="mt5-trade-spin-btn"
                          aria-label="Increase pending price"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => stepPendingPriceField('price', -1)}
                          className="mt5-trade-spin-btn"
                          aria-label="Decrease pending price"
                        >
                          ▼
                        </button>
                      </div>
                    </div>

                    {isStopLimitOrderType(pendingOrderType) && (
                      <>
                        <label className="mt5-trade-label-inline">Stop Limit:</label>
                        <div className="mt5-trade-spinbox">
                          <input
                            type="text"
                            value={stopLimitPriceStr}
                            placeholder={currentAsk ? currentAsk.toFixed(specDigits) : '0.00000'}
                            aria-label="Stop Limit price"
                            onChange={(e) => setStopLimitPriceStr(e.target.value)}
                            onBlur={handleBlurPendingPrice(setStopLimitPriceStr)}
                            className="mt5-trade-spinbox-input"
                          />
                          <div className="mt5-trade-spinbox-btns">
                            <button
                              type="button"
                              onClick={() => stepPendingPriceField('stopLimitPrice', 1)}
                              className="mt5-trade-spin-btn"
                              aria-label="Increase Stop Limit price"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => stepPendingPriceField('stopLimitPrice', -1)}
                              className="mt5-trade-spin-btn"
                              aria-label="Decrease Stop Limit price"
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => adjustAtPriceByPoints(10)}
                      className="mt5-trade-point-btn"
                      aria-label="Add 10 points to price"
                      title="Increase At Price by 10 points (+10p)"
                    >
                      +10p
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustAtPriceByPoints(-10)}
                      className="mt5-trade-point-btn"
                      aria-label="Subtract 10 points from price"
                      title="Decrease At Price by 10 points (-10p)"
                    >
                      -10p
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mt5-trade-spinbox">
                      <input
                        type="text"
                        value={displayedAtPrice}
                        aria-label="At price"
                        onChange={(e) => {
                          isAutoPipTrackRef.current = false;
                          setIsAutoPipTrack(false);
                          setManualAtPrice(e.target.value);
                        }}
                        className="mt5-trade-spinbox-input"
                      />
                      <div className="mt5-trade-spinbox-btns">
                        <button
                          type="button"
                          onClick={() => adjustAtPrice(1)}
                          className="mt5-trade-spin-btn"
                          aria-label="Increase price"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustAtPrice(-1)}
                          className="mt5-trade-spin-btn"
                          aria-label="Decrease price"
                        >
                          ▼
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => adjustAtPriceByPoints(10)}
                      className="mt5-trade-point-btn"
                      aria-label="Add 10 points to price"
                      title="Increase At Price by 10 points (+10p)"
                    >
                      +10p
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustAtPriceByPoints(-10)}
                      className="mt5-trade-point-btn"
                      aria-label="Subtract 10 points from price"
                      title="Decrease At Price by 10 points (-10p)"
                    >
                      -10p
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Stop Loss & Take Profit on a single MT5 row */}
            <div className="mt5-trade-row">
              <label className="mt5-trade-label">Stop Loss:</label>
              <div className="mt5-trade-sltp-group">
                <div className="mt5-trade-spinbox">
                  <input
                    type="text"
                    value={tradeSL}
                    aria-label="Stop loss"
                    onChange={(e) => {
                      setTradeSL(e.target.value);
                      isAutoPipTrackRef.current = false;
                      setIsAutoPipTrack(false);
                    }}
                    className="mt5-trade-spinbox-input"
                  />
                  <div className="mt5-trade-spinbox-btns">
                    <button
                      type="button"
                      onClick={() => adjustByPips(setTradeSL, 1)}
                      className="mt5-trade-spin-btn"
                      aria-label="Increase SL"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustByPips(setTradeSL, -1)}
                      className="mt5-trade-spin-btn"
                      aria-label="Decrease SL"
                    >
                      ▼
                    </button>
                  </div>
                </div>

                <label className="mt5-trade-label-inline">Take Profit:</label>
                <div className="mt5-trade-spinbox">
                  <input
                    type="text"
                    value={tradeTP}
                    aria-label="Take profit"
                    onChange={(e) => {
                      setTradeTP(e.target.value);
                      isAutoPipTrackRef.current = false;
                      setIsAutoPipTrack(false);
                    }}
                    className="mt5-trade-spinbox-input"
                  />
                  <div className="mt5-trade-spinbox-btns">
                    <button
                      type="button"
                      onClick={() => adjustByPips(setTradeTP, 1)}
                      className="mt5-trade-spin-btn"
                      aria-label="Increase TP"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustByPips(setTradeTP, -1)}
                      className="mt5-trade-spin-btn"
                      aria-label="Decrease TP"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Comment */}
            <div className="mt5-trade-row">
              <label className="mt5-trade-label">Comment:</label>
              <div className="mt5-trade-control-full">
                <div className="mt5-trade-combo">
                  <input
                    type="text"
                    value={tradeComment}
                    onChange={(e) => setTradeComment(e.target.value)}
                    aria-label="Comment"
                    className="mt5-trade-combo-input"
                  />
                  <select
                    aria-label="Comment presets"
                    className="mt5-trade-combo-select"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setTradeComment(e.target.value);
                    }}
                  >
                    <option value="" />
                    {COMMENT_PRESETS.map((p) => (
                      <option key={p.id} value={p.en}>
                        {p.en} ({p.zh})
                      </option>
                    ))}
                  </select>
                </div>
                {tradeComment && detectCommentLanguage(tradeComment) === 'zh' && (
                  <span className="mt5-trade-comment-hint">
                    Default EN display: {normalizeCommentForDefault(tradeComment)}
                  </span>
                )}
              </div>
            </div>

            {/* Large MT5 Dual Quote Display: 1.12098 / 1.12107 */}
            <div className="mt5-trade-quote-banner">
              <Mt5DualPricePart price={currentBid} digits={digits} side="bid" />
              <span className="mt5-trade-quote-slash">/</span>
              <Mt5DualPricePart price={currentAsk} digits={digits} side="ask" />
            </div>

            {/* Execution Buttons: Sell / Buy */}
            <div className="mt5-trade-action-buttons">
              <button
                type="button"
                onClick={() => handlePlaceTrade('sell')}
                disabled={Boolean(selectedTicketRow) || isPlacingTrade || !canManipulateTrades || !hasTradeSymbol || (isPendingMode && !isPendingSideValidForSide('sell'))}
                title={selectedTicketRow ? 'Clear the selected position to place a new order' : (!hasTradeSymbol ? 'Select a symbol before placing an order' : (isPendingMode ? 'Place SELL pending order' : 'Place SELL market order'))}
                className="mt5-trade-exec-btn is-sell"
              >
                {isPendingMode
                  ? `${alignOrderTypeToSide(pendingOrderType, 'sell')} at ${priceStr || '--'}`
                  : `Sell at ${currentBid ? currentBid.toFixed(digits) : '--'}`}
              </button>

              <button
                type="button"
                onClick={() => handlePlaceTrade('buy')}
                disabled={Boolean(selectedTicketRow) || isPlacingTrade || !canManipulateTrades || !hasTradeSymbol || (isPendingMode && !isPendingSideValidForSide('buy'))}
                title={selectedTicketRow ? 'Clear the selected position to place a new order' : (!hasTradeSymbol ? 'Select a symbol before placing an order' : (isPendingMode ? 'Place BUY pending order' : 'Place BUY market order'))}
                className="mt5-trade-exec-btn is-buy"
              >
                {isPendingMode
                  ? `${alignOrderTypeToSide(pendingOrderType, 'buy')} at ${priceStr || '--'}`
                  : `Buy at ${currentAsk ? currentAsk.toFixed(digits) : '--'}`}
              </button>
            </div>

            {/* Bottom Recessed Status / Position Action Bar */}
            {selectedTicketRow ? (
              <div className="mt5-trade-status-bar is-editing">
                <button
                  type="button"
                  onClick={() => setSelectedTicketRow(null)}
                  disabled={isUpdatingTrade || isPlacingTrade}
                  className="mt5-trade-pos-btn"
                  title="Clear the selected position and prepare a new market order"
                >
                  <Plus size={11} /> New order
                </button>
                <button
                  type="button"
                  onClick={handleUpdateTrade}
                  disabled={!canUpdateTrade}
                  title={!canManipulateTrades ? TRADE_MUTATION_DENIED_MESSAGE : undefined}
                  className="mt5-trade-pos-btn is-primary"
                >
                  <CheckCircle2 size={11} />
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
                    className="mt5-trade-pos-btn is-danger"
                    title={!hasTradeSymbol ? 'Select a symbol before closing' : 'Close Position'}
                  >
                    <Trash2 size={11} /> Close
                  </button>
                )}
              </div>
            ) : (
              <div className="mt5-trade-status-bar">
                {pendingHintText && (
                  <span className="mt5-trade-status-hint">{pendingHintText}</span>
                )}
              </div>
            )}
          </div>
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
