import apiClient from './apiClient';
import { buildIbEndpoint, sanitizeIbPayload } from './ibApiPaths';

export { buildIbEndpoint, sanitizeIbPayload } from './ibApiPaths';

const get = (path, params = {}, options = {}) =>
  apiClient.get(buildIbEndpoint(path, params), options);

const postQuery = (path, params = {}, body, options = {}) =>
  apiClient.post(buildIbEndpoint(path, params), body === undefined ? undefined : sanitizeIbPayload(body), options);

const postBody = (path, body = {}, options = {}) =>
  apiClient.post(path, sanitizeIbPayload(body), options);

export const ibApi = {
  list: (options) => get('/IBList', {}, options),
  get: (login, options) => get('/IBGet', { login }, options),
  create: (body, options) => postBody('/IBCreate', body, options),
  update: (params, options) => postQuery('/IBUpdate', params, undefined, options),
  activate: (login, notes, options) => postQuery('/IBUpdate', { login, status: 'active', notes }, undefined, options),
  approve: (login, notes, options) => postQuery('/IBApprove', { login, notes }, undefined, options),
  reject: (login, notes, options) => postQuery('/IBReject', { login, notes }, undefined, options),
  suspend: (login, notes, options) => postQuery('/IBSuspend', { login, notes }, undefined, options),
  remove: (login, force = false, options) => postQuery('/IBDelete', { login, force }, undefined, options),
  tree: (login, options) => get('/IBTree', { login }, options),

  linkClient: ({ ib_login, client_login, source = 'manual' } = {}, options) =>
    postQuery('/IBLinkClient', { ib_login, client_login, source }, undefined, options),
  unlinkClient: (client_login, options) => postQuery('/IBUnlinkClient', { client_login }, undefined, options),
  directClients: (login, options) => get('/IBClientList', { login }, options),
  allClients: (login, options) => get('/IBClientListAll', { login }, options),

  createPlan: (body, options) => postBody('/IBPlanCreate', body, options),
  updatePlan: (body, options) => postBody('/IBPlanUpdate', body, options),
  enablePlan: (id, options) => postQuery('/IBPlanEnable', { id }, undefined, options),
  disablePlan: (id, options) => postQuery('/IBPlanDisable', { id }, undefined, options),
  deletePlan: (id, options) => postQuery('/IBPlanDelete', { id }, undefined, options),
  listPlans: (login, options) => get('/IBPlanList', { login }, options),

  commissions: (params, options) => get('/IBCommissions', params, options),
  setCommissionStatus: (commission_id, status, options) =>
    postQuery('/IBCommissionStatus', { commission_id, status }, undefined, options),

  payoutRequest: (params, options) => postQuery('/IBPayoutRequest', params, undefined, options),
  payoutApprove: (params, options) => postQuery('/IBPayoutApprove', params, undefined, options),
  payoutReject: (params, options) => postQuery('/IBPayoutReject', params, undefined, options),
  stats: (params, options) => get('/IBStats', params, options),
};

export default ibApi;
