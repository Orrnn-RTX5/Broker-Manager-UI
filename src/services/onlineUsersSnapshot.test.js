import test from 'node:test';
import assert from 'node:assert/strict';

const createMockStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const signIn = (login, brokerId = 'orrnn') => {
  globalThis.window.sessionStorage.setItem('auth', JSON.stringify({ token: 't', login, broker_id: brokerId }));
};

globalThis.window = { sessionStorage: createMockStorage(), localStorage: createMockStorage() };

const {
  clearOnlineUsersSnapshot,
  fetchOnlineUsersSnapshot,
  pageOnlineUsers,
  peekOnlineUsersPage,
  peekOnlineUsersUpdatedAt,
} = await import('./onlineUsersSnapshot.js');

const ROWS = [
  { login: '200010', name: 'Zed', group: 'real', country: 'India' },
  { login: '200002', name: 'Ann', group: 'demo', country: 'Spain' },
  { login: '200105', name: 'Bob', group: 'real', country: 'India' },
];

test('concurrent views share one /AccountsOnline request', async () => {
  clearOnlineUsersSnapshot();
  signIn('9001');
  let calls = 0;
  const load = async () => { calls += 1; return ROWS; };
  const [a, b, c] = await Promise.all([
    fetchOnlineUsersSnapshot(load),
    fetchOnlineUsersSnapshot(load),
    fetchOnlineUsersSnapshot(load),
  ]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(b, c);
  // A view mounting right after the response reuses it too.
  await fetchOnlineUsersSnapshot(load);
  assert.equal(calls, 1);
});

test('a hard refresh renders synchronously from the tab snapshot', async () => {
  clearOnlineUsersSnapshot();
  signIn('9001');
  await fetchOnlineUsersSnapshot(async () => ROWS);

  // Simulate a reload: module memory is gone, sessionStorage survives.
  const fresh = await import(`./onlineUsersSnapshot.js?reload=${Date.now()}`);
  const started = performance.now();
  const page = fresh.peekOnlineUsersPage({ sort_by: 'login', sort_dir: 'asc', limit: 30, offset: 0 });
  const elapsed = performance.now() - started;

  assert.equal(page.total, 3);
  assert.deepEqual(page.rows.map((row) => row.login), ['200002', '200010', '200105']);
  assert.ok(fresh.peekOnlineUsersUpdatedAt() > 0);
  assert.ok(elapsed < 20, `snapshot page built in ${elapsed.toFixed(2)}ms`);
});

test('a snapshot never leaks to a different signed-in account', async () => {
  clearOnlineUsersSnapshot();
  signIn('9001');
  await fetchOnlineUsersSnapshot(async () => ROWS);
  assert.equal(peekOnlineUsersPage({}).total, 3);

  signIn('9002');
  assert.equal(peekOnlineUsersPage({}), undefined);
  assert.equal(peekOnlineUsersUpdatedAt(), undefined);
});

test('views page, search and sort the shared list locally', () => {
  const searched = pageOnlineUsers(ROWS, { search: 'india', limit: 30 });
  assert.deepEqual(searched.rows.map((row) => row.login), ['200010', '200105']);

  const sorted = pageOnlineUsers(ROWS, { sort_by: 'login', sort_dir: 'desc', limit: 2, offset: 0 });
  assert.deepEqual(sorted.rows.map((row) => row.login), ['200105', '200010']);
  assert.equal(sorted.total, 3);
  assert.equal(sorted.hasMore, true);

  const byName = pageOnlineUsers(ROWS, { sort_by: 'name', sort_dir: 'asc', limit: 30 });
  assert.deepEqual(byName.rows.map((row) => row.name), ['Ann', 'Bob', 'Zed']);
});
