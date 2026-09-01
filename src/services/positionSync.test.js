import assert from 'node:assert/strict';
import test from 'node:test';
import { PositionSyncClient, getWsTicket, isPositionMutation } from './positionSyncCore.js';

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
  assert.equal(getWsTicket({ answer: { ticket: 'abc' } }), 'abc');
  assert.equal(isPositionMutation({ action: 'reversed' }), true);
  assert.equal(isPositionMutation({ type: 'heartbeat' }), false);
});
