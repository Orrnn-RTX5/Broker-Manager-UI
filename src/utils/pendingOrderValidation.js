// White-label Pending Order Architecture & Validation Logic.
// Never hardcodes symbol-specific digits, tick_size/point, contract_size, stops_level, or symbol maps.

export const ORDER_TYPES = Object.freeze({
  MARKET: 'Market Execution',
  LIMIT: 'Limit Order',
  STOP: 'Stop Order',
  STOP_LIMIT: 'Stop Limit Order',
  BUY_LIMIT: 'Buy Limit',
  SELL_LIMIT: 'Sell Limit',
  BUY_STOP: 'Buy Stop',
  SELL_STOP: 'Sell Stop',
  BUY_STOP_LIMIT: 'Buy Stop Limit',
  SELL_STOP_LIMIT: 'Sell Stop Limit',
});

export const PENDING_ORDER_TYPE_OPTIONS = Object.freeze([
  'Buy Limit',
  'Sell Limit',
  'Buy Stop',
  'Sell Stop',
  'Buy Stop Limit',
  'Sell Stop Limit',
  'Limit Order',
  'Stop Order',
  'Stop Limit Order',
]);

export const isLimitOrderType = (type) =>
  type === 'Limit Order' || type === 'Buy Limit' || type === 'Sell Limit';

export const isStopOrderType = (type) =>
  type === 'Stop Order' || type === 'Buy Stop' || type === 'Sell Stop';

export const isStopLimitOrderType = (type) =>
  type === 'Stop Limit Order' || type === 'Buy Stop Limit' || type === 'Sell Stop Limit';

export const isPendingOrderType = (type) =>
  isLimitOrderType(type) || isStopOrderType(type) || isStopLimitOrderType(type);

export const resolveSideForOrderType = (type) => {
  const s = String(type || '');
  if (s.startsWith('Buy ')) return 'buy';
  if (s.startsWith('Sell ')) return 'sell';
  return null;
};

export const alignOrderTypeToSide = (type, submitSide) => {
  const sidePrefix = submitSide === 'sell' ? 'Sell' : 'Buy';
  if (type === 'Buy Limit' || type === 'Sell Limit') return `${sidePrefix} Limit`;
  if (type === 'Buy Stop' || type === 'Sell Stop') return `${sidePrefix} Stop`;
  if (type === 'Buy Stop Limit' || type === 'Sell Stop Limit') return `${sidePrefix} Stop Limit`;
  return type;
};

export const normalizePendingOrderWireType = (type, submitSide) => {
  const aligned = alignOrderTypeToSide(type, submitSide);
  const side = (resolveSideForOrderType(aligned) || submitSide || 'buy').toLowerCase();
  if (isStopLimitOrderType(aligned)) return `${side}_stop_limit`;
  if (isStopOrderType(aligned)) return `${side}_stop`;
  if (isLimitOrderType(aligned)) return `${side}_limit`;
  return 'market';
};

export const inferDecimalsFromPriceValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value).trim();
  if (!str || !Number.isFinite(Number(str))) return null;
  const dotIdx = str.indexOf('.');
  if (dotIdx === -1) return 0;
  return Math.min(8, Math.max(0, str.length - dotIdx - 1));
};

// Always resolve from broker metadata -> live price decimal inference fallback (never symbol tables).
export const resolveSymbolDigits = ({ quote, instrument, liveTick, fallbackPrice } = {}) => {
  const candidates = [
    instrument?.digits,
    instrument?.Digits,
    quote?.digits,
    quote?.Digits,
    quote?.specification?.digits,
    quote?.brokerSpecification?.digits,
    liveTick?.digits,
    liveTick?.Digits,
  ];
  for (const c of candidates) {
    const num = Number(c);
    if (Number.isInteger(num) && num >= 0 && num <= 8) return num;
  }

  const tickSizeCandidate = Number(
    instrument?.tick_size ??
    instrument?.tickSize ??
    instrument?.point ??
    quote?.tick_size ??
    quote?.tickSize ??
    quote?.point ??
    quote?.specification?.tick_size ??
    quote?.specification?.point
  );
  if (Number.isFinite(tickSizeCandidate) && tickSizeCandidate > 0 && tickSizeCandidate <= 1) {
    const logDigits = Math.round(-Math.log10(tickSizeCandidate));
    if (Number.isInteger(logDigits) && logDigits >= 0 && logDigits <= 8) {
      return logDigits;
    }
  }

  const priceSamples = [
    liveTick?.bid,
    liveTick?.ask,
    quote?.rawBid,
    quote?.rawAsk,
    quote?.bid,
    quote?.ask,
    fallbackPrice,
  ];
  let maxInferred = null;
  for (const sample of priceSamples) {
    const d = inferDecimalsFromPriceValue(sample);
    if (d !== null && (maxInferred === null || d > maxInferred)) {
      maxInferred = d;
    }
  }
  return maxInferred;
};

export const resolveSymbolPriceStep = ({ quote, instrument, specDigits } = {}) => {
  const rawTickSize = Number(
    instrument?.tick_size ??
    instrument?.tickSize ??
    instrument?.point ??
    quote?.tick_size ??
    quote?.tickSize ??
    quote?.trade_tick_size ??
    quote?.tradeTickSize ??
    quote?.point_size ??
    quote?.pointSize ??
    quote?.point ??
    quote?.specification?.tick_size ??
    quote?.specification?.point
  );
  const hasTickSize = Number.isFinite(rawTickSize) && rawTickSize > 0;
  const digitsStep =
    specDigits !== null && specDigits !== undefined && Number.isInteger(specDigits) && specDigits >= 0
      ? Math.pow(10, -specDigits)
      : null;

  if (hasTickSize && digitsStep !== null && digitsStep > 0) {
    return Math.min(rawTickSize, digitsStep);
  }
  if (hasTickSize) return rawTickSize;
  if (digitsStep !== null && digitsStep > 0) return digitsStep;
  return null;
};

export const resolveSymbolStopsLevel = ({ quote, instrument, liveTick } = {}) => {
  const candidates = [
    instrument?.stops_level,
    instrument?.stopsLevel,
    quote?.stops_level,
    quote?.stopsLevel,
    quote?.specification?.stops_level,
    quote?.specification?.stopsLevel,
    quote?.brokerSpecification?.stops_level,
    quote?.brokerSpecification?.stopsLevel,
    quote?.trading_conditions?.stops_level,
    quote?.tradingConditions?.stopsLevel,
    liveTick?.stops_level,
    liveTick?.stopsLevel,
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') {
      const num = Number(c);
      if (Number.isFinite(num) && num >= 0) return num;
    }
  }
  return null;
};

export const formatDialogPrice = (price, specDigits) => {
  const num = Number(price);
  if (!Number.isFinite(num) || num < 0) return '';
  if (specDigits !== null && specDigits !== undefined && Number.isInteger(specDigits) && specDigits >= 0) {
    return num.toFixed(specDigits);
  }
  return String(num);
};

export const stepPriceFieldValue = ({
  currentValueStr,
  direction,
  anchorPrice,
  specDigits,
  priceStep,
}) => {
  const trimmed = String(currentValueStr ?? '').trim();
  const parsed = Number(trimmed);
  const digits = specDigits !== null && specDigits !== undefined && Number.isInteger(specDigits) ? specDigits : null;

  if (trimmed === '' || !Number.isFinite(parsed) || parsed <= 0) {
    const anchor = Number(anchorPrice);
    if (Number.isFinite(anchor) && anchor > 0) {
      return formatDialogPrice(anchor, digits);
    }
    return trimmed;
  }

  const fallbackStep = digits !== null ? Math.pow(10, -digits) : 0.00001;
  const step = priceStep !== null && priceStep !== undefined && priceStep > 0 ? priceStep : fallbackStep;
  const next = Math.max(0, parsed + direction * step);
  return digits !== null ? next.toFixed(digits) : String(next);
};

export const resolveDialogExpirationTimestamp = (expiration, expirationDateStr) => {
  if (!expiration || expiration === 'GTC') {
    return { invalid: false, seconds: undefined };
  }
  if (expiration === 'Today') {
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const seconds = Math.floor(endOfDay.getTime() / 1000);
    return { invalid: seconds * 1000 <= Date.now(), seconds };
  }
  if (expiration === 'Specified' || expiration === 'Specified day') {
    const raw = String(expirationDateStr ?? '').trim();
    if (!raw) return { invalid: true, seconds: undefined };
    const parsedMs = Date.parse(raw);
    if (!Number.isFinite(parsedMs) || parsedMs <= 0) {
      return { invalid: true, seconds: undefined };
    }
    if (expiration === 'Specified day' && !raw.includes('T') && !raw.includes(':')) {
      const d = new Date(parsedMs);
      const endOfSpecifiedDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      return { invalid: false, seconds: Math.floor(endOfSpecifiedDay.getTime() / 1000) };
    }
    return { invalid: false, seconds: Math.floor(parsedMs / 1000) };
  }
  return { invalid: false, seconds: undefined };
};

export const isPendingSideValid = ({
  side,
  orderType,
  volume,
  price,
  stopLimitPrice,
  stopLoss,
  takeProfit,
  bid = 0,
  ask = 0,
  specDigits = null,
  unitStep = null,
  specStopsLevel = null,
  expiration = 'GTC',
  expirationDateStr = '',
  nowMs = Date.now(),
}) => {
  // Check 1: Explicit Side Lock
  const explicitSide = resolveSideForOrderType(orderType);
  if (explicitSide && explicitSide !== side) return false;

  // Check 2: Volume & Price Presence
  const parsedVol = typeof volume === 'string' && volume.trim() === '' ? NaN : Number(volume);
  const parsedPrice = typeof price === 'string' && price.trim() === '' ? NaN : Number(price);
  const parsedStopLimitPrice =
    typeof stopLimitPrice === 'string' && stopLimitPrice.trim() === '' ? NaN : Number(stopLimitPrice);

  if (!Number.isFinite(parsedVol) || parsedVol < 0.01) return false;
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return false;
  if (isStopLimitOrderType(orderType) && (!Number.isFinite(parsedStopLimitPrice) || parsedStopLimitPrice <= 0)) {
    return false;
  }

  // Check 3: Stops Level Distance & Floating-Point Tolerance
  const minDist =
    specStopsLevel !== null && specStopsLevel > 0 && unitStep !== null
      ? specStopsLevel * unitStep
      : 0;
  const eps = specDigits !== null ? Math.pow(10, -(specDigits + 3)) : 1e-9;

  // Check 4: Pending Price vs. Live Market (Bid / Ask) Geometry
  const numBid = Number(bid) || 0;
  const numAsk = Number(ask) || 0;

  if (isLimitOrderType(orderType)) {
    if (side === 'buy' && numAsk > 0 && parsedPrice >= numAsk - minDist - eps) return false;
    if (side === 'sell' && numBid > 0 && parsedPrice <= numBid + minDist + eps) return false;
  } else if (isStopOrderType(orderType) || isStopLimitOrderType(orderType)) {
    if (side === 'buy' && numAsk > 0 && parsedPrice <= numAsk + minDist + eps) return false;
    if (side === 'sell' && numBid > 0 && parsedPrice >= numBid - minDist - eps) return false;
  }

  // Check 5: Stop Loss (SL) & Take Profit (TP) vs. Entry Reference Price
  const entryRef =
    isStopLimitOrderType(orderType) && parsedStopLimitPrice > 0
      ? parsedStopLimitPrice
      : parsedPrice;

  const parsedStopLoss = Number(stopLoss);
  if (Number.isFinite(parsedStopLoss) && parsedStopLoss > 0) {
    if (side === 'buy' && parsedStopLoss >= entryRef - minDist - eps) return false;
    if (side === 'sell' && parsedStopLoss <= entryRef + minDist + eps) return false;
  }

  const parsedTakeProfit = Number(takeProfit);
  if (Number.isFinite(parsedTakeProfit) && parsedTakeProfit > 0) {
    if (side === 'buy' && parsedTakeProfit <= entryRef + minDist + eps) return false;
    if (side === 'sell' && parsedTakeProfit >= entryRef - minDist + eps) return false;
  }

  // Check 6: Expiration Timestamp Validation
  if (expiration === 'Specified' || expiration === 'Specified day') {
    const resolved = resolveDialogExpirationTimestamp(expiration, expirationDateStr);
    if (resolved.invalid || resolved.seconds === undefined || resolved.seconds * 1000 <= nowMs) {
      return false;
    }
  }

  return true;
};

export const depthExecutionForLevel = (sideUpper, clickedPrice, bid, ask) => {
  const s = String(sideUpper || '').toUpperCase();
  const p = Number(clickedPrice);
  const b = Number(bid) || 0;
  const a = Number(ask) || 0;
  if (s === 'BUY') {
    return a > 0 && p > a ? 'stop' : 'limit';
  }
  return b > 0 && p < b ? 'stop' : 'limit';
};
