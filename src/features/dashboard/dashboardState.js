export const DASHBOARD_BACKEND_ENDPOINTS = Object.freeze([
  '/AccountDetailsMany',
  '/PositionsAll',
]);

export const DASHBOARD_REQUIRED_AGGREGATION_ENDPOINTS = Object.freeze([
  '/DashboardSummary',
  '/Dashboard/AccountsSeries',
  '/Dashboard/CashflowSeries',
  '/Dashboard/AccountsBySource',
  '/Dashboard/LiquidityProviders',
]);

export const DASHBOARD_PLACEHOLDER_MODE = DASHBOARD_BACKEND_ENDPOINTS.length === 0;
