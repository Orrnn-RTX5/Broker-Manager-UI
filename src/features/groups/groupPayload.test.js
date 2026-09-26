import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountPatchFromGroup, describeGroupSave, readLeverageRatio } from './groupAccountRows.js';

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
