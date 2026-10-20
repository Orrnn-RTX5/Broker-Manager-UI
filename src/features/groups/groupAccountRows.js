const pick = (account, keys) => {
  for (const key of keys) {
    const value = account?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
};

const money = (value) => {
  const number = Number(value);
  return value === '' || !Number.isFinite(number)
    ? ''
    : number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const sameGroupName = (left, right) =>
  String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();

export const GROUP_ACCOUNT_COLUMNS = [
  { key: 'login', label: 'Login' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'leverage', label: 'Leverage' },
  { key: 'balance', label: 'Balance', numeric: true },
  { key: 'equity', label: 'Equity', numeric: true },
];

export const readLeverageRatio = (settings) => {
  const raw = settings?.leverage ?? settings?.Leverage ?? settings?.defaultLeverage ?? settings?.default_leverage;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (text === '') return null;
    const ratio = text.match(/^1\s*:\s*(\d+(?:\.\d+)?)$/i);
    if (ratio) {
      const value = Number(ratio[1]);
      return Number.isFinite(value) && value > 0 ? value : null;
    }
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return null;
};

const groupLeverage = (settings) => readLeverageRatio(settings);

export const toGroupAccountRow = (account, groupSettings) => {
  const safe = account ?? {};
  const leverage = readLeverageRatio(safe) ?? groupLeverage(groupSettings);
  return {
    account,
    login: safe.login ?? '',
    name: safe.Name || '',
    email: pick(safe, ['email', 'Email', 'username', 'Username']),
    leverage: leverage === null ? '' : `1 : ${leverage}`,
    balance: money(pick(safe, ['balance', 'Balance'])),
    equity: money(pick(safe, ['equity', 'Equity'])),
  };
};

const accountGroupName = (account) => pick(account, ['group', 'Group', 'accountGroup', 'AccountGroup', 'group_name', 'GroupName']);

export const accountsInGroup = (accounts, groupName, groupSettings) =>
  (accounts || []).filter((account) => sameGroupName(accountGroupName(account), groupName)).map((account) => toGroupAccountRow(account, groupSettings));

/** Logins under each group name, for the navigator tree. */
export const accountsByGroupName = (accounts) => {
  const map = new Map();
  for (const account of accounts || []) {
    const key = String(accountGroupName(account) ?? '').trim().toLowerCase();
    const login = String(account?.login ?? '').trim();
    if (!key || !login) continue;
    const list = map.get(key) || [];
    list.push({ login, name: account.Name || account.name || '' });
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((left, right) => left.login.localeCompare(right.login, undefined, { numeric: true }));
  }
  return map;
};

/** Account fields that follow the group when a manager edits it. */
export const buildAccountPatchFromGroup = (payload, originalName) => {
  const patch = {};
  const nextName = String(payload?.name ?? '').trim();
  const previousName = String(originalName ?? '').trim();
  if (nextName && previousName && nextName !== previousName) patch.Group = nextName;
  const leverage = readLeverageRatio(payload);
  if (leverage) patch.Leverage = leverage;
  // Empty financial dropdowns are stored as 0. Sending that clears or rejects
  // the account update, so only a chosen level is copied onto the accounts.
  const marginCall = Number(payload?.marginCallLevel);
  if (Number.isFinite(marginCall) && marginCall > 0) patch.MarginCallLevel = marginCall;
  const stopOut = Number(payload?.stopOutLevel);
  if (Number.isFinite(stopOut) && stopOut > 0) patch.StopOutLevel = stopOut;
  return patch;
};

export const describeGroupSave = (saved, { created = false } = {}) => {
  if (created) return { title: 'Group created', message: 'The group was created.' };
  const count = Number(saved?.accountsUpdated ?? 0);
  const failed = Array.isArray(saved?.accountErrors) ? saved.accountErrors.length : 0;
  const noun = count === 1 ? 'account' : 'accounts';
  const message = failed
    ? `The group was updated. ${count} ${noun} now use the new settings. ${failed} could not be updated.`
    : `The group was updated. ${count} ${noun} now use the new settings.`;
  return { title: 'Group updated', message };
};

export const countAccountsByGroup = (accounts) => {
  const counts = new Map();
  for (const account of accounts || []) {
    const key = String(account?.group ?? '').trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
};
