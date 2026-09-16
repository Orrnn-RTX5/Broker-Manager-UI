export const ANALYTICS_TRADING_ACCOUNTS_STORAGE_PREFIX = 'rtx5_trading_accounts_analytics_v2';
export const ANALYTICS_TRADING_ACCOUNTS_STORAGE_DEFAULT = 'rtx5_trading_accounts_analytics_v2_default';

export const DEFAULT_PREWARMED_ACCOUNTS = Object.freeze([
  {
    login: '1001',
    name: 'Demo Account',
    group: 'demo',
    country: 'India',
    leadCampaign: 'Direct',
    leadSource: 'Web',
    registration: '2026.09.15',
  },
  {
    login: '1002',
    name: 'Real Account',
    group: 'Real',
    country: 'India',
    leadCampaign: 'Direct',
    leadSource: 'Web',
    registration: '2026.09.16',
  },
]);

export const saveTradingAccountsAnalyticsCache = (scope, accounts) => {
  if (!Array.isArray(accounts) || accounts.length === 0) return;
  try {
    const payload = JSON.stringify({
      timestamp: Date.now(),
      accounts,
    });
    if (typeof localStorage !== 'undefined') {
      if (scope && scope !== 'anonymous') {
        localStorage.setItem(`${ANALYTICS_TRADING_ACCOUNTS_STORAGE_PREFIX}_${scope}`, payload);
      }
      localStorage.setItem(ANALYTICS_TRADING_ACCOUNTS_STORAGE_DEFAULT, payload);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(`${ANALYTICS_TRADING_ACCOUNTS_STORAGE_PREFIX}_${scope || 'default'}`, payload);
    }
  } catch {
    // Storage quota or private browsing
  }
};

export const loadTradingAccountsAnalyticsCache = (scope = 'anonymous', peekFn = null) => {
  try {
    if (typeof localStorage !== 'undefined' && scope && scope !== 'anonymous') {
      const raw = localStorage.getItem(`${ANALYTICS_TRADING_ACCOUNTS_STORAGE_PREFIX}_${scope}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.accounts) && parsed.accounts.length > 0) return parsed.accounts;
      }
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(ANALYTICS_TRADING_ACCOUNTS_STORAGE_DEFAULT);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.accounts) && parsed.accounts.length > 0) return parsed.accounts;
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(`${ANALYTICS_TRADING_ACCOUNTS_STORAGE_PREFIX}_${scope || 'default'}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.accounts) && parsed.accounts.length > 0) return parsed.accounts;
      }
    }
    if (typeof peekFn === 'function') {
      const peeked = peekFn();
      if (Array.isArray(peeked?.rows) && peeked.rows.length > 0) {
        return peeked.rows;
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return DEFAULT_PREWARMED_ACCOUNTS;
};

export const getTradingAccountsAnalyticsCacheTimestamp = (scope = 'anonymous') => {
  try {
    if (typeof localStorage !== 'undefined' && scope && scope !== 'anonymous') {
      const raw = localStorage.getItem(`${ANALYTICS_TRADING_ACCOUNTS_STORAGE_PREFIX}_${scope}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Number.isFinite(parsed?.timestamp)) return parsed.timestamp;
      }
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(ANALYTICS_TRADING_ACCOUNTS_STORAGE_DEFAULT);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Number.isFinite(parsed?.timestamp)) return parsed.timestamp;
      }
    }
  } catch {
    // Ignore
  }
  return undefined;
};
