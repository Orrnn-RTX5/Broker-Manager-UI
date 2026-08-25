import test from 'node:test';
import assert from 'node:assert/strict';
import { sortMarketWatchQuotes, summarizeMarketWatchQuotes } from './marketWatchQuotes.js';

test('Market Watch sorts tick-confirmed live quotes before cached quotes', () => {
  const quotes = sortMarketWatchQuotes([
    { symbol: '0001.HK', isStale: true, feedState: 'cached' },
    { symbol: 'USDCHF', isStale: false, feedState: 'live' },
    { symbol: 'AUDUSD', isStale: false, feedState: 'live' },
    { symbol: '0002.HK', isStale: true, feedState: 'cached' },
  ]);

  assert.deepEqual(quotes.map((quote) => quote.symbol), [
    'AUDUSD',
    'USDCHF',
    '0001.HK',
    '0002.HK',
  ]);
});

test('Market Watch summary separates live and cached quotes', () => {
  assert.deepEqual(summarizeMarketWatchQuotes([
    { symbol: 'AUDUSD', isStale: false, feedState: 'live' },
    { symbol: '0001.HK', isStale: true, feedState: 'cached' },
  ]), { live: 1, cached: 1 });
});
