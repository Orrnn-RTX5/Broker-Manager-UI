import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderMetrics,
  buildOrdersByReason,
  getOrderReason,
  toFiniteNumber,
} from './orderAnalytics.js';

test('order metrics count visible rows by side and symbol', () => {
  const metrics = buildOrderMetrics([
    { type: 'buy', symbol: 'EURUSD', volume: 0.5 },
    { side: 'sell', symbol: 'XAUUSD', volume: '1.25' },
    { action: 'BUY', symbol: 'EURUSD', lots: 2 },
    { type: 'Market', side: 'buy', symbol: 'BTCUSD', volume: 0.01 },
    { type: 'unknown', symbol: '', volume: 'bad-value' },
  ]);

  assert.deepEqual(metrics, {
    totalOrders: 5,
    buyOrders: 3,
    sellOrders: 1,
    symbols: 3,
    totalVolume: 3.76,
    netProfit: 0,
  });
});

test('order reason aggregation uses real row fields with unspecified fallback', () => {
  assert.equal(getOrderReason({ comment: 'Mobile' }), 'Mobile');
  assert.equal(getOrderReason({ state: 'placed' }), 'placed');
  assert.equal(getOrderReason({ status: 'placed' }), 'placed');
  assert.equal(getOrderReason({}), 'Unspecified');

  assert.deepEqual(buildOrdersByReason([
    { comment: 'Mobile' },
    { Comment: 'Mobile' },
    { status: 'expert' },
    { reason: 'expert' },
    {},
  ]), [
    { name: 'expert', value: 2, percentage: 40 },
    { name: 'Mobile', value: 2, percentage: 40 },
    { name: 'Unspecified', value: 1, percentage: 20 },
  ]);
});

test('order numeric parsing accepts finite values only', () => {
  assert.equal(toFiniteNumber('1,250.50'), 1250.5);
  assert.equal(toFiniteNumber('bad'), 0);
  assert.equal(toFiniteNumber(Number.NaN), 0);
});

test('order metrics use lots before raw volume and include net profit', () => {
  assert.deepEqual(buildOrderMetrics([
    { side: 'buy', lots: 0.01, volume: 100, profit: '-7.20' },
    { side: 'sell', volume: 200, profit: 8.23 },
  ]), {
    totalOrders: 2,
    buyOrders: 1,
    sellOrders: 1,
    symbols: 0,
    totalVolume: 0.03,
    netProfit: 1.03,
  });
});
