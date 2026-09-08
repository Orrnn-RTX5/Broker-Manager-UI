import test from 'node:test';
import assert from 'node:assert/strict';
import { TRADE_COLUMNS, tradeCells } from './terminalTrades.js';

test('terminal exposes only the requested trade columns in order', () => {
  assert.deepEqual(TRADE_COLUMNS, ['Ticket', 'Login', 'User Name', 'Email', 'Symbol', 'Action', 'Lots', 'Open', 'Current', 'S/L', 'T/P', 'Storage', 'Profit', 'Comment']);
});

test('maps normalized trades without losing zero values or price precision', () => {
  assert.deepEqual(tradeCells({ position: 123, login: '42', name: 'Trader', email: 'trader@example.test', symbol: 'EURUSD', type: 'sell', volume: 0.01, priceOpen: 1.12345, priceCurrent: 1.12346, priceSl: 0, priceTp: 0, swap: -2.5, profit: 0, comment: 'Test' }),
    [123, '42', 'Trader', 'trader@example.test', 'EURUSD', 'SELL', '0.01', 1.12345, 1.12346, 0, 0, '-2.50', '0.00', 'Test']);
});

test('missing data is not fabricated', () => {
  assert.deepEqual(tradeCells({}), Array(14).fill('—'));
});
