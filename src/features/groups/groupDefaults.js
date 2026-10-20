import { fetchManagerApi } from '../../services/managerFetch.js';
import { parseGroupLeverage } from './groupLeverage.js';

// Broker group-defaults read used to pre-fill the group-create leverage.
//
// GET /api/v1/manager/broker/group-defaults (manager session; the backend
// scopes it to the session broker, so no broker_id is sent) answers
// {"broker_id": "...", "group_default_leverage": <int 1..10000> | null}.
// Any miss (null, 403/404/503, bad JSON, network) is fail-closed to null: the
// form stays blank and the operator must enter a leverage.
export const GROUP_DEFAULTS_PATH = '/api/v1/manager/broker/group-defaults';

/** The broker's default group leverage as an integer, or null. Never throws. */
export const fetchBrokerDefaultLeverage = async () => {
  try {
    const response = await fetchManagerApi(GROUP_DEFAULTS_PATH, { method: 'GET' });
    if (!response?.ok) return null;
    const body = await response.json();
    const value = body?.group_default_leverage;
    return typeof value === 'number' ? parseGroupLeverage(value) : null;
  } catch {
    return null;
  }
};
