import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LiveTradingState } from '../../services/liveTradingState.js';

// SUI-M2: AccountDetails -> Trade -> SL/TP edits reset to 0 within ~250ms so
// Modify/Update never enabled. The selected-row sync effect depended on the
// selectedTicketRow OBJECT, but useLivePositions (overlayRows) rebuilds that
// object identity on every live tick, re-running the effect and wiping
// in-progress edits. The effect now depends on stable primitives
// (ticket / priceSl / priceTp / volume / digits) so only an actual change of
// ticket/values resets the edit fields.
//
// Everything asserted here runs against the REAL artifacts, never mirrored
// logic: the real AccountTradeTab.jsx source text and the real
// LiveTradingState.overlayRows tick path the selected row flows through. The
// component itself needs a DOM/React harness, so the live interaction check
// stays manual (see the DOM-verification note at the bottom). No network,
// no new dependencies, tenant-agnostic generic fixtures only.

const tabSource = readFileSync(fileURLToPath(new URL('./AccountTradeTab.jsx', import.meta.url)), 'utf8');

const SYNC_ANCHOR = '// Sync state when selected position row changes.';
const NEXT_SECTION = '// Available symbols list';

const readSyncEffectDeps = () => {
  const start = tabSource.indexOf(SYNC_ANCHOR);
  assert.ok(start !== -1, 'selected-row sync effect anchor comment must exist');
  const end = tabSource.indexOf(NEXT_SECTION, start);
  assert.ok(end > start, 'selected-row sync effect block must end before the symbols section');
  const match = tabSource.slice(start, end).match(/\}\s*,\s*\[([\s\S]*?)\]\);/);
  assert.ok(match, 'selected-row sync effect must declare an explicit dep array');
  return match[1].split(',').map((dep) => dep.trim()).filter(Boolean);
};

// Generic fixtures only: placeholder login/ticket, no tenant identifiers.
const frame = (data, type = 'position_update') => ({ type, data: [{ account_login: 1001, ticket: 42, ...data }] });
const snapshotRow = () => ({
  login: '1001',
  position: 42,
  state_version: '1',
  symbol: 'EURUSD',
  type: 'buy',
  volume: 0.5,
  priceSl: 1.1,
  priceTp: 1.2,
  profit: 0,
});
const ingestSnapshot = (state, extra = {}) => state.ingest(frame({
  update_kind: 'snapshot',
  state_version: '1',
  sl: 1.1,
  tp: 1.2,
  lots: 0.5,
  symbol: 'EURUSD',
  side: 'buy',
  ...extra,
}));

test('sync effect deps use stable row primitives, never the rebuilt row object', () => {
  const deps = readSyncEffectDeps();
  assert.ok(
    !deps.includes('selectedTicketRow'),
    `sync effect must not depend on the row object identity (rebuilt every tick): [${deps.join(', ')}]`
  );
  for (const dep of deps) {
    if (dep.includes('selectedTicketRow')) {
      assert.ok(dep.includes('?.'), `row dep must be a stable primitive read, got: ${dep}`);
    }
  }
  assert.ok(deps.some((dep) => dep.includes('priceSl')), 'sync effect must resync on priceSl changes');
  assert.ok(deps.some((dep) => dep.includes('priceTp')), 'sync effect must resync on priceTp changes');
  assert.ok(
    deps.some((dep) => dep.includes('position') && dep.includes('ticket')),
    'sync effect must resync on ticket identity (position/ticket)'
  );
  assert.ok(
    deps.some((dep) => dep.includes('volume') && dep.includes('lots')),
    'sync effect must resync on volume (volume/lots)'
  );
  assert.ok(deps.includes('digits'), 'sync effect must keep the digits dep for price formatting');
});

test('real tick overlays rebuild row identity while SL/TP/volume stay identical', () => {
  // The exact condition that wiped edits under the old object dep: same
  // values, new identity, on every tick.
  const state = new LiveTradingState();
  ingestSnapshot(state);
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 10, profit: 3 }));
  const first = state.overlayRows([snapshotRow()])[0];
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 11, profit: 4 }));
  const second = state.overlayRows([snapshotRow()])[0];
  assert.notEqual(first, second, 'each live tick must produce a rebuilt row object');
  assert.equal(second.profit, 4, 'live PnL still flows through the overlay');
  assert.equal(first.priceSl, second.priceSl, 'SL value is untouched by ticks');
  assert.equal(first.priceTp, second.priceTp, 'TP value is untouched by ticks');
  assert.equal(first.volume ?? first.lots, second.volume ?? second.lots, 'volume is untouched by ticks');
  assert.equal(
    String(first.position ?? first.ticket),
    String(second.position ?? second.ticket),
    'ticket identity is untouched by ticks'
  );
});

test('real overlay still propagates an actual SL change so edits resync', () => {
  // The counterpart: a genuine SL/TP change must reach the row so the new
  // primitive deps fire and the edit fields resync to the saved values.
  const state = new LiveTradingState();
  ingestSnapshot(state);
  const before = state.overlayRows([snapshotRow()])[0];
  assert.equal(before.priceSl, 1.1);
  state.ingest(frame({
    update_kind: 'snapshot',
    state_version: '2',
    sl: 1.105,
    tp: 1.2,
    lots: 0.5,
    price_time_msc: 20,
  }));
  const after = state.overlayRows([snapshotRow()])[0];
  assert.equal(after.priceSl, 1.105, 'modified SL must flow through the overlay');
  assert.equal(after.priceTp, 1.2, 'TP must be preserved alongside the SL change');
});

// Dep-level edge cases below evaluate the REAL dep expressions extracted from
// the fixed effect (never a reimplementation) against rows produced by the
// REAL LiveTradingState tick path. React re-runs the sync effect iff any dep
// slot changes by Object.is, so syncWouldResync encodes framework semantics,
// not component logic: identical ticks must keep every slot stable (edits
// survive), while a ticket/volume/SL/TP/digits move must re-run it.
const evalSyncDep = (dep, row, digits) =>
  new Function('selectedTicketRow', 'digits', 'return (' + dep + ');')(row, digits);
const syncDepValues = (deps, row, digits) => deps.map((dep) => evalSyncDep(dep, row, digits));
const syncWouldResync = (before, after) => {
  assert.equal(before.length, after.length, 'dep vectors must align slot-for-slot');
  return before.some((value, index) => !Object.is(value, after[index]));
};
const depIndex = (deps, ...fragments) => deps.findIndex((dep) => fragments.every((fragment) => dep.includes(fragment)));
const EURUSD_DIGITS = 5;

test('identical tick values keep every real sync dep stable so edits survive', () => {
  // Same SL/TP/volume/ticket with a fresh object identity per tick: the exact
  // condition that wiped in-progress edits under the old row-object dep.
  const deps = readSyncEffectDeps();
  const state = new LiveTradingState();
  ingestSnapshot(state);
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 10, profit: 3 }));
  const first = state.overlayRows([snapshotRow()])[0];
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 11, profit: 4 }));
  const second = state.overlayRows([snapshotRow()])[0];
  assert.notEqual(first, second, 'each live tick must produce a rebuilt row object');
  const before = syncDepValues(deps, first, EURUSD_DIGITS);
  const after = syncDepValues(deps, second, EURUSD_DIGITS);
  assert.deepEqual(after, before, 'identical SL/TP/volume/ticket must leave every sync dep untouched');
  assert.ok(!syncWouldResync(before, after), 'the sync effect must not re-run (and wipe edits) on identical ticks');
  assert.ok(
    syncWouldResync(before, syncDepValues(deps, second, 3)),
    'a digits change alone must still re-run the sync effect for price formatting'
  );
});

test('ticket switch moves the real ticket dep so edits reset for the new position', () => {
  const deps = readSyncEffectDeps();
  const ticketIndex = depIndex(deps, 'position', 'ticket');
  assert.notEqual(ticketIndex, -1, 'ticket dep (position/ticket) must exist');
  const state = new LiveTradingState();
  ingestSnapshot(state);
  state.ingest(frame({
    update_kind: 'snapshot',
    state_version: '1',
    ticket: 43,
    sl: 1.1,
    tp: 1.2,
    lots: 0.5,
    symbol: 'EURUSD',
    side: 'buy',
  }));
  const first = state.overlayRows([{ ...snapshotRow(), position: 42 }])[0];
  const second = state.overlayRows([{ ...snapshotRow(), position: 43 }])[0];
  assert.equal(String(first.position ?? first.ticket), '42');
  assert.equal(String(second.position ?? second.ticket), '43');
  const before = syncDepValues(deps, first, EURUSD_DIGITS);
  const after = syncDepValues(deps, second, EURUSD_DIGITS);
  assert.ok(!Object.is(before[ticketIndex], after[ticketIndex]), 'switching positions must move the ticket dep');
  assert.ok(syncWouldResync(before, after), 'switching positions must re-run the sync effect for the new ticket');
});

test('volume-only change moves the real volume dep so edits resync', () => {
  const deps = readSyncEffectDeps();
  const volumeIndex = depIndex(deps, 'volume', 'lots');
  assert.notEqual(volumeIndex, -1, 'volume dep (volume/lots) must exist');
  const state = new LiveTradingState();
  ingestSnapshot(state);
  const before = state.overlayRows([snapshotRow()])[0];
  state.ingest(frame({
    update_kind: 'snapshot',
    state_version: '2',
    sl: 1.1,
    tp: 1.2,
    lots: 0.75,
    price_time_msc: 20,
  }));
  const after = state.overlayRows([snapshotRow()])[0];
  assert.equal(after.volume ?? after.lots, 0.75, 'modified volume must flow through the real overlay');
  const beforeDeps = syncDepValues(deps, before, EURUSD_DIGITS);
  const afterDeps = syncDepValues(deps, after, EURUSD_DIGITS);
  assert.ok(!Object.is(beforeDeps[volumeIndex], afterDeps[volumeIndex]), 'a volume-only change must move the volume dep');
  assert.ok(syncWouldResync(beforeDeps, afterDeps), 'a genuine volume change must re-run the sync effect');
  beforeDeps.forEach((value, index) => {
    if (index === volumeIndex) return;
    assert.ok(Object.is(value, afterDeps[index]), 'only the volume dep may move on a volume-only change (slot ' + index + ': ' + deps[index] + ')');
  });
});

test('missing rows keep every real sync dep readable so the guard holds', () => {
  const deps = readSyncEffectDeps();
  const digitsIndex = deps.findIndex((dep) => dep.trim() === 'digits');
  assert.notEqual(digitsIndex, -1, 'digits dep must exist');
  for (const row of [undefined, null]) {
    const label = row === null ? 'null' : 'undefined';
    let values;
    assert.doesNotThrow(
      () => { values = syncDepValues(deps, row, EURUSD_DIGITS); },
      'sync dep reads must not throw for an ' + label + ' row'
    );
    values.forEach((value, index) => {
      if (index === digitsIndex) {
        assert.equal(value, EURUSD_DIGITS, 'digits dep never depends on the row');
      } else if (deps[index].includes('Number(')) {
        // HOLD-2 intentional change: Number()-normalized numeric deps read 0
        // (not undefined) for a missing row so HTTP-number vs WS-string forms
        // compare equal and never flap/resync. Symbol/comment stay undefined.
        assert.equal(value, 0, 'Number-normalized numeric dep must read 0 for an ' + label + ' row (' + deps[index] + ')');
      } else {
        assert.equal(value, undefined, 'row-derived dep must read undefined for an ' + label + ' row (' + deps[index] + ')');
      }
    });
  }
  const start = tabSource.indexOf(SYNC_ANCHOR);
  const end = tabSource.indexOf(NEXT_SECTION, start);
  const syncBlock = tabSource.slice(start, end);
  assert.ok(
    syncBlock.includes('if (selectedTicketRow)') || syncBlock.includes('if (!selectedTicketRow)'),
    'the sync effect must guard its body against a missing selected row (early-return on empty is the HOLD-1/3 fail-closed form)'
  );
  const fresh = new LiveTradingState();
  assert.deepEqual(fresh.overlayRows([]), [], 'the real overlay maps no rows to no rows');
  const orphan = { login: '1001', position: 99 };
  assert.deepEqual(
    fresh.overlayRows([orphan])[0],
    orphan,
    'the real overlay passes rows without live data through untouched'
  );
});

test('real overlay still propagates an actual TP change so edits resync', () => {
  // Symmetric counterpart to the SL case: a genuine TP change must reach the
  // row so the primitive deps fire and the edit fields resync.
  const deps = readSyncEffectDeps();
  const state = new LiveTradingState();
  ingestSnapshot(state);
  const before = state.overlayRows([snapshotRow()])[0];
  assert.equal(before.priceTp, 1.2);
  state.ingest(frame({
    update_kind: 'snapshot',
    state_version: '2',
    sl: 1.1,
    tp: 1.25,
    lots: 0.5,
    price_time_msc: 20,
  }));
  const after = state.overlayRows([snapshotRow()])[0];
  assert.equal(after.priceTp, 1.25, 'modified TP must flow through the real overlay');
  assert.equal(after.priceSl, 1.1, 'SL must be preserved alongside the TP change');
  assert.ok(
    syncWouldResync(syncDepValues(deps, before, EURUSD_DIGITS), syncDepValues(deps, after, EURUSD_DIGITS)),
    'a genuine TP change must re-run the sync effect'
  );
});

// DOM-verification step for live check (requires a browser harness, not
// runnable under plain node --test): open AccountDetails -> Trade with a live
// position selected, edit the SL field, and let live ticks arrive for >250ms.
// The typed SL value must persist and the Modify button must enable. Before
// this fix the field reset to the saved value on the next tick.

// ds-16 E-FLAG: the Trade tab invented an 'EURUSD' fallback (modalSymbol
// initializer `|| 'EURUSD'` plus a hardcoded preset symbol list), so an empty
// symbol could never stay empty and modify/close stayed enabled against a
// symbol the account never asked for. The fallback is removed: empty stays
// empty and gates modify/close fail-closed. Everything below asserts the REAL
// AccountTradeTab.jsx source text (never mirrored logic), generically for all
// symbols with no new endpoints.

test('no invented symbol fallback: empty symbol stays empty', () => {
  assert.ok(!tabSource.includes("'EURUSD'"), 'component must not invent an EURUSD fallback anywhere in the flow');
  assert.ok(!tabSource.includes('"EURUSD"'), 'component must not invent an EURUSD fallback (double-quoted) anywhere in the flow');
  const initAt = tabSource.indexOf('selectedTicketRow?.symbol || positions[0]?.symbol');
  assert.ok(initAt !== -1, 'modalSymbol must still derive from the selected row or open positions');
  const initSnippet = tabSource.slice(initAt, initAt + 120);
  assert.ok(!initSnippet.includes('EURUSD'), 'modalSymbol initializer must not fall back to an invented symbol');
  assert.ok(initSnippet.includes("|| ''"), 'empty symbol must stay empty (explicit empty-string fallback)');
});

test('empty symbol disables the modify action through the real enablement path', () => {
  const gateAt = tabSource.indexOf('const hasTradeSymbol');
  assert.ok(gateAt !== -1, 'a truthy-symbol gate must exist');
  const gateLine = tabSource.slice(gateAt, tabSource.indexOf('\n', gateAt));
  assert.ok(gateLine.includes('modalSymbol'), 'the symbol gate must derive from the real modalSymbol state');
  const updateAt = tabSource.indexOf('const canUpdateTrade');
  assert.ok(updateAt !== -1, 'the real modify enablement path must exist');
  const updateLine = tabSource.slice(updateAt, tabSource.indexOf('\n', updateAt));
  assert.ok(updateLine.includes('hasTradeSymbol'), 'modify enablement must gate on truthy symbol (fail-closed)');
  assert.ok(!updateLine.includes('!hasTradeSymbol'), 'the symbol gate must enable on a real symbol, not invert it');
  assert.ok(updateLine.includes('selectedTicketRow'), 'modify enablement must still require a selected row');
  // Evaluate the REAL gate initializer extracted above (never a
  // reimplementation) across empty vs real symbols.
  const initExpr = gateLine.slice(gateLine.indexOf('=') + 1).replace(/;[\s\S]*$/, '').trim();
  const evalGate = (symbol) => new Function('modalSymbol', 'return (' + initExpr + ');')(symbol);
  assert.equal(evalGate(''), false, 'empty symbol must fail the gate');
  assert.equal(evalGate('   '), false, 'whitespace-only symbol must fail the gate');
  assert.equal(evalGate(null), false, 'null symbol must fail the gate');
  assert.equal(evalGate(undefined), false, 'undefined symbol must fail the gate');
  assert.equal(evalGate('TESTSYM'), true, 'a real symbol must pass the gate');
  assert.ok(
    tabSource.includes('disabled={!canUpdateTrade}'),
    'Modify button must stay bound to the symbol-gated enablement flag'
  );
});

test('empty symbol disables the close action through the real close path', () => {
  const closeAt = tabSource.indexOf('requestTradeClose({');
  assert.ok(closeAt !== -1, 'the real close call site must exist');
  const closeWindow = tabSource.slice(Math.max(0, closeAt - 600), closeAt + 200);
  assert.ok(closeWindow.includes('disabled={!hasTradeSymbol}'), 'Close button must disable on empty symbol (fail-closed)');
  const handlerAt = tabSource.indexOf('const handleUpdateTrade');
  assert.ok(handlerAt !== -1, 'the real modify handler must exist');
  const handlerWindow = tabSource.slice(handlerAt, handlerAt + 600);
  assert.ok(
    handlerWindow.includes("String(modalSymbol || '').trim()"),
    'modify handler must fail closed on empty symbol'
  );
});

test('symbol list invents no symbols: built only from live sources', () => {
  const listStart = tabSource.indexOf('// Available symbols list');
  assert.ok(listStart !== -1, 'available-symbols section must exist');
  const listEnd = tabSource.indexOf('}, [modalSymbol', listStart);
  assert.ok(listEnd > listStart, 'available-symbols memo must declare its dep close');
  const listBlock = tabSource.slice(listStart, listEnd);
  assert.ok(!listBlock.includes('EURUSD'), 'symbol list must not invent EURUSD');
  assert.ok(!/'[A-Z]{6}'/.test(listBlock), 'symbol list must not embed hardcoded 6-letter symbol literals');
  assert.ok(listBlock.includes('modalSymbol'), 'symbol list must include the current symbol');
  assert.ok(listBlock.includes('positions'), 'symbol list must include open-position symbols');
  assert.ok(listBlock.includes('storeSymbols'), 'symbol list must include live-feed symbols');
});

// HOLD-1 stale-symbol bypass: an empty-symbol row must clear modalSymbol so it
// cannot inherit the prior real symbol and defeat hasTradeSymbol. Asserts the
// REAL sync effect body (never mirrored logic) plus the REAL overlay path for
// a sparse empty-symbol row and the REAL hasTradeSymbol gate.
test('HOLD-1 empty-symbol row clears modalSymbol instead of inheriting the prior symbol', () => {
  const start = tabSource.indexOf(SYNC_ANCHOR);
  const end = tabSource.indexOf(NEXT_SECTION, start);
  assert.ok(start !== -1 && end > start, 'sync effect block must exist');
  const block = tabSource.slice(start, end);
  assert.ok(!block.includes('if (selectedTicketRow.symbol)'), 'vulnerable guarded-only symbol set must be gone');
  assert.ok(block.includes('setModalSymbol(rowSymbol'), 'symbol must follow the row exactly');
  assert.ok(block.includes("|| ''"), 'empty row symbol must clear to empty (fail-closed, no inheritance)');
  assert.ok(block.includes('ticketChanged || rowSymbol'), 'symbol resync must fire on ticket change or server symbol change');
  // REAL sparse row through the REAL overlay: no live entry, so the empty
  // symbol passes through untouched (the exact bypass condition).
  const fresh = new LiveTradingState();
  const sparse = fresh.overlayRows([{ ...snapshotRow(), symbol: '' }])[0];
  assert.equal(sparse.symbol, '', 'sparse empty-symbol row must reach the tab as empty');
  // REAL gate: the cleared empty symbol must fail closed.
  const gateAt = tabSource.indexOf('const hasTradeSymbol');
  const gateLine = tabSource.slice(gateAt, tabSource.indexOf('\n', gateAt));
  const initExpr = gateLine.slice(gateLine.indexOf('=') + 1).replace(/;[\s\S]*$/, '').trim();
  const evalGate = (symbol) => new Function('modalSymbol', 'return (' + initExpr + ');')(symbol);
  assert.equal(evalGate(''), false, 'cleared empty symbol must fail the trade gate');
  assert.equal(evalGate(sparse.symbol), false, 'sparse-row symbol must fail the trade gate');
});

// HOLD-2 raw-type flap: Number()-normalized numeric deps must treat
// HTTP-number vs WS-string forms as identical so edits are never wiped.
test('HOLD-2 Number-normalized deps ignore HTTP-number vs WS-string type flaps', () => {
  const deps = readSyncEffectDeps();
  for (const fragment of ['priceSl', 'priceTp', 'volume']) {
    const dep = deps.find((d) => d.includes(fragment));
    assert.ok(dep, 'numeric dep must exist for ' + fragment);
    assert.ok(dep.includes('Number(') && dep.includes('?? 0'), 'numeric dep must normalize via Number(x ?? 0): ' + dep);
  }
  const ticketDep = deps.find((d) => d.includes('position') && d.includes('ticket'));
  assert.ok(ticketDep.includes('Number('), 'ticket dep must normalize via Number(): ' + ticketDep);
  // REAL dep evaluation: same values, different JS types (HTTP number vs
  // WS string) must leave every sync dep untouched.
  const asNumbers = { ...snapshotRow(), priceSl: 1.1, priceTp: 1.2, volume: 0.5, position: 42 };
  const asStrings = { ...snapshotRow(), priceSl: '1.1', priceTp: '1.2', volume: '0.5', position: '42' };
  const before = syncDepValues(deps, asNumbers, EURUSD_DIGITS);
  const after = syncDepValues(deps, asStrings, EURUSD_DIGITS);
  assert.deepEqual(after, before, 'number vs string forms of the same values must evaluate identically');
  assert.ok(!syncWouldResync(before, after), 'a raw-type flap must not re-run the sync effect (edits survive)');
});

// HOLD-3 sparse-row carryover: ticket change with missing volume/comment must
// reset to defaults instead of preserving the prior ticket's values.
test('HOLD-3 ticket change resets sparse volume/comment to defaults', () => {
  const start = tabSource.indexOf(SYNC_ANCHOR);
  const end = tabSource.indexOf(NEXT_SECTION, start);
  const block = tabSource.slice(start, end);
  assert.ok(block.includes('ticketChanged'), 'effect must distinguish a ticket change from a same-ticket update');
  assert.ok(block.includes("setTradeVolume('0.01')"), 'sparse volume must reset to the 0.01 default');
  assert.ok(block.includes('setTradeComment(rowComment'), 'comment must follow the row with an empty default');
  // REAL dep evaluation: a missing volume/comment reads as the normalized
  // default, which differs from a real value so the reset path fires.
  const deps = readSyncEffectDeps();
  const full = { ...snapshotRow(), volume: 0.5, comment: 'first' };
  const sparse = { ...snapshotRow(), position: 43 };
  delete sparse.volume;
  delete sparse.comment;
  const before = syncDepValues(deps, full, EURUSD_DIGITS);
  const after = syncDepValues(deps, sparse, EURUSD_DIGITS);
  assert.ok(syncWouldResync(before, after), 'switching to a sparse ticket must re-run the sync effect for a reset');
  // REAL overlay: a sparse row without live data passes through missing its
  // fields (the exact carryover condition the defaults guard against).
  const fresh = new LiveTradingState();
  const orphan = fresh.overlayRows([{ login: '1001', position: 99 }])[0];
  assert.equal(orphan.volume ?? orphan.lots, undefined, 'sparse row carries no volume through the real overlay');
  assert.equal(orphan.comment, undefined, 'sparse row carries no comment through the real overlay');
});

// HOLD-4 auto-track ref race: manual edit/adjust handlers must clear the ref
// synchronously, not one render later via the mirror effect.
test('HOLD-4 manual edits clear isAutoPipTrackRef synchronously', () => {
  const mirrorAt = tabSource.indexOf('const isAutoPipTrackRef');
  assert.ok(mirrorAt !== -1, 'auto-track ref must exist');
  const refSyncs = tabSource.split('isAutoPipTrackRef.current = false').length - 1;
  assert.ok(refSyncs >= 4, 'manual paths (adjust + SL/TP edits + update) must clear the ref synchronously, found ' + refSyncs);
  assert.ok(tabSource.includes('isAutoPipTrackRef.current = e.target.checked'), 'checkbox must mirror synchronously both ways');
  const adjustAt = tabSource.indexOf('const adjustValue');
  const adjustWindow = tabSource.slice(adjustAt, adjustAt + 300);
  assert.ok(
    adjustWindow.indexOf('isAutoPipTrackRef.current = false') !== -1 &&
    adjustWindow.indexOf('isAutoPipTrackRef.current = false') < adjustWindow.indexOf('setIsAutoPipTrack(false)'),
    'adjustValue must clear the ref before queueing state (synchronous, no one-render race)'
  );
  const slInput = tabSource.indexOf('aria-label="Stop loss"');
  const slWindow = tabSource.slice(slInput, slInput + 400);
  assert.ok(slWindow.includes('isAutoPipTrackRef.current = false'), 'SL manual edit must clear the ref synchronously');
  const tpInput = tabSource.indexOf('aria-label="Take profit"');
  const tpWindow = tabSource.slice(tpInput, tpInput + 400);
  assert.ok(tpWindow.includes('isAutoPipTrackRef.current = false'), 'TP manual edit must clear the ref synchronously');
  // REAL tick condition: live ticks rebuild rows every tick, so a one-render
  // ref delay would let one auto-track write win after the manual edit.
  const state = new LiveTradingState();
  ingestSnapshot(state);
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 10, profit: 3 }));
  const first = state.overlayRows([snapshotRow()])[0];
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 11, profit: 4 }));
  const second = state.overlayRows([snapshotRow()])[0];
  assert.notEqual(first, second, 'live ticks keep arriving while the user edits (race window is real)');
});

// HOLD-5 digits-driven wipe: a digits-only change (manual symbol switch with
// the same ticket/values) must preserve in-progress edits via field guards.
test('HOLD-5 digits-only change preserves in-progress edits via field guards', () => {
  const deps = readSyncEffectDeps();
  const start = tabSource.indexOf(SYNC_ANCHOR);
  const end = tabSource.indexOf(NEXT_SECTION, start);
  const block = tabSource.slice(start, end);
  assert.ok(block.includes('ticketChanged || rowSl !== prev.sl'), 'SL must only resync on ticket or server-SL change');
  assert.ok(block.includes('ticketChanged || rowTp !== prev.tp'), 'TP must only resync on ticket or server-TP change');
  assert.ok(block.includes('if (ticketChanged || rowSymbol'), 'symbol path must be guarded, never unconditional');
  // REAL dep evaluation on REAL overlay rows: identical ticket/values with a
  // fresh identity per tick keep every row-derived dep stable; only the
  // digits slot moves, and the guards above ensure that move wipes nothing.
  const state = new LiveTradingState();
  ingestSnapshot(state);
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 10, profit: 3 }));
  const first = state.overlayRows([snapshotRow()])[0];
  state.ingest(frame({ update_kind: 'pnl', state_version: '1', price_time_msc: 11, profit: 4 }));
  const second = state.overlayRows([snapshotRow()])[0];
  const before = syncDepValues(deps, first, EURUSD_DIGITS);
  const afterSameDigits = syncDepValues(deps, second, EURUSD_DIGITS);
  assert.deepEqual(afterSameDigits, before, 'identical ticks leave every sync dep untouched');
  const afterDigitsFlip = syncDepValues(deps, second, 3);
  const digitsIndex = deps.findIndex((dep) => dep.trim() === 'digits');
  before.forEach((value, index) => {
    if (index === digitsIndex) return;
    assert.ok(Object.is(value, afterDigitsFlip[index]), 'only the digits dep may move on a digits-only change (slot ' + index + ': ' + deps[index] + ')');
  });
  assert.ok(!Object.is(before[digitsIndex], afterDigitsFlip[digitsIndex]), 'digits-only change moves only the digits dep');
});

// HOLD-6 missing symbol/comment deps + cross-field wipe: server-only comment
// or symbol changes must resync their own field without wiping SL/TP edits.
test('HOLD-6 comment/symbol-only server changes resync without wiping SL/TP', () => {
  const deps = readSyncEffectDeps();
  assert.ok(deps.some((dep) => dep.includes('?.symbol')), 'sync effect must track the symbol primitive');
  assert.ok(deps.some((dep) => dep.includes('?.comment')), 'sync effect must track the comment primitive');
  const start = tabSource.indexOf(SYNC_ANCHOR);
  const end = tabSource.indexOf(NEXT_SECTION, start);
  const block = tabSource.slice(start, end);
  assert.ok(block.includes('if (rowComment !== prev.comment)'), 'comment-only change must touch only the comment field');
  assert.ok(block.includes('if (ticketChanged || rowSl !== prev.sl)'), 'comment/symbol-only change must not touch SL');
  assert.ok(block.includes('if (ticketChanged || rowTp !== prev.tp)'), 'comment/symbol-only change must not touch TP');
  // REAL server-only comment change through the REAL LiveTradingState path:
  // only the comment dep may move; SL/TP/volume/ticket/symbol stay stable.
  const state = new LiveTradingState();
  ingestSnapshot(state, { comment: 'first' });
  const beforeRow = state.overlayRows([{ ...snapshotRow(), comment: 'first' }])[0];
  assert.equal(beforeRow.comment, 'first', 'first comment must flow through the real overlay');
  state.ingest(frame({ update_kind: 'snapshot', state_version: '2', sl: 1.1, tp: 1.2, lots: 0.5, symbol: 'EURUSD', side: 'buy', comment: 'second', price_time_msc: 20 }));
  const afterRow = state.overlayRows([{ ...snapshotRow(), comment: 'second' }])[0];
  assert.equal(afterRow.comment, 'second', 'updated comment must flow through the real overlay');
  assert.equal(afterRow.priceSl, 1.1, 'SL must be preserved alongside the comment change');
  assert.equal(afterRow.priceTp, 1.2, 'TP must be preserved alongside the comment change');
  const before = syncDepValues(deps, beforeRow, EURUSD_DIGITS);
  const after = syncDepValues(deps, afterRow, EURUSD_DIGITS);
  const commentIndex = deps.findIndex((dep) => dep.includes('?.comment'));
  assert.ok(!Object.is(before[commentIndex], after[commentIndex]), 'a comment-only change must move the comment dep');
  before.forEach((value, index) => {
    if (index === commentIndex) return;
    assert.ok(Object.is(value, after[index]), 'only the comment dep may move on a comment-only change (slot ' + index + ': ' + deps[index] + ')');
  });
  // REAL symbol-only evaluation: same ticket/values, different symbol moves
  // only the symbol dep, so SL/TP guards hold it without wiping.
  const symBefore = syncDepValues(deps, { ...snapshotRow(), symbol: 'EURUSD' }, EURUSD_DIGITS);
  const symAfter = syncDepValues(deps, { ...snapshotRow(), symbol: 'TESTSYM' }, EURUSD_DIGITS);
  const symbolIndex = deps.findIndex((dep) => dep.includes('?.symbol'));
  assert.ok(!Object.is(symBefore[symbolIndex], symAfter[symbolIndex]), 'a symbol-only change must move the symbol dep');
  symBefore.forEach((value, index) => {
    if (index === symbolIndex) return;
    if (deps[index].trim() === 'digits') return;
    assert.ok(Object.is(value, symAfter[index]), 'only the symbol dep may move on a symbol-only change (slot ' + index + ': ' + deps[index] + ')');
  });
});

// HOLD-7 canUpdateTrade ticket check: Modify must stay disabled without a
// ticket (fail-open button becomes fail-closed).
test('HOLD-7 modify enablement requires a ticket', () => {
  const ticketAt = tabSource.indexOf('const hasTradeTicket');
  assert.ok(ticketAt !== -1, 'a ticket gate must exist');
  const ticketLine = tabSource.slice(ticketAt, tabSource.indexOf('\n', ticketAt));
  assert.ok(ticketLine.includes('position') && ticketLine.includes('ticket'), 'ticket gate must cover position/ticket identity');
  const updateAt = tabSource.indexOf('const canUpdateTrade');
  assert.ok(updateAt !== -1, 'the real modify enablement path must exist');
  const updateLine = tabSource.slice(updateAt, tabSource.indexOf('\n', updateAt));
  assert.ok(updateLine.includes('hasTradeTicket'), 'modify enablement must gate on a ticket (fail-closed)');
  assert.ok(updateLine.includes('hasTradeSymbol'), 'modify enablement must keep the symbol gate');
  // Evaluate the REAL ticket gate expression (never a reimplementation).
  const initExpr = ticketLine.slice(ticketLine.indexOf('=') + 1).replace(/;[\s\S]*$/, '').trim();
  const evalTicket = (row) => new Function('selectedTicketRow', 'return (' + initExpr + ');')(row);
  assert.equal(evalTicket({ position: 42, ticket: 42 }), true, 'a row with a ticket must pass');
  assert.equal(evalTicket({ ticket: 43 }), true, 'a ticket-only row must pass');
  assert.equal(evalTicket({ position: 42 }), true, 'a position-only row must pass');
  assert.equal(evalTicket({}), false, 'a ticketless row must fail closed');
  assert.equal(evalTicket(null), false, 'a null row must fail closed');
  assert.equal(evalTicket(undefined), false, 'a missing row must fail closed');
  assert.ok(tabSource.includes('disabled={!canUpdateTrade}'), 'Modify button must stay bound to the gated flag');
});

// HOLD-8 BUY/SELL buttons: disabled on empty symbol with a reasoned title so
// they cannot error-toast in a loop.
test('HOLD-8 BUY/SELL disable on empty symbol with a reasoned title', () => {
  for (const op of ['sell', 'buy']) {
    const callAt = tabSource.indexOf("handlePlaceTrade('" + op + "')");
    assert.ok(callAt !== -1, 'the real ' + op.toUpperCase() + ' call site must exist');
    const window = tabSource.slice(Math.max(0, callAt - 500), callAt + 600);
    assert.ok(window.includes('!hasTradeSymbol'), op.toUpperCase() + ' button must disable on empty symbol');
    assert.ok(window.includes('Select a symbol before placing an order'), op.toUpperCase() + ' button must explain the empty-symbol disablement');
  }
  // REAL gate: empty symbols disable, a real symbol enables (row/gating path).
  const gateAt = tabSource.indexOf('const hasTradeSymbol');
  const gateLine = tabSource.slice(gateAt, tabSource.indexOf('\n', gateAt));
  const initExpr = gateLine.slice(gateLine.indexOf('=') + 1).replace(/;[\s\S]*$/, '').trim();
  const evalGate = (symbol) => new Function('modalSymbol', 'return (' + initExpr + ');')(symbol);
  assert.equal(evalGate(''), false, 'empty symbol must disable BUY/SELL');
  assert.equal(evalGate('TESTSYM'), true, 'a real symbol must enable BUY/SELL (other gates permitting)');
});
