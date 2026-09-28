import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveTradingState } from './liveTradingState.js';
import { isPositionMutation } from './positionSyncCore.js';
const initial = { login: '1001', position: 42, state_version: '1', volume: 2, priceSl: 4, profit: 0 };
const frame = (data, type = 'position_update') => ({ type, data: [{ account_login: 1001, ticket: 42, ...data }] });
test('documented batched PnL updates reach existing rows with exact price precision', () => {
  const state = new LiveTradingState();
  const message = frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 12, price_current: 1.12345, profit: 5 });
  assert.equal(isPositionMutation(message), true);
  state.ingest(message);
  assert.equal(state.overlayRows([initial])[0].priceCurrent, 1.12345);
  assert.equal(state.overlayRows([]).length, 0, 'tick cannot invent a position');
  state.ingest(frame({ update_kind: 'pnl', state_version: 1, price_time_msc: 11, profit: 1 }));
  assert.equal(state.overlayRows([initial])[0].profit, 5);
});
test('close tombstone survives delayed PnL and stale REST snapshot', () => {
  const state = new LiveTradingState();
  state.ingest(frame({ state_version: '2' }, 'position_closed'));
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', profit: 9 }));
  assert.deepEqual(state.overlayRows([initial]), []);
});
test('v1 and v2 close twins are idempotent in either delivery order', () => {
  const data = { account_login: 1001, ticket: 42, state_version: '2', status: 'closed' };
  const v1 = { event_id: 'same-event', type: 'position_closed', data };
  const v2 = { schema_version: 2, event_id: 'same-event', entity: 'position', action: 'closed', account_login: 1001, data };
  for (const events of [[v1, v2], [v2, v1], [v2]]) {
    const state = new LiveTradingState();
    events.forEach(event => state.ingest(event));
    state.ingest(frame({ update_kind: 'snapshot', state_version: '1', lots: 1, status: 'open' }));
    assert.deepEqual(state.overlayRows([initial], '1001', true), []);
  }
});
test('legacy close uses precise version text above the JavaScript integer range', () => {
  const state = new LiveTradingState();
  state.ingest(frame({ update_kind: 'pnl', state_version: '9007199254740992', profit: 9 }));
  state.ingest(frame({ state_version: Number('9007199254740993'), state_version_text: '9007199254740993' }, 'position_closed'));
  assert.deepEqual(state.overlayRows([{ ...initial, state_version: '9007199254740992' }]), []);
  assert.equal(state.positions.get('1001:42').version, '9007199254740993');
});
test('partial close and explicit SL removal survive stale REST and newer ticks', () => {
  const state = new LiveTradingState();
  assert.equal(isPositionMutation({ type: 'position_modified', data: { action: 0, ticket: 42 } }), true);
  state.ingest(frame({ update_kind: 'snapshot', state_version: '2', lots: 1, sl: null, tp: 8, profit: 3 }, 'position_decreased'));
  state.ingest(frame({ update_kind: 'pnl', state_version: '2', price_time_msc: 20, profit: 7 }));
  const row = state.overlayRows([initial])[0];
  assert.equal(row.volume, 1); assert.equal(row.priceSl, 0); assert.equal(row.priceTp, 8); assert.equal(row.profit, 7);
  assert.equal(state.overlayRows([{ ...initial, state_version: '3', volume: 0.5 }])[0].volume, 0.5);
});
test('metrics preserve exact large token ordering and account scope; session reset clears overlays', () => {
  const state = new LiveTradingState();
  state.ingest({ type: 'metrics_update', publication_token: '18000000000000000002', data: { login: 1001, equity: 100 } });
  state.ingest({ type: 'metrics_update', publication_token: '18000000000000000001', data: { login: 1001, equity: 90 } });
  assert.equal(state.account(1001).equity, 100); assert.equal(state.account(1002), undefined);
  for (const token of ['00000000000000000000', '1', '180000000000000000003']) {
    state.ingest({ type: 'metrics_update', publication_token: token, data: { login: 1001, equity: -1 } });
    assert.equal(state.account(1001).equity, 100);
  }
  state.reset(); assert.equal(state.account(1001), undefined);
});
test('new snapshots appear immediately but a later recovery snapshot can remove missed closes', () => {
  const state = new LiveTradingState();
  const beforeRequest = state.snapshot();
  state.ingest(frame({ update_kind: 'snapshot', state_version: '1', symbol: 'EURUSD', side: 'buy', lots: 100,
    price_open: 1.2, account_name: 'Trader', account_email: 'trader@example.test' }, 'position_opened'));
  const [opened] = state.overlayRows([], '1001', true, beforeRequest);
  assert.equal(opened.name, 'Trader');
  assert.equal(opened.email, 'trader@example.test');
  assert.equal(state.overlayRows([], '1002', true, beforeRequest).length, 0);
  const afterEvent = state.snapshot();
  assert.equal(state.overlayRows([], '1001', true, afterEvent).length, 0);
});
test('incomplete live snapshots cannot fabricate open trade rows', () => {
  for (const missing of ['symbol', 'lots', 'price_open', 'account_name', 'account_email']) {
    const state = new LiveTradingState();
    const snapshot = { update_kind: 'snapshot', state_version: '1', symbol: 'BTCUSD', lots: 0.01,
      price_open: 83150.25, price_current: 83152.07, profit: -6.92,
      account_name: 'Trader', account_email: 'trader@example.test' };
    delete snapshot[missing];
    state.ingest(frame(snapshot));
    assert.deepEqual(state.overlayRows([], '1001', true), [], `missing ${missing}`);
  }

  const state = new LiveTradingState();
  state.ingest(frame({ update_kind: 'snapshot', state_version: '1', symbol: 'BTCUSD', lots: 0,
    price_open: 83150.25, price_current: 83152.07, profit: -6.92 }));
  assert.deepEqual(state.overlayRows([], '1001', true), [], 'zero lots');
});
test('incomplete live snapshots still update matching HTTP rows', () => {
  const state = new LiveTradingState();
  state.ingest(frame({ update_kind: 'snapshot', state_version: '1', price_current: 83152.07, profit: -6.92 }));
  const httpRow = { login: '1001', position: 42, symbol: 'BTCUSD', volume: 0.01,
    priceOpen: 83150.25, priceCurrent: 83151, profit: -7 };

  assert.deepEqual(state.overlayRows([httpRow], '1001', true), [
    { ...httpRow, priceCurrent: 83152.07, profit: -6.92 },
  ]);
});
test('duplicate structural snapshot preserves same-version PnL, new versions await repricing', () => {
  const state = new LiveTradingState();
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 20, profit: 7, price_current: 1.12345 }));
  state.ingest(frame({ update_kind: 'snapshot', state_version: '1', lots: 2, price_sl: null, price_tp: 8, pnl_available: false }, 'position_modified'));
  const row = state.overlayRows([initial])[0];
  assert.equal(row.profit, 7); assert.equal(row.priceCurrent, 1.12345); assert.equal(row.priceSl, 0);
  state.ingest(frame({ update_kind: 'snapshot', state_version: '2', lots: 1, pnl_available: false }, 'position_decreased'));
  assert.equal(state.overlayRows([initial])[0].profit, null);
  state.ingest(frame({ update_kind: 'pnl', state_version: '2', price_time_msc: 21, profit: 3 }));
  assert.equal(state.overlayRows([initial])[0].profit, 3);
});
test('reversal changes side and lots immediately without carrying old-direction profit', () => {
  const state = new LiveTradingState();
  state.ingest(frame({ update_kind: 'snapshot', state_version: '2', side: 'sell', lots: 0.5, pnl_available: false }, 'position_reversed'));
  const row = state.overlayRows([{ ...initial, type: 'buy', profit: 99 }])[0];
  assert.equal(row.type, 'sell'); assert.equal(row.volume, 0.5); assert.equal(row.profit, null);
});
test('disconnected and mutated accounts fall back to REST while token fence rejects late metrics', () => {
  const state = new LiveTradingState();
  const metrics = (token, equity) => ({ type: 'metrics_update', publication_token: token, data: { login: 1001, equity } });
  state.ingest(metrics('18000000000000000002', 100));
  state.invalidateMetrics([1001]); assert.equal(state.account(1001), undefined);
  state.ingest(metrics('18000000000000000001', 90)); assert.equal(state.account(1001), undefined);
  state.ingest(metrics('18000000000000000003', 110)); assert.equal(state.account(1001).equity, 110);
  state.ingest({ type: 'state_changed', data: { entity: 'accounts', account_login: 1001 } });
  assert.equal(state.account(1001), undefined);
});
