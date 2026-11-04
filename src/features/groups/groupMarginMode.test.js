import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

// Group "Account mode" (hedging | netting): payload keys, B-book rule, form
// state from a source group, and readable netting refusals on save. Real
// payload builders with a controlled transport; generic fixtures only.
const runtime = { calls: [], response: null };
globalThis.__groupMarginModeTest = runtime;
const bundle = await build({
  stdin: {
    contents: "export * from './groupPayload.js'; export { buildNewGroupFormData } from './newGroupForm.js';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    loader: 'js',
  },
  bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [{ name: 'group-mode-transport', setup(builder) {
    builder.onResolve({ filter: /\/(managerFetch|managerAccountApi|sidebarAccounts|realtimeCacheRevision)\.js$/ }, ({ path }) => ({ path, namespace: 'group-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'group-test' }, ({ path }) => ({ loader: 'js', contents:
      path.includes('managerFetch') ? 'export const fetchManagerApi = (...args) => globalThis.__groupMarginModeTest.request(...args);' :
      path.includes('managerAccountApi') ? 'export const updateManagerAccount = async () => ({});' :
      path.includes('realtimeCacheRevision') ? 'export const advanceRealtimeCacheRevision = () => {};' :
      'export const fetchAllSidebarAccounts = async () => ({ rows: [] });',
    }));
  } }],
});
const {
  GROUP_ALLOWED_FIELDS, GROUP_DEFAULT_PAYLOAD, GROUP_MARGIN_MODE_OPTIONS, NETTING_NEEDS_B_BOOK_HINT,
  buildGroupSavePayload, buildNewGroupFormData, buildNewGroupPayload, groupMarginModeOf,
  submitGroup, validateGroupMarginMode,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

runtime.request = async (url, init) => {
  runtime.calls.push({ url, body: JSON.parse(init.body) });
  const { status, body } = runtime.response;
  return { ok: status < 400, status, text: async () => JSON.stringify(body) };
};
beforeEach(() => { runtime.calls = []; runtime.response = { status: 200, body: {} }; });
after(() => { delete globalThis.__groupMarginModeTest; });

test('marginMode is an allowed GroupCreate/GroupUpdate key; hedging is the default choice', () => {
  assert.ok(GROUP_ALLOWED_FIELDS.includes('marginMode'));
  assert.equal(GROUP_DEFAULT_PAYLOAD.marginMode, '');
  assert.deepEqual(GROUP_MARGIN_MODE_OPTIONS.map((option) => option.value), ['hedging', 'netting']);
});

test('create with Netting + B-book sends marginMode netting; a blank mode is omitted', () => {
  const netting = buildNewGroupPayload({ ...GROUP_DEFAULT_PAYLOAD, name: 'Fixture\\Net', routingMode: 'b_book', marginMode: 'netting', leverage: 100 });
  assert.equal(netting.marginMode, 'netting');
  assert.equal(netting.bookType, 'b');
  const plain = buildNewGroupPayload({ ...GROUP_DEFAULT_PAYLOAD, name: 'Fixture\\Plain', leverage: 100 });
  assert.equal(Object.hasOwn(plain, 'marginMode'), false);
});

test('netting with an explicit A-book or Hybrid routing is blocked before submit', () => {
  assert.equal(validateGroupMarginMode({ marginMode: 'netting', routingMode: 'a_book' }), NETTING_NEEDS_B_BOOK_HINT);
  assert.equal(validateGroupMarginMode({ marginMode: 'netting', routingMode: 'hybrid' }), NETTING_NEEDS_B_BOOK_HINT);
  assert.equal(validateGroupMarginMode({ marginMode: 'Netting', routingMode: 'A-Book' }), NETTING_NEEDS_B_BOOK_HINT);
  assert.equal(validateGroupMarginMode({ marginMode: 'netting', routingMode: 'b_book' }), null);
  // A blank routing is left to the server, which defaults to B-book.
  assert.equal(validateGroupMarginMode({ marginMode: 'netting', routingMode: '' }), null);
  assert.equal(validateGroupMarginMode({ marginMode: 'hedging', routingMode: 'a_book' }), null);
  assert.equal(validateGroupMarginMode({ marginMode: '', routingMode: 'hybrid' }), null);
});

test('group records: marginMode is read from every known key, unknown or missing means hedging (blank)', () => {
  assert.equal(groupMarginModeOf({ marginMode: 'netting' }), 'netting');
  assert.equal(groupMarginModeOf({ margin_mode: 'netting' }), 'netting');
  assert.equal(groupMarginModeOf({ MarginMode: 'Netting' }), 'netting');
  assert.equal(groupMarginModeOf({ marginMode: 'hedging' }), 'hedging');
  assert.equal(groupMarginModeOf({ marginMode: null }), '');
  assert.equal(groupMarginModeOf({ marginMode: 'other' }), '');
  assert.equal(groupMarginModeOf({}), '');
  assert.equal(groupMarginModeOf(null), '');
});

test('edit preselects the current mode; changing it sends only marginMode, an untouched edit sends nothing', () => {
  const source = { name: 'Fixture\\Edit', routingMode: 'b_book', leverage: 100, margin_mode: 'hedging' };
  const initial = buildNewGroupFormData({ initialData: source });
  assert.equal(initial.marginMode, 'hedging');
  assert.deepEqual(buildGroupSavePayload(initial, { ...initial }), {});
  assert.deepEqual(buildGroupSavePayload(initial, { ...initial, marginMode: 'netting' }), { marginMode: 'netting' });
  const nettingSource = buildNewGroupFormData({ initialData: { ...source, margin_mode: undefined, marginMode: 'netting' } });
  assert.equal(nettingSource.marginMode, 'netting');
  const fresh = buildNewGroupFormData({});
  assert.equal(fresh.marginMode, '');
});

test('submitGroup: GroupUpdate carries marginMode in the JSON body', async () => {
  await submitGroup({ originalName: 'Fixture\\Edit', payload: { marginMode: 'netting' } });
  assert.equal(runtime.calls.length, 1);
  assert.match(runtime.calls[0].url, /^\/GroupUpdate\?group=/);
  assert.deepEqual(runtime.calls[0].body, { marginMode: 'netting' });
});

const refusal = (body) => async () => {
  runtime.response = { status: 409, body };
  return submitGroup({ originalName: '', payload: { name: 'Fixture\\Net', marginMode: 'netting' } });
};

test('submitGroup: netting refusals show readable text (engine_code > error_code > code)', async () => {
  await assert.rejects(refusal({ message: 'engine said no', code: 'MT_RET_ERR_DATA', engine_code: 'ACCOUNT_MODE_UNSUPPORTED', stackTrace: null }),
    (err) => err.message === 'Netting is not enabled on this server yet.' && err.code === 'ACCOUNT_MODE_UNSUPPORTED');
  await assert.rejects(refusal({ error: 'Netting groups require routingMode b_book', message: 'x', code: 'NETTING_REQUIRES_B_BOOK', error_code: 'NETTING_REQUIRES_B_BOOK' }),
    (err) => err.message === 'Netting groups must use B-book routing.');
  await assert.rejects(refusal({ error: 'in use', code: 'GROUP_MARGIN_MODE_IN_USE', error_code: 'GROUP_MARGIN_MODE_IN_USE' }),
    (err) => err.message === 'Close all positions in this group before changing its account mode.');
  await assert.rejects(refusal({ error: 'mixed', error_code: 'GROUP_MARGIN_MODE_MIXED' }),
    (err) => err.message === 'This group (or its subgroups) has accounts in the other mode.');
  await assert.rejects(refusal({ error: 'grant', error_code: 'GROUP_MODE_WRITER_GRANT_MISSING' }),
    (err) => err.message === 'The server is not set up to change account modes yet (admin action needed).');
});

test('submitGroup: other refusals keep the server text unchanged', async () => {
  await assert.rejects(refusal({ error: 'Group already exists', code: 'MT_RET_ERR_DUPLICATE' }),
    (err) => err.message === 'Group already exists' && err.code === undefined);
  await assert.rejects(refusal({ message: 'marginMode must be hedging or netting', code: 'MT_RET_ERR_PARAMS' }),
    (err) => err.message === 'marginMode must be hedging or netting');
});

test('both group forms render the Account mode select (source shape)', () => {
  const props = readFileSync(new URL('./components/GroupPropertiesModal.jsx', import.meta.url), 'utf8');
  assert.match(props, /Account mode/);
  assert.match(props, /update\('marginMode', event\.target\.value\)/);
  assert.match(props, /validateGroupMarginMode\(/);
  const wizard = readFileSync(new URL('./components/NewGroupModal.jsx', import.meta.url), 'utf8');
  assert.match(wizard, /label="Account mode"/);
  assert.match(wizard, /handleChange\('marginMode', v\)/);
  assert.match(wizard, /validateGroupMarginMode\(/);
});
