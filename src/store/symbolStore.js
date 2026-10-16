import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getFeedWsDisabledMessage,
  isManagerMarketFeed,
} from '../config/endpoints';
import { getRuntimeConfigValue } from '../config/backendTarget';
import { prepareMarketFeed } from '../services/marketFeed';
import {
  fetchSymbolMetadataFallback,
  fetchFeedStatus,
  getSymbolName,
  SYMBOL_METADATA_FALLBACK_REASON,
} from '../services/symbolMetadata';
import { FEED_DATA_STATE } from '../utils/feedStatus';
import { extractFeedTicks } from '../utils/feedMessages';
import {
  hasCurrentSessionLiveTick,
  isActiveFeedSocket,
  markSymbolMapCached,
  resolveFallbackFeedFields,
  resolveTickFeedFields,
} from '../utils/symbolFeedLifecycle';

const WS_CONNECT_TIMEOUT_MS = 10_000;
const WS_RECONNECT_DELAY_MS = 5_000;
const WS_METADATA_FALLBACK_DELAY_MS = 3_000;
// Coalesce bursts over roughly one display frame for responsive live quotes.
const MARKET_TICK_BATCH_MS = 16;
const SYMBOL_CACHE_WRITE_DELAY_MS = 2_000;
const REHYDRATED_SYMBOL_REASON = 'Cached quote awaiting a tick from the current feed connection.';

const CATEGORIES = {
  METALS: 'Metals',
  FOREX: 'Forex',
  INDICES: 'Indices',
  CRYPTO: 'Crypto',
  COMMODITIES: 'Commodities',
  OTHERS: 'Others',
};

const getCategory = (symbol) => {
  const sym = symbol.toUpperCase();
  
  // Metals
  if (/(XAU|XAG|XPT|XPD|GOLD|SILVER|PLATINUM|PALLADIUM)/.test(sym)) return CATEGORIES.METALS;
  
  // Crypto
  if (/(BTC|ETH|LTC|XRP|SOL|ADA|DOT|DOGE|SHIB|MATIC|BNB)/.test(sym)) return CATEGORIES.CRYPTO;
  
  // Indices
  if (/(US30|NAS100|SPX500|GER30|UK100|DAX|FRA40|HK50|EUSTX50|JPN225|WS30)/.test(sym)) return CATEGORIES.INDICES;
  
  // Commodities
  if (/(OIL|WTI|BRENT|GAS|NATGAS|COFFEE|SUGAR|CORN|WHEAT)/.test(sym)) return CATEGORIES.COMMODITIES;
  
  // Forex - Usually 6 letters or with a separator, and not matched above
  if (/^[A-Z]{6}$/.test(sym) || sym.includes('/') || sym.includes('.')) return CATEGORIES.FOREX;

  return CATEGORIES.OTHERS;
};

const getSymbolFeedFields = (entry = {}, staleReason = '') => {
  const isStale = Boolean(staleReason || entry.isStale || entry.feedState === FEED_DATA_STATE.CACHED);
  return {
    feedState: isStale ? FEED_DATA_STATE.CACHED : FEED_DATA_STATE.LIVE,
    isStale,
    staleReason: isStale ? (staleReason || entry.staleReason || '') : '',
  };
};

const formatPrice = (value, fallback = '0.00000') => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(5) : fallback;
};

const getEntryValue = (entry = {}, keys = []) => {
  if (!entry || typeof entry !== 'object') return undefined;
  for (const key of keys) {
    if (entry[key] !== undefined && entry[key] !== null && entry[key] !== '') return entry[key];
  }
  return undefined;
};

const buildMetadataEntry = (entry = {}, staleReason = '') => {
  const symbol = getSymbolName(entry);
  return {
    symbol,
    category: entry.category || getCategory(symbol),
    ...getSymbolFeedFields(entry, staleReason),
  };
};

const buildSymbolMetadata = (symbols = {}, staleReason = '') =>
  Object.values(symbols)
    .map((entry) => buildMetadataEntry(entry, staleReason))
    .filter((entry) => entry.symbol)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

const markCachedSymbolData = (state, staleReason) => {
  const reason = staleReason || 'Market feed unavailable: cached symbol data is not live.';
  const nextSymbols = markSymbolMapCached(state.symbols, reason);

  const metadataSource = state.symbolMetadata?.length
    ? state.symbolMetadata
    : buildSymbolMetadata(nextSymbols, reason);

  return {
    symbols: nextSymbols,
    symbolMetadata: metadataSource
      .map((entry) => buildMetadataEntry(entry, reason))
      .filter((entry) => entry.symbol)
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
};

const buildFallbackSymbols = (rows = [], staleReason = '', currentSymbols = {}) => {
  const now = Date.now();
  return rows.reduce((acc, row) => {
    const symbol = getSymbolName(row);
    if (!symbol) return acc;

    const source = row && typeof row === 'object' ? row : {};
    const existing = acc[symbol] || currentSymbols[symbol] || {};
    const preserveLiveTick = hasCurrentSessionLiveTick(existing);
    const bid = getEntryValue(source, ['bid', 'Bid', 'price_bid', 'priceBid']);
    const ask = getEntryValue(source, ['ask', 'Ask', 'price_ask', 'priceAsk']);

    acc[symbol] = {
      ...existing,
      ...source,
      symbol,
      bid: preserveLiveTick ? existing.bid : formatPrice(bid, existing.bid || '0.00000'),
      ask: preserveLiveTick ? existing.ask : formatPrice(ask, existing.ask || '0.00000'),
      lastUpdate: preserveLiveTick ? existing.lastUpdate : (existing.lastUpdate || now),
      category: source.category || source.Category || existing.category || getCategory(symbol),
      dir: existing.dir || 'up',
      ...resolveFallbackFeedFields(existing, source, staleReason),
    };
    return acc;
  }, { ...currentSymbols });
};

let symbolFallbackPromise = null;
let reconnectTimer = null;
let feedGeneration = 0;
let pendingFeedTicks = new Map();
let pendingFeedSocket = null;
let tickBatchTimer = null;
let pendingSymbolCacheWrite = null;
let symbolCacheWriteTimer = null;

const getSymbolCacheStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const flushSymbolCache = () => {
  if (symbolCacheWriteTimer) {
    clearTimeout(symbolCacheWriteTimer);
    symbolCacheWriteTimer = null;
  }

  const pendingWrite = pendingSymbolCacheWrite;
  pendingSymbolCacheWrite = null;
  if (!pendingWrite) return;

  try {
    getSymbolCacheStorage()?.setItem(pendingWrite.name, JSON.stringify(pendingWrite.value));
  } catch {
    // A full or unavailable browser cache must not interrupt live market data.
  }
};

// Persisting a complete quote map on every tick blocks the main thread. Keep
// the same offline cache, but write only the latest snapshot every two seconds.
const throttledSymbolStorage = {
  getItem: (name) => {
    try {
      const value = getSymbolCacheStorage()?.getItem(name);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    pendingSymbolCacheWrite = { name, value };
    if (symbolCacheWriteTimer) return;
    symbolCacheWriteTimer = setTimeout(flushSymbolCache, SYMBOL_CACHE_WRITE_DELAY_MS);
  },
  removeItem: (name) => {
    if (pendingSymbolCacheWrite?.name === name) pendingSymbolCacheWrite = null;
    try {
      getSymbolCacheStorage()?.removeItem(name);
    } catch {
      // Storage cleanup is best-effort.
    }
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSymbolCache);
}

const MAX_SYMBOL_TICK_BUFFER = 500;
const DEFAULT_SEEDED_TICK_COUNT = 140;
const symbolTickBuffers = new Map();
const symbolTickListeners = new Map();

const notifySymbolTickListeners = (symbol, nextBuffer) => {
  const listeners = symbolTickListeners.get(symbol);
  if (!listeners || listeners.size === 0) return;
  listeners.forEach((listener) => {
    try {
      listener(nextBuffer);
    } catch {
      // Listener errors must never interrupt feed processing.
    }
  });
};

export const subscribeSymbolTicks = (symbol, listener) => {
  if (!symbol || typeof listener !== 'function') return () => {};
  let set = symbolTickListeners.get(symbol);
  if (!set) {
    set = new Set();
    symbolTickListeners.set(symbol, set);
  }
  set.add(listener);
  return () => {
    const currentSet = symbolTickListeners.get(symbol);
    if (!currentSet) return;
    currentSet.delete(listener);
    if (currentSet.size === 0) symbolTickListeners.delete(symbol);
  };
};

const inferSymbolDigits = (quote = {}, fallbackPrice = 0) => {
  const explicit = Number(quote?.digits ?? quote?.Digits);
  if (Number.isInteger(explicit) && explicit >= 0 && explicit <= 8) return explicit;
  const rawText = String(quote?.bid ?? quote?.ask ?? fallbackPrice ?? '');
  const numeric = Number(rawText);
  if (!Number.isFinite(numeric) || numeric <= 0) return 2;
  const trimmed = numeric.toFixed(5).replace(/0+$/, '');
  const dotIdx = trimmed.indexOf('.');
  if (dotIdx === -1) return 2;
  return Math.max(2, Math.min(5, trimmed.length - dotIdx - 1));
};

const hashSymbolSeed = (symbol = '') => {
  let hash = 2166136261;
  const text = String(symbol || 'SYMBOL');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
};

const normalizeTickTimestampMs = (entry = {}, fallback = Date.now()) => {
  const raw = entry.timestamp ?? entry.time_msc ?? entry.timeMs ?? entry.time ?? entry.quote_time ?? entry.lastUpdate;
  if (raw !== undefined && raw !== null && raw !== '') {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      if (num >= 100_000_000_000_000_000) return Math.floor(num / 1_000_000);
      if (num >= 100_000_000_000_000) return Math.floor(num / 1_000);
      if (num >= 100_000_000_000) return Math.floor(num);
      return Math.floor(num * 1_000);
    }
    const parsed = typeof raw === 'string' ? Date.parse(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return fallback;
};

export const recordSymbolTick = (symbol, entry, fallbackTime = Date.now()) => {
  if (!symbol || !entry) return;
  const bid = Number(entry.bid ?? entry.Bid ?? entry.price_bid ?? entry.priceBid);
  const ask = Number(entry.ask ?? entry.Ask ?? entry.price_ask ?? entry.priceAsk);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return;
  const timestamp = normalizeTickTimestampMs(entry, fallbackTime);
  const buffer = symbolTickBuffers.get(symbol) || [];
  const last = buffer[buffer.length - 1];
  if (last && last.bid === bid && last.ask === ask && Math.abs(timestamp - last.timestamp) < 1000) return;
  const point = { timestamp: last && timestamp <= last.timestamp ? last.timestamp + 1 : timestamp, bid, ask, seeded: false };
  const next = buffer.length >= MAX_SYMBOL_TICK_BUFFER
    ? [...buffer.slice(-(MAX_SYMBOL_TICK_BUFFER - 1)), point]
    : [...buffer, point];
  symbolTickBuffers.set(symbol, next);
  notifySymbolTickListeners(symbol, next);
};

export const ensureSymbolTickSeries = (symbol, quote = null, targetCount = DEFAULT_SEEDED_TICK_COUNT) => {
  if (!symbol) return [];
  const existing = symbolTickBuffers.get(symbol) || [];
  if (existing.length >= targetCount) return existing;

  const storeQuote = quote || useSymbolStore.getState().symbols?.[symbol];
  const liveTicks = existing.filter((point) => !point.seeded);
  const anchor = liveTicks[0] || (storeQuote ? {
    timestamp: normalizeTickTimestampMs(storeQuote, Date.now()),
    bid: Number(storeQuote.bid),
    ask: Number(storeQuote.ask),
    seeded: false,
  } : null);

  if (!anchor || !Number.isFinite(anchor.bid) || !Number.isFinite(anchor.ask) || anchor.bid <= 0 || anchor.ask <= 0) {
    return existing;
  }

  const digits = inferSymbolDigits(storeQuote, anchor.bid);
  const tickUnit = 10 ** -digits;
  const baseSpread = Math.max(anchor.ask - anchor.bid, tickUnit);
  const stepScale = Math.max(tickUnit, baseSpread * 0.35, anchor.bid * 0.00008);
  const baseTicks = liveTicks.length > 0 ? liveTicks : [anchor];
  const missingCount = Math.max(0, targetCount - baseTicks.length);
  if (missingCount === 0) return baseTicks;

  let prng = hashSymbolSeed(symbol);
  const nextRand = () => {
    prng ^= prng << 13;
    prng ^= prng >>> 17;
    prng ^= prng << 5;
    return (prng >>> 0) / 4294967296;
  };

  const backwards = [];
  let cursorBid = anchor.bid;
  let cursorTime = anchor.timestamp;
  const stepWeights = [-3, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 3];

  for (let i = 0; i < missingCount; i += 1) {
    const r1 = nextRand();
    const r2 = nextRand();
    const r3 = nextRand();
    const weight = stepWeights[Math.floor(r1 * stepWeights.length)];
    const impulse = (i % 17 === 5) ? (r2 > 0.5 ? 4.5 : -4.5) : 0;
    const delta = (weight + impulse) * stepScale;
    cursorBid = Math.max(tickUnit * 2, cursorBid - delta);
    const spreadJitter = (r3 - 0.5) * Math.min(baseSpread * 0.25, tickUnit * 2);
    const pointSpread = Math.max(tickUnit, baseSpread + spreadJitter);
    const bidVal = Number(cursorBid.toFixed(digits));
    const askVal = Number(Math.max(bidVal + tickUnit, cursorBid + pointSpread).toFixed(digits));
    cursorTime -= 450 + Math.floor(r2 * 550);
    backwards.push({
      timestamp: cursorTime,
      bid: bidVal,
      ask: askVal,
      seeded: true,
    });
  }

  const seededSeries = [...backwards.reverse(), ...baseTicks].slice(-MAX_SYMBOL_TICK_BUFFER);
  symbolTickBuffers.set(symbol, seededSeries);
  return seededSeries;
};

export const mergeRemoteSymbolTickHistory = (symbol, remotePoints = []) => {
  if (!symbol || !Array.isArray(remotePoints) || remotePoints.length === 0) return getSymbolTickBuffer(symbol);
  const existing = symbolTickBuffers.get(symbol) || [];
  const livePoints = existing.filter((point) => !point.seeded);
  const firstLiveTimestamp = livePoints[0]?.timestamp ?? Number.POSITIVE_INFINITY;
  const earlierRemote = remotePoints
    .filter((point) => point && point.timestamp < firstLiveTimestamp && point.bid > 0 && point.ask > 0)
    .map((point) => ({ ...point, seeded: false }));
  const merged = [...earlierRemote, ...livePoints].slice(-MAX_SYMBOL_TICK_BUFFER);
  if (merged.length > 0) {
    symbolTickBuffers.set(symbol, merged);
    notifySymbolTickListeners(symbol, merged);
  }
  return merged;
};

export const getSymbolTickBuffer = (symbol) => (
  symbol ? (symbolTickBuffers.get(symbol) || []) : []
);

// Feeds can deliver many messages in the same frame. Coalesce them by symbol
// so React renders the latest price at a controlled cadence instead of once per
// WebSocket message.
const queueFeedTicks = (updates, socket) => {
  if (pendingFeedSocket && pendingFeedSocket !== socket) {
    pendingFeedTicks = new Map();
  }
  pendingFeedSocket = socket;

  const now = Date.now();
  updates.forEach((entry) => {
    const symbol = getSymbolName(entry);
    if (symbol) {
      recordSymbolTick(symbol, entry, now);
      pendingFeedTicks.set(symbol, entry);
    }
  });

  if (tickBatchTimer) return;
  tickBatchTimer = setTimeout(() => {
    tickBatchTimer = null;
    const sourceSocket = pendingFeedSocket;
    const batch = [...pendingFeedTicks.values()];
    pendingFeedTicks = new Map();
    pendingFeedSocket = null;

    if (batch.length > 0 && useSymbolStore.getState().ws === sourceSocket) {
      useSymbolStore.getState().upsertSymbols(batch);
    }
  }, MARKET_TICK_BATCH_MS);
};

const useSymbolStore = create(
  persist(
    (set, get) => ({
      symbols: {}, // Object keyed by symbol name: { symbol, bid, ask, lastUpdate, category }
      symbolMetadata: [], // Stable list of metadata
      ws: null,
      isConnected: false,
      isConnecting: false,
      feedError: '',
      feedSymbolNames: null,

      refreshFeedInventory: async (socket) => {
        if (!isManagerMarketFeed()) return;
        try {
          const status = await fetchFeedStatus();
          const brokerId = getRuntimeConfigValue(['BROKER_ID', 'VITE_BROKER_ID']);
          // Only a successful inventory for this broker may prune saved quotes.
          if (get().ws !== socket || !brokerId || status.broker_id !== brokerId
            || !Array.isArray(status.available_symbols) || status.available_symbols.length === 0) return;
          const names = status.available_symbols.filter((name) => typeof name === 'string' && name.trim());
          if (names.length === 0) return;
          const available = new Set(names);
          set((state) => {
            const symbols = Object.fromEntries(Object.entries(state.symbols).filter(([name, quote]) => (
              available.has(name) || hasCurrentSessionLiveTick(quote)
            )));
            return { symbols, symbolMetadata: buildSymbolMetadata(symbols), feedSymbolNames: names };
          });
        } catch {
          // An unavailable inventory must not erase quotes or interrupt streaming.
        }
      },

      upsertSymbols: (dataArray) => {
        set((state) => {
          let nextSymbols = state.symbols;
          const now = Date.now();
          let newSymbolAdded = false;
          let metadataNeedsRefresh = false;
          const updatedSymbols = new Set();

          dataArray.forEach(data => {
            const symbol = getSymbolName(data);
            if (!symbol) return;
            const { bid, ask } = data;
            const current = nextSymbols[symbol];
            const nextBid = bid !== undefined && bid !== null
              ? formatPrice(bid, current?.bid || '0.00000')
              : (current?.bid || '0.00000');
            const nextAsk = ask !== undefined && ask !== null
              ? formatPrice(ask, current?.ask || '0.00000')
              : (current?.ask || '0.00000');
            const feedFields = resolveTickFeedFields(data);
            const feedStateChanged = current?.feedState !== feedFields.feedState
              || current?.isStale !== feedFields.isStale
              || current?.staleReason !== feedFields.staleReason;

            // Identical live ticks do not affect anything the user can see, so
            // avoid cloning the entire map and triggering a React update.
            const detailFields = ['session', 'daily_open', 'previous_close'];
            const detailsChanged = detailFields.some((key) => data[key] !== undefined
              && JSON.stringify(data[key]) !== JSON.stringify(current?.[key]));
            if (current && current.bid === nextBid && current.ask === nextAsk && !feedStateChanged && !detailsChanged) return;

            if (nextSymbols === state.symbols) nextSymbols = { ...state.symbols };
            if (!current) newSymbolAdded = true;
            if (feedStateChanged) metadataNeedsRefresh = true;
            updatedSymbols.add(symbol);

            const previousBid = Number(current?.bid);
            const nextBidNumber = Number(nextBid);
            const dir = Number.isFinite(previousBid) && Number.isFinite(nextBidNumber)
              ? (nextBidNumber >= previousBid ? 'up' : 'down')
              : (current?.dir || 'up');
            
            const category = getCategory(symbol);
            recordSymbolTick(symbol, { ...data, bid: nextBid, ask: nextAsk }, now);
            nextSymbols[symbol] = {
              ...(current || {}),
              ...Object.fromEntries(detailFields.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])),
              symbol,
              bid: nextBid,
              ask: nextAsk,
              lastUpdate: now,
              category,
              dir,
              ...feedFields,
            };
          });

          if (nextSymbols === state.symbols) return state;

          const nextState = { symbols: nextSymbols };
          
          // Metadata contains feed-state only, not prices. Refresh it only for
          // a new symbol or the first fresh tick after cached data is restored.
          if (newSymbolAdded || (state.symbolMetadata && state.symbolMetadata.length === 0 && Object.keys(nextSymbols).length > 0)) {
            nextState.symbolMetadata = buildSymbolMetadata(nextSymbols);
          } else if (metadataNeedsRefresh && updatedSymbols.size > 0 && state.symbolMetadata?.length > 0) {
            nextState.symbolMetadata = state.symbolMetadata.map((entry) => (
              updatedSymbols.has(entry.symbol) && nextSymbols[entry.symbol]
                ? buildMetadataEntry(nextSymbols[entry.symbol])
                : entry
            ));
          }

          return nextState;
        });
      },

      loadSymbolFallback: async (staleReason = SYMBOL_METADATA_FALLBACK_REASON, options = {}) => {
        if (symbolFallbackPromise) return symbolFallbackPromise;

        symbolFallbackPromise = (async () => {
          const result = await fetchSymbolMetadataFallback();
          const reason = staleReason || SYMBOL_METADATA_FALLBACK_REASON;

          set((state) => {
            // A fallback started by a failed socket must not downgrade a
            // connection that has recovered while the HTTP request was pending.
            const setFeedError = options.setFeedError && !state.isConnected;
            if (!Array.isArray(result.symbols) || result.symbols.length === 0) {
              return setFeedError
                ? {
                    ...markCachedSymbolData(state, reason),
                    feedError: reason,
                  }
                : {};
            }

            const available = state.feedSymbolNames ? new Set(state.feedSymbolNames) : null;
            const rows = available
              ? result.symbols.filter((row) => available.has(getSymbolName(row)))
              : result.symbols;
            const nextSymbols = buildFallbackSymbols(rows, reason, state.symbols);
            return {
              symbols: nextSymbols,
              symbolMetadata: buildSymbolMetadata(nextSymbols),
              ...(setFeedError ? { feedError: reason } : {}),
            };
          });

          return result;
        })().finally(() => {
          symbolFallbackPromise = null;
        });

        return symbolFallbackPromise;
      },

      disconnectWebSocket: () => {
        feedGeneration += 1;
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        const socket = get().ws;
        set((state) => ({ ...markCachedSymbolData(state, REHYDRATED_SYMBOL_REASON), ws: null, isConnected: false, isConnecting: false, feedSymbolNames: null }));
        socket?.close();
      },

      initWebSocket: () => {
        if (reconnectTimer || get().isConnecting) return;
        const currentSocket = get().ws;
        if (isActiveFeedSocket(currentSocket)) return;

        if (currentSocket || get().isConnecting) {
          set({ ws: null, isConnected: false, isConnecting: false });
        }

        const generation = feedGeneration;
        const connect = async () => {
          if (generation !== feedGeneration) return;
          const existingSocket = get().ws;
          if (isActiveFeedSocket(existingSocket)) return;

          if (existingSocket || get().isConnecting) {
            set({ ws: null, isConnected: false, isConnecting: false });
          }

          set({ isConnecting: true });

          let connection;
          try {
            connection = await prepareMarketFeed();
            if (generation !== feedGeneration) return;
          } catch {
            if (generation !== feedGeneration) return;
            const message = getFeedWsDisabledMessage();
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnected: false,
              isConnecting: false,
              ws: null,
              feedError: message,
            }));
            get().loadSymbolFallback(message, { setFeedError: true });
            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
              }, WS_RECONNECT_DELAY_MS);
            }
            return;
          }

          console.debug('[SymbolStore] Connecting to feed WebSocket');
          let ws;
          let metadataFallbackTimer = null;

          const clearMetadataFallback = () => {
            if (!metadataFallbackTimer) return;
            clearTimeout(metadataFallbackTimer);
            metadataFallbackTimer = null;
          };

          const scheduleMetadataFallback = () => {
            if (Object.keys(get().symbols).length > 0) return;
            metadataFallbackTimer = setTimeout(() => {
              metadataFallbackTimer = null;
              if (get().ws === ws && Object.keys(get().symbols).length === 0) {
                get().loadSymbolFallback(SYMBOL_METADATA_FALLBACK_REASON);
              }
            }, WS_METADATA_FALLBACK_DELAY_MS);
          };

          try {
            ws = new WebSocket(connection.url);
          } catch {
            const message = 'Market feed unavailable: websocket connection could not be started.';
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnected: false,
              isConnecting: false,
              ws: null,
              feedError: message,
            }));
            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
              }, WS_RECONNECT_DELAY_MS);
            }
            return;
          }

          let connectWatchdog = setTimeout(() => {
            if (get().ws !== ws || ws.readyState !== 0) return;

            const message = 'Market feed unavailable: websocket connection timed out.';
            clearMetadataFallback();
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnected: false,
              isConnecting: false,
              ws: null,
              feedError: message,
            }));
            get().loadSymbolFallback(message, { setFeedError: true });

            try {
              ws.close();
            } catch {
              // The reconnect timer below will create a fresh socket.
            }

            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
              }, WS_RECONNECT_DELAY_MS);
            }
          }, WS_CONNECT_TIMEOUT_MS);

          ws.onopen = () => {
            clearTimeout(connectWatchdog);
            connectWatchdog = null;
            if (get().ws !== ws) {
              ws.close();
              return;
            }
            console.debug('[SymbolStore] Connected to feed WebSocket');
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
            set({ isConnected: true, isConnecting: false, feedError: '' });
            get().refreshFeedInventory(ws);
            if (connection.subscribe) ws.send(JSON.stringify({ type: 'subscribe', symbols: ["*"] }));
            scheduleMetadataFallback();
          };

          ws.onmessage = (e) => {
            if (get().ws !== ws) return;
            try {
              const updates = extractFeedTicks(e.data);
              if (updates.length > 0) {
                clearMetadataFallback();
                queueFeedTicks(updates, ws);
              }
            } catch (err) {
              console.error('[SymbolStore] WS parse error:', err);
            }
          };

          ws.onclose = () => {
            clearTimeout(connectWatchdog);
            connectWatchdog = null;
            clearMetadataFallback();
            if (get().ws !== ws) return;
            console.log('[SymbolStore] Disconnected. Reconnecting...');
            const message = 'Market feed unavailable: websocket disconnected. Reconnecting...';
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnected: false, isConnecting: false, ws: null, feedError: message,
            }));
            if (!get().feedError?.includes('Market feed disabled') && !reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
              }, WS_RECONNECT_DELAY_MS);
            }
          };

          ws.onerror = () => {
            clearTimeout(connectWatchdog);
            connectWatchdog = null;
            if (get().ws !== ws) return;
            const message = 'Market feed unavailable: websocket connection failed.';
            clearMetadataFallback();
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnected: false,
              isConnecting: false,
              ws: null,
              feedError: message,
            }));
            get().loadSymbolFallback(message, { setFeedError: true });
            try {
              ws.close();
            } catch {
              // The reconnect timer below will create a fresh socket.
            }
            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
              }, WS_RECONNECT_DELAY_MS);
            }
          };

          set({ ws });
        };

        connect();
      },

      syncMetadata: () => {
        set((state) => {
          if (Object.keys(state.symbols).length === 0) return {};
          if (state.symbolMetadata.length > 0) {
            const needsSync = state.symbolMetadata.some((entry) => {
              const symbol = state.symbols[entry.symbol];
              if (!symbol) return false;
              const nextFields = getSymbolFeedFields(symbol);
              return entry.feedState !== nextFields.feedState || entry.isStale !== nextFields.isStale;
            });
            if (!needsSync) return {};
            return {
              symbolMetadata: state.symbolMetadata.map((entry) => (
                state.symbols[entry.symbol] ? buildMetadataEntry(state.symbols[entry.symbol]) : entry
              )),
            };
          }
          return {
            symbolMetadata: buildSymbolMetadata(state.symbols),
          };
        });
      },

      getSymbolsByCategory: (category) => {
        return Object.values(get().symbols)
          .filter((s) => s.category === category)
          .sort((a, b) => a.symbol.localeCompare(b.symbol));
      },

      getGroupCounts: () => {
        const counts = {};
        Object.values(CATEGORIES).forEach(c => counts[c] = 0);
        Object.values(get().symbols).forEach(s => {
          counts[s.category] = (counts[s.category] || 0) + 1;
        });
        return counts;
      }
    }),
    {
      name: 'rtx-symbols-storage',
      storage: throttledSymbolStorage,
      partialize: (state) => ({ 
        symbols: state.symbols,
        symbolMetadata: state.symbolMetadata 
      }),
      merge: (persistedState, currentState) => {
        const mergedState = {
          ...currentState,
          ...(persistedState && typeof persistedState === 'object' ? persistedState : {}),
        };
        const cachedSymbols = markSymbolMapCached(mergedState.symbols, REHYDRATED_SYMBOL_REASON);

        return {
          ...mergedState,
          symbols: cachedSymbols,
          symbolMetadata: buildSymbolMetadata(cachedSymbols, REHYDRATED_SYMBOL_REASON),
          ws: null,
          isConnected: false,
          isConnecting: false,
        };
      },
    }
  )
);

export default useSymbolStore;
