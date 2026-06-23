import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFeedTicks } from './feedMessages.js';

test('extractFeedTicks accepts single tick frames', () => {
  const ticks = extractFeedTicks('{"symbol":"EURUSD","bid":1.1,"ask":1.2}');

  assert.equal(ticks.length, 1);
  assert.equal(ticks[0].symbol, 'EURUSD');
});

test('extractFeedTicks accepts batched ticks frames', () => {
  const ticks = extractFeedTicks(JSON.stringify({
    type: 'ticks',
    ticks: [
      { symbol: '1000XBONK', bid: 0.00435, ask: 0.00441 },
      { symbol: 'BTCUSD', bid: 63300.12, ask: 63310.34 },
    ],
  }));

  assert.equal(ticks.length, 2);
  assert.equal(ticks[0].symbol, '1000XBONK');
  assert.equal(ticks[1].ask, 63310.34);
});
