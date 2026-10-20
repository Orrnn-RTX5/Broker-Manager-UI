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
      } else {
        assert.equal(value, undefined, 'row-derived dep must read undefined for an ' + label + ' row (' + deps[index] + ')');
      }
    });
  }
  const start = tabSource.indexOf(SYNC_ANCHOR);
  const end = tabSource.indexOf(NEXT_SECTION, start);
  assert.ok(
    tabSource.slice(start, end).includes('if (selectedTicketRow)'),
    'the sync effect must guard its body against a missing selected row'
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
