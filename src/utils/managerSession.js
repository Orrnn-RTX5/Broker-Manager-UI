const firstPresent = (...values) => values.find((value) => (
  value !== undefined && value !== null && String(value).trim() !== ''
));

const titleCase = (value) => String(value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const normalizeManagerSession = (response = {}, claims = {}) => {
  const envelope = response && typeof response === 'object' ? response : {};
  const source = envelope.manager || envelope.user || envelope.account || envelope;
  const isAdmin = claims.isAdmin === true || source.is_admin === true || source.isAdmin === true;
  const login = firstPresent(
    source.login,
    source.manager_login,
    source.managerLogin,
    source.username,
    source.user,
    claims.login
  );
  const displayName = firstPresent(
    source.display_name,
    source.displayName,
    source.name,
    source.full_name,
    source.fullName,
    source.username,
    login,
    'Manager'
  );
  const rawRole = firstPresent(source.role, source.manager_role, isAdmin ? 'admin' : 'manager');
  const brokerId = firstPresent(source.broker_id, source.brokerId, claims.brokerId);
  const permissions = Array.isArray(source.permissions) ? source.permissions : [];
  const initial = String(displayName).trim().match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() || 'M';

  return {
    login: login === undefined ? null : String(login),
    displayName: String(displayName),
    role: titleCase(rawRole),
    brokerId: brokerId === undefined ? null : String(brokerId),
    permissions,
    isAdmin,
    initial,
  };
};

export default normalizeManagerSession;
