import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCloseAccountTrades,
  canMutateAccountTrades,
  TRADE_CLOSE_DENIED_MESSAGE,
  TRADE_MUTATION_DENIED_MESSAGE,
} from './accountTradePermissions.js';
import { PERMISSIONS } from '../../utils/permissions.js';

test('account trade mutations require the manipulate_trades permission key', () => {
  const seen = [];
  assert.equal(
    canMutateAccountTrades((permission) => {
      seen.push(permission);
      return permission === PERMISSIONS.MANIPULATE_TRADES;
    }),
    true
  );
  assert.deepEqual(seen, [PERMISSIONS.MANIPULATE_TRADES]);
});

test('account trade mutations fail closed when permissions are unresolved or denied', () => {
  assert.equal(canMutateAccountTrades(undefined), false);
  assert.equal(canMutateAccountTrades(() => false), false);
  assert.match(TRADE_MUTATION_DENIED_MESSAGE, /permission/i);
});

test('closing an account trade requires the manage_trades permission key', () => {
  const seen = [];
  assert.equal(
    canCloseAccountTrades((permission) => {
      seen.push(permission);
      return permission === PERMISSIONS.MANAGE_TRADES;
    }),
    true
  );
  assert.deepEqual(seen, [PERMISSIONS.MANAGE_TRADES]);
  assert.equal(canCloseAccountTrades(() => false), false);
  assert.match(TRADE_CLOSE_DENIED_MESSAGE, /manage trades/i);
});
