import test from 'node:test';
import assert from 'node:assert/strict';
import { accountsByGroupName, accountsInGroup, countAccountsByGroup } from './groupAccountRows.js';

test('accounts inside a group keep login, name and money, and ignore other groups', () => {
  const rows = accountsInGroup([
    { login: '200004', Name: 'dipanita das', group: 'dipannita', email: 'dipanita@gmail.com', leverage: 100, balance: 99853.74, equity: 99850.1 },
    { login: '200001', Name: 'Animesh', group: 'Arijit', leverage: 100, balance: 10 },
  ], 'Dipannita');

  assert.deepEqual(rows.map((row) => row.login), ['200004']);
  assert.equal(rows[0].name, 'dipanita das');
  assert.equal(rows[0].leverage, '1 : 100');
  assert.equal(accountsInGroup([
    { login: '200004', Name: 'dipanita das', group: 'dipannita', leverage: 100 },
  ], 'dipannita', { leverage: 20 })[0].leverage, '1 : 20');
  assert.equal(rows[0].balance, (99853.74).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  assert.deepEqual(accountsByGroupName([
    { login: '200023', group: 'Auj/demo', Name: 'Arena Phase1' },
    { login: '200020', Group: 'auj/demo', name: 'Auj test' },
    { login: '200004', group: 'dipannita' },
  ]).get('auj/demo').map((account) => account.login), ['200020', '200023']);
  assert.equal(countAccountsByGroup([
    { group: 'dipannita' },
    { group: 'YoPips Demo' },
    { group: 'yopips demo' },
  ]).get('yopips demo'), 2);
});
