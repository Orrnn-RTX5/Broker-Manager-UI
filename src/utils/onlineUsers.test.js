import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOnlineUserMetrics,
  normalizeOnlineUserRows,
  toFiniteNumber,
} from './onlineUsers.js';

test('online user normalization accepts array and answer payloads', () => {
  assert.deepEqual(normalizeOnlineUserRows({
    answer: [
      {
        Login: 200009,
        Name: 'Primary User',
        Group: 'Real\\VIP',
        Version: 5500,
        IPAddress: '127.0.0.1',
        Equity: '1,250.50',
        Currency: 'USD',
        IsAdmin: 'true',
      },
    ],
  }), [
    {
      Login: 200009,
      Name: 'Primary User',
      Group: 'Real\\VIP',
      Version: 5500,
      IPAddress: '127.0.0.1',
      Equity: '1,250.50',
      Currency: 'USD',
      IsAdmin: 'true',
      login: '200009',
      name: 'Primary User',
      group: 'Real\\VIP',
      client: '',
      version: 5500,
      ip: '127.0.0.1',
      equity: 1250.5,
      currency: 'USD',
      type: '',
      country: '',
      isAdmin: true,
    },
  ]);
});

test('online user metrics are calculated from normalized backend rows', () => {
  const metrics = buildOnlineUserMetrics([
    { login: 1, group: 'Real\\VIP', equity: 100, isAdmin: true },
    { login: 2, group: 'Real\\VIP', equity: '200.25', isAdmin: false },
    { login: 3, group: 'Demo\\STD', equity: 'bad-value', IsAdmin: 'admin' },
  ]);

  assert.deepEqual(metrics, {
    activeUsers: 3,
    adminSessions: 2,
    uniqueGroups: 2,
    totalEquity: 300.25,
  });
});

test('online user numeric parsing rejects non-finite values', () => {
  assert.equal(toFiniteNumber('1 000.75'), 1000.75);
  assert.equal(toFiniteNumber('not-a-number'), 0);
  assert.equal(toFiniteNumber(Number.POSITIVE_INFINITY), 0);
});
