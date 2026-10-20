import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Group properties window opened on a folder row (group.isNew): its OK button
// creates a top-level group through POST /GroupCreate. Like the New group
// wizard it must pre-fill leverage from the broker's group default, require a
// whole number 1..10000 when none resolves, and never send 0. Real React,
// real modal, real payload builders in jsdom; only the network edges and the
// unrelated child windows are replaced. Generic fixtures only.

const leverageGate = await import('../groupLeverage.js').catch(() => ({}));

// ---- DOM (must exist before react-dom is evaluated) -----------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'HTMLFormElement', 'Node', 'Element', 'MouseEvent', 'getComputedStyle']) {
  if (!(key in globalThis)) globalThis[key] = dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---- Recorded network edge -------------------------------------------------
const host = { calls: [], defaultsResponse: null, serverText: '' };
globalThis.__groupPropertiesHost = host;

const STUBS = {
  transport: `
    const host = globalThis.__groupPropertiesHost;
    export const fetchManagerApi = async (url, options = {}) => {
      const method = String(options.method ?? 'GET').toUpperCase();
      host.calls.push({ url, method, body: options.body === undefined ? undefined : JSON.parse(options.body) });
      if (method === 'GET') return host.defaultsResponse();
      if (host.serverText) {
        return { ok: false, status: 400, text: async () => JSON.stringify({ message: host.serverText, code: 'MT_RET_ERR_PARAMS', stackTrace: null }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ created: true }) };
    };
    export const updateManagerAccount = async () => { throw new Error('GroupPropertiesModal test: account write must not run on create'); };
    export const fetchAllSidebarAccounts = async () => ({ rows: [] });
  `,
  api: `
    export const groupSymbolOverridesGet = async () => { throw new Error('GroupPropertiesModal test: symbols are not loaded for a new group'); };
    export const groupSymbolOverridesSave = async () => { throw new Error('GroupPropertiesModal test: symbols are not saved for a new group'); };
  `,
  permissions: `
    export const usePermissions = () => ({ canAct: () => true });
    export default usePermissions;
  `,
  child: `
    export default function Child() { return null; }
  `,
};

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./GroupPropertiesModal.jsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  logLevel: 'silent',
  plugins: [{
    name: 'group-properties-host',
    setup(builder) {
      builder.onResolve({ filter: /(managerFetch|managerAccountApi|sidebarAccounts)(\.js)?$/ }, () => ({ path: 'transport', namespace: 'gp-host' }));
      builder.onResolve({ filter: /services\/api(\.js)?$/ }, () => ({ path: 'api', namespace: 'gp-host' }));
      builder.onResolve({ filter: /usePermissions(\.js)?$/ }, () => ({ path: 'permissions', namespace: 'gp-host' }));
      builder.onResolve({ filter: /(AccountDetailsModal|GroupAccountsTab|NewGroupModal)(\.jsx)?$/ }, () => ({ path: 'child', namespace: 'gp-host' }));
      builder.onLoad({ filter: /.*/, namespace: 'gp-host' }, ({ path }) => ({ loader: 'js', contents: STUBS[path] }));
      builder.onResolve({ filter: /^[@a-z]/i }, ({ path }) => (
        /^[a-z]:[\\/]/i.test(path) ? undefined : { path: import.meta.resolve(path), external: true }
      ));
    },
  }],
});
const { default: GroupPropertiesModal } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

// ---- Render helpers --------------------------------------------------------
const DEFAULTS_PATH = '/api/v1/manager/broker/group-defaults';
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const defaultsOf = (value) => () => jsonResponse(200, { broker_id: 'fixture-broker', group_default_leverage: value });
const defaultsError = (status, code) => () => jsonResponse(status, { message: `${code}: fixture refusal`, code, stackTrace: null });

let mounted = null;
const calls = { close: 0 };

const settle = async (rounds = 8) => {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
  }
};

const renderModal = async (group) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(GroupPropertiesModal, { group, onClose: () => { calls.close += 1; }, onSaved: () => {} }),
    ));
  });
  await settle();
  mounted = { container, root, queryClient };
  return container;
};

const unmountModal = async () => {
  if (!mounted) return;
  await act(async () => { mounted.root.unmount(); });
  mounted.queryClient.clear();
  mounted.container.remove();
  mounted = null;
};

beforeEach(() => {
  host.calls = [];
  host.defaultsResponse = defaultsOf(250);
  host.serverText = '';
  calls.close = 0;
});
afterEach(() => unmountModal());
after(() => { dom.window.close(); });

const click = async (element) => {
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await settle();
};
const openMargin = async (container) => {
  const tab = [...container.querySelectorAll('[role="tab"]')].find((el) => el.textContent === 'Margin');
  assert.ok(tab, 'the Margin tab must render');
  await click(tab);
};
const pressOk = async (container) => {
  const ok = [...container.querySelectorAll('button')].find((el) => el.textContent.trim() === 'OK');
  assert.ok(ok, 'the OK button must render');
  await click(ok);
};
const leverageInput = (container) => container.querySelector('input[aria-label="Leverage"]');
const typeInto = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await settle();
};
const postCalls = () => host.calls.filter((call) => call.method === 'POST');
const getCalls = () => host.calls.filter((call) => call.method === 'GET');
const leverageAlert = (container) =>
  [...container.querySelectorAll('[role="alert"]')].find((el) => el.textContent === leverageGate.GROUP_LEVERAGE_RANGE_MESSAGE) ?? null;

const NEW_GROUP = Object.freeze({ name: 'Fixture/Folder', isNew: true });

const assertBlocked = (container, why) => {
  assert.equal(postCalls().length, 0, `${why}: no GroupCreate request may be sent`);
  assert.ok(leverageGate.GROUP_LEVERAGE_RANGE_MESSAGE, 'range message constant exists');
  assert.ok(leverageAlert(container), `${why}: inline leverage error`);
  assert.ok(leverageInput(container), `${why}: the Margin tab with the leverage field is shown`);
  assert.equal(calls.close, 0, `${why}: the window stays open`);
};

// ---- Tests ------------------------------------------------------------------
test('folder properties create pre-fills the broker default leverage and sends it as an integer', async () => {
  const container = await renderModal(NEW_GROUP);
  assert.deepEqual(getCalls().map((call) => call.url), [DEFAULTS_PATH]);
  await openMargin(container);
  assert.equal(leverageInput(container).value, '250');
  await pressOk(container);
  assert.equal(postCalls().length, 1);
  assert.equal(postCalls()[0].url, '/GroupCreate');
  assert.equal(postCalls()[0].body.leverage, 250);
  assert.equal(calls.close, 1);
});

for (const [label, response] of [
  ['null default', defaultsOf(null)],
  ['403 MT_RET_ERR_PERMISSIONS', defaultsError(403, 'MT_RET_ERR_PERMISSIONS')],
]) {
  test(`folder properties create with ${label}: blank leverage, hint, submit blocked`, async () => {
    host.defaultsResponse = response;
    const container = await renderModal(NEW_GROUP);
    await openMargin(container);
    assert.equal(leverageInput(container).value, '');
    assert.ok(leverageGate.GROUP_LEVERAGE_NO_DEFAULT_HINT, 'hint constant exists');
    assert.ok(container.textContent.includes(leverageGate.GROUP_LEVERAGE_NO_DEFAULT_HINT), 'neutral hint renders');
    await click([...container.querySelectorAll('[role="tab"]')].find((el) => el.textContent === 'Accounts'));
    await pressOk(container);
    assertBlocked(container, label);

    await typeInto(leverageInput(container), '300');
    assert.equal(leverageAlert(container), null, 'typing clears the inline error');
    await pressOk(container);
    assert.equal(postCalls().length, 1);
    assert.equal(postCalls()[0].body.leverage, 300);
  });
}

test('folder properties create: cleared, 0, 10001 and 1.5 are blocked and 0 is never sent', async () => {
  const container = await renderModal(NEW_GROUP);
  await openMargin(container);
  for (const value of ['', '0', '10001', '1.5']) {
    await typeInto(leverageInput(container), value);
    await pressOk(container);
    assertBlocked(container, `leverage ${JSON.stringify(value)}`);
  }
});

test('an existing group does not read broker defaults', async () => {
  await renderModal({ name: 'Fixture/Existing', leverage: 200 });
  assert.equal(getCalls().length, 0);
});

test('folder properties create: server leverage refusals render inline on the leverage field', async () => {
  const { mapGroupPolicyError } = await import('../groupPolicyErrors.js');
  for (const serverText of [
    'GROUP_POLICY_DEFAULT_MISSING: leverage is omitted and this broker has no default group leverage; send leverage explicitly',
    'GROUP_LEVERAGE_INVALID: leverage is outside 1..10000',
  ]) {
    host.calls = [];
    host.serverText = serverText;
    const container = await renderModal(NEW_GROUP);
    await pressOk(container);
    assert.equal(postCalls().length, 1);
    const expected = mapGroupPolicyError(serverText);
    const inline = [...container.querySelectorAll('[role="alert"]')].find((el) => el.textContent === expected);
    assert.ok(inline, `inline leverage error for ${serverText.split(':')[0]}`);
    assert.ok(leverageInput(container), 'the Margin tab with the leverage field is shown');
    assert.doesNotMatch(container.textContent, /GROUP_POLICY_DEFAULT_MISSING|GROUP_LEVERAGE_INVALID/);
    await unmountModal();
  }
});
