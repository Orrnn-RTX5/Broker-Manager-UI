import { FEED_DATA_STATE } from './feedStatus.js';

export const createSocketBeforeBackgroundLoad = (createSocket, loadInBackground) => {
  const socket = createSocket();
  Promise.resolve()
    .then(() => loadInBackground())
    .catch(() => null);
  return socket;
};

export const isActiveFeedSocket = (socket) => (
  socket?.readyState === 0 || socket?.readyState === 1
);

export const hasCurrentSessionLiveTick = (entry = {}) => (
  entry.feedState === FEED_DATA_STATE.LIVE
  && entry.isStale !== true
  && Number.isFinite(Number(entry.lastUpdate))
  && Number(entry.lastUpdate) > 0
);

export const resolveFallbackFeedFields = (
  existing = {},
  fallback = {},
  staleReason = ''
) => {
  if (hasCurrentSessionLiveTick(existing)) {
    return {
      feedState: FEED_DATA_STATE.LIVE,
      isStale: false,
      staleReason: '',
    };
  }

  const isStale = Boolean(
    staleReason
    || fallback.isStale
    || fallback.feedState === FEED_DATA_STATE.CACHED
  );

  return {
    feedState: isStale ? FEED_DATA_STATE.CACHED : FEED_DATA_STATE.LIVE,
    isStale,
    staleReason: isStale ? (staleReason || fallback.staleReason || '') : '',
  };
};

export const markSymbolMapCached = (symbols = {}, staleReason = '') => (
  Object.entries(symbols || {}).reduce((acc, [key, entry]) => {
    acc[key] = {
      ...entry,
      feedState: FEED_DATA_STATE.CACHED,
      isStale: true,
      staleReason,
    };
    return acc;
  }, {})
);
