import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildFeedWsUrl } from '../config/endpoints';

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

const useSymbolStore = create(
  persist(
    (set, get) => ({
      symbols: {}, // Object keyed by symbol name: { symbol, bid, ask, lastUpdate, category }
      symbolMetadata: [], // Stable list of metadata
      ws: null,
      isConnected: false,

      upsertSymbols: (dataArray) => {
        set((state) => {
          const nextSymbols = { ...state.symbols };
          const now = Date.now();
          let metadataUpdated = false;

          dataArray.forEach(data => {
            const { symbol, bid, ask } = data;
            if (!nextSymbols[symbol]) metadataUpdated = true;
            
            const category = getCategory(symbol);
            nextSymbols[symbol] = {
              ...(nextSymbols[symbol] || {}),
              symbol,
              bid: bid !== undefined && bid !== null ? Number(bid).toFixed(5) : (nextSymbols[symbol]?.bid || '0.00000'),
              ask: ask !== undefined && ask !== null ? Number(ask).toFixed(5) : (nextSymbols[symbol]?.ask || '0.00000'),
              lastUpdate: now,
              category,
            };
          });

          const nextState = { symbols: nextSymbols };
          
          // Recompute metadata if it's empty or a new symbol was added
          if (metadataUpdated || (state.symbolMetadata && state.symbolMetadata.length === 0 && Object.keys(nextSymbols).length > 0)) {
            nextState.symbolMetadata = Object.values(nextSymbols)
              .map(s => ({ symbol: s.symbol, category: s.category || getCategory(s.symbol) }))
              .filter(s => s.symbol)
              .sort((a, b) => a.symbol.localeCompare(b.symbol));
          }

          return nextState;
        });
      },

      initWebSocket: () => {
        if (get().ws) return;

        const connect = () => {
          const ws = new WebSocket(buildFeedWsUrl());
          
          ws.onopen = () => {
            console.log('[SymbolStore] Connected to WebSocket');
            set({ isConnected: true });
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

          ws.onerror = (err) => {
            console.error('[SymbolStore] WS error:', err);
            ws.close();
          };

          set({ ws });
        };

        connect();
      },

      syncMetadata: () => {
        set((state) => {
          if (state.symbolMetadata.length > 0 || Object.keys(state.symbols).length === 0) return {};
          return {
            symbolMetadata: Object.values(state.symbols)
              .map(s => ({ symbol: s.symbol, category: s.category || getCategory(s.symbol) }))
              .filter(s => s.symbol)
              .sort((a, b) => a.symbol.localeCompare(b.symbol))
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
