import { buildFeedStatusUrl, isManagerMarketFeed } from '../config/endpoints';
import { symbolList, symbolsList } from './api';
import authService from './authService.js';
import { desktopFetch } from './desktopHttp.js';

export const SYMBOL_METADATA_FALLBACK_REASON =
  'Market feed unavailable: symbol metadata loaded without live prices.';

export const getSymbolName = (entry = {}) => {
  if (typeof entry === 'string') return entry.trim();
  return String(
    entry.symbol ||
    entry.Symbol ||
    entry.name ||
    entry.Name ||
    entry.symbol_name ||
    entry.symbolName ||
    ''
  ).trim();
};

const normalizeStatusSymbols = (status = {}) => {
  const statusRows = Array.isArray(status.symbol_status) ? status.symbol_status : [];
  const statusBySymbol = statusRows.reduce((acc, row) => {
    const symbol = getSymbolName(row);
    if (symbol) acc[symbol] = row;
    return acc;
  }, {});

  const available = Array.isArray(status.available_symbols) ? status.available_symbols : [];
  if (available.length > 0) {
    return available
      .map((symbol) => ({
        ...statusBySymbol[symbol],
        symbol,
        hasData: statusBySymbol[symbol]?.has_data,
        lastTickAgeSec: statusBySymbol[symbol]?.last_tick_age_sec,
      }))
      .filter((entry) => getSymbolName(entry));
  }

  return statusRows.filter((entry) => getSymbolName(entry));
};

export const fetchFeedStatus = async () => {
  const url = buildFeedStatusUrl();
  if (!url) throw new Error('Feed status URL is not configured.');

  const response = await desktopFetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Feed status request failed: HTTP ${response.status}`);
  }

  return response.json();
};

export const fetchSymbolMetadataFallback = async () => {
  if (!isManagerMarketFeed()) {
    try {
      const status = await fetchFeedStatus();
      const statusSymbols = normalizeStatusSymbols(status);
      if (statusSymbols.length > 0) {
        return {
          source: 'feed-status',
          symbols: statusSymbols,
          feedStatus: status,
        };
      }
    } catch {
      // Fall through to authenticated manager symbol APIs.
    }
  }

  if (!authService.getSessionStatus().authenticated) {
    return {
      source: 'none',
      symbols: [],
      feedStatus: null,
    };
  }

  try {
    const names = await symbolsList();
    if (Array.isArray(names) && names.length > 0) {
      return {
        source: 'symbols-list',
        symbols: names,
        feedStatus: null,
      };
    }
  } catch {
    // Fall through to cached/full symbol list only if lightweight list is unavailable.
  }

  if (authService.getSessionClaims().isAdmin) {
    try {
      const rows = await symbolList();
      if (Array.isArray(rows) && rows.length > 0) {
        return {
          source: 'symbol-list',
          symbols: rows,
          feedStatus: null,
        };
      }
    } catch {
      // The caller will keep any cached symbols and show the feed error.
    }
  }

  return {
    source: 'none',
    symbols: [],
    feedStatus: null,
  };
};
