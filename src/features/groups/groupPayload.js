import { fetchManagerApi } from '../../services/managerFetch.js';
import { updateManagerAccount } from '../../services/managerAccountApi.js';
import { fetchAllSidebarAccounts } from '../../services/sidebarAccounts.js';
import { accountsInGroup, buildAccountPatchFromGroup, describeGroupSave, sameGroupName } from './groupAccountRows.js';

export { buildAccountPatchFromGroup, describeGroupSave };

export const GROUP_DEFAULT_PAYLOAD = Object.freeze({
  name: '',
  description: '',
  currency: '',
  leverage: 0,
  marginCallLevel: 0,
  stopOutLevel: 0,
  commissionRate: 0,
  commissionType: '',
  swapMultiplier: 0,
  spreadMarkup: 0,
  maxLotPerTrade: 0,
  maxTotalLots: 0,
  executionMode: '',
  bookType: '',
  negativeBalanceProtection: false,
  tradeAllowed: false,
  demo: false,
  accountType: '',
  lotDivisor: 0,
  routingMode: 'b_book',
  symbolsAllowed: [],
  symbolsBlocked: [],
});

// Only these keys are ever sent to GroupCreate/GroupUpdate. Anything else that
// ends up in a form (e.g. server-echoed fields like createdAt/updatedAt/enabled
// when editing, or values injected via dev-tools) is stripped before submit.
export const GROUP_ALLOWED_FIELDS = Object.keys(GROUP_DEFAULT_PAYLOAD);

export const pickGroupPayloadFields = (source, allowedKeys = GROUP_ALLOWED_FIELDS) =>
  allowedKeys.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});

export const toSymbolList = (value) => {
  if (Array.isArray(value)) return value.map((symbol) => String(symbol).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((symbol) => symbol.trim()).filter(Boolean);
  return [];
};

const accountGroupName = (account) => account?.group ?? account?.Group ?? account?.accountGroup ?? account?.AccountGroup;

const writeAccountCache = (queryClient, groupName, originalName, patch) => {
  if (!queryClient) return;
  queryClient.setQueriesData({ queryKey: ['sidebar-accounts'] }, (data) => {
    if (!data?.rows) return data;
    return {
      ...data,
      rows: data.rows.map((account) => {
        const name = accountGroupName(account);
        if (!sameGroupName(name, groupName) && !sameGroupName(name, originalName)) return account;
        return {
          ...account,
          ...(patch.Leverage ? { leverage: patch.Leverage, Leverage: patch.Leverage } : {}),
          ...(patch.MarginCallLevel ? { marginCallLevel: patch.MarginCallLevel, MarginCallLevel: patch.MarginCallLevel } : {}),
          ...(patch.StopOutLevel ? { stopOutLevel: patch.StopOutLevel, StopOutLevel: patch.StopOutLevel } : {}),
          ...(patch.Group ? { group: patch.Group, Group: patch.Group } : {}),
        };
      }),
    };
  });
};

/** Write the group's leverage, margin, and name onto every account in that group. */
export const applyGroupSettingsToAccounts = async (groupName, payload, originalName = groupName, queryClient) => {
  const patch = buildAccountPatchFromGroup(payload, originalName);
  if (Object.keys(patch).length === 0) return { accountsUpdated: 0, accountErrors: [] };
  const cachedRows = queryClient
    ? queryClient.getQueriesData({ queryKey: ['sidebar-accounts'] }).flatMap(([, data]) => data?.rows || [])
    : [];
  const page = cachedRows.length ? { rows: cachedRows } : await fetchAllSidebarAccounts({});
  const seen = new Set();
  const rows = accountsInGroup(page?.rows, groupName).filter((row) => {
    const login = String(row.login);
    if (seen.has(login)) return false;
    seen.add(login);
    return true;
  });
  const accountErrors = [];
  for (const row of rows) {
    try {
      await updateManagerAccount(row.login, patch);
    } catch (err) {
      accountErrors.push(`${row.login}: ${err.message}`);
    }
  }
  if (rows.length > accountErrors.length) writeAccountCache(queryClient, groupName, originalName, patch);
  return { accountsUpdated: rows.length - accountErrors.length, accountErrors };
};

/** POST a group to /GroupCreate, or to /GroupUpdate when `originalName` names an existing group. */
export const submitGroup = async ({ originalName, payload, queryClient }) => {
  const url = originalName
    ? `/GroupUpdate?${new URLSearchParams({ group: String(originalName) }).toString()}`
    : '/GroupCreate';
  const res = await fetchManagerApi(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const responseText = await res.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    throw new Error(responseText || 'Invalid JSON received from server');
  }
  if (!res.ok) throw new Error(responseData.error || responseData.message || (originalName ? 'Failed to update group' : 'Failed to create group'));
  if (!originalName) return { ...(responseData && typeof responseData === 'object' ? responseData : {}), submitted: payload };
  const saved = responseData && typeof responseData === 'object' ? responseData : {};
  try {
    const applied = await applyGroupSettingsToAccounts(originalName, payload, originalName, queryClient);
    return { ...saved, ...applied, submitted: payload };
  } catch (err) {
    return { ...saved, accountsUpdated: 0, accountErrors: [err.message], submitted: payload };
  }
};
