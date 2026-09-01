import { PERMISSIONS } from '../../utils/permissions.js';

export const TRADE_MUTATION_DENIED_MESSAGE =
  'Your role does not have permission to manipulate trades.';

export const TRADE_CLOSE_DENIED_MESSAGE =
  'Your role does not have permission to manage trades.';

export const canMutateAccountTrades = (canAct) =>
  typeof canAct === 'function' && canAct(PERMISSIONS.MANIPULATE_TRADES) === true;

export const canCloseAccountTrades = (canAct) =>
  typeof canAct === 'function' && canAct(PERMISSIONS.MANAGE_TRADES) === true;

export default {
  TRADE_MUTATION_DENIED_MESSAGE,
  TRADE_CLOSE_DENIED_MESSAGE,
  canMutateAccountTrades,
  canCloseAccountTrades,
};
