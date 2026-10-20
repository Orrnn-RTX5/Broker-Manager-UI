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
// picker (unrelated to the policy path).
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
const host = { serverText: '' };
globalThis.__newGroupModalHost = host;

const STUBS = {
  transport: `
    const host = globalThis.__newGroupModalHost;
    export const fetchManagerApi = async () => ({
      ok: false, status: 400,
      text: async () => JSON.stringify({ error: host.serverText }),
    });
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
    export default function SymbolSelector() { return null; }
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

const renderModal = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(NewGroupModal, { onClose: () => { calls.close += 1; }, onSuccess: () => {} }),
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
  host.serverText = '';
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
