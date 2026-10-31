const SPECIFICATION_NESTED_KEYS = [
  'brokerSpecification',
  'specification',
  'spec',
  'contract',
  'trading_conditions',
  'tradingConditions',
];

const TICK_SIZE_KEYS = ['tick_size', 'tickSize', 'trade_tick_size', 'tradeTickSize'];
const POINT_KEYS = ['point_size', 'pointSize', 'point'];
const TICK_VALUE_KEYS = ['tick_value', 'tickValue', 'trade_tick_value', 'tradeTickValue'];
const BID_HIGH_KEYS = ['high_bid', 'highBid', 'bid_high', 'bidHigh', 'bidhigh'];
const BID_LOW_KEYS = ['low_bid', 'lowBid', 'bid_low', 'bidLow', 'bidlow'];
const ASK_HIGH_KEYS = ['high_ask', 'highAsk', 'ask_high', 'askHigh', 'askhigh'];
const ASK_LOW_KEYS = ['low_ask', 'lowAsk', 'ask_low', 'askLow', 'asklow'];
const OPEN_KEYS = ['daily_open', 'dailyOpen', 'open', 'open_price', 'openPrice'];
const CLOSE_KEYS = ['close', 'close_price', 'closePrice', 'previous_close', 'previousClose'];
const SETTLEMENT_KEYS = [
  'settlement_price',
  'settlementPrice',
  'session_price_settlement',
  'sessionPriceSettlement',
  'price_settlement',
  'priceSettlement',
];
const DAILY_CHANGE_PRICE_KEYS = ['daily_change_price', 'dailyChangePrice', 'change_price', 'changePrice'];
const DAILY_CHANGE_PCT_KEYS = ['daily_change_pct', 'dailyChangePct', 'dailyChange', 'daily_change'];
const DESCRIPTION_KEYS = [
  'description',
  'Description',
  'symbol_description',
  'symbolDescription',
  'full_name',
  'fullName',
  'title',
  'Title',
];

const MAX_PRICE_DIGITS = 10;

const asRecord = (value) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null
);

export const positiveNumber = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const finiteNumber = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const priceDigits = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_PRICE_DIGITS ? parsed : null;
};

/** Nested broker snapshots are authoritative over normalized wrapper fields. */
export const collectSpecificationRecords = (source) => {
  const root = asRecord(source);
  if (!root) return [];
  const unwrapped = [root.instrument, root.symbol_spec, root.symbolSpec, root.data, root.answer]
    .map(asRecord)
    .filter(Boolean);
  const candidates = [root, ...unwrapped];
  const records = [];
  for (const candidate of candidates) {
    const nested = SPECIFICATION_NESTED_KEYS
      .map((key) => asRecord(candidate[key]))
      .filter((record) => record !== null);
    records.push(...nested, candidate);
  }
  return records;
};

const readFirst = (records, keys, parse) => {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const parsed = parse(record[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
};

/**
 * Reads Tick Size, Tick Value and Digits from instrument sources in priority
 * order. A true tick size from any source outranks a point size, because
 * contracts such as index futures tick in multiples of their point.
 */
export const readMarketWatchSymbolSpecification = (...sources) => {
  const records = sources.flatMap(collectSpecificationRecords);
  return {
    tickSize: readFirst(records, TICK_SIZE_KEYS, positiveNumber)
      ?? readFirst(records, POINT_KEYS, positiveNumber),
    tickValue: readFirst(records, TICK_VALUE_KEYS, positiveNumber),
    digits: readFirst(records, ['digits', 'Digits'], priceDigits),
  };
};

export const readInstrumentDescription = (source, symbol = '') => {
  const records = collectSpecificationRecords(source);
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  for (const record of records) {
    for (const key of DESCRIPTION_KEYS) {
      const raw = record[key];
      if (typeof raw === 'string' && raw.trim()) {
        const trimmed = raw.trim();
        if (trimmed.toUpperCase() !== normalizedSymbol) {
          return trimmed;
        }
      }
    }
  }
  return '';
};

export const hasMarketWatchQuote = (tick) => Boolean(
  tick && (
    (Number.isFinite(Number(tick.bid)) && Number(tick.bid) > 0)
    || (Number.isFinite(Number(tick.ask)) && Number(tick.ask) > 0)
  )
);

const shift = (value, offset) => (
  value === null ? null : value + offset
);

// The session extreme can never sit inside the live quote it was measured on.
const includeHigh = (high, current) => (
  high === null || current === null ? high : Math.max(high, current)
);

const includeLow = (low, current) => (
  low === null || current === null ? low : Math.min(low, current)
);

export const getQuoteBidMarkupOffset = (tick, displayedBid = null) => {
  if (!tick || typeof tick !== 'object') return 0;
  const explicitOffset = finiteNumber(tick.bidMarkupOffset ?? tick.bid_offset ?? tick.bidOffset);
  if (explicitOffset !== null) return explicitOffset;
  const rawBid = positiveNumber(tick.rawBid ?? tick.raw_bid ?? tick.feed_bid ?? tick.feedBid);
  const bid = displayedBid ?? positiveNumber(tick.bid);
  return rawBid !== null && bid !== null ? rawBid - bid : 0;
};

export const getQuoteAskMarkupOffset = (tick, displayedAsk = null) => {
  if (!tick || typeof tick !== 'object') return 0;
  const explicitOffset = finiteNumber(tick.askMarkupOffset ?? tick.ask_offset ?? tick.askOffset);
  if (explicitOffset !== null) return explicitOffset;
  const rawAsk = positiveNumber(tick.rawAsk ?? tick.raw_ask ?? tick.feed_ask ?? tick.feedAsk);
  const ask = displayedAsk ?? positiveNumber(tick.ask);
  return rawAsk !== null && ask !== null ? ask - rawAsk : 0;
};

/**
 * Builds the Details view from the live quote/tick and specification.
 * Session ranges arrive on the raw feed basis, so they move by the same
 * account/group spread markup as the displayed Bid and Ask.
 */
export const buildMarketWatchSymbolDetails = ({
  instrument,
  tick,
  lastPrice,
  displayDailyChange,
  displayDailyChangePrice,
  closedDailyChange,
  specification,
} = {}) => {
  const resolvedSpecification = specification ?? readMarketWatchSymbolSpecification(instrument, tick, lastPrice);
  const hasLiveQuote = hasMarketWatchQuote(tick);
  const fallbackQuote = !hasLiveQuote && lastPrice ? lastPrice : undefined;
  const bid = positiveNumber(hasLiveQuote ? tick?.bid : fallbackQuote?.bid);
  const ask = positiveNumber(hasLiveQuote ? tick?.ask : fallbackQuote?.ask);
  const liveBid = hasLiveQuote ? bid : null;
  const liveAsk = hasLiveQuote ? ask : null;
  const bidOffset = hasLiveQuote ? getQuoteBidMarkupOffset(tick, liveBid) : 0;
  const askOffset = hasLiveQuote ? getQuoteAskMarkupOffset(tick, liveAsk) : 0;

  const sessionRecord = asRecord(tick?.session);
  const tickRecord = asRecord(tick);
  const fallbackSessionRecord = asRecord(fallbackQuote?.session);
  const fallbackRecord = asRecord(fallbackQuote);
  const quoteRecords = [sessionRecord, tickRecord, fallbackSessionRecord, fallbackRecord].filter(Boolean);

  // Inspect tick.session first, then flat properties on tick:
  const rawBidHigh = readFirst(quoteRecords, BID_HIGH_KEYS, positiveNumber)
    ?? positiveNumber(tick?.high ?? fallbackQuote?.high);
  const rawBidLow = readFirst(quoteRecords, BID_LOW_KEYS, positiveNumber)
    ?? positiveNumber(tick?.low ?? fallbackQuote?.low);
  const rawAskHigh = readFirst(quoteRecords, ASK_HIGH_KEYS, positiveNumber);
  const rawAskLow = readFirst(quoteRecords, ASK_LOW_KEYS, positiveNumber);

  const open = readFirst(quoteRecords, OPEN_KEYS, positiveNumber);
  const close = readFirst(quoteRecords, CLOSE_KEYS, positiveNumber);
  const settlementPrice = readFirst(quoteRecords, SETTLEMENT_KEYS, positiveNumber);
  const referencePrice = settlementPrice ?? close;
  const currentPrice = bid ?? ask ?? positiveNumber(tick?.last ?? fallbackQuote?.last);

  const upstreamDailyChangePrice = finiteNumber(displayDailyChangePrice)
    ?? readFirst(quoteRecords, DAILY_CHANGE_PRICE_KEYS, finiteNumber);
  const dailyChangePrice = upstreamDailyChangePrice !== null
    ? upstreamDailyChangePrice
    : (currentPrice !== null && referencePrice !== null && referencePrice > 0
      ? currentPrice - referencePrice
      : null);

  const upstreamDailyChange = finiteNumber(displayDailyChange)
    ?? readFirst(quoteRecords, DAILY_CHANGE_PCT_KEYS, finiteNumber)
    ?? finiteNumber(closedDailyChange);
  const dailyChange = upstreamDailyChange !== null
    ? upstreamDailyChange
    : (currentPrice !== null && referencePrice !== null && referencePrice > 0
      ? ((currentPrice - referencePrice) / referencePrice) * 100
      : null);

  return {
    hasLiveQuote,
    digits: resolvedSpecification?.digits ?? null,
    tickSize: resolvedSpecification?.tickSize ?? null,
    tickValue: resolvedSpecification?.tickValue ?? null,
    bid,
    bidHigh: includeHigh(shift(rawBidHigh, -bidOffset), liveBid),
    bidLow: includeLow(shift(rawBidLow, -bidOffset), liveBid),
    ask,
    askHigh: includeHigh(shift(rawAskHigh, askOffset), liveAsk),
    askLow: includeLow(shift(rawAskLow, askOffset), liveAsk),
    dailyChangePrice,
    dailyChange,
    open,
    close,
    fallbackQuoteAsOf: fallbackQuote?.asOf ?? fallbackQuote?.lastUpdate ?? null,
  };
};

const SPECIFICATION_NUMBER_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: MAX_PRICE_DIGITS,
  useGrouping: false,
});

/** Contract terms keep their exact broker precision, e.g. 0.00001 or 0.1. */
export const formatMarketWatchDetailsNumber = (value) => {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
    return null;
  }
  return SPECIFICATION_NUMBER_FORMAT.format(Number(value));
};

export const formatMarketWatchDetailsPrice = (value, digits) => {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
    return null;
  }
  const num = Number(value);
  return digits === null || digits === undefined || !Number.isInteger(digits)
    ? formatMarketWatchDetailsNumber(num)
    : num.toFixed(digits);
};

export const formatDailyChange = (val, digits = 2, percent = false) => {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean' || !Number.isFinite(Number(val))) {
    return '—';
  }
  const precision = Number.isInteger(digits) ? Math.max(0, Math.min(12, digits)) : 2;
  const rounded = Number(Number(val).toFixed(precision));
  return `${rounded > 0 ? '+' : ''}${(rounded === 0 ? 0 : rounded).toFixed(precision)}${percent ? '%' : ''}`;
};

export const formatMarketWatchDetailsPercent = (value) => (
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : formatDailyChange(value, 2, true)
);
