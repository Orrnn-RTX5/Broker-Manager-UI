import { FEED_DATA_STATE } from './feedStatus.js';

export const isLiveMarketQuote = (quote = {}) => (
  quote.isStale !== true && quote.feedState === FEED_DATA_STATE.LIVE
);

export const sortMarketWatchQuotes = (quotes = []) => [...quotes].sort((a, b) => {
  const freshnessOrder = Number(!isLiveMarketQuote(a)) - Number(!isLiveMarketQuote(b));
  return freshnessOrder || String(a.symbol || '').localeCompare(String(b.symbol || ''));
});

export const summarizeMarketWatchQuotes = (quotes = []) => quotes.reduce(
  (summary, quote) => {
    if (isLiveMarketQuote(quote)) summary.live += 1;
    else summary.cached += 1;
    return summary;
  },
  { live: 0, cached: 0 }
);
