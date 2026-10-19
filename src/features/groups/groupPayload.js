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
  tradeAllowed: true,
  demo: false,
  accountType: '',
  lotDivisor: 0,
  routingMode: 'b_book',
  symbolsAllowed: [],
  symbolsBlocked: [],
  parentGroup: '',
  groupPurpose: '',
});

// Only these keys are ever sent to GroupCreate/GroupUpdate. Anything else that
// ends up in a form (e.g. server-echoed fields like createdAt/updatedAt/enabled
// when editing, or values injected via dev-tools) is stripped before submit.
// parentGroup/groupPurpose are the only creation-payload additions: no other
// new backend keys are introduced here.
export const GROUP_ALLOWED_FIELDS = Object.keys(GROUP_DEFAULT_PAYLOAD);

// Backend-canonical book_type values (groups.book_type, COALESCE 'b').
// The wizard shows B-Book/A-Book/Hybrid labels for routingMode; bookType sent
// to the backend must be one of these canonical values, never a display label.
export const ROUTING_TO_BOOK_TYPE = Object.freeze({
  a_book: 'a',
  b_book: 'b',
  hybrid: 'hybrid',
});

// Tenant-agnostic execution choices shown in the new-group wizard. They mirror
// the Admin Margin-tab precedent (market/instant) without hardcoding any
// tenant, broker, currency, or rate. A blank choice is omitted so backend
// tenant/environment/parent derivation applies; an explicit choice always wins.
export const EXECUTION_MODE_OPTIONS = Object.freeze([
  { value: 'market', label: 'Market execution' },
  { value: 'instant', label: 'Instant execution' },
]);

// Tenant-agnostic group-purpose choices. The backend defaults an omitted
// purpose to customer and refuses anything outside customer|coverage.
export const GROUP_PURPOSE_OPTIONS = Object.freeze([
  { value: 'customer', label: 'Customer' },
  { value: 'coverage', label: 'Coverage' },
]);

export const GROUP_PURPOSE_VALUES = Object.freeze(['customer', 'coverage']);

// Blank policy strings omitted on new-group create so omitted-field backend
// derivation (tenant defaults, then environment, then parent-group fallback)
// applies instead of storing an empty string. Numbers, booleans, and symbol
// lists are never omitted here: explicit zero/false/empty-list values are
// preserved by the caller.
const NEW_GROUP_OMIT_BLANK_KEYS = new Set([
  'description',
  'currency',
  'executionMode',
  'bookType',
  'accountType',
  'commissionType',
  'routingMode',
  'parentGroup',
  'groupPurpose',
]);

const isBlankString = (value) => typeof value === 'string' && value.trim() === '';

const normalizeRoutingToken = (value) =>
  String(value ?? '').trim().toLowerCase().replace(/[- ]+/g, '_');

/** Map a user-visible Book/routing choice to its backend-canonical bookType. */
export const bookTypeForRoutingMode = (mode) => {
  const token = normalizeRoutingToken(mode);
  if (!token) return '';
  if (token === 'a_book' || token === 'abook' || token === 'a') return 'a';
  if (token === 'b_book' || token === 'bbook' || token === 'b') return 'b';
  if (token === 'hybrid' || token === 'h') return 'hybrid';
  return '';
};

/** True for the canonical bookType values the backend stores. */
export const isCanonicalBookType = (value) => value === 'a' || value === 'b' || value === 'hybrid';

const normalizeBookTypeValue = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (isCanonicalBookType(text)) return text;
  const mapped = bookTypeForRoutingMode(text);
  return mapped || text;
};

export const pickGroupPayloadFields = (source, allowedKeys = GROUP_ALLOWED_FIELDS) =>
  allowedKeys.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});

/** Validate the new-group identity fields without any tenant-specific defaults. */
export const validateNewGroupFields = ({ name, parentGroup, groupPurpose } = {}) => {
  if (String(name ?? '').trim() === '') return 'Group Name is required.';
  const purpose = String(groupPurpose ?? '').trim();
  if (purpose !== '' && !GROUP_PURPOSE_VALUES.includes(purpose)) {
    return 'Purpose must be customer or coverage.';
  }
  const parent = String(parentGroup ?? '').trim();
  if (parent !== '' && parent.toLowerCase() === String(name ?? '').trim().toLowerCase()) {
    return 'Parent group must name another group.';
  }
  return null;
};

// Parent-group tradeAllowed default for the new-group wizard. The
// operator-typed parent name resolves against GroupList rows with an exact,
// case-insensitive (trimmed) match: near-misses never inherit. The record's
// boolean tradeAllowed wins when present (the API's known casings are
// accepted); anything else reports null so the caller keeps the global
// default. No tenant, broker, currency, symbol, rate, or group names here.
const normalizeParentKey = (value) => String(value ?? '').trim().toLowerCase();

const parentRecordOf = (groups, parentGroup) => {
  const target = normalizeParentKey(parentGroup);
  if (!target) return null;
  const rows = Array.isArray(groups) ? groups : [];
  return rows.find((entry) => {
    if (typeof entry === 'string') return normalizeParentKey(entry) === target;
    if (!entry || typeof entry !== 'object') return false;
    return ['name', 'Group', 'group', 'group_name'].some((key) => {
      const candidate = normalizeParentKey(entry[key]);
      return candidate !== '' && candidate === target;
    });
  }) ?? null;
};

/** Parent group's boolean tradeAllowed for an exact name match, else null. */
export const parentTradeAllowedOf = (groups, parentGroup) => {
  const match = parentRecordOf(groups, parentGroup);
  if (!match || typeof match !== 'object') return null;
  const value = match.tradeAllowed ?? match.TradeAllowed ?? match.trade_allowed;
  return typeof value === 'boolean' ? value : null;
};

/**
 * Value the new-group tradeAllowed checkbox should show.
 * - An explicit operator check/uncheck (tradeTouched) always wins.
 * - Otherwise the exact parent match's tradeAllowed wins when found.
 * - With no parent, no exact match, or no boolean on the record, the
 *   sensible global default true applies.
 */
export const resolveNewGroupTradeAllowed = ({ groups, parentGroup, tradeTouched = false, currentValue = true } = {}) => {
  if (tradeTouched) return Boolean(currentValue);
  return parentTradeAllowedOf(groups, parentGroup) ?? true;
};

/**
 * Build the POST /GroupCreate payload from wizard form data.
 * - Preserves every explicit operator value (non-blank strings, numbers
 *   including zero, booleans including false, symbol arrays).
 * - Omits blank policy strings so omitted-field backend derivation applies.
 * - Derives backend-canonical bookType from the visible routingMode choice.
 * - Omits a blank parentGroup/groupPurpose; validates purpose and self-parent.
 * - An untouched leverage (display default 100, never explicitly picked) is
 *   omitted so backend tenant/env/parent derivation (or its compiled
 *   fallback) governs; an explicit operator value (including a re-typed 100)
 *   is always sent. Follows the tradeTouched/parent-inheritance pattern:
 *   edit/duplicate sources count as touched, so callers pass
 *   leverageTouched explicitly and the flag itself is never a payload key.
 * - Never hardcodes a tenant/broker/currency: a blank currency is omitted and
 *   left for backend derivation.
 */
export const buildNewGroupPayload = (formData = {}, { leverageTouched = true } = {}) => {
  const payload = pickGroupPayloadFields(formData);
  if (!leverageTouched) delete payload.leverage;
  const routingText = String(payload.routingMode ?? '').trim();
  if (routingText !== '') {
    const canonical = bookTypeForRoutingMode(routingText);
    if (canonical) payload.bookType = canonical;
  }
  if (payload.bookType !== undefined) {
    const normalized = normalizeBookTypeValue(payload.bookType);
    if (normalized === '' || isBlankString(payload.bookType)) delete payload.bookType;
    else payload.bookType = normalized;
  }
  for (const key of NEW_GROUP_OMIT_BLANK_KEYS) {
    if (payload[key] !== undefined && isBlankString(payload[key])) delete payload[key];
  }
  if (payload.parentGroup !== undefined) {
    const parent = String(payload.parentGroup ?? '').trim();
    if (parent === '') delete payload.parentGroup;
    else payload.parentGroup = parent;
  }
  if (payload.groupPurpose !== undefined) {
    const purpose = String(payload.groupPurpose ?? '').trim();
    if (purpose === '') delete payload.groupPurpose;
    else payload.groupPurpose = purpose;
  }
  if (payload.tradeAllowed === undefined) payload.tradeAllowed = true;
  return payload;
};

// Existing groups accept partial updates. Keep untouched values out of the
// request so a stale dialog cannot overwrite changes made by another manager.
// New groups use the creation contract: explicit values preserved, blank
// policy strings omitted so backend derivation applies.
export const buildGroupSavePayload = (initial, current, { isNew = false, leverageTouched = true } = {}) => {
  if (isNew) return buildNewGroupPayload(current, { leverageTouched });
  const payload = pickGroupPayloadFields(current);
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) =>
    JSON.stringify(value) !== JSON.stringify(initial[key])
  ));
};

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
  if (originalName && Object.keys(payload).length === 0) {
    return { submitted: payload, accountsUpdated: 0, accountErrors: [], unchanged: true };
  }
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
