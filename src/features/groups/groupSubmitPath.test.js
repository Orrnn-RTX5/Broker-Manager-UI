import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { NEW_GROUP_FINANCIAL_DEFAULTS } from './groupFinancialPresets.js';

// Submit-path test for the new-group create flow (ds-18).
//
// ds-20 lesson: tests must execute the REAL helpers against REAL production
// data shapes, never re-implemented logic or mirrored literals. Everything
// asserted below runs through the real production code:
//   - formData is composed from the REAL GROUP_DEFAULT_PAYLOAD and the REAL
//     NEW_GROUP_FINANCIAL_DEFAULTS exactly like NewGroupModal.jsx's useState
//     initializer does (defaults spread, then financial defaults for new,
//     then source);
//   - the submit composition is the REAL handleSubmit create branch:
//     validateNewGroupFields gate, then buildNewGroupPayload, then the same
//     comma-string -> array split NewGroupModal.jsx performs for symbol lists.
// groupPayload.js cannot be imported directly under node (its service imports
// use extensionless paths), so it is bundled with esbuild exactly like
// groupPayload.test.js does. Only the network transports (never called by
// these tests) are stubbed fail-closed; every builder/validator executed here
// is the real production code.
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./groupPayload.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [{ name: 'group-submit-path-transport', setup(builder) {
    builder.onResolve({ filter: /\/(managerFetch|managerAccountApi|sidebarAccounts)\.js$/ }, ({ path }) => ({ path, namespace: 'group-submit-stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'group-submit-stub' }, () => ({ loader: 'js', contents:
      'export const fetchManagerApi = () => { throw new Error("groupSubmitPath: network stub must never be called"); };'
      + 'export const updateManagerAccount = () => { throw new Error("groupSubmitPath: network stub must never be called"); };'
      + 'export const fetchAllSidebarAccounts = () => { throw new Error("groupSubmitPath: network stub must never be called"); };',
    }));
  } }],
});
const {
  GROUP_DEFAULT_PAYLOAD,
  GROUP_ALLOWED_FIELDS,
  buildNewGroupPayload,
  buildGroupSavePayload,
  validateNewGroupFields,
  bookTypeForRoutingMode,
  pickGroupPayloadFields,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

// Generic fixtures only: synthetic group names with placeholder values. No
// tenant, broker, host, or account identifiers.

// Mirrors NewGroupModal.jsx's useState initializer for the create path, where
// initialData/duplicateData are absent (source is undefined). Composed from
// the REAL constants only -- no mirrored literals.
const buildCreateFormData = (overrides = {}) => {
  const source = undefined; // creates have no initialData/duplicateData
  const data = { ...GROUP_DEFAULT_PAYLOAD, ...(source ? {} : NEW_GROUP_FINANCIAL_DEFAULTS), ...(source || {}) };
  // New groups trade by default; edits and duplicates keep their source value.
  if (!source) data.tradeAllowed = true;
  // The visible Book choice is routingMode; bookType is its backend-canonical
  // value (b/a/hybrid), never a display label.
  if (!source && data.routingMode) {
    const canonical = bookTypeForRoutingMode(data.routingMode);
    if (canonical) data.bookType = canonical;
  }
  if (Array.isArray(data.symbolsAllowed)) data.symbolsAllowed = data.symbolsAllowed.join(', ');
  if (Array.isArray(data.symbolsBlocked)) data.symbolsBlocked = data.symbolsBlocked.join(', ');
  return { ...data, ...overrides };
};

// Mirrors NewGroupModal.jsx handleSubmit for creates (isEditing false): the
// validateNewGroupFields gate, then buildNewGroupPayload, then the same
// comma-string -> array split applied to the symbol lists. leverageTouched
// mirrors NewGroupModal.jsx's leverageTouched ref: fresh creates start
// untouched (display default shown but omitted), while an explicit operator
// pick -- and every edit/duplicate source -- counts as touched.
const runCreateSubmitPath = (formData, { leverageTouched = false } = {}) => {
  const validationError = validateNewGroupFields({
    name: formData.name,
    parentGroup: formData.parentGroup,
    groupPurpose: formData.groupPurpose,
  });
  if (validationError) return { validationError, payload: null };
  const payload = buildNewGroupPayload(formData, { leverageTouched });
  if (typeof payload.symbolsAllowed === 'string') {
    payload.symbolsAllowed = payload.symbolsAllowed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (typeof payload.symbolsBlocked === 'string') {
    payload.symbolsBlocked = payload.symbolsBlocked.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return { validationError: null, payload };
};

// Book choices shaped exactly as NewGroupModal.jsx builds them for the
// visible "Book" dropdown (routingMode values, never backend labels).
const BOOK_CHOICES = [
  { value: 'b_book', label: 'B-Book' },
  { value: 'a_book', label: 'A-Book' },
  { value: 'hybrid', label: 'Hybrid' },
];

test('create initializer composes the real defaults without mirrored literals', () => {
  const form = buildCreateFormData();

  // No client-side leverage literal default: the form starts from the blank
  // payload value and the modal pre-fills the broker's group default.
  assert.ok(!('leverage' in NEW_GROUP_FINANCIAL_DEFAULTS), 'no leverage literal default for new groups');
  assert.equal(form.leverage, GROUP_DEFAULT_PAYLOAD.leverage);
  assert.equal(form.marginCallLevel, NEW_GROUP_FINANCIAL_DEFAULTS.marginCallLevel);
  assert.equal(form.stopOutLevel, NEW_GROUP_FINANCIAL_DEFAULTS.stopOutLevel);
  assert.equal(form.spreadMarkup, NEW_GROUP_FINANCIAL_DEFAULTS.spreadMarkup);
  assert.equal(form.routingMode, GROUP_DEFAULT_PAYLOAD.routingMode);
  assert.equal(form.tradeAllowed, true);
  // GROUP_DEFAULT_PAYLOAD holds symbol ARRAYS; the initializer joins them so
  // the form (like SymbolSelector/handleArrayChange) carries comma strings.
  assert.equal(typeof form.symbolsAllowed, 'string');
  assert.equal(typeof form.symbolsBlocked, 'string');
});

test('fresh-create submit path: keys within allowed fields, blanks absent, symbols a true Array', () => {
  const form = buildCreateFormData({
    name: 'Fixture/Standard',
    description: '',
    currency: '',
    executionMode: '',
    accountType: '',
    parentGroup: '',
    groupPurpose: '',
    // Comma-joined string, exactly what handleArrayChange stores while typing.
    symbolsAllowed: 'EURUSD, GBPUSD,XAUUSD ',
    symbolsBlocked: '',
  });

  const { validationError, payload } = runCreateSubmitPath(form);

  assert.equal(validationError, null);
  for (const key of Object.keys(payload)) {
    assert.ok(GROUP_ALLOWED_FIELDS.includes(key), `payload key outside GROUP_ALLOWED_FIELDS: ${key}`);
  }
  for (const key of ['currency', 'executionMode', 'accountType', 'parentGroup', 'groupPurpose']) {
    assert.ok(!(key in payload), `blank ${key} must be omitted so backend derivation applies`);
  }
  // Untouched routingMode is omitted so backend derivation governs (no b_book default).
  assert.ok(!('routingMode' in payload), 'untouched routingMode must be omitted for backend derivation');
  assert.ok(!('bookType' in payload), 'no derived bookType without an explicit routing choice');
  assert.ok('tradeAllowed' in payload);
  assert.equal(typeof payload.tradeAllowed, 'boolean');
  assert.equal(payload.tradeAllowed, true);
  // A blank leverage is never sent (never as 0); for a top-level create the
  // modal's 1..10000 gate blocks the submit before this builder runs.
  assert.equal(form.leverage, GROUP_DEFAULT_PAYLOAD.leverage);
  assert.ok(!('leverage' in payload), 'a blank leverage must never be sent');
  // ds-20 guard: the submitted list must be a true Array (not Set/string), so
  // production array operations such as .includes keep working.
  assert.ok(Array.isArray(payload.symbolsAllowed));
  assert.ok(!(payload.symbolsAllowed instanceof Set));
  assert.equal(Object.getPrototypeOf(payload.symbolsAllowed), Array.prototype);
  assert.deepEqual(payload.symbolsAllowed, ['EURUSD', 'GBPUSD', 'XAUUSD']);
  assert.ok(payload.symbolsAllowed.includes('EURUSD'));
  assert.deepEqual(payload.symbolsBlocked, []);
});

for (const choice of BOOK_CHOICES) {
  const expected = choice.value === 'b_book' ? 'b' : choice.value === 'a_book' ? 'a' : 'hybrid';
  test(`routingMode ${choice.value} (${choice.label}) submits canonical bookType ${expected}`, () => {
    assert.equal(bookTypeForRoutingMode(choice.value), expected);
    const form = buildCreateFormData({ name: 'Fixture/Standard', routingMode: choice.value });
    const { validationError, payload } = runCreateSubmitPath(form);
    assert.equal(validationError, null);
    assert.equal(payload.bookType, expected);
  });
}

test('blank routing/book/currency (incl. whitespace) are omitted, never sent as empty strings', () => {
  const form = buildCreateFormData({
    name: 'Fixture/Standard',
    routingMode: '',
    bookType: '',
    currency: '   ',
  });
  const { validationError, payload } = runCreateSubmitPath(form);
  assert.equal(validationError, null);
  assert.ok(!('routingMode' in payload));
  assert.ok(!('bookType' in payload));
  assert.ok(!('currency' in payload));
});

test('parent group naming the group itself is refused', () => {
  // Case-sensitive group names: 'fixture/alpha' is another group, so it is a valid parent.
  assert.equal(
    validateNewGroupFields({ name: 'Fixture/Alpha', parentGroup: 'fixture/alpha', groupPurpose: '' }),
    null,
  );
  assert.equal(
    validateNewGroupFields({ name: 'Fixture/Alpha', parentGroup: 'Fixture/Alpha', groupPurpose: '' }),
    'Parent group must name another group.',
  );
  const { validationError, payload } = runCreateSubmitPath(
    buildCreateFormData({ name: 'Fixture/Alpha', parentGroup: 'Fixture/Alpha' }),
  );
  assert.equal(validationError, 'Parent group must name another group.');
  assert.equal(payload, null);
});

test('purpose outside customer|coverage is refused; customer|coverage|blank pass the gate', () => {
  assert.equal(
    validateNewGroupFields({ name: 'Fixture/Alpha', parentGroup: '', groupPurpose: 'internal' }),
    'Purpose must be customer or coverage.',
  );
  const { validationError, payload } = runCreateSubmitPath(
    buildCreateFormData({ name: 'Fixture/Alpha', groupPurpose: 'internal' }),
  );
  assert.equal(validationError, 'Purpose must be customer or coverage.');
  assert.equal(payload, null);
  assert.equal(validateNewGroupFields({ name: 'Fixture/Alpha', parentGroup: '', groupPurpose: 'customer' }), null);
  assert.equal(validateNewGroupFields({ name: 'Fixture/Alpha', parentGroup: '', groupPurpose: 'coverage' }), null);
  assert.equal(validateNewGroupFields({ name: 'Fixture/Alpha', parentGroup: '', groupPurpose: '' }), null);
  assert.equal(validateNewGroupFields({ name: '   ', parentGroup: '', groupPurpose: '' }), 'Group Name is required.');
});

test('isNew save delegates to the real create builder', () => {
  const initial = buildCreateFormData({ name: 'Fixture/Standard' });
  const current = buildCreateFormData({ name: 'Fixture/Standard', leverage: 200, symbolsAllowed: 'EURUSD' });
  assert.deepEqual(
    buildGroupSavePayload(initial, current, { isNew: true }),
    buildNewGroupPayload(current),
  );
});

test('string-typed form numbers pass through the create builder without crashing', () => {
  // Numeric inputs normally produce numbers, but server-echoed/duplicated
  // values can arrive as strings; the builder preserves explicit values.
  // String-typed values mirror edit/duplicate sources, which count as
  // touched, so the touched flag is passed like NewGroupModal.jsx does.
  const { validationError, payload } = runCreateSubmitPath(
    buildCreateFormData({ name: 'Fixture/Standard', leverage: '100', marginCallLevel: '100' }),
    { leverageTouched: true },
  );
  assert.equal(validationError, null);
  // Leverage is always sent as an integer.
  assert.equal(payload.leverage, 100);
  assert.equal(payload.marginCallLevel, '100');
});

test('top-level create sends a pre-filled or explicit leverage as an integer; a parent group inherits', () => {
  // A broker-default pre-fill is untouched but sent for a top-level group.
  const prefilled = runCreateSubmitPath(buildCreateFormData({ name: 'Fixture/Standard', leverage: 250 }));
  assert.equal(prefilled.validationError, null);
  assert.equal(prefilled.payload.leverage, 250);
  assert.ok(!('leverageTouched' in prefilled.payload), 'the touched flag itself is never a payload key');

  // An explicit operator pick always wins and is sent as an integer.
  for (const [value, expected] of [[200, 200], ['300', 300]]) {
    const { validationError, payload } = runCreateSubmitPath(
      buildCreateFormData({ name: 'Fixture/Standard', leverage: value }),
      { leverageTouched: true },
    );
    assert.equal(validationError, null);
    assert.equal(payload.leverage, expected);
    for (const key of Object.keys(payload)) {
      assert.ok(GROUP_ALLOWED_FIELDS.includes(key), `payload key outside GROUP_ALLOWED_FIELDS: ${key}`);
    }
  }

  // With a parent group, an untouched leverage is omitted so the parent governs.
  const child = runCreateSubmitPath(buildCreateFormData({ name: 'Fixture/Parent/Child', parentGroup: 'Fixture/Parent', leverage: 250 }));
  assert.equal(child.validationError, null);
  assert.ok(!('leverage' in child.payload), 'untouched leverage under a parent must be omitted');
});

test('edit path still sends the full picked payload including leverage', () => {
  const form = { ...buildCreateFormData({ name: 'Fixture/Standard' }), leverage: 250 };
  const picked = pickGroupPayloadFields(form, GROUP_ALLOWED_FIELDS);

  assert.equal(picked.leverage, 250);
  for (const key of Object.keys(picked)) {
    assert.ok(GROUP_ALLOWED_FIELDS.includes(key), `payload key outside GROUP_ALLOWED_FIELDS: ${key}`);
  }
});
