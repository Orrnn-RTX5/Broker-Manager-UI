import { buildManagerAccountEndpoint, MANAGER_API } from '../config/managerApiContract.js';
import { fetchManagerApi } from './managerFetch.js';

const readAccountResponse = async (response) => {
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = text;
  }

  const semanticFailure = result && typeof result === 'object' &&
    (result.success === false || result.ok === false || result.error);
  if (!response.ok || semanticFailure) {
    const nestedError = result?.error && typeof result.error === 'object'
      ? result.error.message
      : result?.error;
    throw new Error(nestedError || result?.message || (typeof result === 'string' ? result : '') || `HTTP ${response.status}`);
  }
  return result;
};

const writeAccount = async (endpoint, method, payload) => {
  const response = await fetchManagerApi(endpoint, {
    method,
    headers: { accept: 'application/json', 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  return readAccountResponse(response);
};

export const createManagerAccount = (payload) =>
  writeAccount(MANAGER_API.accounts, 'POST', payload);

export const updateManagerAccount = (login, payload) =>
  writeAccount(buildManagerAccountEndpoint(login), 'PATCH', payload);

export const deleteManagerAccount = (login) =>
  writeAccount(buildManagerAccountEndpoint(login), 'DELETE');

export default { createManagerAccount, deleteManagerAccount, updateManagerAccount };
