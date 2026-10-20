// Friendly mapping for backend group-policy default errors (POST /GroupCreate).
//
// The backend refuses an omitted field with no tenant/environment/parent
// default as `GROUP_POLICY_DEFAULT_MISSING: <field> is omitted ...` and a
// tenant/env default that fails validation as `GROUP_POLICY_DEFAULT_INVALID:
// <field> ...` (see group_policy_defaults.go). Both codes arrive today as raw
// `err.message` text rendered verbatim by NewGroupModal, so this module maps
// them to per-field plain messages. Anything unrecognized passes through
// untouched. No tenant, broker, currency, symbol, or rate values here: every
// string is a global default-shape message.
import { GROUP_LEVERAGE_RANGE_MESSAGE } from './groupLeverage.js';

export const GROUP_POLICY_DEFAULT_MISSING = 'GROUP_POLICY_DEFAULT_MISSING';
export const GROUP_POLICY_DEFAULT_INVALID = 'GROUP_POLICY_DEFAULT_INVALID';
// An explicit leverage outside the allowed range (400 from GroupCreate).
export const GROUP_LEVERAGE_INVALID = 'GROUP_LEVERAGE_INVALID';

// Backend-covered policy fields (group_policy_defaults.go:20), plus leverage:
// a top-level create without leverage and no broker default answers
// `GROUP_POLICY_DEFAULT_MISSING: leverage is omitted ...`.
export const GROUP_POLICY_FIELDS = Object.freeze([
  'executionMode',
  'bookType',
  'marginCallLevel',
  'stopOutLevel',
  'tradeAllowed',
  'demo',
  'leverage',
]);

const FIELD_ALIASES = Object.freeze({
  executionMode: ['executionmode', 'execution_mode'],
  bookType: ['booktype', 'book_type'],
  marginCallLevel: ['margincalllevel', 'margin_call_level'],
  stopOutLevel: ['stopoutlevel', 'stop_out_level'],
  tradeAllowed: ['tradeallowed', 'trade_allowed'],
  demo: ['demo'],
  leverage: ['leverage'],
});

// Per-field plain message for a missing default: the operator must supply
// the value because the broker has no default to derive. Same sentence shape
// for every field.
const MISSING_MESSAGES = Object.freeze({
  executionMode: 'Choose an execution mode — this broker has no default.',
  bookType: 'Choose a book type — this broker has no default.',
  marginCallLevel: 'Enter a margin call level — this broker has no default.',
  stopOutLevel: 'Enter a stop out level — this broker has no default.',
  tradeAllowed: 'Choose whether trading is allowed — this broker has no default.',
  demo: 'Choose whether this is a demo group — this broker has no default.',
  leverage: 'Enter a leverage — this broker has no default.',
});

// Per-field plain message for an invalid default, naming the constraint the
// value must satisfy (length limits, positive finite numbers, stopOutLevel
// never exceeding marginCallLevel, booleans for the flags).
const INVALID_MESSAGES = Object.freeze({
  executionMode: 'Execution mode must be 1 to 20 characters.',
  bookType: 'Book type must be 1 to 10 characters.',
  marginCallLevel: 'Margin call level must be a positive finite number.',
  stopOutLevel:
    'Stop out level must be a positive finite number and must not exceed the margin call level.',
  tradeAllowed: 'Trade allowed must be true or false.',
  demo: 'Demo must be true or false.',
  leverage: GROUP_LEVERAGE_RANGE_MESSAGE,
});

const GENERIC_MISSING_MESSAGE =
  'A required group value is missing — this broker has no default. Fill in the highlighted field.';
const GENERIC_INVALID_MESSAGE =
  'A group value is invalid. Check the highlighted field and try again.';

/** Raw message text out of an Error, a plain string, or a response-data object. */
const rawTextOf = (input) => {
  if (typeof input === 'string') return input;
  if (input instanceof Error) return input.message;
  if (input && typeof input === 'object') {
    const candidate = input.error ?? input.message;
    if (typeof candidate === 'string') return candidate;
  }
  return '';
};

const codeOf = (input) => {
  if (input && typeof input === 'object' && !(input instanceof Error)) {
    const code = input.code;
    if (typeof code === 'string' && code) return code;
  }
  return '';
};

/**
 * Parse the policy field named in a server message. Matches camelCase and
 * snake_case spellings, case-insensitively; returns the first field named in
 * the text, or null when no covered field is named.
 */
export const parseGroupPolicyField = (message) => {
  const text = String(message ?? '').toLowerCase();
  if (!text) return null;
  let earliest = null;
  for (const field of GROUP_POLICY_FIELDS) {
    for (const alias of FIELD_ALIASES[field]) {
      const index = text.indexOf(alias);
      if (index !== -1 && (earliest === null || index < earliest.index)) {
        earliest = { field, index };
      }
    }
  }
  return earliest?.field ?? null;
};

const hasCode = (text, code) => text.includes(code);

const isLeverageInvalid = (text, code) => code === GROUP_LEVERAGE_INVALID || hasCode(text, GROUP_LEVERAGE_INVALID);

/**
 * Form field a recognized group-policy server error belongs to, or null when
 * the error is unrecognized or names no covered field. GROUP_LEVERAGE_INVALID
 * always belongs to leverage.
 */
export const groupPolicyErrorField = (input) => {
  const text = rawTextOf(input);
  const code = codeOf(input);
  if (isLeverageInvalid(text, code)) return 'leverage';
  const recognized =
    code === GROUP_POLICY_DEFAULT_MISSING || code === GROUP_POLICY_DEFAULT_INVALID ||
    hasCode(text, GROUP_POLICY_DEFAULT_MISSING) || hasCode(text, GROUP_POLICY_DEFAULT_INVALID);
  return recognized ? parseGroupPolicyField(text) : null;
};

/**
 * Map a group-policy server error to a per-field plain message.
 * - `GROUP_POLICY_DEFAULT_MISSING` → per-field "… this broker has no default."
 * - `GROUP_POLICY_DEFAULT_INVALID` → per-field message naming the constraint.
 * - `GROUP_LEVERAGE_INVALID` → the leverage range message.
 * - Unknown errors pass through untouched (the original message text).
 * Raw codes never appear in a mapped message: an unparseable field falls
 * back to a generic friendly message for a recognized code.
 */
export const mapGroupPolicyError = (input) => {
  const text = rawTextOf(input);
  if (!text) return text;
  const code = codeOf(input);
  if (isLeverageInvalid(text, code)) return INVALID_MESSAGES.leverage;
  const isMissing = code === GROUP_POLICY_DEFAULT_MISSING || hasCode(text, GROUP_POLICY_DEFAULT_MISSING);
  const isInvalid = code === GROUP_POLICY_DEFAULT_INVALID || hasCode(text, GROUP_POLICY_DEFAULT_INVALID);
  if (!isMissing && !isInvalid) return text;
  const field = parseGroupPolicyField(text);
  if (isMissing) return (field && MISSING_MESSAGES[field]) || GENERIC_MISSING_MESSAGE;
  return (field && INVALID_MESSAGES[field]) || GENERIC_INVALID_MESSAGE;
};
