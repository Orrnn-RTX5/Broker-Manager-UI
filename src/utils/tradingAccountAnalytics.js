const cleanAccountValue = (value) => String(value ?? '').trim();
const registrationValue = (account = {}) => account.registration
  ?? account.raw?.Registration
  ?? account.raw?.registration
  ?? account.raw?.Registered
  ?? account.raw?.registered
  ?? null;

export const parseTradingAccountRegistration = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const calendar = raw.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (calendar) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = calendar;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
    return date.getTime();
  }

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const [, year, month, day] = compact;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
    return date.getTime();
  }

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const timestamp = Math.abs(numeric) < 100_000_000_000 ? numeric * 1000 : numeric;
    return Number.isNaN(new Date(timestamp).getTime()) ? null : timestamp;
  }

  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const dayBoundary = (value, end = false) => {
  const timestamp = parseTradingAccountRegistration(value);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  date.setHours(end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  return date.getTime();
};

const registrationDay = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
};

const stringCompare = (left, right) => {
  const l = left.toLowerCase();
  const r = right.toLowerCase();
  if (l < r) return -1;
  if (l > r) return 1;
  return left < right ? -1 : (left > right ? 1 : 0);
};

const sortedCounts = (counts) => [...counts.entries()]
  .map(([name, count]) => ({ name, count }))
  .sort((left, right) => right.count - left.count || stringCompare(left.name, right.name));

const uniqueValues = (accounts, key) => [...new Set(accounts.map((account) => cleanAccountValue(account?.[key])).filter(Boolean))]
  .sort(stringCompare);

export const buildTradingAccountFilterOptions = (accounts = []) => ({
  campaigns: uniqueValues(accounts, 'leadCampaign'),
  sources: uniqueValues(accounts, 'leadSource'),
  countries: uniqueValues(accounts, 'country'),
  groups: uniqueValues(accounts, 'group'),
});

export const buildTradingAccountReport = (accounts = [], filters = {}) => {
  const campaign = cleanAccountValue(filters.campaign);
  const source = cleanAccountValue(filters.source);
  const country = cleanAccountValue(filters.country);
  const group = cleanAccountValue(filters.group);
  const rangeStart = dayBoundary(filters.start);
  const rangeEnd = dayBoundary(filters.end, true);
  const registrations = new Map();
  const countries = new Map();
  const groups = new Map();
  let total = 0;

  for (const account of Array.isArray(accounts) ? accounts : []) {
    if (campaign && cleanAccountValue(account.leadCampaign) !== campaign) continue;
    if (source && cleanAccountValue(account.leadSource) !== source) continue;
    if (country && cleanAccountValue(account.country) !== country) continue;
    if (group && cleanAccountValue(account.group) !== group) continue;

    const registeredAt = parseTradingAccountRegistration(registrationValue(account));
    if ((rangeStart !== null || rangeEnd !== null) && registeredAt === null) continue;
    if (rangeStart !== null && registeredAt < rangeStart) continue;
    if (rangeEnd !== null && registeredAt > rangeEnd) continue;

    total += 1;
    const countryName = cleanAccountValue(account.country) || 'Unspecified';
    const groupName = cleanAccountValue(account.group) || 'Unspecified';
    countries.set(countryName, (countries.get(countryName) || 0) + 1);
    groups.set(groupName, (groups.get(groupName) || 0) + 1);
    if (registeredAt !== null) {
      const day = registrationDay(registeredAt);
      registrations.set(day, (registrations.get(day) || 0) + 1);
    }
  }

  return {
    total,
    registrations: [...registrations.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((left, right) => (left.date < right.date ? -1 : (left.date > right.date ? 1 : 0))),
    countries: sortedCounts(countries),
    groups: sortedCounts(groups),
  };
};
