import test from 'node:test';
import assert from 'node:assert/strict';

import { FEED_DATA_STATE } from './feedStatus.js';
import {
  createSocketBeforeBackgroundLoad,
  hasCurrentSessionLiveTick,
  isActiveFeedSocket,
  markSymbolMapCached,
  resolveFallbackFeedFields,
} from './symbolFeedLifecycle.js';

test('feed socket creation does not wait for an unresolved metadata fallback', async () => {
  const socket = { readyState: 0 };
  let fallbackStarted = false;

  const created = createSocketBeforeBackgroundLoad(
    () => socket,
    () => {
      fallbackStarted = true;
      return new Promise(() => {});
    }
  );

  assert.equal(created, socket);
  assert.equal(fallbackStarted, false);

  await Promise.resolve();
  assert.equal(fallbackStarted, true);
});

test('feed socket guard only treats CONNECTING and OPEN sockets as active', () => {
  assert.equal(isActiveFeedSocket({ readyState: 0 }), true);
  assert.equal(isActiveFeedSocket({ readyState: 1 }), true);
  assert.equal(isActiveFeedSocket({ readyState: 2 }), false);
  assert.equal(isActiveFeedSocket({ readyState: 3 }), false);
  assert.equal(isActiveFeedSocket(null), false);
});

test('current-session live ticks survive a later fallback merge', () => {
  const existing = {
    symbol: 'AMD.US-PERP',
    bid: '465.08000',
    ask: '465.17000',
    lastUpdate: Date.now(),
    feedState: FEED_DATA_STATE.LIVE,
    isStale: false,
  };

  assert.equal(hasCurrentSessionLiveTick(existing), true);
  assert.deepEqual(
    resolveFallbackFeedFields(existing, { isStale: true }, 'metadata fallback'),
    {
      feedState: FEED_DATA_STATE.LIVE,
      isStale: false,
      staleReason: '',
    }
  );
});

test('persisted symbol rows are cached until the current socket confirms a tick', () => {
  const cached = markSymbolMapCached({
    ALUMINIUM: {
      symbol: 'ALUMINIUM',
      bid: '3240.53000',
      ask: '3254.71300',
      lastUpdate: 123,
      feedState: FEED_DATA_STATE.LIVE,
      isStale: false,
    },
  }, 'Awaiting a current-session tick.');

  assert.equal(cached.ALUMINIUM.feedState, FEED_DATA_STATE.CACHED);
  assert.equal(cached.ALUMINIUM.isStale, true);
  assert.equal(cached.ALUMINIUM.staleReason, 'Awaiting a current-session tick.');
});
