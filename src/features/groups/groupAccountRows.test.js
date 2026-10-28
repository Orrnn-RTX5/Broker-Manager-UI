import test from 'node:test';
import assert from 'node:assert/strict';
import { accountsByGroupName, accountsInGroup, countAccountsByGroup, readLeverageRatio, sameGroupName, toGroupAccountRow } from './groupAccountRows.js';

test('accounts inside a group keep login, name and money, and ignore other groups', () => {
  const rows = accountsInGroup([
    { login: '200004', Name: 'dipanita das', group: 'dipannita', email: 'dipanita@gmail.com', leverage: 100, balance: 99853.74, equity: 99850.1 },
    { login: '200001', Name: 'Animesh', group: 'Arijit', leverage: 100, balance: 10 },
  ], 'dipannita');

  assert.deepEqual(rows.map((row) => row.login), ['200004']);
  assert.equal(rows[0].name, 'dipanita das');
  assert.equal(rows[0].leverage, '1 : 100');
  assert.equal(accountsInGroup([
    { login: '200004', Name: 'dipanita das', group: 'dipannita', leverage: 100 },
  ], 'dipannita', { leverage: 20 })[0].leverage, '1 : 100');
  assert.equal(rows[0].balance, (99853.74).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  assert.deepEqual(accountsByGroupName([
    { login: '200023', group: 'Auj/demo', Name: 'Arena Phase1' },
    { login: '200020', Group: 'auj/demo', name: 'Auj test' },
    { login: '200004', group: 'dipannita' },
  ]).get('auj/demo').map((account) => account.login), ['200020'], 'case-sensitive: "Auj/demo" is another group');
  assert.equal(countAccountsByGroup([
    { group: 'dipannita' },
    { group: 'YoPips Demo' },
    { group: 'yopips demo' },
  ]).get('yopips demo'), 1, 'case-sensitive: "YoPips Demo" is counted separately');
});

test('account leverage wins over the group fallback', () => {
  const rows = accountsInGroup([
    { login: '200004', group: 'dipannita', leverage: 100 },
    { login: '200005', group: 'dipannita' },
  ], 'dipannita', { leverage: 500 });

  assert.equal(rows[0].leverage, '1 : 100');
  assert.equal(rows[1].leverage, '1 : 500');
});

test('leverage parsing is strict: anchored ratios and decimals only, garbage is null', () => {
  assert.equal(readLeverageRatio({ leverage: 100 }), 100);
  assert.equal(readLeverageRatio({ Leverage: '1:50' }), 50);
  assert.equal(readLeverageRatio({ leverage: '1 : 200' }), 200);
  assert.equal(readLeverageRatio({ leverage: '25.5' }), 25.5);
  assert.equal(readLeverageRatio({ leverage: '1 : 100 garbage' }), null);
  assert.equal(readLeverageRatio({ leverage: '0x64' }), null);
  assert.equal(readLeverageRatio({ leverage: [100] }), null);
  assert.equal(readLeverageRatio({ leverage: true }), null);
  assert.equal(readLeverageRatio({ leverage: 0 }), null);
  assert.equal(readLeverageRatio({ leverage: '' }), null);
  assert.equal(readLeverageRatio({ leverage: null }), null);
  assert.equal(readLeverageRatio({}), null);
});

test('row builder tolerates null accounts without throwing', () => {
  const row = toGroupAccountRow(null, { leverage: 200 });
  assert.equal(row.login, '');
  assert.equal(row.leverage, '1 : 200');
  const blank = toGroupAccountRow({ login: '900010' }, {});
  assert.equal(blank.login, '900010');
  assert.equal(blank.leverage, '');
});

// Owner rule 2026-10-28: group names are case-sensitive identities. "Arijit" and
// "ARIJIT" are two groups: separate nodes and counts, and editing one never
// touches the other's accounts. Generic fixtures (no real logins).
test('groups differing only by case are separate: rows, map keys and counts', () => {
  const accounts = [
    { login: '1001', group: 'Grp', leverage: 100 },
    { login: '1002', group: 'GRP', leverage: 50 },
    { login: '1003', group: ' Grp ', leverage: 100 },
  ];
  assert.deepEqual(accountsInGroup(accounts, 'Grp').map((row) => row.login), ['1001', '1003'], 'trim only');
  assert.deepEqual(accountsInGroup(accounts, 'GRP').map((row) => row.login), ['1002']);
  assert.deepEqual(accountsInGroup(accounts, 'grp'), [], 'no case folding');
  const byName = accountsByGroupName(accounts);
  assert.deepEqual([...byName.keys()].sort(), ['GRP', 'Grp']);
  assert.deepEqual(byName.get('Grp').map((a) => a.login), ['1001', '1003']);
  const counts = countAccountsByGroup(accounts);
  assert.equal(counts.get('Grp'), 2);
  assert.equal(counts.get('GRP'), 1);
  assert.equal(counts.get('grp'), undefined);
  assert.equal(sameGroupName('Grp', ' Grp '), true);
  assert.equal(sameGroupName('Grp', 'GRP'), false);
});
