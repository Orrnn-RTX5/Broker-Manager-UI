import apiClient from './apiClient';
import ibApi from './ibApi';
import authService from './authService';
import { fetchManagerApi } from './managerFetch';
import { buildBrokerApiUrl } from '../config/endpoints';
import { normalizeOnlineUserRows } from '../utils/onlineUsers';
import { buildPagedEndpoint, extractRows, normalizePagedResult, normalizePagedStreamResult, normalizePagedTextResult } from '../utils/pagination';
import { chunkSymbolNames } from '../utils/symbolParams';
import { createKeyedRequestCache } from './keyedRequestCache';
import { MANAGER_API } from '../config/managerApiContract.js';
import { requestReportsSummary } from './reportsSummary.js';

export { chunkSymbolNames, SYMBOL_PARAMS_BATCH_SIZE } from '../utils/symbolParams';

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
  else if (typeof p.side === 'string') type = p.side.toLowerCase();
  else if (typeof p.type === 'string') type = p.type.toLowerCase();
  else if (p.Action === 0 || p.action === 0 || p.cmd === 0 || p.Cmd === 0 || p.type === 0 || p.Type === 0) type = 'buy';
  else if (p.Action === 1 || p.action === 1 || p.cmd === 1 || p.Cmd === 1 || p.type === 1 || p.Type === 1) type = 'sell';

  if (type.includes('buy') || type.includes('deal_buy')) type = 'buy';
  else if (type.includes('sell') || type.includes('deal_sell')) type = 'sell';
  else if (type === 'unknown') type = 'buy';

  let volume = p.lots !== undefined ? p.lots : (p.volumeExt !== undefined ? p.volumeExt : (p.Volume !== undefined ? p.Volume : (p.volume !== undefined ? p.volume : 0)));
  if (volume >= 100) volume = volume / 10000;

  const reasonRaw = p.reason ?? p.Reason ?? p.reason_type ?? p.comment ?? p.Comment ?? '';
  let reason = 'Client';
  if (typeof reasonRaw === 'number') {
    const reasonMap = { 0: 'Client', 1: 'Expert', 2: 'Dealer', 3: 'Signal', 4: 'Gateway', 5: 'Mobile', 6: 'Web', 7: 'Auto' };
    reason = reasonMap[reasonRaw] || 'Client';
  } else if (String(reasonRaw).toLowerCase().includes('expert') || String(reasonRaw).toLowerCase().includes('ea')) {
    reason = 'Expert';
  } else if (String(reasonRaw).toLowerCase().includes('mobile') || String(reasonRaw).toLowerCase().includes('ios') || String(reasonRaw).toLowerCase().includes('android')) {
    reason = 'Mobile';
  } else if (String(reasonRaw).toLowerCase().includes('dealer')) {
    reason = 'Dealer';
  } else if (String(reasonRaw).toLowerCase().includes('web')) {
    reason = 'Web';
  } else if (reasonRaw) {
    reason = String(reasonRaw);
  }

  return {
    position: p.positionTicket || p.Position || p.ticket || p.Ticket || p.position || 0,
    login: String(p.login || p.Login || ''),
    name: p.accountName || p.AccountName || p.name || p.Name || '',
    email: p.username || p.Username || p.email || p.Email || '',
    group: p.accountGroup || p.AccountGroup || p.group || p.Group || '',
    symbol: p.symbol || p.Symbol || '',
    type,
    volume,
    reason,
    priceOpen: p.priceOpen || p.PriceOpen || p.openPrice || p.OpenPrice || p.Price || p.price || 0,
    priceCurrent: p.priceCurrent || p.PriceCurrent || p.closePrice || p.ClosePrice || 0,
    priceSl: p.priceSl || p.PriceSl || p.sl || p.SL || 0,
    priceTp: p.priceTp || p.PriceTp || p.tp || p.TP || 0,
    profit: p.profit !== undefined ? p.profit : (p.Profit !== undefined ? p.Profit : 0),
    comment: String(p.comment || p.Comment || ''),
    swap: p.storage || p.Storage || p.swap || p.Swap || 0,
    timeCreate: p.timeCreate || p.TimeCreate || p.openTime || p.OpenTime || 0,
    timeUpdate: p.timeUpdate || p.TimeUpdate || p.closeTime || p.CloseTime || 0,
  };
};

export const normalizeOrderRow = (p = {}) => {
  let type = 'unknown';
  if (typeof p.type === 'string') type = p.type.toLowerCase();
  else if (typeof p.side === 'string') type = p.side.toLowerCase();
  else if (p.type === 0 || p.cmd === 0) type = 'buy';
  else if (p.type === 1 || p.cmd === 1) type = 'sell';

  let volume = p.volume !== undefined ? p.volume : (p.lots !== undefined ? p.lots : 0);
  if (volume >= 100) volume = volume / 10000;

  return {
    ticket: p.ticket || p.position || 0,
    login: String(p.login || p.Login || ''),
    name: p.accountName || p.AccountName || p.username || '',
    email: p.username || p.email || '',
    group: p.accountGroup || p.AccountGroup || p.group || '',
    symbol: p.symbol || p.Symbol || '',
    type,
    side: p.side || '',
    volume,
    priceOpen: p.priceOpen || p.PriceOpen || p.openPrice || 0,
    priceSl: p.priceSl || p.sl || 0,
    priceTp: p.priceTp || p.tp || 0,
    status: p.status || '',
    timeSetup: p.timeSetup || p.timeCreate || 0,
    timeDone: p.timeDone || p.timeUpdate || 0,
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

const ACCOUNT_DETAILS_CACHE_KEY = 'rtx5_account_details_many_v3';
const ACCOUNT_DETAILS_CACHE_TTL_MS = 30_000;

let accountDetailsFirstPage = null;
let accountDetailsFirstPageAt = 0;
let accountDetailsFirstPagePromise = null;

const isDefaultAccountDetailsPage = (params = {}) => {
  const offset = Number(params.offset || 0);
  const search = String(params.search || '').trim();
  const filters = params.filters && typeof params.filters === 'object' ? params.filters : {};
  return offset === 0 && !search && Object.keys(filters).length === 0;
};

const readStoredAccountDetailsPage = () => {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(ACCOUNT_DETAILS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.rows) && parsed.rows.length > 0) return parsed;
  } catch {
    // Ignore storage parse errors
  }
  return null;
};

const writeStoredAccountDetailsPage = (page) => {
  if (!page?.rows?.length) return;
  try {
    sessionStorage.setItem(ACCOUNT_DETAILS_CACHE_KEY, JSON.stringify({
      rows: page.rows,
      total: page.total ?? null,
      hasMore: Boolean(page.hasMore),
      nextOffset: page.nextOffset ?? page.rows.length,
    }));
  } catch {
    // Storage full or private mode
  }
};

export const peekAccountDetailsManyPage = () => {
  if (accountDetailsFirstPage?.rows?.length) return accountDetailsFirstPage;
  return readStoredAccountDetailsPage();
};

const mapAccountDetailsPage = (page, normalizeRow) => {
  const rows = (page?.rows || []).map(normalizeRow);
  const offset = page?.offset ?? 0;
  const hasMore = Boolean(page?.hasMore);

  return {
    rows,
    total: page?.total ?? (!hasMore ? offset + rows.length : null),
    hasMore,
    nextOffset: page?.nextOffset ?? rows.length,
    limit: page?.limit,
    offset,
  };
};

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

const getAccountsOnlineSnapshot = async (params = {}, options = {}) => {
  const data = await apiClient.get(MANAGER_API.accountsOnline, options);
  const records = Array.isArray(data?.users) ? data.users : getRecords(data, 'accounts');
  const normalized = records.map((row) => normalizeOnlineUserRows([row])[0] || row);
  const search = String(params.search || '').trim().toLowerCase();
  const filtered = search
    ? normalized.filter((row) => [row.login, row.name, row.group, row.ip, row.country]
      .some((value) => String(value || '').toLowerCase().includes(search)))
    : normalized;
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.max(1, Number(params.limit) || 30);

  return {
    rows: filtered.slice(offset, offset + limit),
    total: filtered.length,
    hasMore: offset + limit < filtered.length,
  };
};

export const getOnlineUsersPage = async (params = {}, options = {}) => {
  return getAccountsOnlineSnapshot(params, options);
};

export const getAccountsOnline = async () => {
  const page = await getAccountsOnlinePage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getAccountsOnlinePage = async (params = {}, options = {}) => (
  getAccountsOnlineSnapshot(params, options)
);

// ─── Clients ───────────────────────────────────────────────────────────────────
export const getClients = async () => {
  const page = await getClientsPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getAccountDetailsManyPage = async (params = {}, options = {}) => {
  if (!isDefaultAccountDetailsPage(params)) {
    return getPaged('/AccountDetailsMany', params, (row) => row, ['accounts'], options);
  }

  if (
    accountDetailsFirstPage?.rows?.length
    && Date.now() - accountDetailsFirstPageAt < ACCOUNT_DETAILS_CACHE_TTL_MS
  ) {
    return accountDetailsFirstPage;
  }
  if (accountDetailsFirstPagePromise) return accountDetailsFirstPagePromise;

  accountDetailsFirstPagePromise = getPaged(
    '/AccountDetailsMany',
    { ...params, limit: params.limit || 30, offset: 0 },
    (row) => row,
    ['accounts'],
    options,
  ).then((page) => {
    if (page?.rows?.length) {
      accountDetailsFirstPage = page;
      accountDetailsFirstPageAt = Date.now();
      writeStoredAccountDetailsPage(page);
    }
    return page;
  }).finally(() => {
    accountDetailsFirstPagePromise = null;
  });

  return accountDetailsFirstPagePromise;
};

export const getClientsPage = async (params = {}, options = {}) => {
  const singleAccountPage = await getSingleAccountSearchPage(params, normalizeClientRow, options);
  if (singleAccountPage) return singleAccountPage;
  const page = await getAccountDetailsManyPage(params, options);
  return mapAccountDetailsPage(page, normalizeClientRow);
};

// ─── Trading Accounts ──────────────────────────────────────────────────────────
export const getTradingAccounts = async () => {
  const page = await getTradingAccountsPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getTradingAccountsPage = async (params = {}, options = {}) => {
  const singleAccountPage = await getSingleAccountSearchPage(params, normalizeTradingAccountRow, options);
  if (singleAccountPage) return singleAccountPage;
  const page = await getAccountDetailsManyPage(params, options);
  return mapAccountDetailsPage(page, normalizeTradingAccountRow);
};

let cachedPositionsDataset = null;
let cachedPositionsDatasetTime = 0;
let pendingPositionsDatasetPromise = null;
let positionsCacheGeneration = 0;
const POSITIONS_CACHE_TTL_MS = 20_000;
const ACCOUNT_POSITIONS_CACHE_TTL_MS = 5_000;
const ACCOUNT_POSITIONS_PRIORITY_WAIT_MS = 1_000;
const ACCOUNT_POSITIONS_PAINT_GRACE_MS = 150;
const ACCOUNT_POSITIONS_INITIAL_LIMIT = 30;

const buildAccountPositionsEndpoint = (logins, { offset = 0 } = {}) => {
  const params = new URLSearchParams(arrayQuery('logins[]', logins));
  params.set('limit', String(ACCOUNT_POSITIONS_INITIAL_LIMIT));
  params.set('offset', String(offset));
  return `/Positions?${params.toString()}`;
};

const getFreshPositionsDataset = () => (
  Array.isArray(cachedPositionsDataset)
  && Date.now() - cachedPositionsDatasetTime < POSITIONS_CACHE_TTL_MS
    ? cachedPositionsDataset
    : null
);

const selectAccountPositions = (records, login) => records
  .map(normalizePositionRow)
  .filter((position) => String(position.login) === String(login));

const activeAccountPositionRequests = new Set();
let accountPositionsSessionGeneration = 0;
const accountPositionsGenerations = new Map();
const accountPositionsContinuationOffsets = new Map();
const pendingAccountPositionsContinuations = new Map();

const getAccountPositionsGeneration = (login) => {
  const key = String(login ?? '').trim();
  return {
    session: accountPositionsSessionGeneration,
    account: accountPositionsGenerations.get(key) || 0,
  };
};

const accountPositionsGenerationMatches = (login, generation) => {
  const key = String(login ?? '').trim();
  return accountPositionsSessionGeneration === generation.session
    && (accountPositionsGenerations.get(key) || 0) === generation.account;
};

const bumpAccountPositionsGeneration = (login) => {
  const key = String(login ?? '').trim();
  if (key) {
    accountPositionsGenerations.set(key, (accountPositionsGenerations.get(key) || 0) + 1);
  } else {
    accountPositionsSessionGeneration += 1;
    accountPositionsGenerations.clear();
  }
};

const waitForAccountPositionRequests = async () => {
  if (activeAccountPositionRequests.size === 0) return false;
  const activeRequests = [...activeAccountPositionRequests];
  await new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, ACCOUNT_POSITIONS_PRIORITY_WAIT_MS);
    Promise.allSettled(activeRequests).then(() => {
      clearTimeout(timeoutId);
      resolve();
    });
  });
  return true;
};

const accountPositionsRequests = createKeyedRequestCache({
  ttlMs: ACCOUNT_POSITIONS_CACHE_TTL_MS,
  load: async (login, options = {}) => {
    // PositionsAll ignores its login filter and can take several seconds. The
    // account-scoped endpoint applies logins[] server-side and returns only the
    // requested account's positions.
    const accountRequestGeneration = getAccountPositionsGeneration(login);
    const request = apiClient.get(buildAccountPositionsEndpoint([login]), options);
    activeAccountPositionRequests.add(request);
    try {
      const data = await request;
      const records = getRecords(data, 'positions');
      const positions = selectAccountPositions(records, login);
      if (accountPositionsGenerationMatches(login, accountRequestGeneration)) {
        if (records.length === ACCOUNT_POSITIONS_INITIAL_LIMIT) {
          accountPositionsContinuationOffsets.set(String(login), { offset: records.length });
        } else {
          accountPositionsContinuationOffsets.delete(String(login));
        }
      }
      return positions;
    } finally {
      activeAccountPositionRequests.delete(request);
    }
  },
});

export const getAccountPositions = (login, options = {}) => accountPositionsRequests.get(login, options);
export const preloadAccountPositions = (login) => getAccountPositions(login).catch(() => undefined);
export const preloadAccountPositionsBatch = (logins = []) => {
  const normalizedLogins = [...new Set(
    logins.map((login) => String(login ?? '').trim()).filter(Boolean),
  )];
  if (normalizedLogins.length === 0) return Promise.resolve([]);

  const unresolvedLogins = normalizedLogins.filter((login) => (
    accountPositionsRequests.peek(login) === undefined
    && !accountPositionsRequests.hasPending(login)
  ));

  if (unresolvedLogins.length > 0) {
    // The broker handles one repeated-key request substantially faster than a
    // cold single-login request. Register every per-login projection before
    // paint so pointer-down/modal readers share this exact in-flight request.
    const requestSessionGeneration = accountPositionsSessionGeneration;
    const requestGenerations = new Map(
      unresolvedLogins.map((login) => [login, getAccountPositionsGeneration(login)]),
    );
    const recordsRequest = (async () => {
      if (accountPositionsSessionGeneration !== requestSessionGeneration) {
        throw new Error('Account positions batch was invalidated before it started.');
      }
      const request = apiClient.get(buildAccountPositionsEndpoint(unresolvedLogins));
      activeAccountPositionRequests.add(request);
      try {
        const data = await request;
        return getRecords(data, 'positions');
      } finally {
        activeAccountPositionRequests.delete(request);
      }
    })();

    unresolvedLogins.forEach((login) => {
      accountPositionsRequests.adopt(
        login,
        recordsRequest.then((records) => {
          // A full multi-login page can be truncated at any account boundary;
          // restart that rare continuation at offset zero for the one account.
          if (accountPositionsGenerationMatches(login, requestGenerations.get(login))) {
            if (records.length === ACCOUNT_POSITIONS_INITIAL_LIMIT) {
              accountPositionsContinuationOffsets.set(login, { offset: 0 });
            } else {
              accountPositionsContinuationOffsets.delete(login);
            }
          }
          return selectAccountPositions(records, login);
        }),
      );
    });
  }

  // Explicitly resolves [] for requested accounts absent from the batch. Empty
  // is a successful cache entry, not a reason to issue a slow fallback request.
  return Promise.all(normalizedLogins.map((login) => getAccountPositions(login)))
    .catch(() => undefined);
};
export const peekAccountPositions = (login) => {
  return accountPositionsRequests.peek(login);
};
export const invalidateAccountPositionsCache = (login) => {
  const key = String(login ?? '').trim();
  bumpAccountPositionsGeneration(key);
  accountPositionsRequests.invalidate(key);
  if (key) {
    accountPositionsContinuationOffsets.delete(key);
    pendingAccountPositionsContinuations.delete(key);
  } else {
    accountPositionsContinuationOffsets.clear();
    pendingAccountPositionsContinuations.clear();
  }
};

export const hasAccountPositionsContinuation = (login) => (
  accountPositionsContinuationOffsets.has(String(login ?? '').trim())
);

export const completeAccountPositions = (login, initialRows = [], { onPage } = {}) => {
  const key = String(login ?? '').trim();
  if (!key || !accountPositionsContinuationOffsets.has(key)) {
    return Promise.resolve(Array.isArray(initialRows) ? initialRows : []);
  }
  if (pendingAccountPositionsContinuations.has(key)) {
    return pendingAccountPositionsContinuations.get(key);
  }

  const expectedSnapshot = accountPositionsRequests.peek(key);
  const continuationMarker = accountPositionsContinuationOffsets.get(key);
  const continuationStartOffset = continuationMarker.offset;
  const continuationGeneration = getAccountPositionsGeneration(key);
  let continuationRequest;
  continuationRequest = (async () => {
    const merged = new Map();
    const addRows = (rows) => rows.forEach((row, index) => {
      const ticket = row?.position ?? row?.ticket;
      const rowKey = ticket
        ? String(ticket)
        : `${row?.symbol || ''}:${row?.timeCreate || ''}:${index}`;
      merged.set(rowKey, row);
    });
    addRows(Array.isArray(initialRows) ? initialRows : []);

    let offset = continuationStartOffset;
    while (true) {
      const request = apiClient.get(buildAccountPositionsEndpoint([key], { offset }));
      activeAccountPositionRequests.add(request);
      let records;
      try {
        const data = await request;
        records = getRecords(data, 'positions');
      } finally {
        activeAccountPositionRequests.delete(request);
      }
      if (!accountPositionsGenerationMatches(key, continuationGeneration)) {
        throw new Error('Account positions continuation was invalidated.');
      }

      addRows(selectAccountPositions(records, key));
      const rows = [...merged.values()];
      try {
        onPage?.(rows);
      } catch {
        // Rendering callbacks must not turn a successful page into an API error.
      }
      if (records.length < ACCOUNT_POSITIONS_INITIAL_LIMIT) {
        const replacedCurrentSnapshot = accountPositionsRequests.replaceIf(key, expectedSnapshot, rows);
        if (replacedCurrentSnapshot && accountPositionsContinuationOffsets.get(key) === continuationMarker) {
          accountPositionsContinuationOffsets.delete(key);
        }
        return rows;
      }
      offset += records.length;
    }
  })().finally(() => {
    if (pendingAccountPositionsContinuations.get(key) === continuationRequest) {
      pendingAccountPositionsContinuations.delete(key);
    }
  });

  pendingAccountPositionsContinuations.set(key, continuationRequest);
  return continuationRequest;
};

export const invalidateGlobalPositionsCache = () => {
  positionsCacheGeneration += 1;
  cachedPositionsDataset = null;
  cachedPositionsDatasetTime = 0;
  pendingPositionsDatasetPromise = null;
};

export const invalidatePositionsCache = (login) => {
  invalidateGlobalPositionsCache();
  bumpAccountPositionsGeneration(login);
  accountPositionsRequests.invalidate(login);
  const accountKey = String(login ?? '').trim();
  if (accountKey) {
    accountPositionsContinuationOffsets.delete(accountKey);
    pendingAccountPositionsContinuations.delete(accountKey);
  } else {
    accountPositionsContinuationOffsets.clear();
    pendingAccountPositionsContinuations.clear();
  }
  if (login === undefined || login === null || String(login).trim() === '') {
    activeAccountPositionRequests.clear();
  }
};

const fetchAllPositionsDataset = async (options = {}) => {
  const freshDataset = getFreshPositionsDataset();
  if (freshDataset !== null) return freshDataset;
  if (pendingPositionsDatasetPromise) {
    return pendingPositionsDatasetPromise;
  }

  const requestGeneration = positionsCacheGeneration;
  let datasetRequest;
  datasetRequest = (async () => {
    try {
      const response = await apiClient.getRaw('/PositionsAll', options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error('Invalid PositionsAll response', { cause: error });
      }
      const records = extractRows(parsed, ['positions']);
      if (positionsCacheGeneration === requestGeneration) {
        cachedPositionsDataset = records;
        cachedPositionsDatasetTime = Date.now();
      }
      return records;
    } catch (error) {
      if (positionsCacheGeneration === requestGeneration && Array.isArray(cachedPositionsDataset)) {
        return cachedPositionsDataset;
      }
      throw error;
    } finally {
      if (pendingPositionsDatasetPromise === datasetRequest) {
        pendingPositionsDatasetPromise = null;
      }
    }
  })();
  pendingPositionsDatasetPromise = datasetRequest;

  return pendingPositionsDatasetPromise;
};

export const getPositions = async () => {
  const page = await getPositionsPage({ limit: 30, offset: 0 });
  return page.rows;
};

export const getPositionsPage = async (params = {}, options = {}) => {
  // 1. If we already have the cached positions in memory, filter and slice in < 1ms
  const freshDataset = getFreshPositionsDataset();
  if (freshDataset !== null) return normalizePagedResult(freshDataset, params, normalizePositionRow, ['positions']);

  // Account details is direct user interaction. Keep dashboard and workspace
  // PositionsAll probes from competing with its much smaller request.
  const waitedForAccountPositions = await waitForAccountPositionRequests();
  if (waitedForAccountPositions) {
    // Let the resolved modal state commit and paint before a global streaming
    // fallback starts parsing rows on the same main thread.
    await new Promise((resolve) => setTimeout(resolve, ACCOUNT_POSITIONS_PAINT_GRACE_MS));
  }
  const datasetAfterPriorityWait = getFreshPositionsDataset();
  if (datasetAfterPriorityWait !== null) {
    return normalizePagedResult(datasetAfterPriorityWait, params, normalizePositionRow, ['positions']);
  }

  // 2. If a background fetch of full positions is already in progress, await it
  if (pendingPositionsDatasetPromise) {
    try {
      const dataset = await pendingPositionsDatasetPromise;
      if (Array.isArray(dataset)) {
        return normalizePagedResult(dataset, params, normalizePositionRow, ['positions']);
      }
    } catch {
      // ignore
    }
  }

  // 3. For cold initial loads, stream the first page immediately in < 150ms
  const requestGeneration = positionsCacheGeneration;
  const collectedRows = [];
  const pagedResult = await getPaged('/PositionsAll', params, normalizePositionRow, ['positions'], {
    stream: true,
    ...options,
    onRow: (row) => {
      collectedRows.push(row);
      options.onRow?.(row);
    },
  });

  const filters = params.filters && typeof params.filters === 'object' ? params.filters : {};
  const isCompleteUnfilteredSnapshot = Number(params.offset || 0) === 0
    && !String(params.search || '').trim()
    && Object.keys(filters).length === 0
    && pagedResult.hasMore === false;

  // A filtered or truncated page is not a complete global dataset. Caching it
  // as one can incorrectly make another account appear to have no positions.
  if (isCompleteUnfilteredSnapshot && positionsCacheGeneration === requestGeneration) {
    cachedPositionsDataset = collectedRows;
    cachedPositionsDatasetTime = Date.now();
  }

  // 4. In the background (non-blocking), warm the full dataset for instant dropdown filtering & search
  const requestedLimit = Number(params.limit || 30);
  if (
    positionsCacheGeneration === requestGeneration
    && getFreshPositionsDataset() === null
    && requestedLimit > 1
  ) {
    fetchAllPositionsDataset(options).catch(() => undefined);
  }

  return pagedResult;
};

export const getOpenedOrders = async (login, options = {}) => {
  if (!login) return [];
  const data = await apiClient.get(`/OpenedOrders?${arrayQuery('logins[]', [login])}`, options);
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
export const getTradingAccountsAnalytics = async (options = {}) => {
  return getDashboardSummary(options);
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

export const getDashboardSummary = async ({ date, ...options } = {}) => {
  return requestReportsSummary((endpoint, requestOptions) => apiClient.get(endpoint, requestOptions), { date, ...options });
};

export const getAccountLimitStatus = async (options = {}) => {
  return apiClient.get(MANAGER_API.accountLimits, options);
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
  throw new Error('Advertising campaigns are not exposed by the current Manager API.');
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
export const ibPlanList = (login) => ibApi.listPlans(login);
export const ibCommissions = (params) => ibApi.commissions(params);
export const ibCommissionPay = (body) => ibApi.payCommissions(body);
export const ibStats = (params) => ibApi.stats(params);
export const ibTree = (login) => ibApi.tree(login);

// ─── Symbol Management ────────────────────────────────────────────────────────
export const symbolsList = () => apiClient.get('/SymbolsList');
export const symbolGet = (symbol) => apiClient.get(`/SymbolGet?${query({ symbol })}`);
export const symbolsParams = async (symbols) => {
  const batches = chunkSymbolNames(symbols);
  if (batches.length === 0) return [];

  const results = await Promise.all(batches.map((batch) => (
    apiClient.get(`/SymbolsParams?${arrayQuery('symbols[]', batch)}`)
  )));
  return results.flatMap((rows) => (Array.isArray(rows) ? rows : getRecords(rows, 'symbols')));
};

const SYMBOL_MANAGEMENT_CACHE_KEY = 'rtx5_symbol_management_v1';
const SYMBOL_MANAGEMENT_CACHE_FRESH_MS = 60_000;
const SYMBOL_MANAGEMENT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let symbolManagementCache = null;
let symbolManagementRequest = null;
let symbolManagementProgress = null;
const symbolManagementProgressListeners = new Set();

const readStoredSymbolManagementData = () => {
  try {
    const raw = typeof sessionStorage === 'undefined'
      ? null
      : sessionStorage.getItem(SYMBOL_MANAGEMENT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed?.symbols)
      || parsed.symbols.length === 0
      || Date.now() - Number(parsed.savedAt || 0) > SYMBOL_MANAGEMENT_CACHE_MAX_AGE_MS
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredSymbolManagementData = (data) => {
  if (!Array.isArray(data?.symbols) || data.symbols.length === 0) return;
  const cached = {
    symbols: data.symbols,
    categories: Array.isArray(data.categories) ? data.categories : [],
    savedAt: Date.now(),
  };
  symbolManagementCache = cached;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SYMBOL_MANAGEMENT_CACHE_KEY, JSON.stringify(cached));
    }
  } catch {
    // Storage can be unavailable or full; the in-memory cache still works.
  }
};

export const peekSymbolManagementData = () => {
  if (symbolManagementCache?.symbols?.length) return symbolManagementCache;
  symbolManagementCache = readStoredSymbolManagementData();
  return symbolManagementCache || symbolManagementProgress;
};

export const invalidateSymbolManagementData = () => {
  symbolManagementCache = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SYMBOL_MANAGEMENT_CACHE_KEY);
    }
  } catch {
    // Ignore storage failures; the next request will still refresh memory.
  }
};

const notifySymbolManagementProgress = (data) => {
  symbolManagementProgress = data;
  symbolManagementProgressListeners.forEach((listener) => {
    try {
      listener(data);
    } catch {
      // A rendering callback must not be able to fail the shared request.
    }
  });
};

const symbolName = (entry) => String(
  typeof entry === 'string' ? entry : entry?.symbol || entry?.Symbol || entry?.name || ''
).trim();

const fetchSymbolManagementData = async () => {
  // Start both independent root requests together. Previously categories did not
  // start until the name request finished, producing an avoidable request waterfall.
  const namesRequest = apiClient.get('/SymbolsList');
  const categoriesRequest = apiClient.get('/SymbolCategoryList').catch(() => []);

  const mt5Request = namesRequest.then((names) => {
    if (!Array.isArray(names) || names.length === 0) return [];

    // The lightweight name list is useful immediately while full parameters and
    // category metadata continue loading in the background.
    notifySymbolManagementProgress({
      symbols: names
        .map((entry) => ({
          ...(typeof entry === 'object' && entry !== null ? entry : {}),
          symbol: symbolName(entry),
          __managementPartial: true,
        }))
        .filter((entry) => entry.symbol),
      categories: peekSymbolManagementData()?.categories || [],
      partial: true,
    });

    return symbolsParams(names)
      .catch(() => []);
  });

  const metadataRequest = categoriesRequest.then(async (categories) => {
    if (!Array.isArray(categories) || categories.length === 0) return [];
    return Promise.all(categories.map((category) => (
      apiClient.get(`/SymbolsByCategory?${query({ category: category.name })}`)
        .then((symbols) => ({ category: category.name, symbols }))
        .catch(() => null)
    )));
  });

  const [mt5Data, categories] = await Promise.all([mt5Request, categoriesRequest]);
  const coreSymbols = Array.isArray(mt5Data) ? mt5Data : [];

  if (coreSymbols.length > 0) {
    notifySymbolManagementProgress({
      symbols: coreSymbols.map((symbol) => ({ ...symbol, __managementPartial: true })),
      categories,
      partial: true,
    });
  }

  const metadataResults = await metadataRequest;
  const metadataBySymbol = {};
  metadataResults.forEach((result) => {
    if (!result || !Array.isArray(result.symbols)) return;
    result.symbols.forEach((symbol) => {
      metadataBySymbol[symbol.symbol] = { ...symbol, category: result.category };
    });
  });

  const symbols = coreSymbols.map((symbol) => ({
    ...symbol,
    ...(metadataBySymbol[symbol.symbol] || {}),
  }));
  const data = { symbols, categories: Array.isArray(categories) ? categories : [] };
  writeStoredSymbolManagementData(data);
  return data;
};

export const symbolManagementList = ({ force = false, onProgress } = {}) => {
  if (typeof onProgress === 'function') {
    symbolManagementProgressListeners.add(onProgress);
    if (symbolManagementRequest && symbolManagementProgress) {
      onProgress(symbolManagementProgress);
    }
  }

  const cached = peekSymbolManagementData();
  if (
    !force
    && cached?.symbols?.length
    && Date.now() - Number(cached.savedAt || 0) < SYMBOL_MANAGEMENT_CACHE_FRESH_MS
  ) {
    onProgress?.({ ...cached, partial: false });
    symbolManagementProgressListeners.delete(onProgress);
    return Promise.resolve(cached);
  }

  if (!symbolManagementRequest) {
    symbolManagementRequest = fetchSymbolManagementData().finally(() => {
      symbolManagementRequest = null;
      symbolManagementProgress = null;
      symbolManagementProgressListeners.clear();
    });
  }

  return symbolManagementRequest;
};

export const preloadSymbolManagementData = () => symbolManagementList().catch(() => undefined);
export const symbolList = async (options) => (await symbolManagementList(options)).symbols;

const symbolMutation = (request) => request.then((result) => {
  invalidateSymbolManagementData();
  return result;
});

export const symbolAdd = (params) => symbolMutation(apiClient.get(`/SymbolAdd?${new URLSearchParams(params).toString()}`));
export const symbolUpdate = (params) => symbolMutation(apiClient.get(`/SymbolUpdate?${new URLSearchParams(params).toString()}`));
export const symbolEnable = (symbol) => symbolMutation(apiClient.get(`/SymbolEnable?${query({ symbol })}`));
export const symbolDisable = (symbol) => symbolMutation(apiClient.get(`/SymbolDisable?${query({ symbol })}`));
export const symbolClone = (body) => symbolMutation(apiClient.post('/SymbolClone', body));
export const symbolsByCategory = (category) => apiClient.get(`/SymbolsByCategory?${query({ category })}`);

export const symbolCategoryList = () => apiClient.get('/SymbolCategoryList');
export const symbolCategoryCreate = (body) => apiClient.post('/SymbolCategoryCreate', body);
export const symbolCategoryUpdate = (body) => apiClient.post('/SymbolCategoryUpdate', body);
export const symbolCategoryDelete = (name) => apiClient.post(`/SymbolCategoryDelete?${query({ name })}`, {});

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
  getAccountPositions,
  preloadAccountPositions,
  preloadAccountPositionsBatch,
  peekAccountPositions,
  hasAccountPositionsContinuation,
  completeAccountPositions,
  invalidateGlobalPositionsCache,
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
