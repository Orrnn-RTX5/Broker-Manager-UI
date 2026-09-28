import { getSidebarAccountType } from '../../utils/sidebarAccountRows.js';
import { buildGroupMarginLevels, buildMarginAlerts } from '../terminal/terminalAlerts.js';

const unavailable = () => ({
  usedMarginTotal: null,
  marginCurrency: null,
  accountsWithMargin: null,
  marginAlertCount: null,
  marginCallCount: null,
  stopOutCount: null,
});

const readNumber = (account, keys) => {
  for (const key of keys) {
    const value = account[key];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const number = Number(String(value).replaceAll(',', ''));
    return Number.isFinite(number) ? number : null;
  }
  return null;
};

const hasNumber = (account, keys) => readNumber(account, keys) !== null;

const accountCurrency = (account) => {
  const value = account.currency ?? account.Currency ?? account.accountCurrency ?? account.AccountCurrency;
  return String(value ?? '').trim().toUpperCase() || null;
};

const hasExplicitThresholds = (account) => (
  hasNumber(account, ['marginCallLevel', 'MarginCallLevel', 'margin_call_level'])
  && hasNumber(account, ['stopOutLevel', 'StopOutLevel', 'stop_out_level'])
);

const groupName = (source) => String(source?.name ?? source?.Name ?? source?.group ?? source?.Group ?? '').trim().toLowerCase();
const accountGroupName = (account) => String(
  account?.group ?? account?.Group ?? account?.accountGroup ?? account?.AccountGroup ?? ''
).trim().toLowerCase();

const hasReliableLevel = (account) => {
  const level = readNumber(account, ['marginLevel', 'MarginLevel', 'margin_level']);
  const equity = readNumber(account, ['equity', 'Equity']);
  // A zero margin level is also used by lightweight rows as a missing-value
  // default. Equity distinguishes an actual zero from an omitted reading.
  return (level !== null && level !== 0) || equity !== null;
};

/**
 * Complete real-account snapshots support a used-margin total or an account
 * count. A currency total is withheld when currencies differ or are unknown.
 * Alert counts require enough live values and threshold data for every account
 * with margin; never interpret an incomplete account/group page as a zero.
 */
export const buildDashboardMarginMetrics = ({ accountsPage, groups = [], groupsComplete = false } = {}) => {
  const result = unavailable();
  const rows = accountsPage?.rows;
  if (!Array.isArray(rows) || accountsPage.hasMore !== false) return result;
  const total = accountsPage.total;
  if (total != null && (Number(total) !== rows.length || !Number.isFinite(Number(total)))) return result;
  if (rows.some((account) => !account || getSidebarAccountType(account) === null)) return result;

  const realAccounts = rows.filter((account) => getSidebarAccountType(account) === 'real');
  const marginRows = realAccounts.map((account) => ({
    account,
    margin: readNumber(account, ['margin', 'Margin']),
  }));
  if (marginRows.some(({ margin }) => margin === null || margin < 0)) return result;

  const carryingMargin = marginRows.filter(({ margin }) => margin > 0).map(({ account }) => account);
  result.accountsWithMargin = carryingMargin.length;

  const currencies = new Set(realAccounts.map(accountCurrency));
  if (realAccounts.length > 0 && currencies.size === 1 && !currencies.has(null)) {
    result.marginCurrency = [...currencies][0];
    result.usedMarginTotal = marginRows.reduce((sum, { margin }) => sum + margin, 0);
  }

  if (carryingMargin.length === 0) {
    result.marginAlertCount = 0;
    result.marginCallCount = 0;
    result.stopOutCount = 0;
    return result;
  }

  if (carryingMargin.some((account) => !hasReliableLevel(account))) return result;
  const hasCompleteGroups = groupsComplete && Array.isArray(groups);
  const knownGroups = new Set(hasCompleteGroups ? groups.map(groupName).filter(Boolean) : []);
  if (carryingMargin.some((account) => !hasExplicitThresholds(account) && !knownGroups.has(accountGroupName(account)))) return result;

  const groupLevels = hasCompleteGroups ? buildGroupMarginLevels(groups) : new Map();
  const alertRows = carryingMargin.map((account) => ({
    login: account.login ?? account.Login,
    Name: account.Name ?? account.name,
    group: accountGroupName(account),
    margin: readNumber(account, ['margin', 'Margin']),
    marginLevel: readNumber(account, ['marginLevel', 'MarginLevel', 'margin_level']),
    equity: readNumber(account, ['equity', 'Equity']),
    marginCallLevel: readNumber(account, ['marginCallLevel', 'MarginCallLevel', 'margin_call_level']),
    stopOutLevel: readNumber(account, ['stopOutLevel', 'StopOutLevel', 'stop_out_level']),
  }));
  const alerts = buildMarginAlerts(alertRows, groupLevels);
  result.marginAlertCount = alerts.length;
  result.marginCallCount = alerts.filter((alert) => alert.type === 'margin-call').length;
  result.stopOutCount = alerts.filter((alert) => alert.type === 'stop-out').length;
  return result;
};
