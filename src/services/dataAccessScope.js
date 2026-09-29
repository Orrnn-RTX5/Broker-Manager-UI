import { getSessionClaims, getSessionScopeKey } from './authService.js';
import { buildPermissionSessionFingerprint } from '../utils/sessionFingerprint.js';

export const DATA_ACCESS_CHANGED = 'auth:data-access-changed';
// A fresh page must verify access before reusing another page's saved rows.
const pageEpoch = `${Date.now()}:${Math.random()}`;
let authorityIdentity = '';
let authorityFingerprint = '';

export const getDataAccessIdentity = () => {
  const { login, brokerId } = getSessionClaims();
  return buildPermissionSessionFingerprint({ token: getSessionScopeKey(), login, brokerId });
};

export const getDataAccessScope = () => {
  const identity = getDataAccessIdentity();
  return `${identity}:${pageEpoch}:${identity === authorityIdentity ? authorityFingerprint : ''}`;
};

export const assertDataAccessScope = (expected) => {
  if (expected !== getDataAccessScope()) {
    throw new DOMException('Account access changed; reload the data.', 'AbortError');
  }
};

export const updateDataAccessScope = (session, expectedIdentity = getDataAccessIdentity()) => {
  if (expectedIdentity !== getDataAccessIdentity()) return false;
  const fingerprint = String(session?.access_fingerprint || JSON.stringify({
    login: session?.login, broker: session?.broker_id, admin: session?.is_admin,
    permissions: session?.permissions, groups: session?.allowed_groups,
    mode: session?.group_access_mode, version: session?.authorization_version,
    ready: session?.operational_ready,
  }));
  if (authorityIdentity === expectedIdentity && authorityFingerprint === fingerprint) return false;
  authorityIdentity = expectedIdentity;
  authorityFingerprint = fingerprint;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    queueMicrotask(() => window.dispatchEvent(new CustomEvent(DATA_ACCESS_CHANGED)));
  }
  return true;
};
