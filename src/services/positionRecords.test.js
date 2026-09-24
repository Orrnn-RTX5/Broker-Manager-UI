import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPositionTicket,
  mergePositionUpdates,
  normalizePositionRow,
  reconcilePositionSnapshot,
} from './positionRecords.js';

test('merges by ticket while retaining sibling trades and quiet positions', () => {
  const previous = [
    { positionTicket: '101', login: '200008', symbol: 'EURUSD', profit: 10 },
    { positionTicket: '102', login: '200008', symbol: 'EURUSD', profit: 20 },
    { positionTicket: '201', login: '200009', symbol: 'GBPUSD', profit: 30 },
  ];
  const original = structuredClone(previous);

  const merged = mergePositionUpdates(previous, [{ ticket: 101, profit: 15 }]);

  assert.deepEqual(merged, [
    { ...previous[0], profit: 15 },
    previous[1],
    previous[2],
  ]);
  assert.deepEqual(previous, original);
});

test('sparse live prices preserve volume, entry price, account details, and stops', () => {
  const previous = [{
    positionTicket: '101',
    login: '200008',
    accountName: 'Account owner',
    username: 'owner@example.test',
    accountGroup: 'demo',
    symbol: 'EURUSD',
    action: 'buy',
    lots: 0.75,
    volumeExt: 7500,
    priceOpen: 1.1,
    priceCurrent: 1.2,
    priceSl: 1.05,
    priceTp: 1.3,
    profit: 10,
  }];

  const [merged] = mergePositionUpdates(previous, [{
    positionTicket: '101',
    price_current: 1.25,
    profit: 15,
  }]);

  assert.deepEqual(merged, { ...previous[0], priceCurrent: 1.25, profit: 15 });
  const visible = normalizePositionRow(merged);
  assert.equal(visible.volume, 0.75);
  assert.equal(visible.priceOpen, 1.1);
  assert.equal(visible.name, 'Account owner');
});

test('accepts explicit zero stops, profit, swap, and volume from live updates', () => {
  const [merged] = mergePositionUpdates([{
    positionTicket: '101',
    priceSl: 1.05,
    priceTp: 1.3,
    profit: 15,
    storage: -2,
    lots: 0.5,
    volumeExt: 5000,
  }], [{ ticket: 101, sl: 0, tp: 0, profit: 0, swap: 0, volume: 0 }]);

  assert.equal(merged.priceSl, 0);
  assert.equal(merged.priceTp, 0);
  assert.equal(merged.profit, 0);
  assert.equal(merged.storage, 0);
  assert.equal(merged.lots, 0);
  assert.equal(merged.volumeExt, 0);
  assert.equal(normalizePositionRow(merged).volume, 0);
});

test('a volumeExt-only update changes displayed lots after a partial close', () => {
  const [merged] = mergePositionUpdates([{
    positionTicket: '101', lots: 0.75, volumeExt: 7500,
  }], [{ positionTicket: '101', volumeExt: '2500' }]);

  assert.equal(merged.lots, 0.25);
  assert.equal(merged.volumeExt, 2500);
  assert.equal(normalizePositionRow(merged).volume, 0.25);
});

test('numeric live volume strings are stored as lots and converted consistently', () => {
  const [merged] = mergePositionUpdates([], [{ Ticket: 101, volume: '0.75' }]);

  assert.equal(merged.lots, 0.75);
  assert.equal(merged.volumeExt, 7500);
  assert.equal(normalizePositionRow(merged).volume, 0.75);
});

test('upper-case server aliases update the existing ticket and account fields', () => {
  const [merged] = mergePositionUpdates([{
    positionTicket: '101', login: '200008', symbol: 'EURUSD', lots: 1,
  }], [{
    Ticket: 101,
    Login: 200008,
    Name: 'Account owner',
    Email: 'owner@example.test',
    Group: 'demo',
    Symbol: 'EURUSD',
    Action: 1,
    Volume: '2500',
    PriceOpen: 1.1,
    PriceCurrent: 1.2,
    SL: 0,
    TP: 1.3,
    Profit: 20,
    Swap: -1,
  }]);

  const visible = normalizePositionRow(merged);
  assert.equal(visible.position, '101');
  assert.equal(visible.login, '200008');
  assert.equal(visible.name, 'Account owner');
  assert.equal(visible.email, 'owner@example.test');
  assert.equal(visible.group, 'demo');
  assert.equal(visible.symbol, 'EURUSD');
  assert.equal(visible.type, 'sell');
  assert.equal(visible.volume, 0.25);
  assert.equal(visible.priceOpen, 1.1);
  assert.equal(visible.priceCurrent, 1.2);
  assert.equal(visible.priceSl, 0);
  assert.equal(visible.priceTp, 1.3);
  assert.equal(visible.profit, 20);
  assert.equal(visible.swap, -1);
});

test('recognizes all supported ticket aliases with numeric and string identities', () => {
  for (const alias of ['positionTicket', 'Position', 'ticket', 'Ticket', 'position']) {
    assert.equal(getPositionTicket({ [alias]: 101 }), '101', alias);
    assert.equal(getPositionTicket({ [alias]: '101' }), '101', alias);
    assert.equal(normalizePositionRow({ [alias]: 101 }).position, 101, alias);
    const merged = mergePositionUpdates([
      { positionTicket: '101', profit: 10 },
    ], [{ [alias]: 101, Profit: 20 }]);
    assert.deepEqual(merged, [{ positionTicket: '101', profit: 20 }], alias);
  }
});

test('ignores updates without a valid ticket while adding genuinely new trades', () => {
  const previous = [{ positionTicket: '101', profit: 10 }];
  const merged = mergePositionUpdates(previous, [
    { profit: 20 },
    { Ticket: 0, profit: 30 },
    { Ticket: 102, profit: 40 },
  ]);

  assert.deepEqual(merged, [previous[0], { positionTicket: 102, profit: 40 }]);
});

test('live patches preserve numeric row identity used for selection', () => {
  const [row] = mergePositionUpdates([{ positionTicket: 101, profit: 10 }], [{ ticket: '101', profit: 20 }]);
  assert.equal(normalizePositionRow(row).position, 101);
});

test('HTTP reconciliation retains newer live values and newly opened tickets', () => {
  const snapshot = [
    { positionTicket: '101', accountName: 'Fetched owner', profit: 10 },
    { positionTicket: '102', accountName: 'Fetched quiet owner', profit: 25 },
    { positionTicket: '105', profit: 50 },
  ];
  const current = [
    { positionTicket: '101', profit: 15 },
    { positionTicket: '102', accountName: 'Older quiet owner', profit: 20 },
    { positionTicket: '103', profit: 30 },
    { positionTicket: '104', profit: 40 },
  ];
  const originalSnapshot = structuredClone(snapshot);
  const originalCurrent = structuredClone(current);
  const newerTickets = new Set(['101', '104']);

  const reconciled = reconcilePositionSnapshot(snapshot, current, (ticket) => newerTickets.has(ticket));

  assert.deepEqual(reconciled, [
    { positionTicket: '101', accountName: 'Fetched owner', profit: 15 },
    snapshot[1],
    snapshot[2],
    current[3],
  ]);
  assert.equal(reconciled.some((row) => getPositionTicket(row) === '103'), false);
  assert.deepEqual(snapshot, originalSnapshot);
  assert.deepEqual(current, originalCurrent);
});

test('HTTP reconciliation matches upper-case ticket aliases to canonical live tickets', () => {
  const reconciled = reconcilePositionSnapshot(
    [{ Ticket: 101, Profit: 10, AccountName: 'Fetched owner' }],
    [{ positionTicket: '101', profit: 20 }],
    (ticket) => ticket === '101',
  );

  assert.equal(reconciled.length, 1);
  const visible = normalizePositionRow(reconciled[0]);
  assert.equal(visible.position, '101');
  assert.equal(visible.profit, 20);
  assert.equal(visible.name, 'Fetched owner');
});

for (const [description, source, expectedLots] of [
  ['decimal lots', { lots: '0.75' }, 0.75],
  ['decimal volume', { volume: '0.75' }, 0.75],
  ['extended volume', { volumeExt: '2500' }, 0.25],
  ['upper-case server volume', { Volume: '7500' }, 0.75],
  ['small extended volume', { volumeExt: '50' }, 0.005],
  ['small upper-case server volume', { Volume: '50' }, 0.005],
  ['zero lots', { lots: '0' }, 0],
]) {
  test(`normalizes numeric strings for ${description} into numeric lots`, () => {
    assert.equal(normalizePositionRow(source).volume, expectedLots);
  });
}

for (const lots of [100, 250, '100', '250']) {
  test(`preserves explicit lots of ${JSON.stringify(lots)} without dividing by 10000`, () => {
    assert.equal(normalizePositionRow({ lots }).volume, Number(lots));
    const [merged] = mergePositionUpdates([], [{ Ticket: 101, lots }]);
    assert.equal(merged.volumeExt, Number(lots) * 10000);
    assert.equal(normalizePositionRow(merged).volume, Number(lots));
  });
}
