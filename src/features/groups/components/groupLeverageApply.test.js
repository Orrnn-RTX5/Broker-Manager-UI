import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGroupLeverage,
  beginGroupApply,
  endGroupApply,
  isGroupApplyInFlight,
  subscribeGroupApply,
} from './groupLeverageApply.js';
import { normalizeAccount } from '../../../utils/sidebarAccountRows.js';
import { accountsInGroup } from '../groupAccountRows.js';

// Owner rule 2026-10-28: group names are case-sensitive identities. "Apply
// group leverage" only writes accounts of exactly that group and sends the
// ExpectedGroup precondition on every PATCH. Generic fixtures (no real logins).
const run = async (members, options = { expectedGroup: 'Grp' }) => {
  const calls = [];
  const result = await applyGroupLeverage({
    members,
    groupLeverage: 200,
    confirm: true,
    ...options,
    updateAccount: async (login, patch) => { calls.push([login, patch]); },
  });
  return { calls, result };
};

test('apply group leverage writes only exact-group members, each with ExpectedGroup', async () => {
  const { calls, result } = await run([
    { login: '1001', group: 'Grp', leverage: 100 },
    { login: '1002', group: 'GRP', leverage: 100 },
    { login: '1003', Group: ' Grp ', leverage: 50 },
    { login: '1004', group: 'Grp', leverage: 200 },
  ]);
  assert.deepEqual(calls, [
    ['1001', { Leverage: 200, ExpectedGroup: 'Grp' }],
    ['1003', { Leverage: 200, ExpectedGroup: ' Grp ' }], // stored value, byte-exact (ExpectedGroup contract)
  ]);
  assert.deepEqual(result, { succeeded: 2, failed: 0, total: 2, succeededLogins: ['1001', '1003'] });
});

test('apply group leverage writes nothing without an expected group', async () => {
  for (const options of [{ expectedGroup: '' }, { expectedGroup: '  ' }, { expectedGroup: null }, {}]) {
    const { calls, result } = await run([{ login: '1001', group: 'Grp', leverage: 100 }], options);
    assert.deepEqual(calls, []);
    assert.equal(result.total, 0);
  }
});

test('a 409 ACCOUNT_GROUP_MISMATCH counts as failed and does not stop the others', async () => {
  const calls = [];
  const result = await applyGroupLeverage({
    members: [{ login: '1001', group: 'Grp', leverage: 100 }, { login: '1002', group: 'Grp', leverage: 100 }],
    groupLeverage: 200,
    confirm: true,
    expectedGroup: 'Grp',
    updateAccount: async (login, patch) => {
      calls.push(login);
      if (login === '1001') throw Object.assign(new Error('ACCOUNT_GROUP_MISMATCH'), { status: 409 });
      return patch;
    },
  });
  assert.deepEqual(calls, ['1001', '1002']);
  assert.deepEqual(result, { succeeded: 1, failed: 1, total: 2, succeededLogins: ['1002'] });
});

test('a normalized member (trimmed group) still sends its stored group byte-exact', async () => {
  const { calls } = await run([normalizeAccount({ login: '1001', group: ' Grp ', leverage: 100 })]);
  assert.deepEqual(calls, [['1001', { Leverage: 200, ExpectedGroup: ' Grp ' }]]);
});

// One apply write per group at a time. The registry is module-level, so it holds across remounts.
// Every begin is paired with an end in `finally`, so a failing assertion never leaks an in-flight mark.
test('the in-flight registry admits one apply per group and clears when the apply ends', () => {
  try {
    assert.equal(beginGroupApply('Fixture/Registry'), true);
    assert.equal(beginGroupApply('Fixture/Registry'), false, 'a second apply for the same group is refused while one is in flight');
    assert.equal(isGroupApplyInFlight('Fixture/Registry'), true);
    endGroupApply('Fixture/Registry');
    assert.equal(isGroupApplyInFlight('Fixture/Registry'), false, 'the entry clears when the apply ends');
    assert.equal(beginGroupApply('Fixture/Registry'), true, 'after the apply ends, the group can apply again');
  } finally {
    endGroupApply('Fixture/Registry');
  }
});

test('the in-flight registry keys groups by exact name: case is identity, surrounding spaces are not', () => {
  try {
    assert.equal(beginGroupApply('Fixture/Keys'), true);
    assert.equal(beginGroupApply('fixture/keys'), true, 'a differently-cased group is a different group');
    assert.equal(beginGroupApply(' Fixture/Keys '), false, 'trimmed, the padded name is the same group and is refused');
    endGroupApply('Fixture/Keys');
    endGroupApply('fixture/keys');
    assert.equal(isGroupApplyInFlight('Fixture/Keys'), false);
  } finally {
    endGroupApply('Fixture/Keys');
    endGroupApply('fixture/keys');
  }
});

test('the in-flight registry notifies subscribers when a write starts or ends, not on refused or repeated calls', () => {
  let notified = 0;
  const unsubscribe = subscribeGroupApply(() => { notified += 1; });
  try {
    beginGroupApply('Fixture/Notify');
    assert.equal(notified, 1);
    beginGroupApply('Fixture/Notify');
    assert.equal(notified, 1, 'a refused begin changes nothing');
    endGroupApply('Fixture/Notify');
    assert.equal(notified, 2);
    endGroupApply('Fixture/Notify');
    assert.equal(notified, 2, 'ending a group that is not in flight changes nothing');
    unsubscribe();
    beginGroupApply('Fixture/Notify');
    assert.equal(notified, 2, 'an unsubscribed listener is not called');
  } finally {
    unsubscribe();
    endGroupApply('Fixture/Notify');
  }
});

// Apply selects members with the same accessor as the account list. A row whose `group` is ''
// and whose `accountGroup` is 'Beta' is listed under Beta, so Apply must patch it too.
test('a row with an empty group and accountGroup Beta is patched with ExpectedGroup Beta, like the listed row', async () => {
  const raw = [
    { login: '700001', Name: 'Plain', group: 'Beta', leverage: 100 },
    { login: '700002', Name: 'AG only', group: '', accountGroup: 'Beta', leverage: 100 },
  ];
  const listed = accountsInGroup(raw, 'Beta', { leverage: 200 });
  assert.deepEqual(listed.map((row) => row.login), ['700001', '700002']);
  const { calls, result } = await run(listed.map((row) => row.account), { expectedGroup: 'Beta' });
  assert.deepEqual(calls, [
    ['700001', { Leverage: 200, ExpectedGroup: 'Beta' }],
    ['700002', { Leverage: 200, ExpectedGroup: 'Beta' }],
  ]);
  assert.deepEqual(result, { succeeded: 2, failed: 0, total: 2, succeededLogins: ['700001', '700002'] });
});

test('a member already at group leverage is not counted as a patch target, so the count stays honest', async () => {
  const { calls, result } = await run([
    { login: '700001', group: 'Grp', leverage: 200 },
    { login: '700002', group: '', accountGroup: 'Grp', leverage: 100 },
  ]);
  assert.deepEqual(calls, [['700002', { Leverage: 200, ExpectedGroup: 'Grp' }]]);
  assert.deepEqual(result, { succeeded: 1, failed: 0, total: 1, succeededLogins: ['700002'] });
});
