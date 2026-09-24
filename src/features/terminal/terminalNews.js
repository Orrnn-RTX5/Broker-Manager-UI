// Terminal news feed — a lightweight in-app journal of data changes rendered
// by the News tab. The MetaTrader manager News tab reports broker events; the
// equivalent signal available here is the symbol book changing (symbols added
// or deleted), so a store-level watcher on symbolMetadata produces entries.
// Entries and the last seen symbol set persist in localStorage, which means a
// change made while the app was closed is still reported on the next launch.
import useSymbolStore from '../../store/symbolStore';

const STORAGE_KEY = 'rtx5_terminal_news_v1';
const SEEN_SYMBOLS_KEY = 'rtx5_terminal_news_seen_symbols_v1';
const MAX_ENTRIES = 500;

const readStorage = (key) => {
  try {
    if (typeof localStorage === 'undefined') return null;
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};
const writeStorage = (key, value) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or storage denied — the in-memory feed still works.
  }
};

let entries = (() => {
  const stored = readStorage(STORAGE_KEY);
  return Array.isArray(stored) ? stored.slice(-MAX_ENTRIES) : [];
})();
let nextEntryId = entries.reduce((max, entry) => Math.max(max, Number(entry?.id) || 0), 0) + 1;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => {
  try {
    listener(entries);
  } catch {
    // Listener errors must not break the feed.
  }
});

export const getTerminalNewsEntries = () => entries;

export const addTerminalNewsEntry = ({ subject, category = 'General' } = {}) => {
  const text = String(subject || '').trim();
  if (!text) return null;
  const entry = { id: nextEntryId++, time: Date.now(), subject: text, category };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  writeStorage(STORAGE_KEY, entries);
  notify();
  return entry;
};

export const clearTerminalNews = () => {
  entries = [];
  writeStorage(STORAGE_KEY, entries);
  notify();
};

export const subscribeToTerminalNews = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// --- Symbol add/delete watcher --------------------------------------------

const readSeenSymbols = () => {
  const raw = readStorage(SEEN_SYMBOLS_KEY);
  return Array.isArray(raw) ? new Set(raw.filter(Boolean).map(String)) : null;
};
const writeSeenSymbols = (set) => writeStorage(SEEN_SYMBOLS_KEY, [...set]);

let symbolWatcherStarted = false;
const startSymbolNewsWatcher = () => {
  if (symbolWatcherStarted) return;
  symbolWatcherStarted = true;

  let seen = readSeenSymbols();
  let lastMetadata = null;

  const inspect = (metadata) => {
    if (!Array.isArray(metadata) || metadata.length === 0 || metadata === lastMetadata) return;
    lastMetadata = metadata;
    const current = new Set(metadata.map((entry) => String(entry?.symbol || '')).filter(Boolean));
    if (seen === null) {
      // First contact ever: adopt the current book silently — an initial list
      // is not news.
      seen = current;
      writeSeenSymbols(seen);
      return;
    }
    current.forEach((symbol) => {
      if (!seen.has(symbol)) {
        addTerminalNewsEntry({ subject: `Symbol ${symbol} added`, category: 'Symbols' });
      }
    });
    seen.forEach((symbol) => {
      if (!current.has(symbol)) {
        addTerminalNewsEntry({ subject: `Symbol ${symbol} deleted`, category: 'Symbols' });
      }
    });
    seen = current;
    writeSeenSymbols(seen);
  };

  inspect(useSymbolStore.getState().symbolMetadata);
  useSymbolStore.subscribe((state) => inspect(state.symbolMetadata));
};

startSymbolNewsWatcher();
