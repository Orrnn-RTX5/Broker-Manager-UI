import apiClient from './apiClient';
import { buildIbEndpoint, sanitizeIbPayload } from './ibApiPaths';
import { MANAGER_API } from '../config/managerApiContract.js';

export { buildIbEndpoint, sanitizeIbPayload } from './ibApiPaths';

const get = (path, params = {}, options = {}) =>
  apiClient.get(buildIbEndpoint(path, params), options);

const postBody = (path, body = {}, options = {}) =>
  apiClient.post(path, sanitizeIbPayload(body), options);

export const ibApi = {
  list: (options) => get('/IBList', {}, options),
  get: (login, options) => get('/IBGet', { login }, options),
  create: (body, options) => postBody('/IBCreate', body, options),
  update: (body, options) => postBody(MANAGER_API.ibUpdate, body, options),
  activate: (login, notes, options) => postBody(MANAGER_API.ibUpdate, { login, status: 'active', notes }, options),
  approve: (login, notes, options) => postBody(MANAGER_API.ibUpdate, { login, status: 'approved', notes }, options),
  reject: (login, notes, options) => postBody(MANAGER_API.ibUpdate, { login, status: 'rejected', notes }, options),
  suspend: (login, notes, options) => postBody(MANAGER_API.ibUpdate, { login, status: 'suspended', notes }, options),
  remove: (login, force = false, options) => {
    void force; // retained for call-site compatibility; the safe POST contract accepts login only
    return postBody(MANAGER_API.ibDelete, { login }, options);
  },
  tree: (_login, options) => get('/IBTree', {}, options),

  linkClient: ({ ib_login, client_login, source = 'manual' } = {}, options) =>
    postBody(MANAGER_API.ibLinkClient, { ib_login, client_login, source }, options),
  unlinkClient: (client_login, options) => postBody(MANAGER_API.ibUnlinkClient, { client_login }, options),
  directClients: (login, options) => get('/IBClientList', { login }, options),
  allClients: (login, options) => get('/IBClientListAll', { login }, options),

  createPlan: (body, options) => postBody('/IBPlanCreate', body, options),
  listPlans: (_login, options) => get('/IBPlanList', {}, options),

  commissions: (params, options) => get('/IBCommissions', params, options),
  payCommissions: (body, options) => postBody(MANAGER_API.ibCommissionPay, body, options),
  stats: (params, options) => get('/IBStats', params, options),
};

export default ibApi;
