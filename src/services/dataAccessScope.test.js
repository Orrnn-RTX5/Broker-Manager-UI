import test from 'node:test';
import assert from 'node:assert/strict';
import { getDataAccessScope, updateDataAccessScope, assertDataAccessScope } from './dataAccessScope.js';
import { fetchOnlineUsersSnapshot, peekOnlineUsersPage, clearOnlineUsersSnapshot } from './onlineUsersSnapshot.js';
import { writeStoredTerminalPage, readStoredTerminalPage } from '../features/terminal/terminalTrades.js';
import { saveTradingAccountsAnalyticsCache, loadTradingAccountsAnalyticsCache } from '../utils/tradingAccountsCache.js';

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};
const signIn = (login, session = login) => {
  sessionStorage.setItem('auth', JSON.stringify({ login, broker_id: 'A', token: session, session_scope: session }));
};
const setup = () => {
  globalThis.sessionStorage = storage();
  globalThis.localStorage = storage();
  globalThis.window = { sessionStorage, localStorage };
  clearOnlineUsersSnapshot();
  signIn(9010);
};

test('scope separates identity, login session, and committed authority changes', () => {
  setup();
  const initial = getDataAccessScope();
  updateDataAccessScope({ access_fingerprint: 'real-only' });
  const assigned = getDataAccessScope();
  assert.notEqual(assigned, initial);
  assert.equal(updateDataAccessScope({ access_fingerprint: 'real-only' }), false);
  updateDataAccessScope({ access_fingerprint: 'revoked' });
  assert.throws(() => assertDataAccessScope(assigned), { name: 'AbortError' });
  const revoked = getDataAccessScope();
  signIn(9010, 'new-login-session');
  assert.notEqual(getDataAccessScope(), revoked);
  signIn(9003);
  assert.notEqual(getDataAccessScope(), assigned);
});

test('terminal and analytics never restore another manager or an old assignment', () => {
  setup();
  updateDataAccessScope({ access_fingerprint: 'assigned' });
  const rows = [{ position: 2001, login: 1001, symbol: 'EURUSD', volume: 1, priceOpen: 1.1, group: 'Real Group' }];
  writeStoredTerminalPage({ rows });
  saveTradingAccountsAnalyticsCache('grid', rows);
  assert.deepEqual(readStoredTerminalPage().rows, rows);
  assert.deepEqual(loadTradingAccountsAnalyticsCache('grid'), rows);
  updateDataAccessScope({ access_fingerprint: 'changed' });
  assert.equal(readStoredTerminalPage(), undefined);
  assert.deepEqual(loadTradingAccountsAnalyticsCache('grid'), []);
  localStorage.setItem('rtx5_trading_accounts_analytics_v2_default', JSON.stringify({ accounts: rows }));
  signIn(9003);
  assert.deepEqual(loadTradingAccountsAnalyticsCache('grid'), []);
  saveTradingAccountsAnalyticsCache('grid', rows);
  saveTradingAccountsAnalyticsCache('grid', []);
  assert.deepEqual(loadTradingAccountsAnalyticsCache('grid'), []);
});

test('a late online-users response is discarded after same-session revocation', async () => {
  setup();
  updateDataAccessScope({ access_fingerprint: 'allowed' });
  let finish;
  const request = fetchOnlineUsersSnapshot(() => new Promise((resolve) => { finish = resolve; }));
  await Promise.resolve();
  updateDataAccessScope({ access_fingerprint: 'revoked' });
  finish([{ login: 1001 }]);
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(peekOnlineUsersPage(), undefined);
});
