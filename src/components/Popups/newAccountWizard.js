// Pure, tenant-agnostic helpers for the Manager new-account wizard.
//
// The wizard inherits group defaults (leverage, currency) until the operator
// explicitly edits them, validates the immutable creation-only fields, and
// builds the canonical account payload. No broker, tenant, group, currency,
// or account values are hardcoded here; every default comes from the selected
// group record or from generic operator input.

export const ACCOUNT_MODES = Object.freeze(['hedging', 'netting']);

export const ACCOUNT_MODE_DEFAULT = 'hedging';

/**
 * The exact options the Account mode control renders. Netting is shown but
 * DISABLED: the RAM engine cannot open netting accounts, so hedging stays the
 * default and netting can never be picked through the UI.
 */
export const ACCOUNT_MODE_CREATE_OPTIONS = Object.freeze([
  { value: 'hedging', label: 'Hedging', disabled: false },
  { value: 'netting', label: 'Netting — not supported yet', disabled: true },
]);

/**
 * True only for modes the engine can open today: hedging alone. The submit
 * path checks this AND the control disables every other option, so the submit
 * payload can never carry netting even if component state is forced.
 */
export const isCreatableAccountMode = (value) => normalizeAccountMode(value) === 'hedging';

const CURRENCY_CODE_PATTERN = /^[A-Z0-9]{2,8}$/;

const LEVERAGE_MIN = 1;
const LEVERAGE_MAX = 10000;

/** Uppercase ISO-style code, or '' unless the value is a string with a plausible code.
 * Strict strings-only: non-strings are rejected, never String()-coerced, so
 * {currency:true} can never become 'TRUE' and {currency:123} can never
 * become '123'. */
export const normalizeCurrencyCode = (value) => {
  if (typeof value !== 'string') return '';
  const code = value.trim().toUpperCase();
  if (!code) return '';
  return CURRENCY_CODE_PATTERN.test(code) ? code : '';
};

/** Lowercase accounting mode, or '' unless the value is a string exactly hedging/netting.
 * Strict strings-only: booleans/numbers/objects are rejected, never coerced. */
export const normalizeAccountMode = (value) => {
  if (typeof value !== 'string') return '';
  const mode = value.trim().toLowerCase();
  return mode === 'hedging' || mode === 'netting' ? mode : '';
};

/** Trimmed country name, or '' unless the value is a string with a usable name.
 * Strict strings-only: {country:123/true} never becomes a default; non-strings yield ''. */
export const normalizeCountryName = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const isAccountMode = (value) => normalizeAccountMode(value) !== '';

/** Trimmed group path, or '' unless the value is a string with an explicit choice.
 * Strict strings-only: non-strings yield '' instead of being String()-coerced. */
export const normalizeGroupName = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

/** First non-empty string under any of the keys. Non-strings (booleans,
 * numbers, objects) are skipped, never coerced — so a `true` or `123` in an
 * early key falls through to the next string key instead of becoming text. */
const readFirstString = (record, keys) => {
  if (!record || typeof record !== 'object') return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
};

/** First leverage-shaped value under any of the keys: a finite safe-integer
 * number, or a clean integer string. Booleans/objects/arrays are skipped,
 * never Number()-coerced — so {leverage:true} can never become 1. Returns
 * the integer, or undefined when no key carries one. */
const readFirstLeverage = (record, keys) => {
  if (!record || typeof record !== 'object') return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number') {
      if (Number.isSafeInteger(value)) return value;
      continue;
    }
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text || !/^[+-]?\d+$/.test(text)) continue;
      const parsed = Number(text);
      if (Number.isSafeInteger(parsed)) return parsed;
    }
  }
  return undefined;
};

/** Group leverage as an integer ratio, or null when the group has none. */
export const groupLeverageOf = (groups, groupName) => {
  const target = normalizeGroupName(groupName);
  if (!target) return null;
  const group = (groups || []).find((entry) => entry && normalizeGroupName(entry.name) === target
    || normalizeGroupName(entry?.Group) === target
    || normalizeGroupName(entry?.group) === target);
  // Fall back to exact-name match for records that only carry `name`.
  const record = group || (groups || []).find((entry) => entry && entry.name === target);
  const raw = readFirstLeverage(record, ['leverage', 'Leverage']);
  return raw !== undefined && raw >= LEVERAGE_MIN && raw <= LEVERAGE_MAX ? raw : null;
};

/** Group deposit currency as an uppercase code, or null when it has none. */
export const groupCurrencyOf = (groups, groupName) => {
  const target = normalizeGroupName(groupName);
  if (!target) return null;
  const group = (groups || []).find((entry) => entry && normalizeGroupName(entry.name) === target
    || normalizeGroupName(entry?.Group) === target
    || normalizeGroupName(entry?.group) === target);
  const record = group || (groups || []).find((entry) => entry && entry.name === target);
  if (!record) return null;
  const code = normalizeCurrencyCode(readFirstString(record, ['currency', 'Currency', 'deposit_currency', 'depositCurrency']));
  return code || null;
};

/**
 * Broker-configured default country as a trimmed name, or null when the
 * broker config carries none. Reads only the generic broker-record country
 * field (either case); no tenant, broker, or country literals live here.
 */
export const brokerCountryOf = (brokerInfo) => {
  if (!brokerInfo || typeof brokerInfo !== 'object') return null;
  const name = normalizeCountryName(readFirstString(brokerInfo, ['country', 'Country']));
  return name || null;
};

/**
 * Default Country for the wizard. The broker config wins when it carries a
 * country; otherwise '' (fail-closed: no invented default is ever emitted).
 * A touched field keeps the operator's value, so re-resolution never
 * overwrites an explicit pick. Mirrors the backend account-create contract,
 * where Country is optional free text stored exactly as sent.
 */
export const resolveDefaultCountry = (brokerInfo, countryTouched) => {
  if (countryTouched) return '';
  return brokerCountryOf(brokerInfo) ?? '';
};

/**
 * Group to auto-fill when the wizard opens with no explicit choice.
 * Always null: the wizard never auto-fills (no first-row surprise). The modal
 * leaves Group empty until the operator explicitly picks a group, and submit
 * fails closed on empty. Kept as a named helper so the fail-closed contract
 * stays explicit and testable.
 */
export const resolveInitialGroup = () => null;

/**
 * Values the wizard may inherit from the selected group. Every UNTOUCHED
 * field always carries a key: the fresh group value, or '' when the newly
 * selected group has none. Spreading this result therefore CLEARS
 * previously-inherited (stale) leverage/currency on each group switch — the
 * old add-only shape left a stale EUR/1:200 behind when moving to a group
 * without that datum. TOUCHED fields are omitted entirely, so an explicit
 * operator pick is never cleared. An empty group name yields {} (no-op).
 */
export const inheritGroupSettings = ({ groups, groupName, leverageTouched, currencyTouched }) => {
  const inherited = {};
  if (!normalizeGroupName(groupName)) return inherited;
  if (!leverageTouched) {
    inherited.Leverage = groupLeverageOf(groups, groupName) ?? '';
  }
  if (!currencyTouched) {
    inherited.Currency = groupCurrencyOf(groups, groupName) ?? '';
  }
  return inherited;
};

/**
 * Literal Currency <select> fallback: the exact generic option set the modal
 * rendered before UI-3b. Used ONLY when the groups union below is empty (no
 * group reports a currency). Generic ISO-style codes, no tenant meaning.
 */
export const CURRENCY_FALLBACK_OPTIONS = Object.freeze([
  'USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY',
]);

const GROUP_CURRENCY_LIST_KEYS = ['currencies', 'currencyOptions', 'allowedCurrencies'];

const GROUP_CURRENCY_OBJECT_KEYS = ['code', 'value', 'name', 'label'];

const GROUP_CURRENCY_SINGLE_KEYS = ['currency', 'Currency', 'deposit_currency', 'depositCurrency'];

/**
 * Normalized currency codes from a backend list value. Strings pass through
 * normalizeCurrencyCode (trimmed/uppercased, pattern-checked);
 * {code,value,name,label} objects contribute the first usable string among
 * those keys (in that order); one nested array level contributes its string
 * elements. Numbers/booleans/null/deeper containers yield nothing — never
 * String()-coerced, so a `123` or `true` entry can never become an option. A
 * non-array value yields [] (fail-closed: never invent entries from a scalar).
 */
const currencyCodesFromList = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const pushEntry = (entry) => {
    if (typeof entry === 'string') {
      const code = normalizeCurrencyCode(entry);
      if (code) out.push(code);
      return;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      for (const key of GROUP_CURRENCY_OBJECT_KEYS) {
        const code = normalizeCurrencyCode(entry[key]);
        if (code) {
          out.push(code);
          break;
        }
      }
    }
  };
  for (const entry of raw) {
    if (Array.isArray(entry)) {
      for (const nested of entry) pushEntry(nested);
      continue;
    }
    pushEntry(entry);
  }
  return out;
};

/**
 * A single group record's allowed-currency list
 * (currencies/currencyOptions/allowedCurrencies — first non-nullish key wins,
 * mirroring the broker country-list concept), or [] when the record carries
 * none. Strict strings-only per branch convention (see currencyCodesFromList).
 */
export const groupCurrencyListOf = (groupRecord) => {
  if (!groupRecord || typeof groupRecord !== 'object' || Array.isArray(groupRecord)) return [];
  let raw;
  for (const key of GROUP_CURRENCY_LIST_KEYS) {
    if (groupRecord[key] !== undefined && groupRecord[key] !== null) {
      raw = groupRecord[key];
      break;
    }
  }
  return currencyCodesFromList(raw);
};

/**
 * Currency options for the wizard's Currency <select>: the UNION of the
 * groups' allowed/deposit currencies (each row's allowed-currency list plus
 * its single deposit currency via groupCurrencyOf's keys) — distinct values
 * in stable first-seen (row) order. Falls back to CURRENCY_FALLBACK_OPTIONS
 * ONLY when the union is empty. Never preselects: selection stays the
 * modal's job (resolveDefaultCurrency / inheritGroupSettings).
 */
export const currencyOptions = (groups = []) => {
  const seen = new Set();
  const out = [];
  const push = (code) => {
    if (!code || seen.has(code)) return;
    seen.add(code);
    out.push(code);
  };
  for (const entry of groups || []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    for (const code of groupCurrencyListOf(entry)) push(code);
    push(normalizeCurrencyCode(readFirstString(entry, GROUP_CURRENCY_SINGLE_KEYS)));
  }
  if (out.length === 0) return [...CURRENCY_FALLBACK_OPTIONS];
  return out;
};

/**
 * Initial Currency for the wizard. Binding product decision (UI-3b): NEVER
 * preselected — always '' in every case (no group, any group, touched or
 * not). The placeholder stays until the operator picks explicitly or group
 * inheritance (inheritGroupSettings) sets a value after an explicit group
 * pick. The argument is accepted (and ignored) so callers keep a single
 * explicit seam; nothing is ever derived from it.
 */
// eslint-disable-next-line no-unused-vars
export const resolveDefaultCurrency = ({ groups = [], groupName = '', currencyTouched = false } = {}) => '';

/**
 * Broker-configured country LIST as trimmed names, or [] when the broker
 * config carries none. Reads only the generic broker-list keys (countries,
 * countryOptions, allowedCountries — first non-nullish key wins, mirroring
 * the ds-16 country-list concept); a non-array value under the winning key
 * yields [] (fail-closed: never invent entries from a scalar).
 *
 * Strict strings-only per branch convention: string entries pass through
 * trimmed; {name,label,code,value} objects contribute the first non-blank
 * string among those keys (in that order); numbers/booleans/null/arrays and
 * objects without a usable string yield nothing — never String()-coerced, so
 * a `123` or `true` list entry can never become a suggestion.
 */
export const brokerCountryListOf = (brokerInfo) => {
  if (!brokerInfo || typeof brokerInfo !== 'object') return [];
  const raw = brokerInfo.countries ?? brokerInfo.countryOptions ?? brokerInfo.allowedCountries;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (name) out.push(name);
      continue;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      for (const key of ['name', 'label', 'code', 'value']) {
        const value = entry[key];
        if (typeof value === 'string' && value.trim()) {
          out.push(value.trim());
          break;
        }
      }
    }
  }
  return out;
};

/**
 * Sorted, de-duplicated country suggestions for the wizard's free-text
 * Country input: generic presets, plus broker-list entries (countries /
 * countryOptions / allowedCountries, string or {name,label,code,value}
 * object forms), plus the broker-configured single country when the broker
 * config carries one, plus the current field value so a seeded value stays
 * visible. Suggestions only — any free text (or empty) may be sent, per the
 * backend account-create contract where Country is optional free text.
 *
 * Design note: the list merge lives here in countrySuggestions (not in
 * brokerCountryOf) because brokerCountryOf resolves the SINGLE default
 * country (broker single wins else '' — unchanged), while this helper owns
 * the multi-value suggestion set the modal datalist renders.
 */
export const countrySuggestions = ({ presets = [], brokerInfo = null, current = '' } = {}) => {
  const seen = new Set();
  const out = [];
  const push = (value) => {
    if (typeof value !== 'string') return;
    const name = value.trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  };
  for (const preset of presets) push(preset);
  for (const entry of brokerCountryListOf(brokerInfo)) push(entry);
  push(brokerCountryOf(brokerInfo));
  push(current);
  return out.sort();
};

/**
 * Canonical creation payload. Group is preserved exactly (trimmed) so the
 * submitted group always matches the visible selection; leverage, currency,
 * and accounting mode are normalized and validated. Currency and accounting
 * mode are immutable after creation, so they are required here and rejected
 * when absent or unknown. Throws a TypeError with a tenant-agnostic message.
 *
 * Backend-requiredness mirror (manager AccountCreate handler, accounts.go —
 * verified read-only): the backend REQUIRES master_pass and Group
 * ("master_pass and Group are required") and allows investor_pass,
 * FirstName, LastName, Email, and Country empty. This builder therefore
 * throws fail-closed ONLY on empty master_pass and passes every other
 * identity/password field through exactly as sent — it never gates what the
 * backend allows empty. Password policy (8+ chars, letter+digit) and
 * master≠investor distinctness are enforced by the backend, never rewritten
 * here. Deliberate fail-closed divergences (stricter than the backend):
 * Leverage and Currency are required here although the backend would default
 * them (100/USD), and netting is refused although the backend would accept
 * it — the RAM engine cannot open netting accounts (global product
 * decision), so netting can never reach the wire through this builder.
 */
export const buildNewAccountPayload = (form = {}) => {
  const Group = normalizeGroupName(form.Group);
  if (!Group) throw new TypeError('Please select an account group.');

  const masterPass = form.master_pass;
  if (typeof masterPass !== 'string' || masterPass === '') {
    throw new TypeError('Please enter a master password.');
  }

  // Strict leverage: only numbers or numeric strings that resolve to a
  // finite safe integer in range are accepted. Booleans (and objects/arrays/
  // missing values) throw instead of being Number()-coerced — true must not
  // become 1. Numeric strings from <select> controls remain tolerated.
  const rawLeverage = form.Leverage;
  if (typeof rawLeverage !== 'number' && typeof rawLeverage !== 'string') {
    throw new TypeError('Please select a valid leverage.');
  }
  const Leverage = Number(rawLeverage);
  if (!Number.isSafeInteger(Leverage) || Leverage < LEVERAGE_MIN || Leverage > LEVERAGE_MAX) {
    throw new TypeError('Please select a valid leverage.');
  }

  const Currency = normalizeCurrencyCode(form.Currency);
  if (!Currency) throw new TypeError('Please select a currency.');

  const AccountMode = normalizeAccountMode(form.AccountMode);
  if (!AccountMode) throw new TypeError('Please select an accounting mode (hedging or netting).');
  // Engine constraint (global product decision, already enforced in the
  // submit wrapper + UI): the RAM engine has no netting, so the CANONICAL
  // builder refuses netting too instead of passing it through.
  if (AccountMode === 'netting') {
    throw new TypeError('Netting accounts are not supported yet. Select hedging.');
  }

  // Identity/country fields mirror the backend: optional free text, stored
  // exactly as sent. Strings pass through trimmed; missing values become '';
  // non-strings are never String()-coerced (no 'true'/'123' inventions).
  // Passwords pass through byte-exact (never trimmed): only the backend
  // policy judges them.
  const text = (value) => (typeof value === 'string' ? value.trim() : '');

  return {
    master_pass: masterPass,
    investor_pass: typeof form.investor_pass === 'string' ? form.investor_pass : '',
    Group,
    Leverage,
    FirstName: text(form.FirstName),
    LastName: text(form.LastName),
    Email: text(form.Email),
    Phone: text(form.Phone),
    Country: text(form.Country),
    Currency,
    AccountMode,
  };
};

/**
 * The exact submit path NewAccountModal.jsx calls: the engine-creatability
 * gate first (fail-closed), then the canonical payload builder — which
 * refuses netting itself (engine constraint), so netting can never reach the
 * wire through this function even if component state is forced.
 */
export const buildSubmittableAccountPayload = (form = {}) => {
  if (!isCreatableAccountMode(form?.AccountMode)) {
    throw new TypeError('Netting accounts are not supported yet. Select hedging.');
  }
  return buildNewAccountPayload(form);
};
