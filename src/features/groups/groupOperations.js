import { fetchManagerApi } from '../../services/managerFetch.js';
import { getSessionClaims } from '../../services/authService.js';
import { getRuntimeConfigValue } from '../../config/backendTarget.js';
import { validSavedOperation } from './groupOperationState.js';

export const groupOperationsEnabled = () => {
  const { brokerId } = getSessionClaims();
  const brokers = getRuntimeConfigValue(['GROUP_OPERATIONS_BROKERS', 'VITE_GROUP_OPERATIONS_BROKERS'], '', { allowEmpty: true }).split(',').map(value => value.trim());
  return brokers.includes('*') || Boolean(brokerId && brokers.includes(String(brokerId)));
};
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
