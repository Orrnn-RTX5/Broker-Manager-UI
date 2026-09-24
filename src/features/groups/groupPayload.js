import { fetchManagerApi } from '../../services/managerFetch';

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

/** POST a group to /GroupCreate, or to /GroupUpdate when `originalName` names an existing group. */
export const submitGroup = async ({ originalName, payload }) => {
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
  return responseData;
};
