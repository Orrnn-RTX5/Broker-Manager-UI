const asRows = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.answer)) return value.answer;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.rows)) return value.rows;
  return [];
};

export const toFiniteNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const parsed = Number(value.trim().replace(/[\s,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'admin';
};

export const normalizeOnlineUserRow = (row = {}) => ({
  ...row,
  login: String(row.login ?? row.Login ?? row.account ?? row.Account ?? row.accountLogin ?? row.AccountLogin ?? ''),
  name: row.name ?? row.Name ?? row.accountName ?? row.AccountName ?? row.username ?? row.Username ?? '',
  group: row.group ?? row.Group ?? row.accountGroup ?? row.AccountGroup ?? '',
  client: row.client ?? row.Client ?? row.clientName ?? row.ClientName ?? '',
  version: row.version ?? row.Version ?? row.build ?? row.Build ?? row.platformBuild ?? row.PlatformBuild ?? '',
  ip: row.ip ?? row.IP ?? row.Ip ?? row.ipAddress ?? row.IpAddress ?? row.IPAddress ?? '',
  equity: toFiniteNumber(row.equity ?? row.Equity),
  currency: row.currency ?? row.Currency ?? '',
  type: row.type ?? row.Type ?? row.deviceType ?? row.DeviceType ?? row.platform ?? row.Platform ?? '',
  country: row.country ?? row.Country ?? '',
  isAdmin: toBoolean(row.isAdmin ?? row.IsAdmin ?? row.admin ?? row.Admin ?? row.role ?? row.Role),
});

export const normalizeOnlineUserRows = (value) => asRows(value).map(normalizeOnlineUserRow);

export const buildOnlineUserMetrics = (rows = []) => {
  const normalizedRows = normalizeOnlineUserRows(rows);
  const groups = new Set(normalizedRows.map((row) => row.group).filter(Boolean));
  const totalEquity = normalizedRows.reduce((total, row) => total + toFiniteNumber(row.equity), 0);

  return {
    activeUsers: normalizedRows.length,
    adminSessions: normalizedRows.filter((row) => row.isAdmin).length,
    uniqueGroups: groups.size,
    totalEquity,
  };
};

// Online-user rows also list manager sessions (deviceType "manager"); they are not trading
// accounts, and asking for their account metrics makes the whole ticket batch fail (403).
export const liveAccountScope = (rows = []) => [...new Set(rows
  .filter((row) => row.login && row.deviceType !== 'manager' && ('equity' in row || 'balance' in row))
  .map((row) => String(row.login)))].sort().join(',');
