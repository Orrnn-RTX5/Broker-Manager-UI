// Group-create leverage gate (pure; no imports).
//
// The backend refuses a top-level group create without leverage instead of
// silently defaulting it, so the create form pre-fills the broker's default
// group leverage (groupDefaults.js) and requires a whole number inside the
// named bounds before submit. A blank or cleared value is never sent as 0. A
// create with a parent group keeps inheriting the parent's leverage while the
// operator leaves the field alone.
//
// Tenant-agnostic: bounds and messages only; no leverage default lives here.
export const GROUP_LEVERAGE_MIN = 1;
export const GROUP_LEVERAGE_MAX = 10000;

export const GROUP_LEVERAGE_RANGE_MESSAGE =
  `Enter a whole-number leverage from ${GROUP_LEVERAGE_MIN} to ${GROUP_LEVERAGE_MAX}.`;
export const GROUP_LEVERAGE_NO_DEFAULT_HINT = 'This broker has no default leverage; enter one.';

const inRange = (value) =>
  Number.isSafeInteger(value) && value >= GROUP_LEVERAGE_MIN && value <= GROUP_LEVERAGE_MAX;

/** Whole-number leverage inside the bounds as an integer, else null. */
export const parseGroupLeverage = (value) => {
  if (typeof value === 'number') return inRange(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return inRange(parsed) ? parsed : null;
};

export const isBlankLeverage = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/**
 * Leverage decision for a group create:
 * - `{ omit: true }` with a parent group when the operator left leverage
 *   untouched or cleared it (the parent's leverage governs);
 * - `{ leverage }` as an integer when the value is valid;
 * - `{ error }` otherwise. A top-level group is never omitted.
 */
export const resolveCreateLeverage = ({ leverage, parentGroup, leverageTouched = true } = {}) => {
  const hasParent = String(parentGroup ?? '').trim() !== '';
  if (hasParent && (!leverageTouched || isBlankLeverage(leverage))) return { omit: true };
  const parsed = parseGroupLeverage(leverage);
  return parsed === null ? { error: GROUP_LEVERAGE_RANGE_MESSAGE } : { leverage: parsed };
};
