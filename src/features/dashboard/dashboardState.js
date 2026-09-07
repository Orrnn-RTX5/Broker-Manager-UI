import { MANAGER_API } from '../../config/managerApiContract.js';

export const DASHBOARD_BACKEND_ENDPOINTS = Object.freeze([
  MANAGER_API.reportsSummary,
  MANAGER_API.accountLimits,
  MANAGER_API.accountDetails,
  MANAGER_API.positions,
]);

// The current Swagger has daily/summary reports but no intraday series,
// account-source breakdown, liquidity-provider aggregate, or approval queue.
export const DASHBOARD_REQUIRED_AGGREGATION_ENDPOINTS = Object.freeze([
  'intraday account/equity series',
  'account source breakdown',
  'liquidity provider aggregate',
  'approval queue aggregate',
]);

export const DASHBOARD_PLACEHOLDER_MODE = DASHBOARD_BACKEND_ENDPOINTS.length === 0;
