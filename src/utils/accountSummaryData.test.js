import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountSummaryRows, selectAccountSummary } from './accountSummaryData.js';

test('summary selects the requested account from an enveloped batch', () => {
  const payload = { answer: [{ Login: 11, Balance: 500 }, { Login: 12, Balance: 750 }] };
  assert.equal(selectAccountSummary(payload, '12').Balance, 750);
  assert.equal(selectAccountSummary(payload, '13'), null);
  assert.equal(selectAccountSummary({ Login: 11, Balance: 500 }, '12'), null);
});

test('summary formats financial values, preserves login ids, and labels Free Margin', () => {
  const rows = buildAccountSummaryRows([{ Login: 200002, Balance: 10000, Equity: 10000, Profit: -2.5, Margin: 0, FreeMargin: 10000 }], {}, '200002');
  assert.deepEqual(rows.map(row => [row.label, row.value]), [['Login', '200002'], ['Balance', '10,000.00'], ['Equity', '10,000.00'], ['Profit / Loss', '-2.50'], ['Margin', '0.00'], ['Free Margin', '10,000.00']]);
  assert.equal(rows[3].tone, 'is-negative');
});

test('summary distinguishes missing amounts from actual zero and respects currency precision', () => {
  const rows = buildAccountSummaryRows({ currency_digits: 3, balance: '1,234.567', equity: null, profit: 0, margin: ' ', free_margin: 'invalid' }, {}, '7');
  assert.equal(rows[1].value, '1,234.567');
  assert.equal(rows[2].value, '—');
  assert.equal(rows[3].value, '0.000');
  assert.equal(rows[3].tone, '');
  assert.equal(rows[4].value, '—');
  assert.equal(rows[5].value, '—');
});

test('available grid values paint before a summary arrives without inventing other metrics', () => {
  const rows = buildAccountSummaryRows(null, { login: '7', balance: 0 }, '7');
  assert.equal(rows[1].value, '0.00');
  assert.equal(rows[2].value, '—');
  assert.equal(rows[4].value, '—');
  const live = buildAccountSummaryRows({ Login: 7, Balance: null, Profit: 5 }, { balance: 100 }, '7');
  assert.equal(live[1].value, '—', 'a missing authoritative amount must not revive an old grid amount');
  assert.equal(live[3].tone, 'is-positive');
});
