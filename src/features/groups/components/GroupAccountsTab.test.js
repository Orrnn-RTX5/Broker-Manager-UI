import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// SUI-M1 P0: opening a group's Accounts tab must never write to accounts.
// These tests RENDER the real GroupAccountsTab (real React, real react-query,
// real DepositDialog confirm) in jsdom with react-dom/client, so effects,
// clicks and the confirm flow actually execute. Only the network edges are
// replaced: the account list query, the account write service.
// The apply flow + confirm copy come from the real groupLeverageApply module.
//
// Generic fixtures only: synthetic group names, logins and ratios. No tenant,
// broker, host, or account identifiers.

const GROUP = 'Fixture/Standard';

// ---- DOM (must exist before react-dom is evaluated) -----------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['HTMLElement', 'HTMLDialogElement', 'Node', 'Element', 'MouseEvent', 'getComputedStyle']) {
  if (!(key in globalThis)) globalThis[key] = dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has <dialog> but no modal top layer; DepositDialog only needs open/close.
const dialogProto = dom.window.HTMLDialogElement.prototype;
if (typeof dialogProto.showModal !== 'function') dialogProto.showModal = function showModal() { this.setAttribute('open', ''); };
if (typeof dialogProto.close !== 'function') dialogProto.close = function close() { this.removeAttribute('open', ''); };

// ---- Recorded network edges -----------------------------------------------
const host = {
  rows: [],
  fetches: 0,
  updateCalls: [],
  rejectLogins: new Set(),
  conflictLogins: new Set(),
  gate: null,
  updateGate: null,
  freshReads: [],
  events: [],
};
globalThis.__groupAccountsTabHost = host;
// Gates a test holds open. afterEach releases any left held, so a failed test cannot leave a write in flight.
const pendingGates = [];

const STUBS = {
  sidebarAccounts: `
    const host = globalThis.__groupAccountsTabHost;
    export const getSidebarAccountsQueryOptions = (search = '') => ({
      queryKey: ['sidebar-accounts', String(search || '').trim()],
      queryFn: async () => { host.fetches += 1; host.events.push('read'); return { rows: host.rows.map((row) => ({ ...row })) }; },
      staleTime: 5 * 60 * 1000,
    });
    export const fetchAllSidebarAccounts = async (options = {}) => {
      host.freshReads.push(options);
      host.fetches += 1;
      host.events.push('read');
      if (host.gate) await host.gate;
      return { rows: host.rows.map((row) => ({ ...row })) };
    };
  `,
  managerAccountApi: `
    const host = globalThis.__groupAccountsTabHost;
    export const updateManagerAccount = async (login, payload) => {
      host.updateCalls.push([String(login), payload]);
      host.events.push('patch:' + String(login));
      if (host.updateGate) await host.updateGate;
      if (host.conflictLogins.has(String(login))) throw Object.assign(new Error('ACCOUNT_GROUP_MISMATCH'), { status: 409 });
      if (host.rejectLogins.has(String(login))) throw new Error('Rejected by server');
      // The fake server keeps the accepted leverage, so the list re-read after the writes shows it.
      const stored = host.rows.find((row) => String(row.login) === String(login));
      if (stored) stored.leverage = payload.Leverage;
      return { success: true };
    };
    export const createManagerAccount = async () => { throw new Error('createManagerAccount must not be called'); };
    export const deleteManagerAccount = async () => { throw new Error('deleteManagerAccount must not be called'); };
  `,
  realtimeCacheRevision: `
    export const advanceRealtimeCacheRevision = () => { globalThis.__groupAccountsTabHost.events.push('bump'); };
  `,
};

// Bundle only the tab and its in-repo imports (JSX, CSS). Packages stay
// external and load through Node itself, resolved exactly as this file
// resolves them, so the tab and this test share one React and one
// react-query instance (and React's act() uses Node timers).
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./GroupAccountsTab.jsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  logLevel: 'silent',
  plugins: [{
    name: 'group-accounts-tab-host',
    setup(builder) {
      builder.onResolve({ filter: /(sidebarAccounts|managerAccountApi|realtimeCacheRevision)(\.js)?$/ }, ({ path }) => ({
        path: path.match(/(sidebarAccounts|managerAccountApi|realtimeCacheRevision)/)[1],
        namespace: 'group-accounts-tab-host',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'group-accounts-tab-host' }, ({ path }) => ({ loader: 'js', contents: STUBS[path] }));
      builder.onResolve({ filter: /^[@a-z]/i }, ({ path }) => (
        /^[a-z]:[\\/]/i.test(path) ? undefined : { path: import.meta.resolve(path), external: true }
      ));
    },
  }],
});
const { default: GroupAccountsTab } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
// The confirm copy lives in a plain-.js module: import the REAL helper
// directly, no transform. (The apply flow itself is exercised through the UI
// button path above, not called directly.)
const { buildApplyConfirmCopy } = await import('./groupLeverageApply.js');
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

// ---- Render helpers --------------------------------------------------------
let mounted = null;

const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
  }
};

const renderTab = async (props) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(container);
  const element = (next) => createElement(QueryClientProvider, { client: queryClient }, createElement(GroupAccountsTab, next));
  await act(async () => { root.render(element(props)); });
  await settle();
  mounted = { container, root, queryClient };
  return {
    container,
    rerender: async (next) => { await act(async () => { root.render(element(next)); }); await settle(); },
  };
};

// Unmount and drop the query cache so no react-query gc timer outlives a test.
const unmountTab = async () => {
  if (!mounted) return;
  await act(async () => { mounted.root.unmount(); });
  mounted.queryClient.clear();
  mounted.container.remove();
  mounted = null;
};

const buttonByText = (text) => [...document.querySelectorAll('button')].find((button) => button.textContent.includes(text));
const buttonByExactText = (text) => [...document.querySelectorAll('button')].find((button) => button.textContent === text);
const click = async (element) => {
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await settle();
};

// 900001 differs (100 vs 200) and updates cleanly; 900002 differs (50) and the
// stub rejects it; 900003 already matches and must be skipped; 900004 has no
// leverage; 900009 is outside the group and must never appear or update.
const member = (login, leverage, extra = {}) => ({ login, Name: `Fixture ${login}`, group: GROUP, leverage, balance: 100, equity: 100, ...extra });

beforeEach(() => {
  host.rows = [
    member('900001', 100),
    member('900002', 50, { leverage: undefined, Leverage: 50 }),
    member('900003', 200),
    member('900004', undefined),
    { login: '900009', Name: 'Fixture outsider', group: 'Fixture/Other', leverage: 10 },
  ];
  host.fetches = 0;
  host.updateCalls.length = 0;
  host.rejectLogins = new Set();
  host.conflictLogins = new Set();
  host.gate = null;
  host.updateGate = null;
  host.freshReads = [];
  host.events.length = 0;
});

afterEach(async () => {
  pendingGates.splice(0).forEach((release) => release());
  await settle();
  await unmountTab();
});

// jsdom keeps the event loop alive until its window is closed.
after(() => { dom.window.close(); });

// ---- Tests ----------------------------------------------------------------
test('mounting the tab performs zero account writes, even with effects running', async () => {
  const view = await renderTab({ groupName: GROUP, groupLeverage: 200 });

  assert.equal(host.fetches, 1, 'the tab must load the shared account list');
  assert.equal(view.container.querySelectorAll('tbody tr').length, 4, 'all four members render, the outsider does not');
  assert.deepEqual(host.updateCalls, [], 'mounting the tab must not call updateManagerAccount');

  // The old effect re-ran on leverage and data changes; neither may write now.
  await view.rerender({ groupName: GROUP, groupLeverage: 400 });
  await click(view.container.querySelector('button[aria-label="Refresh accounts"]'));
  assert.equal(host.fetches, 2, 'Refresh re-reads the list');
  assert.deepEqual(host.updateCalls, [], 'changing group leverage or refreshing must not write');
});

test('Apply button shows the live member count; no confirm dialog on mount', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  const button = buttonByText('Apply group leverage');
  assert.ok(button, 'the Apply button must render');
  assert.match(button.textContent, /Apply group leverage to all 4 accounts in group/, 'the button shows the member count');
  assert.equal(document.querySelector('dialog'), null, 'mount must not render any confirm dialog');
  assert.deepEqual(host.updateCalls, [], 'mount performs zero writes');
});

test('clicking Apply and confirming updates only differing members', async () => {
  const view = await renderTab({ groupName: GROUP, groupLeverage: 200 });
  await click(buttonByText('Apply group leverage'));

  const dialog = document.querySelector('dialog');
  assert.ok(dialog, 'the confirm dialog opens');
  assert.match(dialog.textContent, /Apply group leverage/);
  assert.match(dialog.textContent, /Only accounts with a different leverage will be updated\./);
  assert.deepEqual(host.updateCalls, [], 'opening the dialog does not write');

  await click(buttonByExactText('Apply'));

  assert.deepEqual(host.updateCalls, [
    ['900001', { Leverage: 200, ExpectedGroup: GROUP }],
    ['900002', { Leverage: 200, ExpectedGroup: GROUP }],
  ]);
  assert.equal(host.fetches, 3, 'mount, the apply membership read, then one list re-read after the writes; succeeded rows show the new leverage after that re-read');
  const body = view.container.textContent;
  assert.match(body, /Applied group leverage to 2 of 2 accounts\./);
});

// Listed members that the apply did not patch (already at the group leverage, or without a login) are reported.
test('apply reports the listed accounts it did not change when listed members exceed the patched total', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));

  // Four members are listed. 900001 and 900002 differ and are patched; 900003 already matches; 900004 has no leverage.
  assert.deepEqual(host.updateCalls.map(([login]) => login), ['900001', '900002']);
  assert.match(
    document.body.textContent,
    /Applied group leverage to 2 of 2 accounts\. 2 listed accounts were not changed \(already at group leverage or without a login\)\./,
  );
});

// The Apply membership is the server's answer at apply time, not the rows on screen.
test('apply uses fresh server membership: an account that left the group since load is never patched', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  // The server moves 900001 out of the group after the tab loaded (the cached row is stale).
  host.rows = host.rows.map((row) => (row.login === '900001' ? { ...row, group: 'Fixture/Other' } : row));

  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));

  assert.deepEqual(host.updateCalls, [['900002', { Leverage: 200, ExpectedGroup: GROUP }]], 'only the server-confirmed member is patched');
  assert.match(document.body.textContent, /Applied group leverage to 1 of 1 accounts\./);
});

test('apply patches a server member that the loaded list did not show', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  host.rows.push(member('900005', 50));

  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));

  assert.deepEqual(
    host.updateCalls.map(([login]) => login),
    ['900001', '900002', '900005'],
    'a server row missing from the loaded list is patched',
  );
  assert.match(document.body.textContent, /Applied group leverage to 3 of 3 accounts\./);
});

test('a 409-refused account keeps its shown leverage; only the accepted account changes', async () => {
  host.conflictLogins = new Set(['900002']);
  const view = await renderTab({ groupName: GROUP, groupLeverage: 200 });
  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));

  assert.equal(host.updateCalls.length, 2);
  assert.match(document.body.textContent, /Applied group leverage to 1 of 2 accounts\./);
  const rows = [...view.container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
  assert.ok(rows.some((text) => text.includes('900001') && text.includes('1 : 200')), 'accepted row shows the new ratio');
  assert.ok(rows.some((text) => text.includes('900002') && text.includes('1 : 50')), '409-refused row keeps the value the server still holds');
});

test('cancel writes nothing and reports nothing', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Cancel'));
  assert.deepEqual(host.updateCalls, []);
});

test('partial failure patches only succeeded rows', async () => {
  host.rejectLogins = new Set(['900002']);
  const view = await renderTab({ groupName: GROUP, groupLeverage: 200 });
  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));

  assert.equal(host.updateCalls.length, 2, 'a rejected account does not stop the others');
  const status = document.body.textContent;
  assert.match(status, /Applied group leverage to 1 of 2 accounts\./);
  const rows = [...view.container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
  assert.ok(rows.some((text) => text.includes('900001') && text.includes('1 : 200')), 'succeeded row shows the new ratio');
  assert.ok(rows.some((text) => text.includes('900002') && text.includes('1 : 50')), 'failed row keeps its own ratio');
});

// The post-write refresh is the one that runs AFTER the writes. The revision advances after the last
// PATCH and before the list re-read, so no read that started before a PATCH can be the refreshed result.
test('after an apply, the cache revision advances after the last PATCH and before the post-write re-read', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  await click(buttonByText('Apply group leverage'));
  host.events.length = 0;
  await click(buttonByExactText('Apply'));

  const events = [...host.events];
  const lastPatch = events.reduce((at, event, index) => (event.startsWith('patch:') ? index : at), -1);
  const bump = events.indexOf('bump');
  assert.ok(lastPatch >= 0, 'the apply wrote at least one account');
  assert.ok(bump > lastPatch, `the revision must advance after the last PATCH (events: ${events.join(', ')})`);
  assert.ok(events.indexOf('read', bump) > bump, `the post-write re-read must follow the bump (events: ${events.join(', ')})`);
  assert.equal(events.filter((event) => event === 'bump').length, 1, 'one bump per apply');
});

test('tab source keeps writes out of effects', () => {
  const source = readFileSync(fileURLToPath(new URL('./GroupAccountsTab.jsx', import.meta.url)), 'utf8');
  assert.ok(!/\buseEffect\b/.test(source), 'GroupAccountsTab must not use effects; writes belong to the confirm handler only');
});

test('confirm copy names the ratio and count', () => {
  assert.deepEqual(buildApplyConfirmCopy({ groupRatio: 200, count: 3 }), {
    title: 'Apply group leverage',
    message: 'Apply group leverage 1 : 200 to 3 accounts? Only accounts with a different leverage will be updated.',
    confirmLabel: 'Apply',
  });
  assert.deepEqual(buildApplyConfirmCopy({ groupRatio: null, count: 3 }), {
    title: 'Apply group leverage',
    message: 'Group leverage is not set for this group, so there is nothing to apply.',
    confirmLabel: 'Apply',
  });
});

// The Apply membership is one fresh server read, and the "already use" count comes from it.
test('apply requests one fresh membership read and reports the fresh member count', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  // Every current member already matches; the server also gained an account since load.
  host.rows = [
    member('900001', 200),
    member('900002', 200),
    member('900003', 200),
    member('900004', undefined),
    member('900005', 200),
    { login: '900009', Name: 'Fixture outsider', group: 'Fixture/Other', leverage: 10 },
  ];

  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));

  assert.deepEqual(host.freshReads, [{ fresh: true }], 'the apply read is the fresh option, not a shared in-flight read');
  assert.deepEqual(host.updateCalls, [], 'nothing differs, so nothing is written');
  assert.match(document.body.textContent, /All 5 accounts already use group leverage 1 : 200\./, 'the count is the fresh membership');
});

// A result for one group must never show under a group the tab was switched to mid-apply.
test('an apply result is not shown under a group the tab was switched to while it ran', async () => {
  const view = await renderTab({ groupName: GROUP, groupLeverage: 200 });
  let release;
  host.gate = new Promise((resolve) => { release = resolve; });

  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));
  await view.rerender({ groupName: 'Fixture/Other', groupLeverage: 200 });
  release();
  await settle();

  assert.deepEqual(host.updateCalls.map(([login]) => login), ['900001', '900002'], 'the server writes for the started group still happen');
  assert.doesNotMatch(document.body.textContent, /Applied group leverage to/, 'the old counts must not show under the new group');
  assert.doesNotMatch(document.body.textContent, /already use group leverage/, 'no stale status under the new group');
});

// The apply's fresh read is older than any cache write made while the apply runs, so it must not replace it.
test('a newer list written to the cache during the apply is not replaced by the older fresh read', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  let releaseFresh;
  let releaseWrites;
  host.gate = new Promise((resolve) => { releaseFresh = resolve; pendingGates.push(resolve); });
  host.updateGate = new Promise((resolve) => { releaseWrites = resolve; pendingGates.push(resolve); });

  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));
  // A concurrent refresh lands a newer list while the fresh membership read is still running.
  mounted.queryClient.setQueryData(['sidebar-accounts', ''], { rows: host.rows.map((row) => ({ ...row })), newerWrite: true });
  releaseFresh();
  await settle();

  assert.ok(host.updateCalls.length > 0, 'the writes must have started, so the older fresh read has already landed');
  assert.equal(mounted.queryClient.getQueryData(['sidebar-accounts', ''])?.newerWrite, true, 'the older fresh read must not replace the newer cache entry');
  releaseWrites();
  await settle();
});

// A tab switch or remount must not re-enable Apply while the group's write is still in flight.
test('a remounted tab keeps Apply disabled while the group write is in flight, then re-enables it', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  let releaseWrites;
  host.updateGate = new Promise((resolve) => { releaseWrites = resolve; pendingGates.push(resolve); });

  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));
  assert.ok(host.updateCalls.length > 0, 'the first write must be in flight');

  // Tab switch away and back: the component unmounts and mounts again for the same group.
  await unmountTab();
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  assert.equal(buttonByText('Apply group leverage').disabled, true, 'Apply stays disabled for the group whose write is in flight');
  assert.match(document.body.textContent, /Applying group leverage/, 'the applying text shows after the remount');

  releaseWrites();
  await settle();
  assert.equal(buttonByText('Apply group leverage').disabled, false, 'Apply re-enables once the write finishes');
  assert.doesNotMatch(document.body.textContent, /Applying group leverage/, 'the applying text clears once the write finishes');
});

// A fresh read that finds no members says so, instead of "All 0 accounts ...".
test('an apply whose fresh read finds no members says the group has no accounts', async () => {
  await renderTab({ groupName: GROUP, groupLeverage: 200 });
  // Every member left the group since load.
  host.rows = [{ login: '900009', Name: 'Fixture outsider', group: 'Fixture/Other', leverage: 10 }];

  await click(buttonByText('Apply group leverage'));
  await click(buttonByExactText('Apply'));

  assert.deepEqual(host.updateCalls, [], 'no members, so nothing is written');
  assert.match(document.body.textContent, /This group has no accounts\./, 'the zero-member status is named as such');
  assert.doesNotMatch(document.body.textContent, /All 0 accounts/, 'the zero-member status must not read "All 0 accounts"');
});
