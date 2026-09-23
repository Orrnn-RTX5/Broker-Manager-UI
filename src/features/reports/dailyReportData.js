const SOURCE_FIELDS = ['leadSource', 'LeadSource', 'lead_source'];
const MAX_OBSERVATIONS = 2880;

export const utcReportDate = (time = Date.now()) => {
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Report time must be a valid date');
  return date.toISOString().slice(0, 10);
};

const isReportDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && utcReportDate(date) === value;
};

const finiteAmount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
};

// A daily amount is a snapshot for its own date and currency. It must not be
// distributed over earlier hours or summed with a different currency.
export const normalizeDailyCashSummary = (payload, date) => {
  if (!isReportDate(date)) throw new TypeError('Report date must be a valid YYYY-MM-DD UTC date');
  if (payload?.success === false || payload?.ok === false || payload?.error) return [];
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const currencies = new Map();
  for (const row of rows) {
    if (!row || !isReportDate(row.date) || row.date !== date) continue;
    const currency = typeof row.currency === 'string' ? row.currency.trim().toUpperCase() : '';
    if (!currency) continue;
    // Duplicate currency rows are ambiguous. Do not silently double-count or
    // choose an arbitrary row for a financial report.
    if (currencies.has(currency)) {
      currencies.set(currency, null);
      continue;
    }
    const depositsValue = finiteAmount(row.total_deposits);
    const withdrawalValue = finiteAmount(row.total_withdrawals);
    const deposits = depositsValue !== null && depositsValue >= 0 ? depositsValue : null;
    const withdrawals = withdrawalValue === null ? null : Math.abs(withdrawalValue);
    const netValue = deposits === null || withdrawals === null ? null : deposits - withdrawals;
    currencies.set(currency, {
      currency,
      deposits,
      withdrawals,
      netFlow: Number.isFinite(netValue) ? netValue : null,
    });
  }
  return [...currencies.values()].filter(Boolean).sort((left, right) => left.currency.localeCompare(right.currency));
};

export const buildAccountSources = (rows) => {
  const accounts = Array.isArray(rows) ? rows : [];
  const counts = new Map();
  let reported = 0;
  for (const account of accounts) {
    // Normalized accounts always contain leadSource: ''. Inspect the original
    // row when available so an omitted backend field is not treated as data.
    const raw = account?.raw && typeof account.raw === 'object' ? account.raw : account;
    const field = SOURCE_FIELDS.find((key) => Object.hasOwn(raw || {}, key));
    if (field !== undefined) reported += 1;
    const value = field === undefined ? '' : raw[field];
    const name = typeof value === 'string' ? value.trim() : '';
    counts.set(name || 'Unspecified', (counts.get(name || 'Unspecified') || 0) + 1);
  }
  const total = accounts.length;
  const missing = total - reported;
  const unavailableReason = total > 0 && reported === 0
    ? 'Account source information is not provided by this server.'
    : null;
  return {
    items: unavailableReason ? [] : [...counts].map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name)),
    total,
    unavailableReason,
    coverage: { reported, total, missing },
    coverageNote: reported > 0 && missing > 0
      ? `Source information is missing for ${missing} of ${total} accounts; these are shown as Unspecified.`
      : null,
  };
};

const throwIfAborted = (signal) => {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === 'function') signal.throwIfAborted();
  const error = new Error('Daily report request was cancelled');
  error.name = 'AbortError';
  throw error;
};

const incompleteAccounts = (detail) => new Error(`Complete account report is unavailable: ${detail}`);

// This deliberately never returns a sample. A failed page, overlapping page,
// changed total, or size cap cannot become a company-wide source percentage.
export const loadCompleteReportAccounts = async (fetchPage, {
  signal,
  maxAccounts = 10000,
  pageSize = 500,
} = {}) => {
  if (typeof fetchPage !== 'function') throw new TypeError('Account page loader is required');
  if (!Number.isSafeInteger(maxAccounts) || maxAccounts < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new TypeError('Account report limits must be positive integers');
  }
  const rows = [];
  const ids = new Set();
  let expectedTotal = null;
  while (true) {
    throwIfAborted(signal);
    const offset = rows.length;
    const limit = Math.min(pageSize, maxAccounts - offset);
    if (limit <= 0) throw incompleteAccounts(`the account catalogue exceeds the ${maxAccounts} account limit.`);
    const page = await fetchPage({ limit, offset, sort_by: 'login', sort_dir: 'asc' }, { signal });
    throwIfAborted(signal);
    if (!page || !Array.isArray(page.rows)) throw incompleteAccounts('the server did not return account rows.');
    if (page.rows.length > limit) throw incompleteAccounts('the server did not honor the requested page size.');
    if (page.offset != null && page.offset !== offset) throw incompleteAccounts('the server returned the wrong page.');
    const total = page.total ?? null;
    if (total !== null && (!Number.isSafeInteger(total) || total < 0)) {
      throw incompleteAccounts('the server returned an invalid account total.');
    }
    if (total !== null) {
      if (total > maxAccounts) throw incompleteAccounts(`the account catalogue exceeds the ${maxAccounts} account limit.`);
      if (expectedTotal !== null && expectedTotal !== total) throw incompleteAccounts('the account total changed during loading; refresh the report.');
      expectedTotal = total;
    }
    if (typeof page.hasMore !== 'boolean' && total === null) throw incompleteAccounts('the server did not confirm pagination completeness.');
    for (const row of page.rows) {
      const raw = row?.raw;
      const id = String(row?.login ?? row?.Login ?? raw?.login ?? raw?.Login ?? '').trim();
      if (!id) throw incompleteAccounts('an account has no login identifier.');
      if (ids.has(id)) throw incompleteAccounts('the server returned overlapping account pages.');
      ids.add(id);
      rows.push(row);
    }
    if (expectedTotal !== null && rows.length > expectedTotal) throw incompleteAccounts('the account rows exceed the reported total.');
    const hasMore = typeof page.hasMore === 'boolean' ? page.hasMore : rows.length < expectedTotal;
    if (!hasMore) {
      if (expectedTotal !== null && rows.length !== expectedTotal) throw incompleteAccounts('the server returned only part of the account catalogue.');
      return rows;
    }
    if (page.rows.length === 0) throw incompleteAccounts('account pagination stopped before completion.');
    if (expectedTotal !== null && rows.length >= expectedTotal) throw incompleteAccounts('the server returned conflicting pagination information.');
    if (page.nextOffset != null && page.nextOffset !== rows.length) throw incompleteAccounts('account pagination skipped or repeated rows.');
  }
};

const normalizeObservationValue = (value) => {
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return null;
  if (Array.isArray(value)) return value.map(normalizeObservationValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeObservationValue(entry)]));
  }
  return value;
};

export const appendDailyObservation = (history, observation) => {
  if (typeof observation?.timestamp !== 'number' || !Number.isFinite(observation.timestamp)) {
    throw new TypeError('A report observation requires a finite timestamp');
  }
  const byTimestamp = new Map();
  for (const point of Array.isArray(history) ? history : []) {
    if (typeof point?.timestamp === 'number' && Number.isFinite(point.timestamp)) byTimestamp.set(point.timestamp, point);
  }
  // Replace the complete observation at this instant. Missing values must not
  // inherit an older reading and appear to be a successful fresh observation.
  byTimestamp.set(observation.timestamp, normalizeObservationValue(observation));
  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp).slice(-MAX_OBSERVATIONS);
};
