import { buildFeedStatusUrl } from '../config/endpoints.js';
import { desktopFetch } from './desktopHttp.js';

const getName = (entry) => {
  const value = typeof entry === 'string' ? entry : (
    entry?.symbol || entry?.Symbol || entry?.name || entry?.Name
    || entry?.symbol_name || entry?.symbolName || entry?.SymbolName
  );
  return typeof value === 'string' ? value.trim() : '';
};

// Feed availability proves only that a name exists. It does not establish a
// manager configuration, enabled status, calculation mode, or trading limits.
export const normalizeAvailableSymbolNames = (status) => {
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    throw new Error('Invalid available symbol catalogue response.');
  }
  const sources = [status.available_symbols, status.symbol_status];
  if (!sources.some(Array.isArray) || sources.some(value => value !== undefined && !Array.isArray(value))) {
    throw new Error('Invalid available symbol catalogue response.');
  }

  const names = new Set();
  sources.forEach(rows => {
    rows?.forEach(entry => {
      const symbol = getName(entry);
      if (symbol) names.add(symbol);
    });
  });
  return [...names].map(symbol => ({ symbol }));
};

export const fetchAvailableSymbolNames = async ({ signal } = {}) => {
  const url = buildFeedStatusUrl();
  if (!url) throw new Error('Feed status URL is not configured.');
  const response = await desktopFetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Available symbol catalogue request failed: HTTP ${response.status}`);
  }
  return normalizeAvailableSymbolNames(await response.json());
};
