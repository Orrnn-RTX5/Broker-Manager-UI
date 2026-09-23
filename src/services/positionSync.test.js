import assert from 'node:assert/strict';
import test from 'node:test';
import { PositionSyncClient, getPositionUpdateLogin, getWsTicket, isPositionMutation, requiresPositionReconciliation } from './positionSyncCore.js';
import { LiveTradingState } from './liveTradingState.js';

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
  }

  close() {
    this.readyState = 3;
  }
}

test('position sync uses a one-time ticket and refreshes after a lifecycle update', async () => {
  const sockets = [];
  const events = [];
  let ticketRequestCount = 0;
  let poll;
  const client = new PositionSyncClient({
    requestTicket: async () => ({ data: { ws_ticket: `ticket-${++ticketRequestCount}` } }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    buildUrl: (ticket) => `wss://example.test/OnPositionUpdate?ticket=${ticket}`,
    setIntervalFn: (callback) => { poll = callback; return 1; },
    clearIntervalFn: () => {},
    setTimeoutFn: () => 2,
    clearTimeoutFn: () => {},
  });
  client.subscribe((event) => events.push(event));

  client.start();
  await Promise.resolve();
  sockets[0].readyState = 1;
  sockets[0].onopen();
  sockets[0].onmessage({ data: JSON.stringify({ action: 'partially_closed', login: 1001 }) });
  poll();

  assert.equal(sockets[0].url, 'wss://example.test/OnPositionUpdate?ticket=ticket-1');
  assert.deepEqual(events.map((event) => event.type), ['snapshot', 'position', 'snapshot']);
  assert.equal(events[1].payload.login, 1001);
  client.stop();
});

test('position sync obtains a fresh ticket after every reconnect', async () => {
  const sockets = [];
  const reconnects = [];
  let ticketRequestCount = 0;
  const client = new PositionSyncClient({
    requestTicket: async () => ({ ticket: `ticket-${++ticketRequestCount}` }),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    buildUrl: (ticket) => `ws://example.test/OnPositionUpdate?ticket=${ticket}`,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
    setTimeoutFn: (callback) => { reconnects.push(callback); return reconnects.length; },
    clearTimeoutFn: () => {},
  });

  client.start();
  await Promise.resolve();
  sockets[0].onclose();
  reconnects[0]();
  await Promise.resolve();

  assert.equal(ticketRequestCount, 2);
  assert.equal(sockets[1].url, 'ws://example.test/OnPositionUpdate?ticket=ticket-2');
  client.stop();
});

test('position event parsing accepts documented lifecycle actions and rejects control frames', () => {
  assert.equal(isPositionMutation({ type: 'state_changed', data: { account_login: 1001, entity: 'accounts' } }), true);
  assert.equal(getWsTicket({ answer: { ticket: 'abc' } }), 'abc');
  assert.equal(isPositionMutation({ action: 'reversed' }), true);
  assert.equal(isPositionMutation({ type: 'heartbeat' }), false);
});

test('position event login extraction handles nested broker envelopes', () => {
  assert.equal(getPositionUpdateLogin({ login: 200002 }), 200002);
  assert.equal(getPositionUpdateLogin({ data: { data: { account_login: '200008' } } }), '200008');
  assert.equal(getPositionUpdateLogin({ payload: { position: { accountLogin: 200003 } } }), 200003);
  assert.equal(getPositionUpdateLogin({ type: 'heartbeat' }), undefined);
});

test('a v2-first close reaches the store and reconciliation even when its v1 twin is deduplicated', async () => {
  const state = new LiveTradingState();
  const socket = new FakeSocket('ws://broker.test');
  const received = [];
  const client = new PositionSyncClient({
    requestTicket: async () => ({ ticket: 'one-use' }), createSocket: () => socket, buildUrl: () => socket.url,
    setIntervalFn: () => 1, clearIntervalFn: () => {},
  });
  client.subscribe(event => { received.push(event); if (event.payload) state.ingest(event.payload); });
  client.start(); await Promise.resolve();
  const row = { login: '1001', position: 42, state_version: '1', volume: 1 };
  socket.onmessage({ data: JSON.stringify({ schema_version: 2, event_id: 'closed-event', broker_id: 'broker-a',
    entity: 'position', action: 'closed', account_login: 1001,
    data: { ticket: 42, state_version: 2, status: 'closed', side: 'buy' } }) });
  assert.equal(received.length, 1);
  assert.equal(received[0].payload.type, 'position_closed');
  assert.equal(requiresPositionReconciliation(received[0].payload), true);
  assert.deepEqual(state.overlayRows([row]), []);
  // Delayed database page and price packets cannot bring the ticket back.
  socket.onmessage({ data: JSON.stringify({ type: 'position_update', data: [{ account_login: 1001, ticket: 42,
    update_kind: 'pnl', state_version: '1', profit: 10 }] }) });
  assert.deepEqual(state.overlayRows([row]), []);
  client.stop();
});

test('lifecycle-only reconciliation accepts both contracts and does not poll for every tick', () => {
  const tick = { type: 'position_update', data: [{ account_login: 1001, ticket: 42, update_kind: 'pnl', profit: 2 }] };
  assert.equal(requiresPositionReconciliation(tick), false);
  assert.equal(requiresPositionReconciliation({ type: 'position_closed', data: { ticket: 42 } }), true);
  assert.equal(requiresPositionReconciliation({ schema_version: 2, entity: 'position', action: 'closed', data: { ticket: 42 } }), true);
  assert.equal(requiresPositionReconciliation({ schema_version: 2, entity: 'state', action: 'changed', data: { entity: 'accounts' } }), true);
  assert.equal(isPositionMutation({ schema_version: 2, entity: 'state', action: 'changed', data: { entity: 'accounts' } }), true);
});
