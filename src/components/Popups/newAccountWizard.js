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

/** Uppercase ISO-style code, or '' when the value is not a plausible code. */
export const normalizeCurrencyCode = (value) => {
  const code = String(value ?? '').trim().toUpperCase();
  if (!code) return '';
  return CURRENCY_CODE_PATTERN.test(code) ? code : '';
};

/** Lowercase accounting mode, or '' unless it is exactly hedging/netting. */
export const normalizeAccountMode = (value) => {
  const mode = String(value ?? '').trim().toLowerCase();
  return mode === 'hedging' || mode === 'netting' ? mode : '';
};

/** Trimmed country name, or '' when the value is not a usable name. */
export const normalizeCountryName = (value) => String(value ?? '').trim();

export const isAccountMode = (value) => normalizeAccountMode(value) !== '';

/** Trimmed group path, or '' when nothing explicit was chosen. */
export const normalizeGroupName = (value) => String(value ?? '').trim();

const readFirst = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
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
  const record = group || (groups || []).find((entry) => entry && String(entry.name ?? '') === target);
  const raw = Number(readFirst(record, ['leverage', 'Leverage']));
  return Number.isInteger(raw) && raw >= LEVERAGE_MIN && raw <= LEVERAGE_MAX ? raw : null;
};

/** Group deposit currency as an uppercase code, or null when it has none. */
export const groupCurrencyOf = (groups, groupName) => {
  const target = normalizeGroupName(groupName);
  if (!target) return null;
  const group = (groups || []).find((entry) => entry && normalizeGroupName(entry.name) === target
    || normalizeGroupName(entry?.Group) === target
    || normalizeGroupName(entry?.group) === target);
  const record = group || (groups || []).find((entry) => entry && String(entry.name ?? '') === target);
  if (!record) return null;
  const code = normalizeCurrencyCode(readFirst(record, ['currency', 'Currency', 'deposit_currency', 'depositCurrency']));
  return code || null;
};

/**
 * Broker-configured default country as a trimmed name, or null when the
 * broker config carries none. Reads only the generic broker-record country
 * field (either case); no tenant, broker, or country literals live here.
 */
export const brokerCountryOf = (brokerInfo) => {
  if (!brokerInfo || typeof brokerInfo !== 'object') return null;
  const name = normalizeCountryName(readFirst(brokerInfo, ['country', 'Country']));
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
 * Values the wizard may inherit from the selected group. Only untouched
 * fields with a valid group value are returned, so an explicit operator edit
 * always wins and missing group data never clears the form.
 */
export const inheritGroupSettings = ({ groups, groupName, leverageTouched, currencyTouched }) => {
  const inherited = {};
  if (!normalizeGroupName(groupName)) return inherited;
  if (!leverageTouched) {
    const leverage = groupLeverageOf(groups, groupName);
    if (leverage !== null) inherited.Leverage = leverage;
  }
  if (!currencyTouched) {
    const currency = groupCurrencyOf(groups, groupName);
    if (currency !== null) inherited.Currency = currency;
  }
  return inherited;
};

/**
 * Canonical creation payload. Group is preserved exactly (trimmed) so the
 * submitted group always matches the visible selection; leverage, currency,
 * and accounting mode are normalized and validated. Currency and accounting
 * mode are immutable after creation, so they are required here and rejected
 * when absent or unknown. Throws a TypeError with a tenant-agnostic message.
 */
export const buildNewAccountPayload = (form = {}) => {
  const Group = normalizeGroupName(form.Group);
  if (!Group) throw new TypeError('Please select an account group.');

  const Leverage = Number(form.Leverage);
  if (!Number.isInteger(Leverage) || Leverage < LEVERAGE_MIN || Leverage > LEVERAGE_MAX) {
    throw new TypeError('Please select a valid leverage.');
  }

  const Currency = normalizeCurrencyCode(form.Currency);
  if (!Currency) throw new TypeError('Please select a currency.');

  const AccountMode = normalizeAccountMode(form.AccountMode);
  if (!AccountMode) throw new TypeError('Please select an accounting mode (hedging or netting).');

  const text = (value) => String(value ?? '').trim();

  return {
    master_pass: form.master_pass ?? '',
    investor_pass: form.investor_pass ?? '',
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
 * gate first (fail-closed), then the canonical payload builder. Netting can
 * never reach the wire through this function.
 */
export const buildSubmittableAccountPayload = (form = {}) => {
  if (!isCreatableAccountMode(form?.AccountMode)) {
    throw new TypeError('Netting accounts are not supported yet. Select hedging.');
  }
  return buildNewAccountPayload(form);
};
