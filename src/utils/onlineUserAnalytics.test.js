import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichOnlineUserRows } from './onlineUserAnalytics.js';

test('matched rows without a reported currency stay unknown instead of inventing USD', () => {
  const rows = enrichOnlineUserRows(
    [{ login: '200001', type: 'Web', equity: 100 }],
    [{ login: '200001', name: 'Trader', group: 'Real\\STD' }],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].currency, '');
});

test('unmatched rows without a reported currency stay unknown', () => {
  const rows = enrichOnlineUserRows([{ login: '200002', type: 'Web' }], []);
  assert.equal(rows[0].currency, '');
});

test('explicit session-row and matched-account currencies are preserved', () => {
  const rows = enrichOnlineUserRows(
    [{ login: '1', currency: 'EUR' }, { login: '2' }, { login: '3', Currency: '  usd ' }],
    [{ login: '2', Currency: 'GBP' }],
  );
  assert.equal(rows[0].currency, 'EUR');
  assert.equal(rows[1].currency, 'GBP');
  assert.equal(rows[2].currency, 'usd');
});
