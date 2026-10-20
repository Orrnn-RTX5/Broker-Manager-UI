// Run with: node --test src/features/groups/newGroupForm.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { NEW_GROUP_FINANCIAL_DEFAULTS } from './groupFinancialPresets.js';
import { readLeverageRatio } from './groupAccountRows.js';

// Display/wire honesty for the fresh-create leverage field (ds-7 review
// item 1): the form must start blank instead of showing a 100 it would not
// send when untouched.
//
// ds-20 lesson: tests execute the REAL helpers against REAL production shapes,
// never re-implemented logic or mirrored literals. buildNewGroupFormData is
// the exact initializer NewGroupModal.jsx uses for its useState, and the
// submit composition below is the REAL handleSubmit create branch
// (buildNewGroupPayload plus the same comma-string -> array split).
// newGroupForm.js reaches groupPayload.js, which cannot be imported directly
// under node (its service imports use extensionless paths), so both modules
// are bundled with esbuild exactly like groupPayload.test.js does. Only the
// network transports (never called by these tests) are stubbed fail-closed;
// every builder executed here is the real production code.
const stubPlugin = (name) => ({ name, setup(builder) {
  builder.onResolve({ filter: /\/(managerFetch|managerAccountApi|sidebarAccounts)\.js$/ }, ({ path }) => ({ path, namespace: name }));
  builder.onLoad({ filter: /.*/, namespace: name }, () => ({ loader: 'js', contents:
    'export const fetchManagerApi = () => { throw new Error("newGroupForm: network stub must never be called"); };'
    + 'export const updateManagerAccount = () => { throw new Error("newGroupForm: network stub must never be called"); };'
    + 'export const fetchAllSidebarAccounts = () => { throw new Error("newGroupForm: network stub must never be called"); };',
  }));
} });

const formBundle = await build({
  entryPoints: [fileURLToPath(new URL('./newGroupForm.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [stubPlugin('new-group-form-stub')],
});
const { buildNewGroupFormData } = await import(`data:text/javascript;base64,${Buffer.from(formBundle.outputFiles[0].text).toString('base64')}`);

const payloadBundle = await build({
  entryPoints: [fileURLToPath(new URL('./groupPayload.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [stubPlugin('new-group-form-payload-stub')],
});
const { GROUP_DEFAULT_PAYLOAD, GROUP_ALLOWED_FIELDS, buildNewGroupPayload, bookTypeForRoutingMode } = await import(`data:text/javascript;base64,${Buffer.from(payloadBundle.outputFiles[0].text).toString('base64')}`);

// Generic fixtures only: synthetic group names with placeholder values. No
// tenant, broker, host, or account identifiers.

// Mirrors NewGroupModal.jsx handleSubmit for creates (isEditing false): the
// REAL buildNewGroupPayload, then the same comma-string -> array split the
// component performs for symbol lists. leverageTouched mirrors the
// component's leverageTouched ref: fresh creates start untouched, while an
// explicit operator pick -- and every edit/duplicate source -- counts as
// touched.
const runCreateSubmit = (formData, { leverageTouched = false } = {}) => {
  const payload = buildNewGroupPayload(formData, { leverageTouched });
  if (typeof payload.symbolsAllowed === 'string') {
    payload.symbolsAllowed = payload.symbolsAllowed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (typeof payload.symbolsBlocked === 'string') {
    payload.symbolsBlocked = payload.symbolsBlocked.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return payload;
};

test('fresh form starts with a blank leverage but keeps every other financial default', () => {
  const form = buildNewGroupFormData({});

  // Honest blank: the modal pre-fills the broker's group default (or the
  // operator enters one); there is no client-side leverage literal default.
  assert.equal(form.leverage, '');
  assert.ok(!('leverage' in NEW_GROUP_FINANCIAL_DEFAULTS), 'no leverage literal default for new groups');

  // All other financial defaults are preserved exactly.
  assert.equal(form.marginCallLevel, NEW_GROUP_FINANCIAL_DEFAULTS.marginCallLevel);
  assert.equal(form.stopOutLevel, NEW_GROUP_FINANCIAL_DEFAULTS.stopOutLevel);
  assert.equal(form.spreadMarkup, NEW_GROUP_FINANCIAL_DEFAULTS.spreadMarkup);

  // New groups trade by default.
  assert.equal(form.tradeAllowed, true);

  // The visible Book choice still derives the backend-canonical bookType.
  assert.equal(form.bookType, bookTypeForRoutingMode(form.routingMode));

  // GROUP_DEFAULT_PAYLOAD holds symbol ARRAYS; the initializer joins them so
  // the form carries comma strings.
  assert.equal(typeof form.symbolsAllowed, 'string');
  assert.equal(typeof form.symbolsBlocked, 'string');
});

test('presetName prefill still applies to fresh creates only', () => {
  assert.equal(buildNewGroupFormData({ presetName: 'Fixture/Folder\\' }).name, 'Fixture/Folder\\');

  const duplicate = { ...GROUP_DEFAULT_PAYLOAD, name: 'Fixture/Source', leverage: 200 };
  const dupForm = buildNewGroupFormData({ duplicateData: duplicate, presetName: 'Fixture/Folder\\' });
  assert.equal(dupForm.name, 'Fixture/Source Copy');
});

test('duplicate form renames with Copy and keeps the source leverage', () => {
  const duplicate = {
    ...GROUP_DEFAULT_PAYLOAD,
    name: 'Fixture/Source',
    leverage: 200,
    tradeAllowed: false,
    symbolsAllowed: ['EURUSD', 'GBPUSD'],
    symbolsBlocked: ['XAUUSD'],
  };
  const form = buildNewGroupFormData({ duplicateData: duplicate });

  assert.equal(form.name, 'Fixture/Source Copy');
  // Cross-checked with the REAL reader, not a mirrored literal.
  assert.equal(form.leverage, readLeverageRatio(duplicate));
  assert.equal(form.tradeAllowed, false);
  assert.equal(form.symbolsAllowed, ['EURUSD', 'GBPUSD'].join(', '));
  assert.equal(form.symbolsBlocked, ['XAUUSD'].join(', '));
});

test('duplicate without a source name falls back to the generic Copy label', () => {
  const form = buildNewGroupFormData({ duplicateData: { ...GROUP_DEFAULT_PAYLOAD, leverage: 50 } });
  assert.equal(form.name, 'New Group Copy');
  assert.equal(form.leverage, 50);
});

test('edit form keeps source leverage, including ratio-string form', () => {
  const numeric = { ...GROUP_DEFAULT_PAYLOAD, name: 'Fixture/Edited', leverage: 300, tradeAllowed: false };
  const numericForm = buildNewGroupFormData({ initialData: numeric });
  assert.equal(numericForm.name, 'Fixture/Edited');
  assert.equal(numericForm.leverage, readLeverageRatio(numeric));
  assert.equal(numericForm.tradeAllowed, false);

  const ratio = { ...GROUP_DEFAULT_PAYLOAD, name: 'Fixture/Ratio', leverage: '1:50' };
  const ratioForm = buildNewGroupFormData({ initialData: ratio });
  assert.equal(ratioForm.leverage, readLeverageRatio(ratio));
  assert.equal(ratioForm.leverage, 50);
});

test('source book choices normalize to canonical bookType, never display labels', () => {
  const form = buildNewGroupFormData({
    initialData: { ...GROUP_DEFAULT_PAYLOAD, name: 'Fixture/Book', leverage: 100, routingMode: 'a_book' },
  });
  assert.equal(form.bookType, bookTypeForRoutingMode('a_book'));
});

test('fresh top-level form: blank leverage never reaches the wire; a pre-filled or picked value is sent as an integer', () => {
  const fresh = buildNewGroupFormData({ presetName: 'Fixture/New' });
  assert.equal(fresh.leverage, '');

  // Blank is never sent (and never as 0); the modal's gate blocks the submit
  // before this builder runs for a top-level create.
  const blank = runCreateSubmit({ ...fresh, name: 'Fixture/New' });
  assert.ok(!('leverage' in blank), 'a blank leverage must never be sent');
  assert.ok(!('leverageTouched' in blank), 'the touched flag itself is never a payload key');
  assert.ok(
    Object.keys(blank).every((key) => GROUP_ALLOWED_FIELDS.includes(key)),
    'payload keys must stay within GROUP_ALLOWED_FIELDS',
  );

  // A broker-default pre-fill is untouched but still sent for a top-level group.
  const prefilled = runCreateSubmit({ ...fresh, name: 'Fixture/New', leverage: 250 });
  assert.equal(prefilled.leverage, 250);

  // An explicit operator pick is always sent, as an integer.
  for (const [value, expected] of [[200, 200], ['300', 300]]) {
    const payload = runCreateSubmit({ ...fresh, name: 'Fixture/New', leverage: value }, { leverageTouched: true });
    assert.equal(payload.leverage, expected);
  }
});

test('duplicate without a readable source leverage starts blank, never 0', () => {
  const form = buildNewGroupFormData({ duplicateData: { name: 'Fixture/Source' } });
  assert.equal(form.leverage, '');
  const payload = runCreateSubmit({ ...form }, { leverageTouched: true });
  assert.ok(!('leverage' in payload), 'leverage 0 must never be sent');
});

test('duplicate/edit sources count as touched downstream, so their leverage is sent', () => {
  const duplicate = { ...GROUP_DEFAULT_PAYLOAD, name: 'Fixture/Source', leverage: 200 };
  const dupForm = buildNewGroupFormData({ duplicateData: duplicate });
  const dupPayload = runCreateSubmit({ ...dupForm }, { leverageTouched: true });
  assert.equal(dupPayload.leverage, readLeverageRatio(duplicate));

  const edited = { ...GROUP_DEFAULT_PAYLOAD, name: 'Fixture/Edited', leverage: 500 };
  const editForm = buildNewGroupFormData({ initialData: edited });
  const editPayload = runCreateSubmit({ ...editForm }, { leverageTouched: true });
  assert.equal(editPayload.leverage, readLeverageRatio(edited));
});
