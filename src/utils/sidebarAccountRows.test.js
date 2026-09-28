import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccount, getSidebarAccountType } from './sidebarAccountRows.js';

test('mixed sidebar accounts are separated by their normalized server group', () => {
  const accounts = [
    { login: 200001, Group: 'demo/STD', balance: 100 },
    { login: 200002, raw: { GroupName: 'Real/Standard' }, balance: 200 },
    { login: 200003, account: { group: 'Demo/Pro' }, balance: 300 },
    { login: 200004, balance: 400 },
  ].map(normalizeAccount);
  assert.deepEqual(accounts.filter(a => getSidebarAccountType(a) === 'demo').map(a => a.login), ['200001', '200003']);
  assert.deepEqual(accounts.filter(a => getSidebarAccountType(a) === 'real').map(a => a.login), ['200002']);
  assert.equal(getSidebarAccountType(accounts[3]), null);
});

test('a cached account gains its type when account details arrive', () => {
  const cached = normalizeAccount({ login: 200001, balance: 100 });
  assert.equal(getSidebarAccountType(cached), null);
  const details = normalizeAccount({ Login: 200001, Group: 'demo/STD' });
  assert.equal(getSidebarAccountType({ ...cached, ...details }), 'demo');
});

test('sidebar normalization keeps the live margin level separate from the call threshold', () => {
  const account = normalizeAccount({
    raw: { Login: 200005, Margin: 0, MarginLevel: 0, MarginCallLevel: 50 },
    balance: 150005.04,
  });

  assert.equal(account.login, '200005');
  assert.equal(account.MarginLevel, 0);
  assert.equal(account.MarginCallLevel, 50);
});
