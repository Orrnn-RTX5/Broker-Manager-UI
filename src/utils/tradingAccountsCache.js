import { getDataAccessScope, getVerifiedDataAccessScope, matchesDataAccessScope } from '../services/dataAccessScope.js';

export const ANALYTICS_TRADING_ACCOUNTS_STORAGE_PREFIX = 'rtx5_trading_accounts_analytics_v3';
export const ANALYTICS_TRADING_ACCOUNTS_STORAGE_DEFAULT = 'rtx5_trading_accounts_analytics_v2_default';
export const DEFAULT_PREWARMED_ACCOUNTS = Object.freeze([]);

const key = (scope) => `${ANALYTICS_TRADING_ACCOUNTS_STORAGE_PREFIX}_${scope || 'anonymous'}`;
const read = (scope) => {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key(scope));
    const value = raw ? JSON.parse(raw) : null;
    const verifiedAuthority = getVerifiedDataAccessScope();
    const authorized = matchesDataAccessScope(value?.authority)
      || (verifiedAuthority && value?.verifiedAuthority === verifiedAuthority);
    return authorized && Array.isArray(value.accounts) ? value : null;
  } catch { return null; }
};

export const saveTradingAccountsAnalyticsCache = (scope, accounts) => {
  if (!Array.isArray(accounts)) return;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key(scope), JSON.stringify({
      authority: getDataAccessScope(), verifiedAuthority: getVerifiedDataAccessScope(), accounts, timestamp: Date.now(),
    }));
  } catch { /* Storage is optional. */ }
};

export const loadTradingAccountsAnalyticsCache = (scope = 'anonymous', peekFn = null) => {
  const cached = read(scope);
  if (cached) return cached.accounts;
  const page = typeof peekFn === 'function' ? peekFn() : null;
  return Array.isArray(page?.rows) ? page.rows : [];
};

export const getTradingAccountsAnalyticsCacheTimestamp = (scope = 'anonymous') => read(scope)?.timestamp;
