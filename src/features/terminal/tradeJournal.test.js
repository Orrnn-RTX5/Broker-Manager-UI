import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildJournalRequest,
  clearTradeJournal,
  formatJournalTime,
  getTradeJournalEntries,
  recordPositionMutation,
  recordPositionSnapshot,
  resetTradeJournal,
  addTradeJournalListener as subscribeToTradeJournal,
} from './tradeJournalCore.js';

test('first snapshot seeds state without logging already-open positions', () => {
  resetTradeJournal();
  recordPositionSnapshot([{ ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01 }]);
  assert.equal(getTradeJournalEntries().length, 0);
});

test('snapshot diffs log open, modify and close within covered slices', () => {
  resetTradeJournal();
  const t0 = Date.now();
  recordPositionSnapshot([
    { ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01, price_sl: 0, price_tp: 0 },
  ], t0);
  recordPositionSnapshot([
    { ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01, price_sl: 1.1, price_tp: 1.2 },
    { ticket: 101, account_login: 200002, symbol: 'XAUUSD', side: 'sell', volume: 0.02 },
  ], t0 + 100);
  // This frame covers 200002|XAUUSD and 200001|EURUSD. Ticket 100 sits inside
  // the covered EURUSD slice, so its absence logs a close; ticket 101 stays.
  recordPositionSnapshot([
    { ticket: 101, account_login: 200002, symbol: 'XAUUSD', side: 'sell', volume: 0.02 },
    { ticket: 102, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.03 },
  ], t0 + 200);

  const entries = getTradeJournalEntries();
  assert.equal(entries.length, 3);
  assert.equal(entries[0].request, 'modify #100 buy 0.01 EURUSD -> sl: 1.1, tp: 1.2');
  assert.equal(entries[1].request, 'market buy 0.03 EURUSD');
  assert.equal(entries[1].side, 'buy');
  assert.equal(entries[2].request, "for '200001' buy 0.01 EURUSD, close #100");
  assert.equal(entries[2].side, 'buy');
  assert.ok(entries.every((entry) => entry.answer === 'Done'));
});

test('per-symbol frames merge instead of closing each other out', () => {
  resetTradeJournal();
  const t0 = Date.now();
  recordPositionSnapshot([
    { ticket: 1, account_login: 200001, symbol: 'BTCUSD', side: 'buy', volume: 0.01 },
  ], t0);
  // A XAUUSD-only frame must not mark the BTCUSD position closed.
  recordPositionSnapshot([
    { ticket: 2, account_login: 200001, symbol: 'XAUUSD', side: 'sell', volume: 0.02 },
  ], t0 + 2000);
  // Replaying the BTCUSD slice must not re-open #1 or close XAUUSD #2.
  recordPositionSnapshot([
    { ticket: 1, account_login: 200001, symbol: 'BTCUSD', side: 'buy', volume: 0.01 },
  ], t0 + 4000);
  assert.equal(getTradeJournalEntries().length, 0);
});

test('a new ticket in a never-seen slice logs an open once the seed window passed', () => {
  resetTradeJournal();
  const t0 = Date.now();
  recordPositionSnapshot([
    { ticket: 1, account_login: 200001, symbol: 'BTCUSD', side: 'buy', volume: 0.01 },
  ], t0);
  recordPositionSnapshot([
    { ticket: 2, account_login: 200001, symbol: 'ETHUSD', side: 'buy', volume: 0.5 },
  ], t0 + 9000);
  const entries = getTradeJournalEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].request, 'market buy 0.50 ETHUSD');
});

test('lifecycle frames log once and are not repeated by the following snapshot', () => {
  resetTradeJournal();
  recordPositionMutation({ action: 'opened', login: 200003, ticket: 200, side: 'sell', symbol: 'GBPUSD', volume: 0.5, price: 1.33 });
  recordPositionSnapshot([{ ticket: 200, account_login: 200003, symbol: 'GBPUSD', side: 'sell', volume: 0.5 }]);

  const entries = getTradeJournalEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].request, 'market sell 0.50 GBPUSD');
  assert.equal(entries[0].answer, 'Done at 1.33');
  assert.equal(entries[0].login, 200003);
});

test('wrapped mutation envelopes are unwrapped for journal entries', () => {
  resetTradeJournal();
  recordPositionMutation({ data: { action: 'modified', position: 300, login: 9, side: 'buy', symbol: 'EURUSD', sl: 1.0, tp: 1.2 } });
  const [entry] = getTradeJournalEntries();
  assert.equal(entry.request, 'modify #300 buy EURUSD -> sl: 1, tp: 1.2');
});

test('a mutation frame trailing its snapshot does not journal the same trade twice', () => {
  resetTradeJournal();
  const t0 = Date.now();
  recordPositionSnapshot([{ ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01 }], t0);
  // Snapshot already reflects the open; the lifecycle frame arrives late.
  recordPositionSnapshot([
    { ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01 },
    { ticket: 101, account_login: 200001, symbol: 'EURUSD', side: 'sell', volume: 0.02 },
  ], t0 + 9000);
  recordPositionMutation({ action: 'opened', login: 200001, ticket: 101, side: 'sell', symbol: 'EURUSD', volume: 0.02 });
  assert.equal(getTradeJournalEntries().length, 1);

  // Same for a close: a covered frame already removed the ticket.
  recordPositionSnapshot([
    { ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01 },
    { ticket: 102, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.03 },
  ], t0 + 10000);
  recordPositionMutation({ action: 'closed', login: 200001, ticket: 101, side: 'sell' });
  const entries = getTradeJournalEntries();
  assert.equal(entries.length, 3);
  assert.equal(entries[0].request, 'market sell 0.02 EURUSD');
  assert.equal(entries[2].request, "for '200001' sell 0.02 EURUSD, close #101");
});

test('a stale snapshot does not flap a just-opened or just-closed ticket', () => {
  resetTradeJournal();
  recordPositionSnapshot([{ ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01 }]);
  // Open lands via lifecycle frame; the next snapshot was generated before it.
  recordPositionMutation({ action: 'opened', login: 200001, ticket: 200, side: 'buy', symbol: 'XAUUSD', volume: 0.01 });
  recordPositionSnapshot([{ ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01 }]);
  // Catch-up snapshot must not log the open a second time either.
  recordPositionSnapshot([
    { ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01 },
    { ticket: 200, account_login: 200001, symbol: 'XAUUSD', side: 'buy', volume: 0.01 },
  ]);
  assert.equal(getTradeJournalEntries().length, 1);

  // Close lands via lifecycle frame; a stale snapshot still carrying the
  // ticket must not resurrect it as a phantom open.
  recordPositionMutation({ action: 'closed', login: 200001, ticket: 200, side: 'buy' });
  recordPositionSnapshot([
    { ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01 },
    { ticket: 200, account_login: 200001, symbol: 'XAUUSD', side: 'buy', volume: 0.01 },
  ]);
  recordPositionSnapshot([{ ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01 }]);
  const entries = getTradeJournalEntries();
  assert.equal(entries.length, 2);
  assert.ok(entries.every((entry) => !entry.request.includes('#200') || entry.request.includes('close #200')));
});

test('update frames carrying no journal-tracked change are not journaled', () => {
  resetTradeJournal();
  recordPositionSnapshot([{ ticket: 100, account_login: 200001, symbol: 'EURUSD', side: 'buy', volume: 0.01, price_sl: 0, price_tp: 0 }]);
  recordPositionMutation({ action: 'update', ticket: 100, price_current: 1.2345 });
  assert.equal(getTradeJournalEntries().length, 0);
  recordPositionMutation({ action: 'modified', ticket: 100, sl: 1.5 });
  assert.equal(getTradeJournalEntries().length, 1);
});

test('subscribers are notified and clear empties the feed', () => {
  resetTradeJournal();
  const seen = [];
  const unsubscribe = subscribeToTradeJournal((entries) => seen.push(entries.length));
  recordPositionMutation({ action: 'closed', login: 1, ticket: 9, side: 'buy' });
  clearTradeJournal();
  unsubscribe();
  recordPositionMutation({ action: 'closed', login: 1, ticket: 10, side: 'buy' });
  assert.deepEqual(seen, [1, 0]);
  assert.equal(getTradeJournalEntries().length, 1);
});

test('request text and time formatting match the manager journal shape', () => {
  assert.equal(
    buildJournalRequest('modify', { ticket: 12, side: 'buy', volume: 0.01, symbol: 'XAUUSD', sl: 0, tp: 4325 }),
    'modify #12 buy 0.01 XAUUSD -> sl: 0, tp: 4325'
  );
  assert.equal(
    buildJournalRequest('close', { ticket: 99, side: 'sell', volume: 0.5, symbol: 'XAUUSD', price: 4308.89 }),
    'market sell 0.50 XAUUSD at 4308.89, close #99'
  );
  assert.equal(
    buildJournalRequest('activate', { ticket: 5, kind: 'stop', side: 'buy', volume: 0.01, symbol: 'XAUUSD', price: 4359.71 }),
    'activate #5 stop buy 0.01 XAUUSD at 4359.71'
  );
  assert.equal(formatJournalTime(new Date(2026, 8, 17, 12, 48, 44)), '2026.09.17 12:48:44');
});
