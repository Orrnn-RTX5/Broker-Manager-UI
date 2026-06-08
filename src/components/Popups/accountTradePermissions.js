import { PERMISSIONS } from '../../utils/permissions.js';

export const TRADE_MUTATION_DENIED_MESSAGE =
  'Your role does not have permission to manipulate trades.';

export const canMutateAccountTrades = (canAct) =>
  typeof canAct === 'function' && canAct(PERMISSIONS.MANIPULATE_TRADES) === true;

export default { TRADE_MUTATION_DENIED_MESSAGE, canMutateAccountTrades };
