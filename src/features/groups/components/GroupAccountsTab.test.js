import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import esbuild from 'esbuild';
const { transformSync } = esbuild;

// SUI-M1 redo (MONITOR OVERRIDE): the group-leverage sync is the owner team's
// intended feature, so the Accounts tab keeps an EXPLICIT, confirmed apply
// path instead of the deleted auto-PATCH effect. Viewing the tab
// (open/render/refresh/search/select) must NEVER write.
//
// Everything asserted here runs against the REAL artifacts, never mirrored
// logic:
// - the real GroupAccountsTab.jsx, JSX-transformed only (esbuild, already in
//   node_modules) so plain node --test can load it; no source line is
//   rewritten. The compiled copy lives in a temp dir and is removed in after().
// - the real accountsInGroup display mapper (loaded by the compiled tab).
// - the real exported applyGroupLeverage flow for the button path.
// - the real react-query provider/client; only the data hook itself is
//   stubbed (canned rows, no network), the query-options factory is
//   redirected (node ESM rejects its extensionless import; the stub keeps
//   the same queryKey shape and is ignored by the stubbed hook), and the
//   account-update service is a COUNTING stub so the tests can prove zero
//   writes on render.
//
// Generic fixtures only: synthetic group names with placeholder values. No
// tenant, broker, host, or account identifiers.

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// Compiled copies live under the worktree's node_modules (gitignored, removed
// in after()) so bare imports in the compiled tab (react, lucide-react,
// @tanstack/react-query) resolve exactly as they do for the real source.
const nodeModulesDir = dirname(dirname(require.resolve('react/package.json')));
const fileUrl = (path) => pathToFileURL(path).href;

const GROUP_NAME = 'Fixture/Standard';
const GROUP_LEVERAGE = 200;

// login 900001 differs (100 vs 200) and updates cleanly; 900002 differs and
// the stub rejects it; 900003 already matches and must be skipped; 900004 is
// outside the group and must never appear.
const stubAccounts = () => ([
  { login: '900001', Name: 'Fixture Member One', group: GROUP_NAME, leverage: 100, balance: 5000, equity: 5000 },
  { login: '900002', Name: 'Fixture Member Two', group: GROUP_NAME, Leverage: 50, balance: 10, equity: 10 },
  { login: '900003', Name: 'Fixture Member Three', group: GROUP_NAME, Leverage: 200, balance: 7, equity: 7 },
  { login: '900004', Name: 'Fixture Outsider', group: 'Fixture/Other', leverage: 200, balance: 7, equity: 7 },
]);

const cacheDir = join(nodeModulesDir, '.cache', `sui-m1-tab-${Date.now()}-${Math.floor(Math.random() * 1000000)}`);
mkdirSync(cacheDir, { recursive: true });

const stubDir = cacheDir;
writeFileSync(join(stubDir, 'managerAccountApi.stub.mjs'), `
export const calls = [];
export const updateManagerAccount = async (login, payload) => {
  calls.push({ login, payload });
  if (String(login) === '900002') throw new Error('rejected for fixture member two');
  return { ok: true };
};
export const createManagerAccount = async () => { throw new Error('not stubbed'); };
export const deleteManagerAccount = async () => { throw new Error('not stubbed'); };
export default { createManagerAccount, deleteManagerAccount, updateManagerAccount };
`);

// Stubbed data hook: re-exports the real react-query package and overrides
// only useQuery with canned rows (no network). Everything else stays real.
writeFileSync(join(stubDir, 'reactQuery.stub.mjs'), `
export * from '@tanstack/react-query';
export const useQuery = () => ({
  data: globalThis.__SUI_M1_ROWS__ || { rows: [] },
  isLoading: false,
  isFetching: false,
  error: null,
  refetch: () => Promise.resolve({}),
});
`);

// Sidebar query-options factory: node ESM cannot load the real module
// (it uses a bundler-style extensionless import), so it is redirected to a
// stub with the same queryKey shape. The stubbed useQuery ignores the
// options object entirely and serves canned rows, so no query behavior is
// asserted through this stub.
writeFileSync(join(stubDir, 'sidebarAccounts.stub.mjs'), `
export const getSidebarAccountsQueryOptions = (search = '') => ({
  queryKey: ['sidebar-accounts', String(search || '').trim()],
  queryFn: () => Promise.resolve({ rows: [] }),
  staleTime: 5 * 60 * 1000,
});
`);
// Shared confirm dialog: the real DepositDialog pulls in a CSS import that
// plain node cannot load, so it is redirected to a stub that renders the
// exact props it receives (the dialog only appears after an explicit click,
// never on mount, so mount assertions are unaffected; prop-passing is).
writeFileSync(join(stubDir, 'depositDialog.stub.mjs'), `
import { createElement as h } from 'react';
export default function DepositDialog({ status, title, message, confirmLabel, onConfirm, onDismiss }) {
  return h('div', {
    className: 'deposit-dialog-stub',
    'data-status': status,
    'data-title': title,
    'data-message': message,
    'data-confirm-label': confirmLabel,
  });
}
`);
// Compile the REAL tab: JSX syntax transform only, then point its imports at
// the real row mapper and at the stubs above.
const compiled = transformSync(readFileSync(join(here, 'GroupAccountsTab.jsx'), 'utf8'), {
  loader: 'jsx',
  jsx: 'automatic',
}).code
  .replaceAll('../../../services/managerAccountApi.js', fileUrl(join(stubDir, 'managerAccountApi.stub.mjs')))
  .replaceAll('../../../services/sidebarAccounts.js', fileUrl(join(stubDir, 'sidebarAccounts.stub.mjs')))
  .replaceAll('../groupAccountRows.js', fileUrl(join(here, '..', 'groupAccountRows.js')))
  .replaceAll('./groupLeverageApply.js', fileUrl(join(here, 'groupLeverageApply.js')))
  .replaceAll('../../../components/Popups/DepositDialog.jsx', fileUrl(join(stubDir, 'depositDialog.stub.mjs')))
  .replaceAll('@tanstack/react-query', fileUrl(join(stubDir, 'reactQuery.stub.mjs')));
writeFileSync(join(cacheDir, 'GroupAccountsTab.compiled.mjs'), compiled);

const tabModule = await import(fileUrl(join(cacheDir, 'GroupAccountsTab.compiled.mjs')));
const updateStub = await import(fileUrl(join(stubDir, 'managerAccountApi.stub.mjs')));
// The apply flow lives in its own plain-.js module (no JSX/CSS), so the test
// imports the REAL helpers directly — no transform, no mirror.
const { applyGroupLeverage, buildApplyConfirmCopy } = await import('./groupLeverageApply.js');
const GroupAccountsTab = tabModule.default;

after(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

const renderTab = () => {
  globalThis.__SUI_M1_ROWS__ = { rows: stubAccounts(), total: 4, hasMore: false, nextOffset: 4 };
  const client = new QueryClient();
  return renderToString(
    h(QueryClientProvider, { client }, h(GroupAccountsTab, { groupName: GROUP_NAME, groupLeverage: GROUP_LEVERAGE })),
  );
};

test('react-dom/server renders the real tab component', () => {
  assert.equal(typeof renderToString, 'function', 'react-dom/server must be available');
  assert.equal(typeof GroupAccountsTab, 'function', 'the real tab component must load');
  assert.equal(typeof applyGroupLeverage, 'function', 'the real apply flow must be exported');
  assert.equal(typeof buildApplyConfirmCopy, 'function', 'the real confirm copy must be exported');
});

test('(a) RENDER: member rows render, Apply button shows the count, zero update calls', () => {
  updateStub.calls.length = 0;
  const html = renderTab();

  assert.ok(html.includes('Fixture Member One'), 'member one must render');
  assert.ok(html.includes('Fixture Member Two'), 'member two must render');
  assert.ok(html.includes('Fixture Member Three'), 'member three must render');
  assert.ok(!html.includes('Fixture Outsider'), 'accounts outside the group must not render');
  assert.ok(
    html.includes('Apply group leverage to 3 accounts'),
    'the Apply button must show the current member count',
  );
  assert.equal(updateStub.calls.length, 0, 'rendering the tab must perform zero account updates');
});

test('(a) RENDER: no confirm dialog on mount, remount is write-free', () => {
  updateStub.calls.length = 0;
  const first = renderTab();
  assert.ok(!first.includes('role="alertdialog"'), 'mount must not show any confirm dialog');
  assert.ok(!first.includes('groups-apply-desc'), 'mount must not render confirm copy');
  assert.ok(!first.includes('deposit-dialog'), 'mount must not render the shared confirm dialog');
  const second = renderTab();
  assert.ok(second.includes('Apply group leverage to 3 accounts'), 'remount must render the same Apply button');
  assert.equal(updateStub.calls.length, 0, 'mounting and remounting must perform zero account updates');
});

test('(c) CONFIRM COPY: shared-dialog props carry the count and ratio', () => {
  const copy = buildApplyConfirmCopy({ groupRatio: 200, count: 3 });
  assert.deepEqual(copy, {
    title: 'Apply group leverage',
    message: 'Apply group leverage 1 : 200 to 3 accounts? Only accounts with a different leverage will be updated.',
    confirmLabel: 'Apply',
  });
});

test('(b) button path: confirm=false performs zero updates', async () => {
  updateStub.calls.length = 0;
  const result = await applyGroupLeverage({
    members: stubAccounts(),
    groupLeverage: GROUP_LEVERAGE,
    confirm: false,
    updateAccount: updateStub.updateManagerAccount,
  });
  assert.deepEqual(result, { succeeded: 0, failed: 0, total: 0 });
  assert.equal(updateStub.calls.length, 0, 'without confirmation nothing may be written');
});

test('(b) button path: confirm=true updates only differing members, reports succeeded/failed', async () => {
  updateStub.calls.length = 0;
  const result = await applyGroupLeverage({
    members: stubAccounts().filter((account) => account.login !== '900004'),
    groupLeverage: GROUP_LEVERAGE,
    confirm: true,
    updateAccount: updateStub.updateManagerAccount,
  });
  assert.deepEqual(
    updateStub.calls.map((call) => call.login),
    ['900001', '900002'],
    'only members whose leverage differs are updated, in row order',
  );
  for (const call of updateStub.calls) {
    assert.deepEqual(call.payload, { Leverage: 200 }, 'each update carries the group ratio');
  }
  assert.deepEqual(result, { succeeded: 1, failed: 1, total: 2 });
});

test('(b) button path: unparsable group leverage performs zero updates', async () => {
  updateStub.calls.length = 0;
  const result = await applyGroupLeverage({
    members: stubAccounts(),
    groupLeverage: null,
    confirm: true,
    updateAccount: updateStub.updateManagerAccount,
  });
  assert.deepEqual(result, { succeeded: 0, failed: 0, total: 0 });
  assert.equal(updateStub.calls.length, 0, 'an unknown group ratio must not touch any account');
});
