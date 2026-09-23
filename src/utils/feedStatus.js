import { redactUrl } from './redaction.js';

export const FEED_DATA_STATE = {
  LIVE: 'live',
  CACHED: 'cached',
  CONNECTING: 'connecting',
};

export const getFeedStatusCopy = (feedError) => {
  const message = redactUrl(String(feedError || '').trim());
  if (!message) return null;

  return {
    title: 'Market feed unavailable',
    message,
  };
};

export const getFeedAvailability = ({ feedError = '', isConnected = false } = {}) => {
  const copy = getFeedStatusCopy(feedError);
  if (copy) {
    return {
      state: 'unavailable',
      isLive: false,
      copy,
    };
  }

  if (isConnected) {
    return {
      state: FEED_DATA_STATE.LIVE,
      isLive: true,
      copy: null,
    };
  }

  return {
    state: FEED_DATA_STATE.CONNECTING,
    isLive: false,
    copy: null,
  };
};

export const getSymbolFeedStatus = ({
  feedError = '',
  isConnected = false,
  symbol = {},
} = {}) => {
  const availability = getFeedAvailability({ feedError, isConnected });
  const isMarkedStale = Boolean(symbol?.isStale || symbol?.feedState === FEED_DATA_STATE.CACHED);

  if (availability.copy || isMarkedStale) {
    return {
      state: FEED_DATA_STATE.CACHED,
      label: 'Cached',
      isLive: false,
      tone: 'muted',
      title: availability.copy
        ? `${availability.copy.title}: cached symbol data is not live.`
        : 'Cached symbol data is not live yet.',
      copy: availability.copy,
    };
  }

  if (availability.isLive) {
    return {
      state: FEED_DATA_STATE.LIVE,
      label: 'Live',
      isLive: true,
      tone: 'success',
      title: 'Live market feed',
      copy: null,
    };
  }

  return {
    state: FEED_DATA_STATE.CONNECTING,
    label: 'Connecting',
    isLive: false,
    tone: 'muted',
    title: 'Waiting for live market feed connection.',
    copy: null,
  };
};

export const hasCachedFeedRows = ({ feedError = '', rows = [] } = {}) =>
  Boolean(getFeedStatusCopy(feedError) && Array.isArray(rows) && rows.length > 0);
