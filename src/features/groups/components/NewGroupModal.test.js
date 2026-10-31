import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Inline GROUP_POLICY wiring for the real NewGroupModal (real React, real
// react-query, real groupPayload submit path, real mapping module) in jsdom
// with react-dom/client, so submit -> 400 -> map -> inline render executes.
// Only the network edges and unrelated providers are replaced: the
// GroupCreate transport (400 with a mapper-derived server body), the
// permission gate (granted), the parent-group list (empty), and the symbol
// picker, which selects one synthetic symbol through its onChange prop so the
// modal's fail-closed allowed-symbol rule is satisfied (otherwise unrelated to
// the policy path).
//
// Generic fixtures only: synthetic group names. No tenant, broker, host, or
// account identifiers. Server text, field choice, and expectations derive
// from the REAL groupPolicyErrors module — no mirrored literals.

// The REAL mapping module (pure, no transform needed).
import {
  GROUP_POLICY_DEFAULT_INVALID,
  GROUP_POLICY_DEFAULT_MISSING,
  GROUP_POLICY_FIELDS,
  mapGroupPolicyError,
} from '../groupPolicyErrors.js';
import { LEVERAGE_PRESETS } from '../groupFinancialPresets.js';
import { EMPTY_ALLOWED_SYMBOLS_ERROR } from '../groupSymbolAvailability.js';

// The REAL leverage gate module; guarded so a missing module reports each
// test by name instead of failing the whole file.
const leverageGate = await import('../groupLeverage.js').catch(() => ({}));

// First covered policy field is the execution-mode field: the MISSING flow
// under test leaves it blank so backend derivation 400s and the mapper names
// it for inline display.
const FIELD = GROUP_POLICY_FIELDS[0];
const RAW_CODES = [GROUP_POLICY_DEFAULT_MISSING, GROUP_POLICY_DEFAULT_INVALID];

// Backend shape for an omitted field with no tenant/environment/parent
// default (see group_policy_defaults.go / grp-backend.md).
const missingServerMessage = (field) =>
  `${GROUP_POLICY_DEFAULT_MISSING}: ${field} is omitted and this broker has no tenant or environment default for it; send ${field} explicitly`;

// ---- DOM (must exist before react-dom is evaluated) -----------------------
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'HTMLFormElement', 'Node', 'Element', 'MouseEvent', 'getComputedStyle']) {
  if (!(key in globalThis)) globalThis[key] = dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ---- Recorded network edge -------------------------------------------------
// Every manager request is recorded. GET answers the broker group-defaults
// read (host.defaultsResponse); POST answers GroupCreate with a 400 carrying
// host.serverText, or a 200 when serverText is empty.
// allowedSymbol: the one synthetic symbol the SymbolSelector stub picks for the
// Allowed symbols field through its onChange prop ('' picks none).
const FIXTURE_SYMBOL = 'FIXTURE_SYMBOL';
const host = { serverText: '', calls: [], defaultsResponse: null, allowedSymbol: FIXTURE_SYMBOL };
globalThis.__newGroupModalHost = host;

const STUBS = {
  transport: `
    const host = globalThis.__newGroupModalHost;
    export const fetchManagerApi = async (url, options = {}) => {
      const method = String(options.method ?? 'GET').toUpperCase();
      host.calls.push({ url, method, body: options.body === undefined ? undefined : JSON.parse(options.body) });
      if (method === 'GET') return host.defaultsResponse();
      if (!host.serverText) return { ok: true, status: 200, text: async () => JSON.stringify({ created: true }) };
      return { ok: false, status: 400, text: async () => JSON.stringify({ error: host.serverText }) };
    };
    export const updateManagerAccount = async () => { throw new Error('NewGroupModal test: account write must not run on create'); };
    export const fetchAllSidebarAccounts = async () => ({ rows: [] });
  `,
  permissions: `
    export const usePermissions = () => ({ canAct: () => true });
    export default usePermissions;
  `,
  groupList: `
    export const useGroupList = () => ({ groups: [], total: null, hasMore: false, loading: false, error: null });
  `,
  symbols: `
    import { useEffect } from 'react';
    const host = globalThis.__newGroupModalHost;
    export default function SymbolSelector({ label, value, onChange }) {
      useEffect(() => {
        if (label !== 'Allowed symbols' || String(value ?? '').trim() !== '' || !host.allowedSymbol) return;
        onChange(host.allowedSymbol);
      }, [label, value]);
      return null;
    }
  `,
};

// Bundle the real modal and its real in-repo imports (JSX, CSS, payload
// builders, mapper). Packages stay external and load through Node itself,
// resolved exactly as this file resolves them, so the modal and this test
// share one React and one react-query instance.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./NewGroupModal.jsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  logLevel: 'silent',
  plugins: [{
    name: 'new-group-modal-host',
    setup(builder) {
      builder.onResolve({ filter: /(managerFetch|managerAccountApi|sidebarAccounts)(\.js)?$/ }, () => ({
        path: 'transport',
        namespace: 'new-group-modal-host',
      }));
      builder.onResolve({ filter: /usePermissions(\.js)?$/ }, () => ({
        path: 'permissions',
        namespace: 'new-group-modal-host',
      }));
      builder.onResolve({ filter: /useGroupList(\.js)?$/ }, () => ({
        path: 'groupList',
        namespace: 'new-group-modal-host',
      }));
      builder.onResolve({ filter: /SymbolSelector(\.jsx)?$/ }, () => ({
        path: 'symbols',
        namespace: 'new-group-modal-host',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'new-group-modal-host' }, ({ path }) => ({ loader: 'js', contents: STUBS[path] }));
      builder.onResolve({ filter: /^[@a-z]/i }, ({ path }) => (
        /^[a-z]:[\\/]/i.test(path) ? undefined : { path: import.meta.resolve(path), external: true }
      ));
    },
  }],
});
const { default: NewGroupModal } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

// ---- Render helpers --------------------------------------------------------
let mounted = null;
const calls = { close: 0 };

const settle = async (rounds = 8) => {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
  }
};

const renderModal = async (props = {}) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(NewGroupModal, { ...props, onClose: () => { calls.close += 1; }, onSuccess: () => {} }),
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

// ---- Broker group-defaults fixtures ----------------------------------------
// Contract: 200 {"broker_id", "group_default_leverage": int 1..10000 | null};
// errors are {"message","code","stackTrace"}. Values derive from the REAL
// preset list (one preset, one non-preset) -- no tenant values.
const PRESET_DEFAULT = LEVERAGE_PRESETS[Math.floor(LEVERAGE_PRESETS.length / 2)];
const CUSTOM_DEFAULT = (() => {
  let value = PRESET_DEFAULT.value + 1;
  while (LEVERAGE_PRESETS.some((preset) => preset.value === value)) value += 1;
  return value;
})();
const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const defaultsOf = (value) => () => jsonResponse(200, { broker_id: 'fixture-broker', group_default_leverage: value });
const defaultsError = (status, code) => () => jsonResponse(status, { message: `${code}: fixture refusal`, code, stackTrace: null });
const DEFAULTS_PATH = '/api/v1/manager/broker/group-defaults';

beforeEach(() => {
  host.serverText = '';
  host.calls = [];
  host.defaultsResponse = defaultsOf(PRESET_DEFAULT.value);
  host.allowedSymbol = FIXTURE_SYMBOL;
  calls.close = 0;
});

afterEach(() => unmountModal());

// jsdom keeps the event loop alive until its window is closed.
after(() => { dom.window.close(); });

const fieldWrap = (container, label) =>
  [...container.querySelectorAll('.group-create-field')].find((el) => el.children[0]?.tagName === 'SPAN' && el.children[0].textContent === label);

const fillInput = async (container, label, value) => {
  const wrap = fieldWrap(container, label);
  assert.ok(wrap, `field "${label}" must render`);
  const input = wrap.querySelector('input');
  assert.ok(input, `field "${label}" must own an input`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await settle();
};

const submitModal = async (container) => {
  const form = container.querySelector('form');
  assert.ok(form, 'the modal form must render');
  await act(async () => { form.requestSubmit(); });
  await settle();
};

// ---- Tests ------------------------------------------------------------------
test('server MISSING error renders inline on the executionMode field; raw code never renders', async () => {
  host.serverText = missingServerMessage(FIELD);
  const expected = mapGroupPolicyError(host.serverText);
  for (const code of RAW_CODES) assert.doesNotMatch(expected, new RegExp(code));

  const container = await renderModal();

  // Blank routing default shows the Book placeholder instead of a default.
  const bookWrap = fieldWrap(container, 'Book');
  assert.ok(bookWrap, 'the Book choice must render');
  assert.equal(bookWrap.querySelector('button span')?.textContent, 'Select');

  await fillInput(container, 'Group name', 'Fixture/Standard');
  await submitModal(container);

  const alerts = [...container.querySelectorAll('[role="alert"]')];
  const inline = alerts.find((el) => el.textContent === expected);
  assert.ok(inline, 'the mapped message must render inline on the field');
  assert.ok(inline.classList.contains('group-create-field-error'), 'inline alert uses the per-field pattern');
  const wrap = inline.closest('.group-create-field');
  assert.ok(wrap && wrap.textContent.includes('Execution mode'), 'inline alert sits on the Execution mode field');
  assert.equal(
    container.querySelector('.group-create-body > .group-create-error'),
    null,
    'a mapped field error must not also render at form level',
  );
  for (const code of RAW_CODES) assert.doesNotMatch(container.textContent, new RegExp(code));
  assert.equal(calls.close, 0, 'a failed submit must not close the modal');
});

test('unknown server errors keep the verbatim form-level passthrough', async () => {
  host.serverText = 'Failed to create group';
  const container = await renderModal();
  await fillInput(container, 'Group name', 'Fixture/Standard');
  await submitModal(container);

  const formAlert = container.querySelector('.group-create-body > .group-create-error');
  assert.ok(formAlert, 'unknown errors still render at form level');
  assert.equal(formAlert.textContent, host.serverText);
  assert.equal(container.querySelectorAll('.group-create-field-error').length, 0, 'unknown errors render no inline alert');
  assert.equal(calls.close, 0, 'a failed submit must not close the modal');
});

test('editing the executionMode field clears its inline error', async () => {
  host.serverText = missingServerMessage(FIELD);
  const container = await renderModal();
  await fillInput(container, 'Group name', 'Fixture/Standard');
  await submitModal(container);
  assert.equal(container.querySelectorAll('.group-create-field-error').length, 1, 'the inline error shows first');

  const execWrap = fieldWrap(container, 'Execution mode');
  assert.ok(execWrap, 'the Execution mode choice must render');
  await act(async () => {
    execWrap.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  await settle();
  const option = document.querySelectorAll('[role="option"]')[0];
  assert.ok(option, 'the execution menu must open');
  await act(async () => {
    option.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  await settle();
  assert.equal(container.querySelectorAll('.group-create-field-error').length, 0, 'picking a value clears the inline error');
});

// ---- Group-create leverage: broker default pre-fill and the 1..10000 gate ---
const leverageWrap = (container) => {
  const wrap = fieldWrap(container, 'Leverage');
  assert.ok(wrap, 'the Leverage choice must render');
  return wrap;
};
const leverageShown = (container) => leverageWrap(container).querySelector('button span')?.textContent;
const leverageError = (container) => leverageWrap(container).querySelector('.group-create-field-error')?.textContent ?? null;
const leveragePanel = (container) => leverageWrap(container).closest('.group-create-preset');
const customLeverageInput = (container) => container.querySelector('input[aria-label="Leverage (custom)"]');
const postCalls = () => host.calls.filter((call) => call.method === 'POST');
const getCalls = () => host.calls.filter((call) => call.method === 'GET');

const typeInto = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await settle();
};

const chooseLeverageOption = async (container, label) => {
  await act(async () => {
    leverageWrap(container).querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  await settle();
  const option = [...document.querySelectorAll('[role="option"]')].find((el) => el.textContent === label);
  assert.ok(option, `the leverage menu must offer "${label}"`);
  await act(async () => { option.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await settle();
};

const assertBlocked = (container, why) => {
  assert.equal(postCalls().length, 0, `${why}: no GroupCreate request may be sent`);
  assert.ok(leverageGate.GROUP_LEVERAGE_RANGE_MESSAGE, 'range message constant exists');
  assert.equal(leverageError(container), leverageGate.GROUP_LEVERAGE_RANGE_MESSAGE, `${why}: inline leverage error`);
  assert.equal(calls.close, 0, `${why}: the modal stays open`);
};

test('a fresh create reads the broker group defaults exactly once, at the manager contract path', async () => {
  await renderModal();
  assert.deepEqual(getCalls().map((call) => call.url), [DEFAULTS_PATH]);
  assert.equal(getCalls()[0].body, undefined, 'the GET carries no body (no broker_id)');
});

test('broker default pre-fills leverage (preset) and is sent as an integer', async () => {
  const container = await renderModal();
  assert.equal(leverageShown(container), PRESET_DEFAULT.label, 'the default shows as the selected value');
  await fillInput(container, 'Group name', 'Fixture/Standard');
  await submitModal(container);
  assert.equal(postCalls().length, 1);
  assert.equal(postCalls()[0].url, '/GroupCreate');
  assert.equal(postCalls()[0].body.leverage, PRESET_DEFAULT.value);
  assert.ok(Number.isInteger(postCalls()[0].body.leverage));
  assert.equal(calls.close, 1);
});

test('broker default that is not a preset pre-fills the custom box and is sent', async () => {
  host.defaultsResponse = defaultsOf(CUSTOM_DEFAULT);
  const container = await renderModal();
  assert.equal(customLeverageInput(container)?.value, String(CUSTOM_DEFAULT));
  await fillInput(container, 'Group name', 'Fixture/Standard');
  await submitModal(container);
  assert.equal(postCalls().length, 1);
  assert.equal(postCalls()[0].body.leverage, CUSTOM_DEFAULT);
});

test('null broker default leaves leverage empty with a hint and requires a value', async () => {
  host.defaultsResponse = defaultsOf(null);
  const container = await renderModal();
  assert.equal(leverageShown(container), 'Select leverage…');
  assert.ok(leverageGate.GROUP_LEVERAGE_NO_DEFAULT_HINT, 'hint constant exists');
  assert.ok(leveragePanel(container).textContent.includes(leverageGate.GROUP_LEVERAGE_NO_DEFAULT_HINT), 'neutral hint renders');
  await fillInput(container, 'Group name', 'Fixture/Standard');
  await submitModal(container);
  assertBlocked(container, 'null default');

  await chooseLeverageOption(container, PRESET_DEFAULT.label);
  assert.equal(leverageError(container), null, 'picking a value clears the inline error');
  await submitModal(container);
  assert.equal(postCalls().length, 1);
  assert.equal(postCalls()[0].body.leverage, PRESET_DEFAULT.value);
});

for (const [label, response] of [
  ['403 MT_RET_ERR_PERMISSIONS', defaultsError(403, 'MT_RET_ERR_PERMISSIONS')],
  ['503 GROUP_DEFAULTS_UNAVAILABLE', defaultsError(503, 'GROUP_DEFAULTS_UNAVAILABLE')],
  ['network failure', () => { throw new TypeError('Failed to fetch'); }],
]) {
  test(`group-defaults ${label} leaves leverage empty with a hint and blocks submit`, async () => {
    host.defaultsResponse = response;
    const container = await renderModal();
    assert.equal(getCalls().length, 1, 'the defaults read was attempted');
    assert.equal(leverageShown(container), 'Select leverage…');
    assert.ok(leverageGate.GROUP_LEVERAGE_NO_DEFAULT_HINT, 'hint constant exists');
    assert.ok(leveragePanel(container).textContent.includes(leverageGate.GROUP_LEVERAGE_NO_DEFAULT_HINT));
    await fillInput(container, 'Group name', 'Fixture/Standard');
    await submitModal(container);
    assertBlocked(container, label);
  });
}

test('custom leverage: cleared box never sends 0; 0, 10001 and 1.5 are blocked; 250 is sent as an integer', async () => {
  const container = await renderModal();
  await fillInput(container, 'Group name', 'Fixture/Standard');
  await chooseLeverageOption(container, 'Custom...');
  assert.ok(customLeverageInput(container), 'the custom leverage box opens');

  for (const value of ['', '0', '10001', '1.5']) {
    await typeInto(customLeverageInput(container), value);
    await submitModal(container);
    assertBlocked(container, `custom ${JSON.stringify(value)}`);
  }

  await typeInto(customLeverageInput(container), '250');
  assert.equal(leverageError(container), null, 'typing clears the inline error');
  await submitModal(container);
  assert.equal(postCalls().length, 1);
  assert.equal(postCalls()[0].body.leverage, 250);
  assert.ok(Number.isInteger(postCalls()[0].body.leverage));
});

test('create with a parent group keeps inheriting: untouched leverage is omitted', async () => {
  for (const response of [defaultsOf(null), defaultsOf(PRESET_DEFAULT.value)]) {
    host.calls = [];
    host.defaultsResponse = response;
    calls.close = 0;
    const container = await renderModal();
    await fillInput(container, 'Group name', 'Fixture/Parent/Child');
    await fillInput(container, 'Parent group (optional)', 'Fixture/Parent');
    await submitModal(container);
    assert.equal(postCalls().length, 1, 'subgroup create is not blocked');
    assert.equal(postCalls()[0].body.parentGroup, 'Fixture/Parent');
    assert.ok(!('leverage' in postCalls()[0].body), 'the parent leverage governs');
    await unmountModal();
  }
});

test('duplicate keeps sending the source leverage', async () => {
  const source = { name: 'Fixture/Source', leverage: CUSTOM_DEFAULT, tradeAllowed: true };
  const container = await renderModal({ duplicateData: source });
  await submitModal(container);
  assert.equal(postCalls().length, 1);
  assert.equal(postCalls()[0].body.name, 'Fixture/Source Copy');
  assert.equal(postCalls()[0].body.leverage, CUSTOM_DEFAULT);
});

test('server leverage refusals render inline on the Leverage field', async () => {
  for (const serverText of [
    `${GROUP_POLICY_DEFAULT_MISSING}: leverage is omitted and this broker has no default group leverage; send leverage explicitly`,
    'GROUP_LEVERAGE_INVALID: leverage is outside 1..10000',
  ]) {
    host.calls = [];
    host.serverText = serverText;
    const container = await renderModal();
    await fillInput(container, 'Group name', 'Fixture/Standard');
    await submitModal(container);
    assert.equal(postCalls().length, 1);
    const inline = leverageError(container);
    assert.ok(inline, `inline leverage error for ${serverText.split(':')[0]}`);
    assert.equal(inline, mapGroupPolicyError(serverText));
    assert.equal(container.querySelector('.group-create-body > .group-create-error'), null, 'no form-level duplicate');
    assert.doesNotMatch(container.textContent, /GROUP_POLICY_DEFAULT_MISSING|GROUP_LEVERAGE_INVALID/);
    await unmountModal();
  }
});

test('no allowed symbol and allow-all unticked: refused client-side, no GroupCreate is sent', async () => {
  host.allowedSymbol = '';
  const container = await renderModal();
  const allowAll = [...container.querySelectorAll('label.group-create-check')].find((el) => el.textContent === 'Allow all symbols');
  assert.ok(allowAll, 'the Allow all symbols control must render');
  assert.equal(allowAll.querySelector('input').checked, false, 'allow-all starts unticked');
  await fillInput(container, 'Group name', 'Fixture/Standard');
  await submitModal(container);

  const formAlert = container.querySelector('.group-create-body > .group-create-error');
  assert.ok(formAlert, 'the fail-closed refusal renders at form level');
  assert.equal(formAlert.textContent, EMPTY_ALLOWED_SYMBOLS_ERROR);
  assert.equal(postCalls().length, 0, 'no GroupCreate request may be sent');
  assert.equal(calls.close, 0, 'the modal stays open');
});
