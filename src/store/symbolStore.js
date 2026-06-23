import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  buildFeedWsUrl,
  FEED_WS_AUTH_NOT_CONFIGURED_MESSAGE,
  getFeedWsDisabledMessage,
} from '../config/endpoints';
import {
  fetchSymbolMetadataFallback,
  getSymbolName,
  SYMBOL_METADATA_FALLBACK_REASON,
} from '../services/symbolMetadata';
import { FEED_DATA_STATE } from '../utils/feedStatus';
import { extractFeedTicks } from '../utils/feedMessages';

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
  const nextSymbols = Object.entries(state.symbols || {}).reduce((acc, [key, entry]) => {
    acc[key] = {
      ...entry,
      ...getSymbolFeedFields(entry, reason),
    };
    return acc;
  }, {});

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
    const bid = getEntryValue(source, ['bid', 'Bid', 'price_bid', 'priceBid']);
    const ask = getEntryValue(source, ['ask', 'Ask', 'price_ask', 'priceAsk']);

    acc[symbol] = {
      ...existing,
      ...source,
      symbol,
      bid: formatPrice(bid, existing.bid || '0.00000'),
      ask: formatPrice(ask, existing.ask || '0.00000'),
      lastUpdate: existing.lastUpdate || now,
      category: source.category || source.Category || existing.category || getCategory(symbol),
      dir: existing.dir || 'up',
      ...getSymbolFeedFields(source, staleReason),
    };
    return acc;
  }, { ...currentSymbols });
};

const hasFeedQueryToken = (wsUrl = '') => {
  const raw = String(wsUrl || '');
  if (!raw) return false;
  try {
    const url = new URL(raw, 'http://rtx.local');
    return Boolean(String(url.searchParams.get('token') || '').trim());
  } catch {
    const query = raw.split('?')[1]?.split('#')[0];
    if (!query) return false;
    try {
      return Boolean(String(new URLSearchParams(query).get('token') || '').trim());
    } catch {
      return false;
    }
  }
};

let symbolFallbackPromise = null;

const useSymbolStore = create(
  persist(
    (set, get) => ({
      symbols: {}, // Object keyed by symbol name: { symbol, bid, ask, lastUpdate, category }
      symbolMetadata: [], // Stable list of metadata
      ws: null,
      isConnected: false,
      isConnecting: false,
      feedError: '',

      upsertSymbols: (dataArray) => {
        set((state) => {
          const nextSymbols = { ...state.symbols };
          const now = Date.now();
          let metadataUpdated = false;

          const updatedSymbols = new Set();

          dataArray.forEach(data => {
            const symbol = getSymbolName(data);
            if (!symbol) return;
            const { bid, ask } = data;
            if (!nextSymbols[symbol]) metadataUpdated = true;
            updatedSymbols.add(symbol);

            const previousBid = Number(nextSymbols[symbol]?.bid);
            const nextBid = Number(bid);
            const dir = Number.isFinite(previousBid) && Number.isFinite(nextBid)
              ? (nextBid >= previousBid ? 'up' : 'down')
              : (nextSymbols[symbol]?.dir || 'up');
            
            const category = getCategory(symbol);
            nextSymbols[symbol] = {
              ...(nextSymbols[symbol] || {}),
              symbol,
              bid: bid !== undefined && bid !== null ? Number(bid).toFixed(5) : (nextSymbols[symbol]?.bid || '0.00000'),
              ask: ask !== undefined && ask !== null ? Number(ask).toFixed(5) : (nextSymbols[symbol]?.ask || '0.00000'),
              lastUpdate: now,
              category,
              dir,
              feedState: FEED_DATA_STATE.LIVE,
              isStale: false,
              staleReason: '',
            };
          });

          const nextState = { symbols: nextSymbols };
          
          // Recompute metadata if it's empty or a new symbol was added
          if (metadataUpdated || (state.symbolMetadata && state.symbolMetadata.length === 0 && Object.keys(nextSymbols).length > 0)) {
            nextState.symbolMetadata = buildSymbolMetadata(nextSymbols);
          } else if (updatedSymbols.size > 0 && state.symbolMetadata?.length > 0) {
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
            if (!Array.isArray(result.symbols) || result.symbols.length === 0) {
              return options.setFeedError
                ? {
                    ...markCachedSymbolData(state, reason),
                    feedError: reason,
                  }
                : {};
            }

            const nextSymbols = buildFallbackSymbols(result.symbols, reason, state.symbols);
            return {
              symbols: nextSymbols,
              symbolMetadata: buildSymbolMetadata(nextSymbols, reason),
              ...(options.setFeedError ? { feedError: reason } : {}),
            };
          });

          return result;
        })().finally(() => {
          symbolFallbackPromise = null;
        });

        return symbolFallbackPromise;
      },

      initWebSocket: () => {
        if (get().ws || get().isConnecting) return;

        const connect = async () => {
          if (get().ws || get().isConnecting) return;
          set({ isConnecting: true });

          const fallback = await get().loadSymbolFallback(SYMBOL_METADATA_FALLBACK_REASON).catch(() => null);

          let wsUrl;
          try {
            wsUrl = buildFeedWsUrl();
          } catch (err) {
            const message = getFeedWsDisabledMessage(err);
            console.warn(`[SymbolStore] ${message}`);
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnected: false,
              isConnecting: false,
              ws: null,
              feedError: message,
            }));
            return;
          }

          if (fallback?.feedAuthRequired && !hasFeedQueryToken(wsUrl)) {
            const message = FEED_WS_AUTH_NOT_CONFIGURED_MESSAGE;
            console.warn(`[SymbolStore] ${message}`);
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnected: false,
              isConnecting: false,
              ws: null,
              feedError: message,
            }));
            return;
          }

          console.debug('[SymbolStore] Connecting to feed WebSocket');
          let ws;
          try {
            ws = new WebSocket(wsUrl);
          } catch {
            const message = 'Market feed unavailable: websocket connection could not be started.';
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnected: false,
              isConnecting: false,
              ws: null,
              feedError: message,
            }));
            return;
          }

          ws.onopen = () => {
            console.debug('[SymbolStore] Connected to feed WebSocket');
            set({ isConnected: true, isConnecting: false, feedError: '' });
            ws.send(JSON.stringify({ type: 'subscribe', symbols: ["*"] }));
          };

          ws.onmessage = (e) => {
            try {
              const updates = extractFeedTicks(e.data);
              if (updates.length > 0) {
                get().upsertSymbols(updates);
              }
            } catch (err) {
              console.error('[SymbolStore] WS parse error:', err);
            }
          };

          ws.onclose = () => {
            console.log('[SymbolStore] Disconnected. Reconnecting...');
            set({ isConnected: false, isConnecting: false, ws: null });
            if (!get().feedError?.includes('Market feed disabled')) {
              setTimeout(connect, 5000);
            }
          };

          ws.onerror = () => {
            const message = 'Market feed unavailable: websocket connection failed.';
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnecting: false,
              feedError: message,
            }));
            get().loadSymbolFallback(message, { setFeedError: true });
            ws.close();
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
      partialize: (state) => ({ 
        symbols: state.symbols,
        symbolMetadata: state.symbolMetadata 
      }),
    }
  )
);

export default useSymbolStore;
