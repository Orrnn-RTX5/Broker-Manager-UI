import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Bundles the real module with the network edges stubbed (apiClient, endpoints, the socket client).
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./accountListSync.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'account-list-sync-stubs', setup(builder) {
    builder.onResolve({ filter: /\/(apiClient|endpoints|positionSyncCore)(\.js)?$/ }, (args) => ({ path: args.path, namespace: 'als-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'als-test' }, (args) => ({ loader: 'js', contents:
      args.path.includes('apiClient') ? 'export default { post: async () => ({ ticket: "t" }) };'
        : args.path.includes('endpoints') ? 'export const buildAccountUpdatesWsUrl = (t) => "ws://test/OnAccountUpdate?ticket=" + t;'
          : 'export class PositionSyncClient { subscribe() { return () => {}; } start() {} stop() {} }',
    }));
  } }],
});
const {
  ACCOUNT_LIST_REFETCH_DEBOUNCE_MS, ACCOUNT_LIST_SLOW_REFETCH_MS, accountListEventNeedsRefetch, watchAccountList,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const stateChanged = (data) => ({ type: 'state_changed', data });
const known = new Set(['710001', '710002']);
const accountEvent = (login, operation) => stateChanged({ entity: 'accounts', account_login: login, login, operation });
const position = (payload) => ({ type: 'position', payload });

test('accountListEventNeedsRefetch: a new/removed account now; hints, resyncs and op-less events slow; updates and shown rows never', () => {
  assert.equal(accountListEventNeedsRefetch(accountEvent(710009, 'insert'), known), 'now', 'a new account');
  assert.equal(accountListEventNeedsRefetch(accountEvent(710009, 'INSERT'), known), 'now', 'any case');
  assert.equal(accountListEventNeedsRefetch(accountEvent(710009, 'delete'), known), 'now', 'a removed account');
  assert.equal(accountListEventNeedsRefetch(accountEvent(710009, 'update'), known), false, 'a money/margin update on another page');
  assert.equal(accountListEventNeedsRefetch(accountEvent(710009, undefined), known), 'slow', 'no operation: throttled');
  assert.equal(accountListEventNeedsRefetch(stateChanged({ entity: 'accounts', broker_id: 'b' }), known), 'slow', 'the login-less scope hint');
  assert.equal(accountListEventNeedsRefetch(stateChanged({ entity: 'resync' }), known), 'slow');
  assert.equal(accountListEventNeedsRefetch(accountEvent(710001, 'insert'), known), false, 'a shown row: the metrics overlay updates it');
  assert.equal(accountListEventNeedsRefetch(accountEvent(710001, 'update'), known), false);
  assert.equal(accountListEventNeedsRefetch(accountEvent(710001, 'delete'), known), 'now', 'a deleted row leaves the page');
  assert.equal(accountListEventNeedsRefetch(stateChanged({ entity: 'positions', account_login: 710009, operation: 'insert' }), known), false);
  assert.equal(accountListEventNeedsRefetch(stateChanged({ entity: 'groups' }), known), false);
  assert.equal(accountListEventNeedsRefetch({ type: 'metrics_update', data: { login: 710009 } }, known), false);
  assert.equal(accountListEventNeedsRefetch(null, known), false);
  assert.equal(accountListEventNeedsRefetch(stateChanged(null), known), false);
});

const fakeClient = () => {
  const listeners = new Set();
  const client = {
    started: 0, stopped: 0,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() { client.started += 1; }, stop() { client.stopped += 1; },
    emit(event) { listeners.forEach((listener) => listener(event)); },
    listenerCount: () => listeners.size,
  };
  return client;
};

// Fake clock and timers: advance(ms) runs the timers that are due, in order.
const fakeTime = () => {
  let now = 1_000_000;
  const pending = new Map();
  let next = 1;
  return {
    nowFn: () => now,
    setTimeoutFn: (fn, ms) => { const id = next++; pending.set(id, { fn, due: now + ms, ms }); return id; },
    clearTimeoutFn: (id) => { pending.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, entry] of [...pending].sort((a, b) => a[1].due - b[1].due)) {
        if (entry.due <= now && pending.has(id)) { pending.delete(id); entry.fn(); }
      }
    },
    size: () => pending.size,
    delays: () => [...pending.values()].map(({ ms }) => ms),
  };
};

const start = (client, time, counter) => watchAccountList({
  getKnownLogins: () => known, onRefetch: () => { counter.refetches += 1; }, createClient: () => client, ...time,
});

test('watchAccountList: a new account refetches after the debounce; a burst is one refetch; updates never refetch', () => {
  const client = fakeClient(); const time = fakeTime(); const counter = { refetches: 0 };
  const stop = start(client, time, counter);
  assert.equal(client.started, 1);
  client.emit({ type: 'snapshot', reason: 'connected' });
  client.emit(position(stateChanged({ entity: 'resync' })));
  assert.equal(time.size(), 0, 'the resync right after the first connect is not a refetch');
  for (let i = 0; i < 50; i += 1) client.emit(position(accountEvent(720000 + i, 'update')));
  client.emit(position(accountEvent(710001, 'insert')));
  assert.equal(time.size(), 0, 'balance/margin updates and shown rows never refetch');
  client.emit(position(accountEvent(710009, 'insert')));
  client.emit(position(accountEvent(710010, 'insert')));
  assert.deepEqual(time.delays(), [ACCOUNT_LIST_REFETCH_DEBOUNCE_MS], 'a burst of new accounts is one debounced refetch');
  time.advance(ACCOUNT_LIST_REFETCH_DEBOUNCE_MS);
  assert.equal(counter.refetches, 1);
  client.emit({ type: 'snapshot', reason: 'poll' });
  assert.equal(time.size(), 0, 'the client poll tick does not refetch');
  stop();
  assert.equal(client.stopped, 1);
  assert.equal(client.listenerCount(), 0);
});

test('watchAccountList: login-less hints and resyncs refetch at most once per slow window; a new account still comes fast', () => {
  const client = fakeClient(); const time = fakeTime(); const counter = { refetches: 0 };
  const stop = start(client, time, counter);
  client.emit({ type: 'snapshot', reason: 'connected' });
  const hint = position(stateChanged({ entity: 'accounts', broker_id: 'b' }));
  client.emit(hint);
  time.advance(ACCOUNT_LIST_REFETCH_DEBOUNCE_MS);
  assert.equal(counter.refetches, 1, 'the first hint refetches after the debounce');
  for (let i = 0; i < 20; i += 1) { client.emit(hint); time.advance(200); }
  assert.equal(counter.refetches, 1, 'a hint storm waits for the slow window');
  time.advance(ACCOUNT_LIST_SLOW_REFETCH_MS);
  assert.equal(counter.refetches, 2, 'then one refetch');
  client.emit(hint);
  assert.equal(time.size(), 1);
  client.emit(position(accountEvent(710011, 'insert')));
  assert.deepEqual(time.delays(), [ACCOUNT_LIST_REFETCH_DEBOUNCE_MS], 'a new account pulls the pending slow refetch forward');
  time.advance(ACCOUNT_LIST_REFETCH_DEBOUNCE_MS);
  assert.equal(counter.refetches, 3);
  client.emit(position(accountEvent(710012, 'insert')));
  client.emit(hint);
  assert.deepEqual(time.delays(), [ACCOUNT_LIST_REFETCH_DEBOUNCE_MS], 'a slow hint never delays a pending fast refetch');
  time.advance(ACCOUNT_LIST_REFETCH_DEBOUNCE_MS);
  assert.equal(counter.refetches, 4);
  stop();
});

test('watchAccountList: a reconnect refetches once (its resync is not a second refetch); stop clears a pending refetch', () => {
  const client = fakeClient(); const time = fakeTime(); const counter = { refetches: 0 };
  const stop = start(client, time, counter);
  client.emit({ type: 'snapshot', reason: 'connected' });
  client.emit(position(stateChanged({ entity: 'resync' })));
  client.emit({ type: 'snapshot', reason: 'connected' });
  client.emit(position(stateChanged({ entity: 'resync' })));
  assert.deepEqual(time.delays(), [ACCOUNT_LIST_REFETCH_DEBOUNCE_MS], 'a reconnect refetches fast, not on the slow window');
  time.advance(ACCOUNT_LIST_REFETCH_DEBOUNCE_MS);
  assert.equal(counter.refetches, 1, 'one refetch for the reconnect');
  client.emit(position(stateChanged({ entity: 'resync' })));
  assert.equal(time.size(), 1, 'a later server resync is a (slow) refetch');
  stop();
  assert.equal(time.size(), 0, 'stop clears the pending refetch');
  time.advance(ACCOUNT_LIST_SLOW_REFETCH_MS);
  assert.equal(counter.refetches, 1);
});

test('watchAccountList: a reconnect within the slow window after a refetch still refetches on the fast debounce', () => {
  const client = fakeClient(); const time = fakeTime(); const counter = { refetches: 0 };
  const stop = start(client, time, counter);
  client.emit({ type: 'snapshot', reason: 'connected' });
  client.emit(position(accountEvent(710013, 'insert')));
  time.advance(ACCOUNT_LIST_REFETCH_DEBOUNCE_MS);
  assert.equal(counter.refetches, 1);
  time.advance(2000);
  client.emit({ type: 'snapshot', reason: 'connected' });
  assert.deepEqual(time.delays(), [ACCOUNT_LIST_REFETCH_DEBOUNCE_MS], 'not held back to lastRefetch + slow window');
  time.advance(ACCOUNT_LIST_REFETCH_DEBOUNCE_MS);
  assert.equal(counter.refetches, 2);
  stop();
});

test('the accounts grid watches the account list while its data is requested', () => {
  const grid = readFileSync(new URL('../features/clients/components/TradingAccountsDataGrid.jsx', import.meta.url), 'utf8');
  assert.match(grid, /import \{ watchAccountList \} from '\.\.\/\.\.\/\.\.\/services\/accountListSync';/);
  assert.match(grid, /if \(!hasRequestedData\) return undefined;\s*return watchAccountList\(\{\s*getKnownLogins: \(\) => knownLoginsRef\.current,\s*onRefetch: \(\) => refetchRef\.current\?\.\(\),\s*\}\);\s*\}, \[hasRequestedData\]\);/);
  const sync = readFileSync(new URL('./accountListSync.js', import.meta.url), 'utf8');
  assert.match(sync, /apiClient\.post\('\/api\/v1\/manager\/ws-ticket', \{ path: '\/OnAccountUpdate' \}\)/);
  const endpoints = readFileSync(new URL('../config/endpoints.js', import.meta.url), 'utf8');
  assert.match(endpoints, /export const buildAccountUpdatesWsUrl = \(ticket\) => buildManagerTicketWsUrl\('\/OnAccountUpdate', ticket\);/);
});
