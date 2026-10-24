import { fetchManagerApi } from '../../services/managerFetch.js';
import { getSessionClaims } from '../../services/authService.js';
import { getRuntimeConfigValue } from '../../config/backendTarget.js';
import { validSavedOperation } from './groupOperationState.js';

export const GROUP_OPERATIONS_DISABLED_MESSAGE = 'Group operations are not enabled for this broker. Ask your platform administrator to enable them.';

// sessionValue is the manager auth/me `group_operations_enabled` field. A boolean
// is authoritative. While the session is still loading and the field is absent this
// returns null (unknown): callers show nothing and must not use the config list.
// Once loading has finished and the field is still absent, the runtime-config list below applies.
// Error path (decided): when auth/me errors, or there is no token (loading false, data undefined),
// the field stays absent and this falls back to the config list, as before. The server still
// enforces the gate on every group-operation request, so the fallback only affects the UI.
export const groupOperationsEnabled = (sessionValue, loading = false) => {
  if (typeof sessionValue === 'boolean') return sessionValue;
  if (loading) return null;
  // DEPRECATED: client-side broker allowlist, consulted only when the backend omits
  // group_operations_enabled. Remove once every deployed backend sends the field.
  const { brokerId } = getSessionClaims();
  const brokers = getRuntimeConfigValue(['GROUP_OPERATIONS_BROKERS', 'VITE_GROUP_OPERATIONS_BROKERS'], '', { allowEmpty: true }).split(',').map(value => value.trim());
  return brokers.includes('*') || Boolean(brokerId && brokers.includes(String(brokerId)));
};

// Only the entitlement refusal (403 GROUP_LIFECYCLE_NOT_ENTITLED) is mapped to the actionable
// message. 503 feature_disabled is the submit kill switch ("New group operations are disabled"),
// so its own backend message is shown unchanged.
export const groupOperationErrorMessage = (error) => (
  error?.status === 403 && error?.code === 'GROUP_LIFECYCLE_NOT_ENTITLED'
) ? GROUP_OPERATIONS_DISABLED_MESSAGE : error?.message;

export const operationStorageKey = () => {
  const { brokerId, login } = getSessionClaims();
  return `group-operation:${brokerId}:${login}`;
};
export function readSavedOperation() {
  try {
    const value = JSON.parse(localStorage.getItem(operationStorageKey()) || 'null');
    return validSavedOperation(value) ? value : null;
  } catch { return null; }
}
export function saveOperation(value) {
  try {
    if (value) localStorage.setItem(operationStorageKey(), JSON.stringify(value));
    else localStorage.removeItem(operationStorageKey());
  } catch { /* Server progress remains available by operation ID. */ }
}
export async function groupOperationRequest(path, body, signal) {
  const response = await fetchManagerApi(`/api/v1/manager/group-operations${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const blockers = Array.isArray(data.blockers) ? data.blockers.map(item => `${item.login ? `Account ${item.login}: ` : ''}${item.message}`).join('\n') : '';
    const error = new Error([data.message || `Group operation could not be completed (HTTP ${response.status})`, blockers].filter(Boolean).join('\n'));
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  const valid = path === '/preview'
    ? ['sources', 'accounts', 'blockers', 'destinations'].every(key => Array.isArray(data[key]))
    : typeof data.id === 'string' && data.id.length > 0 && (body !== undefined || ['queued', 'synchronizing', 'succeeded', 'failed'].includes(data.state));
  if (!valid) throw new Error('The server returned an invalid group operation response. Retry the request.');
  return data;
}
