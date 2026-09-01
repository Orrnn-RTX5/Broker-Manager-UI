import apiClient from './apiClient';
import ibApi from './ibApi';
import authService from './authService';
import { fetchManagerApi } from './managerFetch';
import { buildBrokerApiUrl } from '../config/endpoints';
import { normalizeOnlineUserRows } from '../utils/onlineUsers';
import { buildPagedEndpoint, normalizePagedResult, normalizePagedStreamResult, normalizePagedTextResult } from '../utils/pagination';

const SESSION_ERROR_MESSAGE = 'Session expired. Please log in again.';
const PAGED_RESPONSE_MAX_BYTES = 1_500_000;
const PAGED_RESPONSE_TOO_LARGE = 'Response is too large for a paged grid request';

const query = (params) => new URLSearchParams(
  Object.entries(params).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null) acc[key] = String(value);
    return acc;
  }, {})
).toString();

const arrayQuery = (key, values = []) => {
  const params = new URLSearchParams();
  values.forEach((value) => params.append(key, String(value)));
  return params.toString();
};

const readJson = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const getResponseMessage = (data, fallback) =>
  data?.error?.message ||
  data?.error ||
  data?.message ||
  data?.detail ||
  fallback;

const expireAndThrow = (reason) => {
  authService.expireSession(reason);
  throw new Error(SESSION_ERROR_MESSAGE);
};

const buildBrokerV2Url = (path, params = {}) => {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const baseUrl = buildBrokerApiUrl(`/api/v2/${normalizedPath}`);
  const browserOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost';
  const url = new URL(baseUrl, browserOrigin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return baseUrl.startsWith('/') ? `${url.pathname}${url.search}` : url.toString();
};

const getBrokerV2Json = async (path, params = {}) => {
  const url = buildBrokerV2Url(path, params);
  const prepareHeaders = () => {
    const sessionStatus = authService.getSessionStatus();
    if (!sessionStatus.authenticated) {
      expireAndThrow(sessionStatus.reason || 'session_invalid');
    }

    return {
      accept: 'application/json',
      Authorization: `Bearer ${sessionStatus.snapshot.token}`,
    };
  };

  let response = await fetch(url, { method: 'GET', headers: prepareHeaders() });
  if (response.status === 401) {
    const nextToken = await authService.refreshSession();
    if (!nextToken) expireAndThrow('token_rejected');
    response = await fetch(url, { method: 'GET', headers: prepareHeaders() });
  }

  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(getResponseMessage(data, `HTTP ${response.status}`));
    error.status = response.status;
    throw error;
  }
  return data;
};

const getRecords = (data, key) => {
  if (Array.isArray(data)) return data;
  const records = data?.[key] || data?.answer || data?.data || data?.records || [];
  return Array.isArray(records) ? records : [];
};

const getFirstRecord = (data) => {
  if (Array.isArray(data)) return data[0] || null;
  if (!data || typeof data !== 'object') return null;

  for (const key of ['answer', 'data', 'record', 'account', 'user']) {
    const value = data[key];
    if (Array.isArray(value)) return value[0] || null;
    if (value && typeof value === 'object') return value;
  }

  return data.login || data.Login ? data : null;
};

export const normalizeClientRow = (p = {}) => ({
  id: String(p.login || p.Login || ''),
  name: p.Name || p.name || [p.FirstName || p.firstName, p.LastName || p.lastName].filter(Boolean).join(' ') || '',
  city: p.City || p.city || '',
  type: p.Type || p.type || 'Individual',
  status: p.status || p.Status || 'Active',
  lead: p.Lead || p.lead || '',
  email: p.email || p.Email || '',
  phone: p.phone || p.Phone || '',
  country: p.Country || p.country || '',
  balance: p.balance !== undefined ? p.balance : (p.Balance !== undefined ? p.Balance : 0),
});

export const normalizeTradingAccountRow = (p = {}) => ({
  raw: p,
  login: String(p.login || p.Login || ''),
  name: p.Name || p.name || '',
  group: p.Group || p.group || '',
  country: p.Country || p.country || '',
  client: p.client || p.Client || '',
  balance: p.balance !== undefined ? p.balance : (p.Balance !== undefined ? p.Balance : 0),
  equity: p.equity !== undefined ? p.equity : (p.Equity !== undefined ? p.Equity : 0),
  profit: p.profit !== undefined ? p.profit : (p.Profit !== undefined ? p.Profit : 0),
  currency: p.Currency || p.currency || '',
  leverage: p.leverage || p.Leverage || 100,
  credit: p.credit || p.Credit || 0,
  status: p.status || p.Status || 'active',
  margin: p.margin || p.Margin || 0,
  marginFree: p.marginFree || p.MarginFree || 0,
  marginLevel: p.marginLevel || p.MarginLevel || 0,
  email: p.email || p.Email || '',
  phone: p.phone || p.Phone || p.PhoneNumber || p.phoneNumber || '',
  company: p.company || p.Company || '',
  firstName: p.firstName || p.FirstName || '',
  lastName: p.lastName || p.LastName || '',
  middleName: p.middleName || p.MiddleName || '',
  language: p.language || p.Language || p.lang || p.Lang || '',
  idNumber: p.idNumber || p.IDNumber || p.IdNumber || p.id_number || '',
  leadCampaign: p.leadCampaign || p.LeadCampaign || p.lead_campaign || '',
  leadSource: p.leadSource || p.LeadSource || p.lead_source || '',
  mqid: p.mqid || p.MQID || p.MetaQuotesID || p.metaQuotesId || '',
  state: p.state || p.State || p.province || p.Province || p.region || p.Region || '',
  city: p.city || p.City || '',
  zipCode: p.zipCode || p.ZipCode || p.zip || p.Zip || p.PostalCode || p.postalCode || '',
  address: p.address || p.Address || '',
  comment: p.comment || p.Comment || '',
});

export const normalizePositionRow = (p = {}) => {
  let type = 'unknown';
  if (typeof p.action === 'string') type = p.action.toLowerCase();
  else if (p.Action === 0 || p.action === 0) type = 'buy';
  else if (p.Action === 1 || p.action === 1) type = 'sell';

  let volume = p.lots !== undefined ? p.lots : (p.volumeExt !== undefined ? p.volumeExt : (p.Volume !== undefined ? p.Volume : 0));
  if (volume >= 100) volume = volume / 10000;

  return {
    position: p.positionTicket || p.Position || p.ticket || p.position || 0,
    login: String(p.login || p.Login || ''),
    name: p.accountName || p.AccountName || '',
    email: p.username || p.Username || '',
    group: p.accountGroup || p.AccountGroup || '',
    symbol: p.symbol || p.Symbol || '',
    type,
    volume,
    priceOpen: p.priceOpen || p.PriceOpen || p.Price || p.price || 0,
    priceCurrent: p.priceCurrent || p.PriceCurrent || 0,
    priceSl: p.priceSl || 0,
    priceTp: p.priceTp || 0,
    profit: p.profit || 0,
    comment: String(p.comment || p.Comment || ''),
    swap: p.storage || p.Storage || p.swap || p.Swap || 0,
    timeCreate: p.timeCreate || p.TimeCreate || 0,
    timeUpdate: p.timeUpdate || p.TimeUpdate || 0,
  };
};

export const normalizeOrderRow = (p = {}) => {
  let type = 'unknown';
  if (typeof p.type === 'string') type = p.type.toLowerCase();
  else if (p.type === 0) type = 'buy';
  else if (p.type === 1) type = 'sell';

  let volume = p.volume !== undefined ? p.volume : 0;
  if (volume >= 100) volume = volume / 10000;

  return {
    ticket: p.ticket || 0,
    login: String(p.login || ''),
    name: p.accountName || p.username || '',
    email: p.username || '',
    group: p.accountGroup || '',
    symbol: p.symbol || '',
    type,
    side: p.side || '',
    volume,
    priceOpen: p.priceOpen || 0,
    priceSl: p.priceSl || 0,
    priceTp: p.priceTp || 0,
    status: p.status || '',
    timeSetup: p.timeSetup || 0,
    timeDone: p.timeDone || 0,
    comment: String(p.comment || ''),
  };
};

export const normalizeDealRow = (p = {}) => ({
  ticket: p.ticket || 0,
  orderTicket: p.orderTicket || 0,
  login: String(p.login || ''),
  username: p.username || '',
  accountName: p.accountName || '',
  accountGroup: p.accountGroup || '',
  symbol: p.symbol || '',
  action: p.action || '',
  entry: p.entry || '',
  volume: p.volume !== undefined ? p.volume : 0,
  price: p.price || 0,
  profit: p.profit || 0,
  commission: p.commission || 0,
  swap: p.swap || 0,
  fee: p.fee || 0,
  time: p.time || 0,
  comment: String(p.comment || ''),
});

export const normalizeGroupRow = (item = {}) => (
  typeof item === 'string'
    ? { name: item, description: '' }
    : {
        ...item,
        name: item.name || item.Group || item.group || item.group_name || 'Unnamed',
        description: item.description || item.Description || item.Currency || '',
      }
);

const getPaged = async (endpoint, params, normalizeRow, preferredKeys, options = {}) => {
  const { stream = false, ...requestOptions } = options;
  const pagedEndpoint = buildPagedEndpoint(endpoint, params);

  // AccountDetailsMany and explicit lightweight callers use the streamed
  // parser. It can stop after the requested page instead of JSON-parsing a
  // large response that a manager endpoint may have returned in full.
  if (endpoint === '/AccountDetailsMany' || stream) {
    const response = await apiClient.getRaw(pagedEndpoint, requestOptions);
    return normalizePagedStreamResult(response, params, normalizeRow, preferredKeys, {
      ...requestOptions,
      serverPaged: true,
    });
  }

  try {
    const data = await apiClient.get(pagedEndpoint, {
      maxResponseBytes: PAGED_RESPONSE_MAX_BYTES,
      ...requestOptions,
    });
    return normalizePagedResult(data, params, normalizeRow, preferredKeys);
  } catch (error) {
    if (!String(error?.message || '').includes(PAGED_RESPONSE_TOO_LARGE)) throw error;
  }

  const text = await apiClient.getText(pagedEndpoint, requestOptions);
  return normalizePagedTextResult(text, params, normalizeRow, preferredKeys, requestOptions);
};

const isExactLoginSearch = (value) => /^\d+$/.test(String(value || '').trim());

const getSingleAccountSearchPage = async (params = {}, normalizeRow, options = {}) => {
  const search = String(params.search || '').trim();
  const offset = Number(params.offset || 0);
  if (!isExactLoginSearch(search)) return null;
  if (Number.isFinite(offset) && offset > 0) {
    return normalizePagedResult([], { ...params, offset }, normalizeRow);
  }

  try {
    const data = await apiClient.get(`/AccountDetails?${query({ login: search })}`, options);
    const record = getFirstRecord(data);
    return normalizePagedResult(record ? [record] : [], { ...params, limit: params.limit || 30, offset: 0 }, normalizeRow);
  } catch (error) {
    if (String(error?.message || '').includes('HTTP 404')) {
      return normalizePagedResult([], { ...params, limit: params.limit || 30, offset: 0 }, normalizeRow);
    }
    throw error;
  }
};

const normalizePositionHistoryRow = (p, index = 0) => {
  const side = String(p.side ?? p.action ?? '').toLowerCase();
  const cmd = Number(p.cmd ?? p.Cmd);
  const type = side.includes('sell') || cmd === 1 ? 'sell' : 'buy';

  return {
    order: p.order ?? p.close_deal ?? p.ticket ?? p.position ?? p.open_deal ?? index,
    login: p.account_login ?? p.login ?? p.Login ?? 0,
    symbol: p.symbol ?? p.Symbol ?? '',
    type,
    volume: p.volume_lots ?? p.lots ?? p.volume ?? p.Volume ?? 0,
    openTime: p.time_open ?? p.open_time ?? p.openTime ?? p.timeCreate ?? p.TimeCreate ?? 0,
    closeTime: p.time_close ?? p.close_time ?? p.closeTime ?? p.timeDone ?? p.TimeDone ?? 0,
    openPrice: p.price_open ?? p.open_price ?? p.openPrice ?? p.PriceOpen ?? 0,
    closePrice: p.price_close ?? p.close_price ?? p.closePrice ?? p.PriceClose ?? 0,
    sl: p.price_sl ?? p.sl ?? p.SL ?? 0,
    tp: p.price_tp ?? p.tp ?? p.TP ?? 0,
    profit: p.profit ?? p.Profit ?? 0,
    swap: p.swap ?? p.storage ?? p.Swap ?? p.Storage ?? 0,
    commission: p.commission ?? p.Commission ?? 0,
    comment: p.comment ?? p.Comment ?? '',
  };
};

const getOrderHistory = async (loginId) => {
  const params = new URLSearchParams({ login: String(loginId) });
  const response = await fetchManagerApi(`/OrderHistory?${params.toString()}`, {
    method: 'GET',
    legacyQueryToken: true,
  });
  const data = await readJson(response);

  if (!response.ok) {
    const error = new Error(getResponseMessage(data, `HTTP ${response.status}`));
    error.status = response.status;
    throw error;
  }

  return getRecords(data, 'answer').map(normalizePositionHistoryRow);
};

// ─── Online Users ──────────────────────────────────────────────────────────────
export const getOnlineUsers = async () => {
  const page = await getOnlineUsersPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getOnlineUsersPage = async (params = {}, options = {}) => {
  return getPaged('/OnlineUsers', params, (row) => normalizeOnlineUserRows([row])[0] || row, ['users'], options);
};

export const getAccountsOnline = async () => {
  const page = await getAccountsOnlinePage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getAccountsOnlinePage = async (params = {}, options = {}) => (
  getPaged('/AccountsOnline', params, (row) => row, ['accounts', 'users'], options)
);

// ─── Clients ───────────────────────────────────────────────────────────────────
export const getClients = async () => {
  const page = await getClientsPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getClientsPage = async (params = {}, options = {}) => {
  const singleAccountPage = await getSingleAccountSearchPage(params, normalizeClientRow, options);
  if (singleAccountPage) return singleAccountPage;
  return getPaged('/AccountDetailsMany', params, normalizeClientRow, ['accounts'], options);
};

// ─── Trading Accounts ──────────────────────────────────────────────────────────
export const getTradingAccounts = async () => {
  const page = await getTradingAccountsPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getTradingAccountsPage = async (params = {}, options = {}) => {
  const singleAccountPage = await getSingleAccountSearchPage(params, normalizeTradingAccountRow, options);
  if (singleAccountPage) return singleAccountPage;
  return getPaged('/AccountDetailsMany', params, normalizeTradingAccountRow, ['accounts'], options);
};

export const getPositions = async () => {
  const page = await getPositionsPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getPositionsPage = async (params = {}, options = {}) => (
  getPaged('/PositionsAll', params, normalizePositionRow, ['positions'], options)
);

export const getPositionHistory = async (loginId) => {
  if (!loginId) return [];

  try {
    return await getOrderHistory(loginId);
  } catch (error) {
    if (error.status && error.status !== 404) throw error;
  }

  try {
    const data = await getBrokerV2Json(`positions/${encodeURIComponent(loginId)}/history`, {
      limit: 500,
      offset: 0,
    });
    return getRecords(data, 'positions').map(normalizePositionHistoryRow);
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const data = await apiClient.get(`/PositionHistoryMT4Format?${arrayQuery('logins[]', [loginId])}`);
  return getRecords(data, 'answer').map(normalizePositionHistoryRow);
};

export const getOpenedOrders = async (login) => {
  if (!login) return [];
  const data = await apiClient.get(`/OpenedOrders?${arrayQuery('logins[]', [login])}`);
  const records = Array.isArray(data) ? data : data.answer || [];

  return records.map(p => ({
    ticket: p.ticket || 0,
    login: p.login || 0,
    symbol: p.symbol || '',
    side: p.side || '',
    volume: p.volume || 0,
    lots: p.lots || 0,
    openPrice: p.openPrice || 0,
    closePrice: p.closePrice || 0,
    openTime: p.openTime || 0,
    closeTime: p.closeTime || 0,
    profit: p.profit || 0,
    swap: p.swap || 0,
    commission: p.commission || 0,
    state: p.state || ''
  }));
};

// ─── Analytics ─────────────────────────────────────────────────────────────────
export const getTradingAccountsAnalytics = async () => {
  return apiClient.get('/AccountAnalytics');
};

export const getOpenOrders = async () => {
  const page = await getOrdersPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getOrders = async () => {
  const page = await getOrdersPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getOrdersPage = async (params = {}, options = {}) => (
  getPaged('/BrokerOrders', params, normalizeOrderRow, ['orders'], options)
);

export const getBrokerDeals = async () => {
  const page = await getBrokerDealsPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getBrokerDealsPage = async (params = {}, options = {}) => (
  getPaged('/BrokerDeals', params, normalizeDealRow, ['deals'], options)
);

export const getOpenPositions = async () => {
  const page = await getPositionsPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getDashboardSummary = async (options = {}) => {
  return apiClient.get('/DashboardSummary', options);
};

export const getAccountLimitStatus = async (options = {}) => {
  return apiClient.get('/AccountLimitStatus', options);
};

export const getGroupsPage = async (params = {}, options = {}) => {
  const response = await fetchManagerApi(buildPagedEndpoint('/GroupList', params), {
    headers: { accept: 'application/json' },
    ...options,
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(getResponseMessage(data, 'Failed to fetch groups'));
  return normalizePagedResult(data, params, normalizeGroupRow, ['groups']);
};

export const getActiveGroupsPage = async (params = {}, options = {}) => {
  const response = await fetchManagerApi(buildPagedEndpoint('/UserGroups', params), {
    method: 'GET',
    headers: { accept: 'application/json' },
    ...options,
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(getResponseMessage(data, 'Failed to fetch active groups'));
  return normalizePagedResult(data, params, normalizeGroupRow, ['groups']);
};

export const getAdvertisingCampaigns = async () => {
  return apiClient.get('/AdvertisingCampaigns');
};

// ─── IB Management ───────────────────────────────────────────────────────────
export const ibList = () => ibApi.list();
export const ibGet = (login) => ibApi.get(login);
export const ibCreate = (body) => ibApi.create(body);
export const ibUpdate = (params) => ibApi.update(params);
export const ibApprove = (login, notes) => ibApi.approve(login, notes);
export const ibReject = (login, notes) => ibApi.reject(login, notes);
export const ibSuspend = (login, notes) => ibApi.suspend(login, notes);
export const ibDelete = (login, force = false) => ibApi.remove(login, force);
export const ibLinkClient = (body) => ibApi.linkClient(body);
export const ibUnlinkClient = (body) => ibApi.unlinkClient(body && typeof body === 'object' ? body.client_login : body);
export const ibClientList = (login) => ibApi.directClients(login);
export const ibClientListAll = (login) => ibApi.allClients(login);
export const ibPlanCreate = (body) => ibApi.createPlan(body);
export const ibPlanUpdate = (body) => ibApi.updatePlan(body);
export const ibPlanEnable = (id) => ibApi.enablePlan(id);
export const ibPlanDisable = (id) => ibApi.disablePlan(id);
export const ibPlanDelete = (id) => ibApi.deletePlan(id);
export const ibPlanList = (login) => ibApi.listPlans(login);
export const ibCommissions = (params) => ibApi.commissions(params);
export const ibCommissionStatus = (commissionId, status) => ibApi.setCommissionStatus(commissionId, status);
export const ibPayoutRequest = (params) => ibApi.payoutRequest(params);
export const ibPayoutApprove = (params) => ibApi.payoutApprove(params);
export const ibPayoutReject = (params) => ibApi.payoutReject(params);
export const ibCommissionPay = () => {
  throw new Error('Legacy direct IB payout is disabled in the manager UI. Use the payout request workflow.');
};
export const ibStats = (params) => ibApi.stats(params);
export const ibTree = (login) => ibApi.tree(login);

// ─── Symbol Management ────────────────────────────────────────────────────────
export const symbolsList = () => apiClient.get('/SymbolsList');
export const symbolGet = (symbol) => apiClient.get(`/SymbolGet?${query({ symbol })}`);
export const symbolsParams = (symbols) => apiClient.get(`/SymbolsParams?${arrayQuery('symbols[]', symbols)}`);
export const symbolList = async () => {
  const names = await apiClient.get('/SymbolsList');
  if (!Array.isArray(names) || names.length === 0) return [];
  
  const params = arrayQuery('symbols[]', names);
  
  const [mt5Data, cats] = await Promise.all([
    apiClient.get(`/SymbolsParams?${params}`).catch(() => []),
    apiClient.get('/SymbolCategoryList').catch(() => [])
  ]);

  const metaMap = {};
  if (Array.isArray(cats)) {
    const metaPromises = cats.map(c => 
      apiClient.get(`/SymbolsByCategory?${query({ category: c.name })}`)
        .then(res => ({ category: c.name, symbols: res }))
        .catch(() => null)
    );
    const metaResults = await Promise.all(metaPromises);
    for (const res of metaResults) {
      if (res && Array.isArray(res.symbols)) {
        for (const s of res.symbols) {
          metaMap[s.symbol] = { ...s, category: res.category };
        }
      }
    }
  }

  if (!Array.isArray(mt5Data)) return [];
  
  return mt5Data.map(s => {
    const meta = metaMap[s.symbol] || {};
    return { ...s, ...meta };
  });
};
export const symbolAdd = (params) => apiClient.get(`/SymbolAdd?${new URLSearchParams(params).toString()}`);
export const symbolUpdate = (params) => apiClient.get(`/SymbolUpdate?${new URLSearchParams(params).toString()}`);
export const symbolEnable = (symbol) => apiClient.get(`/SymbolEnable?${query({ symbol })}`);
export const symbolDisable = (symbol) => apiClient.get(`/SymbolDisable?${query({ symbol })}`);
export const symbolClone = (body) => apiClient.post('/SymbolClone', body);
export const symbolsByCategory = (category) => apiClient.get(`/SymbolsByCategory?${query({ category })}`);

export const symbolCategoryList = () => apiClient.get('/SymbolCategoryList');
export const symbolCategoryCreate = (body) => apiClient.post('/SymbolCategoryCreate', body);
export const symbolCategoryUpdate = (body) => apiClient.post('/SymbolCategoryUpdate', body);
export const symbolCategoryDelete = (name) => apiClient.get(`/SymbolCategoryDelete?${query({ name })}`);

export const symbolMappingList = () => apiClient.get('/SymbolMappingList');
export const symbolMappingCreate = (body) => apiClient.post('/SymbolMappingCreate', body);

export const sessionOverrideList = (params) => apiClient.get(`/SessionOverrideList?${new URLSearchParams(params).toString()}`);
export const sessionOverrideSet = (params, body) => apiClient.post(`/SessionOverrideSet?${new URLSearchParams(params).toString()}`, body);
export const sessionOverrideDelete = (overrideId) => apiClient.get(`/SessionOverrideDelete?${query({ override_id: overrideId })}`);
export const symbolSessionGet = (symbol) => apiClient.get(`/SymbolSessionGet?${query({ symbol })}`);
export const symbolSessionSet = (body) => apiClient.post('/SymbolSessionSet', body);

export const dynamicLeverageList = (symbol) => apiClient.get(`/DynamicLeverageList?${query({ symbol })}`);
export const dynamicLeverageCreate = (body) => apiClient.post('/DynamicLeverageCreate', body);
export const dynamicLeverageDelete = (tierId) => apiClient.get(`/DynamicLeverageDelete?${query({ tier_id: tierId })}`);

export const commissionScheduleList = (symbol) => apiClient.get(`/CommissionScheduleList?${query({ symbol })}`);
export const commissionScheduleCreate = (body) => apiClient.post('/CommissionScheduleCreate', body);
export const commissionScheduleDelete = (scheduleId) => apiClient.get(`/CommissionScheduleDelete?${query({ schedule_id: scheduleId })}`);

export const swapFreeGroupList = () => apiClient.get('/SwapFreeGroupList');
export const swapFreeGroupSet = (body) => apiClient.post('/SwapFreeGroupSet', body);
export const swapFreeGroupDelete = (groupId) => apiClient.get(`/SwapFreeGroupDelete?${query({ group_id: groupId })}`);

export const marketDepthConfigGet = (symbol) => apiClient.get(`/MarketDepthConfigGet?${query({ symbol })}`);
export const marketDepthConfigSet = (body) => apiClient.post('/MarketDepthConfigSet', body);

export const symbolVisibilityList = () => apiClient.get('/SymbolVisibilityList');
export const symbolVisibilityGet = (params) => apiClient.get(`/SymbolVisibilityGet?${new URLSearchParams(params).toString()}`);
export const symbolVisibilitySet = (body) => apiClient.post('/SymbolVisibilitySet', body);

export default {
  getOnlineUsers,
  getOnlineUsersPage,
  getAccountsOnlinePage,
  getClients,
  getClientsPage,
  getTradingAccounts,
  getTradingAccountsPage,
  getPositions,
  getPositionsPage,
  getTradingAccountsAnalytics,
  getOpenOrders,
  getOrders,
  getOrdersPage,
  getBrokerDeals,
  getBrokerDealsPage,
  getOpenPositions,
  getDashboardSummary,
  getAccountLimitStatus,
  getGroupsPage,
  getActiveGroupsPage,
  getAdvertisingCampaigns,
};
