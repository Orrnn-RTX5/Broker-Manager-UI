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
const { GROUP_DEFAULT_PAYLOAD, GROUP_ALLOWED_FIELDS, ROUTING_TO_BOOK_TYPE, EXECUTION_MODE_OPTIONS, GROUP_PURPOSE_OPTIONS, bookTypeForRoutingMode, isCanonicalBookType, buildNewGroupPayload, validateNewGroupFields, buildGroupSavePayload, parentTradeAllowedOf, resolveNewGroupTradeAllowed, pickGroupPayloadFields, submitGroup } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
import { buildGroupSymbolsSavePayload, isCanonicalGroupSymbolsSavePayload, NEW_GROUP_SYMBOL_TERMS_GAP } from './groupSymbolTerms.js';

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

test('new groups omit blank policy strings so backend derivation applies, preserving explicit values', async () => {
  const initial = existingGroup();
  const form = {
    ...initial,
    description: '',
    currency: '   ',
    executionMode: '',
    accountType: '',
    commissionType: '  ',
    parentGroup: '   ',
    groupPurpose: '',
    commissionRate: 7,
    revision: 'not-a-group-field',
  };

  const payload = buildGroupSavePayload(initial, form, { isNew: true });

  assert.equal(payload.name, 'Nexa/standard');
  assert.equal(payload.routingMode, 'b_book');
  assert.equal(payload.bookType, 'b');
  assert.equal(payload.commissionRate, 7);
  assert.equal(payload.tradeAllowed, true);
  assert.deepEqual(payload.symbolsAllowed, ['EURUSD', 'GBPUSD']);
  assert.ok(!('currency' in payload), 'blank currency is omitted for backend derivation');
  assert.ok(!('executionMode' in payload), 'blank executionMode is omitted for backend derivation');
  assert.ok(!('accountType' in payload), 'blank accountType is omitted');
  assert.ok(!('commissionType' in payload), 'blank commissionType is omitted');
  assert.ok(!('description' in payload), 'blank description is omitted');
  assert.ok(!('parentGroup' in payload), 'blank parentGroup is omitted');
  assert.ok(!('groupPurpose' in payload), 'blank groupPurpose is omitted');
  assert.ok(!('revision' in payload), 'unknown fields are excluded');

  // Explicit operator values always survive.
  const explicit = buildNewGroupPayload({
    ...GROUP_DEFAULT_PAYLOAD,
    name: 'Main/alpha',
    currency: 'EUR',
    executionMode: 'instant',
    routingMode: 'a_book',
    accountType: 'standard',
    commissionType: 'per_lot',
    tradeAllowed: false,
    leverage: 100,
    marginCallLevel: 100,
    stopOutLevel: 50,
  });
  assert.equal(explicit.currency, 'EUR');
  assert.equal(explicit.executionMode, 'instant');
  assert.equal(explicit.bookType, 'a');
  assert.equal(explicit.tradeAllowed, false);

  await submitGroup({ originalName: '', payload });
  assert.deepEqual(runtime.calls, [{ url: '/GroupCreate', payload }]);
  assert.deepEqual(buildGroupSavePayload(payload, payload), {});
  assert.deepEqual(buildGroupSavePayload(initial, { ...initial }), {});
});

test('visible Book choice maps to backend-canonical bookType values, never display labels', () => {
  assert.deepEqual(ROUTING_TO_BOOK_TYPE, { a_book: 'a', b_book: 'b', hybrid: 'hybrid' });
  assert.equal(bookTypeForRoutingMode('b_book'), 'b');
  assert.equal(bookTypeForRoutingMode('a_book'), 'a');
  assert.equal(bookTypeForRoutingMode('hybrid'), 'hybrid');
  assert.equal(bookTypeForRoutingMode('B-Book'), 'b');
  assert.equal(bookTypeForRoutingMode('A-Book'), 'a');
  assert.equal(bookTypeForRoutingMode('Hybrid'), 'hybrid');
  assert.equal(bookTypeForRoutingMode(''), '');
  assert.equal(isCanonicalBookType('a'), true);
  assert.equal(isCanonicalBookType('b'), true);
  assert.equal(isCanonicalBookType('hybrid'), true);
  assert.equal(isCanonicalBookType('B-Book'), false);
  assert.equal(isCanonicalBookType('A-Book'), false);
  assert.equal(isCanonicalBookType(''), false);

  const hybrid = buildNewGroupPayload({ ...GROUP_DEFAULT_PAYLOAD, name: 'Main/hybrid', routingMode: 'hybrid' });
  assert.equal(hybrid.bookType, 'hybrid');
  const aBook = buildNewGroupPayload({ ...GROUP_DEFAULT_PAYLOAD, name: 'Main/a', routingMode: 'a_book', bookType: 'A-Book' });
  assert.equal(aBook.bookType, 'a');
});

test('new groups default to tradeAllowed true while an explicit false is preserved', () => {
  assert.equal(GROUP_DEFAULT_PAYLOAD.tradeAllowed, true);
  const fresh = buildNewGroupPayload({ ...GROUP_DEFAULT_PAYLOAD, name: 'Main/fresh' });
  assert.equal(fresh.tradeAllowed, true);
  const optedOut = buildNewGroupPayload({ ...GROUP_DEFAULT_PAYLOAD, name: 'Main/optout', tradeAllowed: false });
  assert.equal(optedOut.tradeAllowed, false);
  const fromUndefined = buildNewGroupPayload({ name: 'Main/undef', routingMode: 'b_book' });
  assert.equal(fromUndefined.tradeAllowed, true);
});

test('untouched tradeAllowed inherits the exact parent match; an explicit touch always wins', () => {
  const groups = [
    { ...GROUP_DEFAULT_PAYLOAD, name: 'Main/parent', tradeAllowed: false },
    { ...GROUP_DEFAULT_PAYLOAD, name: 'Main/other', tradeAllowed: true },
  ];

  // Parent-match inheritance: exact, case-insensitive, trimmed.
  assert.equal(parentTradeAllowedOf(groups, 'Main/parent'), false);
  assert.equal(parentTradeAllowedOf(groups, 'main/PARENT'), false);
  assert.equal(parentTradeAllowedOf(groups, '  Main/parent  '), false);
  assert.equal(parentTradeAllowedOf(groups, 'Main/other'), true);
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: 'Main/parent', tradeTouched: false, currentValue: true }),
    false,
  );
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: 'MAIN/PARENT', tradeTouched: false, currentValue: true }),
    false,
  );
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: 'Main/other', tradeTouched: false, currentValue: true }),
    true,
  );

  // Explicit operator check/uncheck always wins afterwards.
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: 'Main/parent', tradeTouched: true, currentValue: true }),
    true,
  );
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: 'Main/other', tradeTouched: true, currentValue: false }),
    false,
  );

  // No parent falls back to the sensible global default true.
  assert.equal(parentTradeAllowedOf(groups, ''), null);
  assert.equal(parentTradeAllowedOf(groups, '   '), null);
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: '', tradeTouched: false, currentValue: true }),
    true,
  );
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: '  ', tradeTouched: false, currentValue: true }),
    true,
  );

  // No exact match falls back to true.
  assert.equal(parentTradeAllowedOf([], 'Main/parent'), null);
  assert.equal(
    resolveNewGroupTradeAllowed({ groups: [], parentGroup: 'Main/parent', tradeTouched: false, currentValue: true }),
    true,
  );
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: 'Main/missing', tradeTouched: false, currentValue: true }),
    true,
  );

  // Exact-match-only: near-miss names must not inherit.
  assert.equal(parentTradeAllowedOf(groups, 'Main/paren'), null);
  assert.equal(parentTradeAllowedOf(groups, 'Main/parent/child'), null);
  assert.equal(parentTradeAllowedOf(groups, 'XMain/parent'), null);
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: 'Main/paren', tradeTouched: false, currentValue: true }),
    true,
  );
  assert.equal(
    resolveNewGroupTradeAllowed({ groups, parentGroup: 'Main/parent/child', tradeTouched: false, currentValue: true }),
    true,
  );

  // The inherited value flows into the creation payload without new keys.
  const inherited = resolveNewGroupTradeAllowed({
    groups,
    parentGroup: 'Main/parent',
    tradeTouched: false,
    currentValue: GROUP_DEFAULT_PAYLOAD.tradeAllowed,
  });
  const payload = buildNewGroupPayload({
    ...GROUP_DEFAULT_PAYLOAD,
    name: 'Main/child',
    parentGroup: 'Main/parent',
    tradeAllowed: inherited,
  });
  assert.equal(payload.tradeAllowed, false);
  assert.ok(
    Object.keys(payload).every((key) => GROUP_ALLOWED_FIELDS.includes(key)),
    'payload keys must stay within GROUP_ALLOWED_FIELDS',
  );
});

test('parentGroup and groupPurpose use exactly those keys, validated without tenant defaults', () => {
  assert.ok(GROUP_ALLOWED_FIELDS.includes('parentGroup'), 'parentGroup is in the creation payload contract');
  assert.ok(GROUP_ALLOWED_FIELDS.includes('groupPurpose'), 'groupPurpose is in the creation payload contract');

  assert.equal(validateNewGroupFields({ name: '', parentGroup: '', groupPurpose: '' }), 'Group Name is required.');
  assert.equal(validateNewGroupFields({ name: 'Main/a', parentGroup: '', groupPurpose: 'other' }), 'Purpose must be customer or coverage.');
  assert.equal(validateNewGroupFields({ name: 'Main/a', parentGroup: 'Main/a', groupPurpose: '' }), 'Parent group must name another group.');
  assert.equal(validateNewGroupFields({ name: 'Main/a', parentGroup: '  ', groupPurpose: '' }), null);
  assert.equal(validateNewGroupFields({ name: 'Main/a', parentGroup: 'Base/parent', groupPurpose: 'customer' }), null);
  assert.equal(validateNewGroupFields({ name: 'Main/a', parentGroup: 'Base/parent', groupPurpose: 'coverage' }), null);

  const withParent = buildNewGroupPayload({
    ...GROUP_DEFAULT_PAYLOAD, name: 'Main/child', parentGroup: '  Base/parent  ', groupPurpose: 'coverage',
  });
  assert.equal(withParent.parentGroup, 'Base/parent');
  assert.equal(withParent.groupPurpose, 'coverage');

  const withoutParent = buildNewGroupPayload({ ...GROUP_DEFAULT_PAYLOAD, name: 'Main/root', parentGroup: '', groupPurpose: '' });
  assert.ok(!('parentGroup' in withoutParent));
  assert.ok(!('groupPurpose' in withoutParent));
});

test('new-group create never carries per-symbol financial terms; the canonical collection API is the only path', () => {
  const payload = buildNewGroupPayload({ ...existingGroup(), symbolSettings: [{ symbol: 'EURUSD' }] });
  assert.ok(!('symbolSettings' in payload), 'symbolSettings must not be smuggled through GroupCreate');
  assert.deepEqual(payload.symbolsAllowed, ['EURUSD', 'GBPUSD']);

  assert.ok(String(NEW_GROUP_SYMBOL_TERMS_GAP).includes('GroupSymbolsSave'));
  const save = buildGroupSymbolsSavePayload('Main/alpha', [
    { symbol: 'eurusd', spread_markup: 10, commission: 1.5, swap_multiplier: 1.25, trade_allowed: true },
  ]);
  assert.deepEqual(save, { group: 'Main/alpha', symbols: [{ symbol: 'EURUSD', spread_markup: 10, commission: 1.5, swap_multiplier: 1.25, trade_allowed: true }] });
  assert.equal(isCanonicalGroupSymbolsSavePayload(save), true);
  assert.equal(isCanonicalGroupSymbolsSavePayload({ group: 'Main/alpha', symbols: [{ symbol: 'EURUSD', invented_term: 1 }] }), false);
  assert.throws(() => buildGroupSymbolsSavePayload('', [{ symbol: 'EURUSD' }]), /Group name is required/);
  assert.throws(() => buildGroupSymbolsSavePayload('Main/alpha', [{ symbol: 'bad symbol!' }]), /Invalid symbol/);
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

test('untouched display-default leverage is omitted on create so backend derivation governs', () => {
  const payload = buildNewGroupPayload(
    { ...GROUP_DEFAULT_PAYLOAD, name: 'Nexa/standard', leverage: 100 },
    { leverageTouched: false },
  );

  assert.ok(!('leverage' in payload), 'untouched leverage 100 must be omitted for backend derivation');
  assert.ok(!('leverageTouched' in payload), 'the touched flag itself is never a payload key');
  assert.ok(
    Object.keys(payload).every((key) => GROUP_ALLOWED_FIELDS.includes(key)),
    'payload keys must stay within GROUP_ALLOWED_FIELDS',
  );
});

test('explicit leverage values (including a re-typed 100) are always sent on create', () => {
  const explicit100 = buildNewGroupPayload(
    { ...GROUP_DEFAULT_PAYLOAD, name: 'Nexa/standard', leverage: 100 },
    { leverageTouched: true },
  );
  const explicit200 = buildNewGroupPayload(
    { ...GROUP_DEFAULT_PAYLOAD, name: 'Nexa/standard', leverage: 200 },
    { leverageTouched: true },
  );
  // Callers that predate the touched flag keep the previous behavior: the
  // value is preserved.
  const defaultTouched = buildNewGroupPayload({ ...GROUP_DEFAULT_PAYLOAD, name: 'Nexa/standard', leverage: 100 });

  assert.equal(explicit100.leverage, 100);
  assert.equal(explicit200.leverage, 200);
  assert.equal(defaultTouched.leverage, 100);
  for (const payload of [explicit100, explicit200, defaultTouched]) {
    assert.ok(
      Object.keys(payload).every((key) => GROUP_ALLOWED_FIELDS.includes(key)),
      'payload keys must stay within GROUP_ALLOWED_FIELDS',
    );
  }

  // The isNew save path forwards the touched flag to the create builder.
  assert.ok(!('leverage' in buildGroupSavePayload(
    existingGroup(),
    { ...existingGroup(), leverage: 100 },
    { isNew: true, leverageTouched: false },
  )));
  assert.equal(buildGroupSavePayload(
    existingGroup(),
    { ...existingGroup(), leverage: 100 },
    { isNew: true, leverageTouched: true },
  ).leverage, 100);
});

test('edit path still sends the full picked payload including leverage', () => {
  const form = { ...existingGroup(), leverage: 100 };
  const picked = pickGroupPayloadFields(form, GROUP_ALLOWED_FIELDS);

  assert.equal(picked.leverage, 100);
  assert.ok(
    Object.keys(picked).every((key) => GROUP_ALLOWED_FIELDS.includes(key)),
    'payload keys must stay within GROUP_ALLOWED_FIELDS',
  );
});
