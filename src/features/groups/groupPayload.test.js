import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { buildAccountPatchFromGroup, describeGroupSave, readLeverageRatio } from './groupAccountRows.js';

// Exercise the real save workflow with controlled transports, including the
// account-update path; no browser session or real backend is needed.
const runtime = { calls: [], serverGroup: null };
globalThis.__groupPayloadTest = runtime;
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./groupPayload.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [{ name: 'group-save-transport', setup(builder) {
    builder.onResolve({ filter: /\/(managerFetch|managerAccountApi|sidebarAccounts)\.js$/ }, ({ path }) => ({ path, namespace: 'group-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'group-test' }, ({ path }) => ({ loader: 'js', contents:
      path.includes('managerFetch') ? 'export const fetchManagerApi = (...args) => globalThis.__groupPayloadTest.request(...args);' :
      path.includes('managerAccountApi') ? 'export const updateManagerAccount = (...args) => globalThis.__groupPayloadTest.updateAccount(...args);' :
      'export const fetchAllSidebarAccounts = (...args) => globalThis.__groupPayloadTest.loadAccounts(...args);',
    }));
  } }],
});
const { GROUP_DEFAULT_PAYLOAD, buildGroupSavePayload, submitGroup } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

beforeEach(() => {
  runtime.calls = [];
  runtime.serverGroup = null;
  runtime.request = async (url, options) => {
    const payload = JSON.parse(options.body);
    runtime.calls.push({ url, payload });
    runtime.serverGroup = { ...runtime.serverGroup, ...payload };
    return new Response(JSON.stringify({ updated: true }), { status: 200 });
  };
  runtime.loadAccounts = async () => { throw new Error('Unexpected account load'); };
  runtime.updateAccount = async () => { throw new Error('Unexpected account update'); };
});
after(() => { delete globalThis.__groupPayloadTest; });

const existingGroup = () => ({
  ...GROUP_DEFAULT_PAYLOAD,
  name: 'Nexa/standard',
  leverage: 100,
  marginCallLevel: 100,
  stopOutLevel: 50,
  tradeAllowed: true,
  symbolsAllowed: ['EURUSD', 'GBPUSD'],
  symbolsBlocked: ['XAUUSD'],
});

test('Symbols-only save makes no group or account requests and preserves current restrictions', async () => {
  const initial = existingGroup();
  const form = { ...initial, symbolsAllowed: [...initial.symbolsAllowed], symbolsBlocked: [...initial.symbolsBlocked] };
  const payload = buildGroupSavePayload(initial, form);
  const latestServerGroup = { ...initial, leverage: 200, symbolsAllowed: ['USDJPY'], symbolsBlocked: ['BTCUSD'] };
  runtime.serverGroup = latestServerGroup;

  const saved = await submitGroup({ originalName: initial.name, payload });

  assert.deepEqual(runtime.calls, []);
  assert.deepEqual(payload, {});
  assert.equal(saved.unchanged, true);
  assert.deepEqual(runtime.serverGroup, latestServerGroup);
});

test('editing one group field preserves concurrent changes to restrictions and other settings', async () => {
  const initial = existingGroup();
  const payload = buildGroupSavePayload(initial, { ...initial, commissionRate: 7 });
  const latestServerGroup = { ...initial, leverage: 500, marginCallLevel: 150, symbolsAllowed: ['USDJPY'], symbolsBlocked: [] };
  runtime.serverGroup = latestServerGroup;

  const saved = await submitGroup({ originalName: initial.name, payload });

  assert.deepEqual(payload, { commissionRate: 7 });
  assert.deepEqual(runtime.calls, [{ url: '/GroupUpdate?group=Nexa%2Fstandard', payload: { commissionRate: 7 } }]);
  assert.deepEqual(runtime.serverGroup, { ...latestServerGroup, commissionRate: 7 });
  assert.deepEqual(saved.accountErrors, []);
  assert.deepEqual(buildAccountPatchFromGroup(payload, initial.name), {});
});

test('changing leverage updates accounts with only the changed setting', async () => {
  const initial = existingGroup();
  const payload = buildGroupSavePayload(initial, { ...initial, leverage: 200 });
  const accountUpdates = [];
  runtime.loadAccounts = async () => ({ rows: [{ login: 1001, group: initial.name }, { login: 1002, group: 'Another/group' }] });
  runtime.updateAccount = async (login, patch) => { accountUpdates.push({ login, patch }); };

  const saved = await submitGroup({ originalName: initial.name, payload });

  assert.deepEqual(payload, { leverage: 200 });
  assert.deepEqual(accountUpdates, [{ login: 1001, patch: { Leverage: 200 } }]);
  assert.equal(saved.accountsUpdated, 1);
  assert.deepEqual(saved.accountErrors, []);
});

test('explicit zero, false and empty-list changes are retained while unknown fields are excluded', () => {
  const initial = existingGroup();
  const payload = buildGroupSavePayload(initial, {
    ...initial,
    marginCallLevel: 0,
    tradeAllowed: false,
    symbolsAllowed: [],
    revision: 'not-a-group-field',
  });

  assert.deepEqual(payload, { marginCallLevel: 0, tradeAllowed: false, symbolsAllowed: [] });
});

test('new groups retain the complete creation payload and a saved baseline produces no second update', async () => {
  const initial = existingGroup();
  const form = { ...initial, commissionRate: 7, revision: 'not-a-group-field' };
  const expected = { ...initial, commissionRate: 7 };

  assert.deepEqual(buildGroupSavePayload(initial, form, { isNew: true }), expected);
  await submitGroup({ originalName: '', payload: buildGroupSavePayload(initial, form, { isNew: true }) });
  assert.deepEqual(runtime.calls, [{ url: '/GroupCreate', payload: expected }]);
  assert.deepEqual(buildGroupSavePayload(expected, form), {});
  assert.deepEqual(buildGroupSavePayload(initial, { ...initial }), {});
});

test('a group edit copies leverage, margin, and a renamed group onto each account', () => {
  assert.deepEqual(buildAccountPatchFromGroup({
    name: 'Yopips/real',
    leverage: 200,
    marginCallLevel: 120,
    stopOutLevel: 50,
  }, 'Yopips/demo'), {
    Group: 'Yopips/real',
    Leverage: 200,
    MarginCallLevel: 120,
    StopOutLevel: 50,
  });
  assert.equal(buildAccountPatchFromGroup({ leverage: 0, marginCallLevel: 100, stopOutLevel: 50 }, 'dipannita').Leverage, undefined);
  assert.deepEqual(buildAccountPatchFromGroup({ leverage: '1:20', marginCallLevel: 0, stopOutLevel: 0 }, 'dipannita'), {
    Leverage: 20,
  });
  assert.equal(readLeverageRatio({ Leverage: '1 : 20' }), 20);
  assert.deepEqual(describeGroupSave({ accountsUpdated: 2 }), {
    title: 'Group updated',
    message: 'The group was updated. 2 accounts now use the new settings.',
  });
});
