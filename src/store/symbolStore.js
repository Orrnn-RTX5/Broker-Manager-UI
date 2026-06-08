import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildFeedWsUrl, getFeedWsDisabledMessage } from '../config/endpoints';
import { FEED_DATA_STATE } from '../utils/feedStatus';

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

const getSymbolName = (entry = {}) => String(entry.symbol || '').trim();

const getSymbolFeedFields = (entry = {}, staleReason = '') => {
  const isStale = Boolean(staleReason || entry.isStale || entry.feedState === FEED_DATA_STATE.CACHED);
  return {
    feedState: isStale ? FEED_DATA_STATE.CACHED : FEED_DATA_STATE.LIVE,
    isStale,
    staleReason: isStale ? (staleReason || entry.staleReason || '') : '',
  };
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

const useSymbolStore = create(
  persist(
    (set, get) => ({
      symbols: {}, // Object keyed by symbol name: { symbol, bid, ask, lastUpdate, category }
      symbolMetadata: [], // Stable list of metadata
      ws: null,
      isConnected: false,
      feedError: '',

      upsertSymbols: (dataArray) => {
        set((state) => {
          const nextSymbols = { ...state.symbols };
          const now = Date.now();
          let metadataUpdated = false;

          const updatedSymbols = new Set();

          dataArray.forEach(data => {
            const { symbol, bid, ask } = data;
            if (!nextSymbols[symbol]) metadataUpdated = true;
            updatedSymbols.add(symbol);
            
            const category = getCategory(symbol);
            nextSymbols[symbol] = {
              ...(nextSymbols[symbol] || {}),
              symbol,
              bid: bid !== undefined && bid !== null ? Number(bid).toFixed(5) : (nextSymbols[symbol]?.bid || '0.00000'),
              ask: ask !== undefined && ask !== null ? Number(ask).toFixed(5) : (nextSymbols[symbol]?.ask || '0.00000'),
              lastUpdate: now,
              category,
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

      initWebSocket: () => {
        if (get().ws) return;

        const connect = () => {
          let wsUrl;
          try {
            wsUrl = buildFeedWsUrl();
          } catch (err) {
            const message = getFeedWsDisabledMessage(err);
            console.warn(`[SymbolStore] ${message}`);
            set((state) => ({
              ...markCachedSymbolData(state, message),
              isConnected: false,
              ws: null,
              feedError: message,
            }));
            return;
          }

          console.debug('[SymbolStore] Connecting to feed WebSocket');
          const ws = new WebSocket(wsUrl);

          ws.onopen = () => {
            console.debug('[SymbolStore] Connected to feed WebSocket');
            set({ isConnected: true, feedError: '' });
            ws.send(JSON.stringify({ type: 'subscribe', symbols: ["*"] }));
          };

          ws.onmessage = (e) => {
            try {
              const messages = e.data.trim().split('\n');
              const updates = [];
              messages.forEach(msgStr => {
                if (!msgStr) return;
                const msg = JSON.parse(msgStr);
                if (msg.symbol && (msg.bid !== undefined || msg.ask !== undefined)) {
                  updates.push(msg);
                }
              });
              if (updates.length > 0) {
                get().upsertSymbols(updates);
              }
            } catch (err) {
              console.error('[SymbolStore] WS parse error:', err);
            }
          };

          ws.onclose = () => {
            console.log('[SymbolStore] Disconnected. Reconnecting...');
            set({ isConnected: false, ws: null });
            setTimeout(connect, 5000);
          };

          ws.onerror = () => {
            const message = 'Market feed unavailable: websocket connection failed.';
            set((state) => ({
              ...markCachedSymbolData(state, message),
              feedError: message,
            }));
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
