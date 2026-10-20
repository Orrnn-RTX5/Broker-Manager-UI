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
};
globalThis.__groupAccountsTabHost = host;

const STUBS = {
  sidebarAccounts: `
    const host = globalThis.__groupAccountsTabHost;
    export const getSidebarAccountsQueryOptions = (search = '') => ({
      queryKey: ['sidebar-accounts', String(search || '').trim()],
      queryFn: async () => { host.fetches += 1; return { rows: host.rows.map((row) => ({ ...row })) }; },
      staleTime: 5 * 60 * 1000,
    });
  `,
  managerAccountApi: `
    const host = globalThis.__groupAccountsTabHost;
    export const updateManagerAccount = async (login, payload) => {
      host.updateCalls.push([String(login), payload]);
      if (host.rejectLogins.has(String(login))) throw new Error('Rejected by server');
      return { success: true };
    };
    export const createManagerAccount = async () => { throw new Error('createManagerAccount must not be called'); };
    export const deleteManagerAccount = async () => { throw new Error('deleteManagerAccount must not be called'); };
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
      builder.onResolve({ filter: /(sidebarAccounts|managerAccountApi)(\.js)?$/ }, ({ path }) => ({
        path: path.match(/(sidebarAccounts|managerAccountApi)/)[1],
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
});

afterEach(() => unmountTab());

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
    ['900001', { Leverage: 200 }],
    ['900002', { Leverage: 200 }],
  ]);
  assert.equal(host.fetches, 1, 'no refetch — succeeded rows are patched in the cache');
  const body = view.container.textContent;
  assert.match(body, /Applied group leverage to 2 of 2 accounts\./);
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
