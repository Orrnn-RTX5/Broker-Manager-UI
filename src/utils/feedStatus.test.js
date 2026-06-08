import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEED_DATA_STATE,
  getFeedAvailability,
  getFeedStatusCopy,
  getSymbolFeedStatus,
  hasCachedFeedRows,
} from './feedStatus.js';

test('feed status copy returns null when no feed error exists', () => {
  assert.equal(getFeedStatusCopy(''), null);
  assert.equal(getFeedStatusCopy(null), null);
});

test('feed status copy labels missing auth config as disabled', () => {
  const copy = getFeedStatusCopy(
    'Market feed disabled: configure FEED_BROKER_TOKEN or VITE_FEED_BROKER_TOKEN for this manager UI deployment.'
  );

  assert.equal(copy.title, 'Market feed disabled');
  assert.match(copy.message, /FEED_BROKER_TOKEN/);
  assert.match(copy.message, /VITE_FEED_BROKER_TOKEN/);
});

test('feed status copy redacts token-bearing websocket details', () => {
  const copy = getFeedStatusCopy(
    'Market feed unavailable: wss://feed.example/ws/feed?broker_id=gta_broker&token=secret-token'
  );

  assert.equal(copy.title, 'Market feed unavailable');
  assert.ok(!copy.message.includes('secret-token'), `token leaked: ${copy.message}`);
  assert.match(copy.message, /\[REDACTED_WS_URL\]/);
});

test('feed availability treats missing auth config as disabled and non-live', () => {
  const availability = getFeedAvailability({
    feedError: 'Market feed disabled: configure FEED_BROKER_TOKEN or VITE_FEED_BROKER_TOKEN.',
    isConnected: true,
  });

  assert.equal(availability.state, 'disabled');
  assert.equal(availability.isLive, false);
  assert.equal(availability.copy.title, 'Market feed disabled');
});

test('symbol feed status does not label cached rows live when feed is disabled', () => {
  const status = getSymbolFeedStatus({
    feedError: 'Market feed disabled: configure FEED_BROKER_TOKEN or VITE_FEED_BROKER_TOKEN.',
    isConnected: true,
    symbol: { symbol: 'EURUSD', bid: '1.00000', ask: '1.00010' },
  });

  assert.equal(status.state, FEED_DATA_STATE.CACHED);
  assert.equal(status.label, 'Cached');
  assert.equal(status.isLive, false);
});

test('symbol feed status preserves live display for healthy connected feed rows', () => {
  const status = getSymbolFeedStatus({
    feedError: '',
    isConnected: true,
    symbol: { symbol: 'EURUSD', bid: '1.00000', ask: '1.00010', isStale: false },
  });

  assert.equal(status.state, FEED_DATA_STATE.LIVE);
  assert.equal(status.label, 'Live');
  assert.equal(status.isLive, true);
});

test('symbol feed status keeps persisted stale rows cached until refreshed', () => {
  const status = getSymbolFeedStatus({
    feedError: '',
    isConnected: true,
    symbol: { symbol: 'EURUSD', feedState: FEED_DATA_STATE.CACHED, isStale: true },
  });

  assert.equal(status.state, FEED_DATA_STATE.CACHED);
  assert.equal(status.label, 'Cached');
  assert.equal(status.isLive, false);
});

test('cached feed row notice helper only flags rows when a feed error exists', () => {
  assert.equal(hasCachedFeedRows({ feedError: 'Market feed unavailable', rows: [{ symbol: 'EURUSD' }] }), true);
  assert.equal(hasCachedFeedRows({ feedError: '', rows: [{ symbol: 'EURUSD' }] }), false);
  assert.equal(hasCachedFeedRows({ feedError: 'Market feed unavailable', rows: [] }), false);
});
