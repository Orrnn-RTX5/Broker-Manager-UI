import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivitySnapshot, readActivitySnapshot, writeActivitySnapshot } from './dashboardActivitySnapshot.js';

const NOW = Date.UTC(2026, 8, 28, 12);

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
};

const makeSnapshot = () => createActivitySnapshot({
  scope: 'v1:broker-a-session',
  asOf: NOW,
  deals: [
    { ticket: 1, login: '100', symbol: 'EURUSD', action: 'buy', volume: 0.25, time: NOW - 10 * 60_000 },
    { ticket: 2, login: '200', symbol: 'EURUSD', action: 'buy', volume: 3, time: NOW - 10 * 60_000 },
  ],
  realLogins: new Set(['100']),
  equityHistory: [{ timestamp: NOW - 8 * 60_000, equity: 250000 }],
  volumeCoverageFrom: 0,
});

test('a compact scoped snapshot keeps actual chart values without deal rows or account identities', () => {
  const storage = makeStorage();
  const snapshot = makeSnapshot();
  assert.ok(snapshot);
  assert.equal(writeActivitySnapshot(storage, snapshot), true);
  const cached = readActivitySnapshot(storage, 'v1:broker-a-session', NOW + 2_000);
  assert.equal(cached.cached, true);
  assert.deepEqual(Object.keys(cached.seriesByRange), ['1H', '6H', '24H', '7D', '30D']);
  assert.equal(cached.seriesByRange['1H'].reduce((sum, point) => sum + (point.volume || 0), 0), 0.25);
  assert.ok(cached.seriesByRange['1H'].some((point) => point.equity === 250000));
  const raw = [...storage.values.values()][0];
  assert.ok(raw.length < 24_000);
  assert.equal(raw.includes('EURUSD'), false);
  assert.equal(raw.includes('"login"'), false);
  assert.equal(raw.includes('"deals"'), false);
});

test('a cache entry is isolated to its session and expires after thirty minutes', () => {
  const storage = makeStorage();
  writeActivitySnapshot(storage, makeSnapshot());
  assert.equal(readActivitySnapshot(storage, 'v1:another-session', NOW + 1_000), null);
  assert.ok(readActivitySnapshot(storage, 'v1:broker-a-session', NOW + 30 * 60_000));
  assert.equal(readActivitySnapshot(storage, 'v1:broker-a-session', NOW + 30 * 60_000 + 1), null);
  assert.equal(readActivitySnapshot(storage, 'v1:broker-a-session', NOW - 60_001), null);
});

test('malformed and incomplete snapshots are rejected without breaking startup', () => {
  const storage = makeStorage();
  storage.setItem('rtx5_dashboard_activity_snapshot_v1', '{broken');
  assert.equal(readActivitySnapshot(storage, 'v1:broker-a-session', NOW), null);
  const snapshot = makeSnapshot();
  delete snapshot.seriesByRange['7D'];
  assert.equal(writeActivitySnapshot(storage, snapshot), false);
  assert.equal(createActivitySnapshot({ scope: 'anonymous', asOf: NOW, deals: [], realLogins: new Set() }), null);
  assert.equal(createActivitySnapshot({ scope: 'v1:x', asOf: NOW, deals: [], realLogins: null }), null);
});
