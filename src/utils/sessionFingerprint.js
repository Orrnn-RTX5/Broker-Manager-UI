export const PERMISSION_SESSION_QUERY_ROOT = 'session-info';

const toPart = (value) => (value === undefined || value === null ? '' : String(value));

const fnv1a32 = (input, seed) => {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
};

export const buildPermissionSessionFingerprint = ({ token, login, brokerId } = {}) => {
  const parts = [toPart(token), toPart(login), toPart(brokerId)];
  if (!parts.some(Boolean)) return 'anonymous';

  const material = parts.join('\u001f');
  return `v1:${fnv1a32(material, 0x811c9dc5)}:${fnv1a32(material, 0x9e3779b9)}`;
};

export const getPermissionSessionQueryKey = (session) => [
  PERMISSION_SESSION_QUERY_ROOT,
  buildPermissionSessionFingerprint(session),
];

export default {
  PERMISSION_SESSION_QUERY_ROOT,
  buildPermissionSessionFingerprint,
  getPermissionSessionQueryKey,
};
