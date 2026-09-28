// Margin alerts for the Operations Terminal Summary tab. An account raises an
// alert, as in the MT5 Manager, when it carries margin and its margin level
// (equity / margin, in percent) falls to its group's margin call or stop out
// level. Accounts or groups without explicit levels use the same defaults the
// Account details window shows (100% / 50%).

export const DEFAULT_MARGIN_CALL_LEVEL = 100;
export const DEFAULT_STOP_OUT_LEVEL = 50;

const readNumber = (source, keys) => {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
};

const readText = (source, keys) => {
  if (!source) return '';
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
};

const groupKey = (name) => String(name || '').trim().toLowerCase();

/** Map of lower-cased group name → { call, stop } for groups that define levels. */
export const buildGroupMarginLevels = (groups = []) => {
  const levels = new Map();
  groups.forEach((group) => {
    const name = readText(group, ['name', 'Name', 'group', 'Group']);
    if (!name) return;
    const call = readNumber(group, ['marginCallLevel', 'margin_call_level', 'margin_call', 'MarginCall']);
    const stop = readNumber(group, ['stopOutLevel', 'stop_out_level', 'stop_out', 'MarginStopOut']);
    if (call === undefined && stop === undefined) return;
    levels.set(groupKey(name), { call, stop });
  });
  return levels;
};

const accountMarginLevel = (account) => {
  const margin = readNumber(account, ['margin', 'Margin']);
  if (!(margin > 0)) return undefined;
  const level = readNumber(account, ['marginLevel', 'MarginLevel', 'margin_level']);
  const equity = readNumber(account, ['equity', 'Equity']);
  // Trading-account rows use zero when the server omits margin level. When
  // equity is available, calculate the live value instead of flagging zero.
  if (level !== undefined && (level !== 0 || !(equity > 0))) return level;
  return equity === undefined ? undefined : (equity / margin) * 100;
};

/**
 * Accounts at or below their margin call level, stop outs first and then the
 * lowest margin level. The account's configured `MarginCallLevel` is a
 * threshold; the live `MarginLevel` is read separately.
 */
export const buildMarginAlerts = (accounts = [], groupLevels = new Map()) => accounts
  .flatMap((account) => {
    const login = readText(account, ['login', 'Login']);
    const marginLevel = accountMarginLevel(account);
    if (!login || marginLevel === undefined) return [];

    const group = readText(account, ['group', 'Group']);
    const levels = groupLevels.get(groupKey(group)) || {};
    const call = readNumber(account, ['marginCallLevel', 'MarginCallLevel', 'margin_call_level']) ?? levels.call ?? DEFAULT_MARGIN_CALL_LEVEL;
    const stop = readNumber(account, ['stopOutLevel', 'StopOutLevel', 'stop_out_level']) ?? levels.stop ?? DEFAULT_STOP_OUT_LEVEL;
    if (marginLevel > call) return [];

    const isStopOut = marginLevel <= stop;
    return [{
      login,
      name: readText(account, ['Name', 'name']),
      group,
      type: isStopOut ? 'stop-out' : 'margin-call',
      label: isStopOut ? 'Stop out' : 'Margin call',
      marginLevel,
      threshold: isStopOut ? stop : call,
    }];
  })
  .sort((a, b) => (a.type === b.type ? a.marginLevel - b.marginLevel : a.type === 'stop-out' ? -1 : 1));
