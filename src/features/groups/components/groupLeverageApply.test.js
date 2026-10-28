import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGroupLeverage } from './groupLeverageApply.js';
import { normalizeAccount } from '../../../utils/sidebarAccountRows.js';

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
    ['1003', { Leverage: 200, ExpectedGroup: ' Grp ' }], // stored value, byte-exact (B1 contract)
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
