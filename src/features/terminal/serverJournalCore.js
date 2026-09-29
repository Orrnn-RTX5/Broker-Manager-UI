// MetaTrader-style server journal for the operations terminal, backed by
// GET /api/v1/manager/journal. The backend decides visibility: admins see the
// whole broker, role managers their groups' accounts plus their own actions.
// Kept free of service imports so it stays testable under plain node.

export const SERVER_JOURNAL_COLUMNS = ['Time', 'Type', 'Source', 'Action', 'Login', 'Group', 'Message'];
export const SERVER_JOURNAL_PAGE = 200;

export const SERVER_JOURNAL_FILTERS = [
  { id: 'all', label: 'All events' },
  { id: 'errors', label: 'Errors', params: { severity: 'error' } },
  { id: 'warnings', label: 'Warnings', params: { severity: 'warning' } },
  { id: 'security', label: 'Security & logins', params: { category: 'SECURITY,AUTH' } },
  { id: 'trading', label: 'Trading', params: { category: 'TRADE' } },
  { id: 'accounts', label: 'Accounts & money', params: { category: 'ACCOUNT,FINANCE,PARTNER' } },
  { id: 'config', label: 'Configuration', params: { category: 'CONFIG' } },
  { id: 'staff', label: 'Staff & roles', params: { category: 'ADMIN' } },
  { id: 'system', label: 'Feed & system', params: { category: 'FEED,SYSTEM,NETWORK,API,NOTIFY' } },
];

export const buildServerJournalQuery = ({ filter = 'all', cursor = '', limit = SERVER_JOURNAL_PAGE } = {}) => {
  const preset = SERVER_JOURNAL_FILTERS.find((f) => f.id === filter)?.params || {};
  const params = new URLSearchParams({ limit: String(limit), ...preset });
  if (cursor) params.set('cursor', cursor);
  return params.toString();
};

const pad = (value, width = 2) => String(value).padStart(width, '0');

// Matches the trade journal's "YYYY.MM.DD HH:MM:SS" with milliseconds.
export const formatServerJournalTime = (ms) => {
  const date = new Date(Number(ms));
  if (!ms || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

export const severityClass = (severity) => (
  { warning: 'is-warn', error: 'is-error', critical: 'is-error' }[severity] || 'is-info'
);

export const describeServerJournalScope = (scope) => {
  if (!scope) return '';
  const system = scope.system ? ' + broker-wide events' : '';
  switch (scope.mode) {
    case 'unrestricted':
      return 'Journal · all broker events';
    case 'all_groups':
      return `Journal · all client groups + your actions${system}`;
    case 'groups':
      return `Journal · groups ${(scope.groups || []).join(', ')} + your actions${system}`;
    default:
      return `Journal · your own actions only${system}`;
  }
};

// A 403 means the manager has lost (or never had) journal access. Rows already
// on screen must go too, not stay visible under the error.
export const isServerJournalDenied = (error) => Number(error?.status) === 403;

// Changes whenever the manager's access changes (role edit, permission grant or
// revoke, admin flag). The manager session is polled every few seconds, so a new
// key makes the journal re-ask the server, which stays the authority.
export const serverJournalAccessKey = ({ isAdmin = false, role = '', permissions = [], revision = '' } = {}) => {
  const list = Array.isArray(permissions) ? [...permissions].map(String).sort() : [];
  return [isAdmin ? 'admin' : 'staff', role || '', revision || '', list.join(',')].join('|');
};

export const describeServerJournalError = (error) => {
  if (isServerJournalDenied(error)) return 'No journal access — ask an administrator for the "View Journal" permission';
  return `Journal unavailable — ${error?.message || 'request failed'}`;
};

const show = (value) => {
  if (value === undefined || value === null || value === '') return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

// One-line detail for the expanded row: who, from where, result, and field changes.
export const serverJournalDetail = (entry = {}) => {
  const parts = [
    entry.actor_id ? `By ${[entry.actor_type, entry.actor_id].filter(Boolean).join(' ')}` : '',
    entry.actor_ip ? `IP ${entry.actor_ip}` : '',
    entry.result ? `Result ${entry.result}${entry.error_code ? ` (${entry.error_code})` : ''}` : '',
    entry.target_type && entry.target_id !== undefined && entry.target_id !== null ? `Target ${entry.target_type} ${entry.target_id}` : '',
    entry.request_id ? `Request ${entry.request_id}` : '',
  ];
  const before = entry.before && typeof entry.before === 'object' ? entry.before : {};
  const after = entry.after && typeof entry.after === 'object' ? entry.after : {};
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .map((key) => `${key}: ${show(before[key]) || '—'} → ${show(after[key]) || '—'}`);
  if (changed.length) parts.push(`Changes ${changed.join('; ')}`);
  const text = parts.filter(Boolean).join(' · ');
  return text || 'No additional details.';
};

export const matchesServerJournalSearch = (entry = {}, needle = '') => {
  if (!needle) return true;
  return [
    formatServerJournalTime(entry.time), entry.severity, entry.source, entry.category, entry.action,
    entry.actor_id, entry.account_login, entry.group, entry.result, entry.message,
  ].join(' ').toLowerCase().includes(needle);
};

// Appends an older page without duplicating rows already on screen.
export const mergeServerJournalPages = (current = [], older = []) => {
  const seen = new Set(current.map((entry) => entry.id));
  return [...current, ...older.filter((entry) => !seen.has(entry.id))];
};
