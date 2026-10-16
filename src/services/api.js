import { getDataAccessScope, assertDataAccessScope, matchesDataAccessScope } from './dataAccessScope.js';
import { normalizePositionRow, getPositionTicket, mergePositionUpdates, reconcilePositionSnapshot } from './positionRecords.js';
export { normalizePositionRow } from './positionRecords.js';

import { loadSymbolManagement } from './symbolManagementLoader.js';
import { fetchAvailableSymbolNames } from './symbolCatalogue.js';
import { buildPermissionSessionFingerprint } from '../utils/sessionFingerprint.js';
import apiClient from './apiClient';
import ibApi from './ibApi';
import authService from './authService';
import { fetchManagerApi } from './managerFetch';
import { sendWithSessionRefresh } from './authRequest.js';
import { API_HOST, buildBrokerApiUrl, updateDynamicEndpoints } from '../config/endpoints';
import { normalizeOnlineUserRows } from '../utils/onlineUsers';
import { buildPagedEndpoint, extractRows, normalizePagedResult, normalizePagedStreamResult, normalizePagedTextResult } from '../utils/pagination';
import { chunkSymbolNames } from '../utils/symbolParams';
import { createKeyedRequestCache } from './keyedRequestCache';
import { MANAGER_API } from '../config/managerApiContract.js';
import { requestReportsSummary } from './reportsSummary.js';
import { fetchOnlineUsersSnapshot, pageOnlineUsers, clearOnlineUsersSnapshot } from './onlineUsersSnapshot.js';
import { advanceRealtimeCacheRevision } from './realtimeCacheRevision.js';

export { chunkSymbolNames, SYMBOL_PARAMS_BATCH_SIZE } from '../utils/symbolParams';

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
  const response = await sendWithSessionRefresh((token) => fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  }));

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
  registration: p.Registration ?? p.registration ?? p.Registered ?? p.registered ?? null,
  mqid: p.mqid || p.MQID || p.MetaQuotesID || p.metaQuotesId || '',
  state: p.state || p.State || p.province || p.Province || p.region || p.Region || '',
  city: p.city || p.City || '',
  zipCode: p.zipCode || p.ZipCode || p.zip || p.Zip || p.PostalCode || p.postalCode || '',
  address: p.address || p.Address || '',
  comment: p.comment || p.Comment || '',
});

const normalizeLots = (p = {}) => {
  if (p.lots != null) return Number(p.lots);
  if (p.volume_lots != null) return Number(p.volume_lots);
  if (p.volumeExt != null) return Number(p.volumeExt) / 10000;
  if (p.Volume != null) return Number(p.Volume) / 10000;
  return Number(p.volume ?? 0);
};

export const normalizeOrderRow = (p = {}) => {
  let type = 'unknown';
  if (typeof p.type === 'string') type = p.type.toLowerCase();
  else if (typeof p.side === 'string') type = p.side.toLowerCase();
  else if (p.type === 0 || p.cmd === 0) type = 'buy';
  else if (p.type === 1 || p.cmd === 1) type = 'sell';

  const volume = normalizeLots(p);

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
  action: p.action ?? '',
  entry: p.entry || '',
  volume: normalizeLots(p),
  price: p.price || 0,
  profit: p.profit || 0,
  commission: p.commission || 0,
  swap: p.swap || 0,
  fee: p.fee || 0,
  time: p.time || p.Time || p.timeDone || p.timeCreate || p.timestamp || 0,
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
let accountDetailsCacheGeneration = 0;
let accountDataScope = getDataAccessScope();
const ensureAccountDataScope = () => {
  const scope = getDataAccessScope();
  if (accountDataScope !== scope) {
    const promotedInitialScope = matchesDataAccessScope(accountDataScope);
    accountDataScope = scope;
    if (!promotedInitialScope) {
      invalidateRealtimeCaches();
      clearOnlineUsersSnapshot();
    }
  }
  return scope;
};

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
    if (matchesDataAccessScope(parsed?.scope) && Array.isArray(parsed.rows)) return parsed;
  } catch {
    // Ignore storage parse errors
  }
  return null;
};

const writeStoredAccountDetailsPage = (page) => {
  if (!Array.isArray(page?.rows)) return;
  try {
    sessionStorage.setItem(ACCOUNT_DETAILS_CACHE_KEY, JSON.stringify({
      scope: getDataAccessScope(),
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
  ensureAccountDataScope();
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
  const accessScope = getDataAccessScope();
  const { stream = false, requireRowsArray = false, ...requestOptions } = options;
  const pagedEndpoint = buildPagedEndpoint(endpoint, params);

  // AccountDetailsMany and explicit lightweight callers use the streamed
  // parser. It can stop after the requested page instead of JSON-parsing a
  // large response that a manager endpoint may have returned in full.
  if (endpoint === '/AccountDetailsMany' || stream) {
    const response = await apiClient.getRaw(pagedEndpoint, requestOptions);
    if (endpoint === '/PositionsAll' && (response.status === 401 || response.status === 403)) {
      invalidatePositionsCache();
    }
    const result = await normalizePagedStreamResult(response, params, normalizeRow, preferredKeys, {
      ...requestOptions,
      serverPaged: true,
      requireRowsArray,
    });
    assertDataAccessScope(accessScope);
    return result;
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
    // A scoped account denial is terminal, even though it uses HTTP 404.
    // Trying another API can bypass scope or expire this manager's session.
    if (error.code === 'MT_RET_ERR_NOTFOUND') throw error;
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
    error.code = data?.code ?? data?.error?.code;
    throw error;
  }

  return getRecords(data, 'answer').map(normalizePositionHistoryRow);
};

// ─── Online Users ──────────────────────────────────────────────────────────────
export const getOnlineUsers = async () => {
  const page = await getOnlineUsersPage({ limit: 30, offset: 0 });
  return page.rows;
};

const loadAccountsOnlineRows = async (options = {}) => {
  const data = await apiClient.get(MANAGER_API.accountsOnline, options);
  const records = Array.isArray(data?.users) ? data.users : getRecords(data, 'accounts');
  return records.map((row) => normalizeOnlineUserRows([row])[0] || row);
};

const getAccountsOnlineSnapshot = async (params = {}, options = {}) => {
  // The request is shared by every Online Users view, so one view unmounting
  // (its abort signal) must not cancel it for the others.
  const { signal: _signal, ...requestOptions } = options;
  const snapshot = await fetchOnlineUsersSnapshot(() => loadAccountsOnlineRows(requestOptions));
  return pageOnlineUsers(snapshot.rows, params);
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
  const scope = ensureAccountDataScope();
  // Full reports need fresh, consistently sorted pages, independent of the
  // account grid's first-page cache (which may use another page size/session).
  if (options.bypassCache) {
    const { bypassCache: _bypassCache, ...requestOptions } = options;
    return getPaged('/AccountDetailsMany', params, (row) => row, ['accounts'], requestOptions);
  }
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

  // The first page is shared by the grid, dashboard and startup prefetch, so
  // one caller being cancelled (its abort signal) must not reject it for the
  // others. React Query still drops a cancelled caller's result on its own.
  const { signal: _signal, ...requestOptions } = options;
  const generation = accountDetailsCacheGeneration;
  const request = getPaged(
    '/AccountDetailsMany',
    { ...params, limit: params.limit || 30, offset: 0 },
    (row) => row,
    ['accounts'],
    requestOptions,
  ).then((page) => {
    assertDataAccessScope(scope);
    if (generation === accountDetailsCacheGeneration && Array.isArray(page?.rows)) {
      accountDetailsFirstPage = page;
      accountDetailsFirstPageAt = Date.now();
      writeStoredAccountDetailsPage(page);
    }
    return page;
  }).finally(() => {
    if (accountDetailsFirstPagePromise === request) accountDetailsFirstPagePromise = null;
  });
  accountDetailsFirstPagePromise = request;
  return request;
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
let positionsDatasetRevision = 0;
let positionsDatasetComplete = false;
const positionUpdateRevisions = new Map();
const pendingNewPositions = new Map();
const MAX_PENDING_NEW_POSITIONS = 5_000;
const POSITIONS_CACHE_TTL_MS = 20_000;
const POSITIONS_DATASET_CACHE_KEY = 'rtx5_positions_dataset_v3';
const LEGACY_POSITIONS_DATASET_CACHE_KEY = 'rtx5_positions_dataset_v2';
const POSITIONS_STORAGE_MAX_AGE_MS = 60_000;
const ACCOUNT_POSITIONS_CACHE_TTL_MS = 5_000;
const ACCOUNT_POSITIONS_PRIORITY_WAIT_MS = 1_000;
const ACCOUNT_POSITIONS_PAINT_GRACE_MS = 150;
const ACCOUNT_POSITIONS_INITIAL_LIMIT = 30;

const getPositionsDatasetScope = () => {
  const { login, brokerId } = authService.getSessionClaims();
  const sessionScope = authService.getSessionScopeKey();
  if (!String(login ?? '').trim() || !String(brokerId ?? '').trim() || !String(sessionScope ?? '').trim()) return null;
  updateDynamicEndpoints();
  return buildPermissionSessionFingerprint({
    token: sessionScope,
    login,
    brokerId: `${brokerId}|${API_HOST}`,
  }) + `|${getDataAccessScope()}`;
};

const positionsStorage = () => [
  typeof sessionStorage === 'undefined' ? null : sessionStorage,
  typeof localStorage === 'undefined' ? null : localStorage,
].filter(Boolean);

const clearLegacyPositionsStorage = () => {
  positionsStorage().forEach((storage) => {
    try { storage.removeItem(LEGACY_POSITIONS_DATASET_CACHE_KEY); } catch { /* Storage may be unavailable. */ }
  });
};

const readStoredPositionsDataset = () => {
  clearLegacyPositionsStorage();
  const scope = getPositionsDatasetScope();
  if (!scope) return null;
  for (const storage of positionsStorage()) {
    try {
      const raw = storage.getItem(POSITIONS_DATASET_CACHE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const savedAt = Number(parsed?.timestamp) || 0;
      const ageMs = Date.now() - savedAt;
      if (
        parsed?.scope === scope
        && Array.isArray(parsed.records)
        && parsed.records.length > 0
        && savedAt > 0
        && ageMs >= 0
        && ageMs <= POSITIONS_STORAGE_MAX_AGE_MS
      ) return parsed.records;
      storage.removeItem(POSITIONS_DATASET_CACHE_KEY);
    } catch {
      // Malformed or unavailable storage must not become a position snapshot.
    }
  }
  return null;
};

const writeStoredPositionsDataset = (records) => {
  if (!Array.isArray(records)) return;
  if (records.length === 0) {
    clearPositionsStorageCache();
    return;
  }
  const scope = getPositionsDatasetScope();
  if (!scope) return;
  try {
    const payload = JSON.stringify({ records, timestamp: Date.now(), scope });
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(POSITIONS_DATASET_CACHE_KEY, payload);
    if (typeof localStorage !== 'undefined') localStorage.setItem(POSITIONS_DATASET_CACHE_KEY, payload);
  } catch {
    // Storage full or private mode
  }
};

export const peekStoredPositionsDataset = () => {
  ensureAccountDataScope();
  if (Array.isArray(cachedPositionsDataset) && cachedPositionsDataset.length > 0) return cachedPositionsDataset;
  return readStoredPositionsDataset();
};

export const clearPositionsStorageCache = () => {
  positionsStorage().forEach((storage) => {
    try {
      storage.removeItem(POSITIONS_DATASET_CACHE_KEY);
      storage.removeItem(LEGACY_POSITIONS_DATASET_CACHE_KEY);
    } catch {
      // Ignore storage errors.
    }
  });
};

const buildAccountPositionsEndpoint = (logins, { offset = 0 } = {}) => {
  const params = new URLSearchParams(arrayQuery('logins[]', logins));
  params.set('limit', String(ACCOUNT_POSITIONS_INITIAL_LIMIT));
  params.set('offset', String(offset));
  return `/Positions?${params.toString()}`;
};

const getFreshPositionsDataset = () => {
  ensureAccountDataScope();
  if (Array.isArray(cachedPositionsDataset)) {
    return Date.now() - cachedPositionsDatasetTime < POSITIONS_CACHE_TTL_MS ? cachedPositionsDataset : null;
  }
  const stored = readStoredPositionsDataset();
  if (stored) {
    cachedPositionsDataset = stored;
    cachedPositionsDatasetTime = Date.now();
    positionsDatasetComplete = true;
    return cachedPositionsDataset;
  }
  return null;
};

const selectAccountPositions = (records, login) => records
  .map(normalizePositionRow)
  .filter((position) => String(position.login) === String(login));

const activeAccountPositionRequests = new Set();
const knownPositionLogins = new Set();
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
    const revisionAtStart = positionsDatasetRevision;
    const request = apiClient.get(buildAccountPositionsEndpoint([login]), options);
    activeAccountPositionRequests.add(request);
    try {
      const data = await request;
      const records = getRecords(data, 'positions');
      const positions = selectAccountPositions(reconcileLivePositions(records, revisionAtStart), login);
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

export const getAccountPositions = (login, options = {}) => {
  ensureAccountDataScope();
  const key = String(login ?? '').trim();
  if (key) knownPositionLogins.add(key);
  return accountPositionsRequests.get(login, options);
};
export const preloadAccountPositions = (login) => getAccountPositions(login).catch(() => undefined);
export const preloadAccountPositionsBatch = (logins = []) => {
  ensureAccountDataScope();
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
    const revisionAtStart = positionsDatasetRevision;
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
          return selectAccountPositions(reconcileLivePositions(records, revisionAtStart), login);
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
  ensureAccountDataScope();
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

  const continuationMarker = accountPositionsContinuationOffsets.get(key);
  const continuationStartOffset = continuationMarker.offset;
  const continuationGeneration = getAccountPositionsGeneration(key);
  const revisionAtStart = positionsDatasetRevision;
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
        const current = accountPositionsRequests.peek(key);
        if (accountPositionsSessionGeneration === continuationGeneration.session && current !== undefined) return current;
        throw new Error('Account positions continuation was invalidated.');
      }

      addRows(selectAccountPositions(records, key));
      const rows = selectAccountPositions(reconcileLivePositions(
        [...merged.values()].map((row) => ({ ...row, lots: row.volume })),
        revisionAtStart,
      ), key);
      try {
        onPage?.(rows);
      } catch {
        // Rendering callbacks must not turn a successful page into an API error.
      }
      if (records.length < ACCOUNT_POSITIONS_INITIAL_LIMIT) {
        accountPositionsRequests.set(key, rows);
        if (accountPositionsContinuationOffsets.get(key) === continuationMarker) {
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
  positionsDatasetRevision += 1;
  positionsDatasetComplete = false;
  positionUpdateRevisions.clear();
  pendingNewPositions.clear();
  clearPositionsStorageCache();
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
    knownPositionLogins.clear();
  }
};

const reconcileLivePositions = (records, revision) => {
  const httpTickets = new Set(records.map(getPositionTicket));
  const trustedTickets = positionsDatasetComplete && Array.isArray(cachedPositionsDataset)
    ? new Set(cachedPositionsDataset.map(getPositionTicket))
    : new Set();
  return reconcilePositionSnapshot(
    records,
    Array.isArray(cachedPositionsDataset) ? cachedPositionsDataset : [],
    (ticket, field) => {
      const update = positionUpdateRevisions.get(ticket);
      return (field === undefined ? update?.revision : update?.fields.get(field)) > revision;
    },
  ).filter((row) => {
    const ticket = getPositionTicket(row);
    return httpTickets.has(ticket) || trustedTickets.has(ticket) || hasCompleteNewLivePosition(row);
  });
};

const hasCompletePositionFields = (record) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const row = normalizePositionRow(record);
  return Number.isFinite(Number(row.position)) && Number(row.position) > 0
    && Number.isFinite(Number(row.login)) && Number(row.login) > 0
    && Boolean(String(row.symbol).trim())
    && Number.isFinite(Number(row.volume)) && Number(row.volume) > 0
    && Number.isFinite(Number(row.priceOpen)) && Number(row.priceOpen) > 0;
};

const hasCompleteNewLivePosition = (record) => {
  if (!hasCompletePositionFields(record)) return false;
  const row = normalizePositionRow(record);
  return Boolean(String(row.name).trim() && String(row.email).trim());
};

const validateCompletePositions = (records) => {
  const incompleteIndex = records.findIndex((record) => !hasCompletePositionFields(record));
  if (incompleteIndex >= 0) {
    throw new Error(`Incomplete PositionsAll trade row at index ${incompleteIndex}`);
  }
};

const rememberPendingNewPosition = (ticket, record) => {
  pendingNewPositions.delete(ticket);
  pendingNewPositions.set(ticket, record);
  if (pendingNewPositions.size > MAX_PENDING_NEW_POSITIONS) {
    pendingNewPositions.delete(pendingNewPositions.keys().next().value);
  }
};

const isClosedPositionUpdate = (row) => [row?.status, row?.Status, row?.update_kind, row?.action, row?.operation]
  .some((value) => ['closed', 'deleted', 'delete', 'position_closed'].includes(String(value ?? '').toLowerCase()));

const publishCompletePositionsDataset = (records) => {
  const previous = cachedPositionsDataset || [];
  cachedPositionsDataset = records;
  cachedPositionsDatasetTime = Date.now();
  positionsDatasetRevision += 1;
  positionsDatasetComplete = true;
  writeStoredPositionsDataset(records);
  const retainedTickets = new Set(records.map(getPositionTicket));
  retainedTickets.forEach((ticket) => pendingNewPositions.delete(ticket));
  for (const ticket of positionUpdateRevisions.keys()) {
    if (!retainedTickets.has(ticket)) positionUpdateRevisions.delete(ticket);
  }
  const logins = new Set([...knownPositionLogins, ...[...previous, ...records].map((row) => String(row.login ?? row.Login ?? '')).filter(Boolean)]);
  logins.forEach((login) => {
    bumpAccountPositionsGeneration(login);
    accountPositionsContinuationOffsets.delete(login);
    accountPositionsRequests.set(login, selectAccountPositions(records, login));
  });
};

// A stream frame is a partial update, not proof that absent tickets closed.
// Only a completed HTTP snapshot may remove tickets from the shared book.
export const applyPositionsSnapshot = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const previous = Array.isArray(cachedPositionsDataset) ? cachedPositionsDataset : [];
  const previousByTicket = new Map(previous.map((row) => [getPositionTicket(row), row]));
  const knownTickets = new Set(previousByTicket.keys());
  const acceptedRows = [];
  rows.forEach((row) => {
    const ticket = getPositionTicket(row);
    if (!ticket || ticket === '0') return;
    if (isClosedPositionUpdate(row)) {
      pendingNewPositions.delete(ticket);
      if (!positionsDatasetComplete || !knownTickets.has(ticket)) return;
    }
    if (positionsDatasetComplete && knownTickets.has(ticket)) {
      pendingNewPositions.delete(ticket);
      acceptedRows.push(row);
      return;
    }

    const prior = pendingNewPositions.get(ticket)
      || (!positionsDatasetComplete ? previousByTicket.get(ticket) : undefined);
    const [candidate] = mergePositionUpdates(prior ? [prior] : [], [row]);
    if (hasCompleteNewLivePosition(candidate)) {
      pendingNewPositions.delete(ticket);
      knownTickets.add(ticket);
      acceptedRows.push(candidate);
    } else {
      rememberPendingNewPosition(ticket, candidate);
      // Before the HTTP baseline, these rows remain provisional. The complete
      // dataset reconciler will exclude them unless their details arrive.
      if (!positionsDatasetComplete) acceptedRows.push(row);
    }
  });
  if (acceptedRows.length === 0) return;
  const mergedRecords = mergePositionUpdates(previous, acceptedRows);
  const revision = ++positionsDatasetRevision;
  const changedTickets = new Set(acceptedRows.map(getPositionTicket));
  const updatesByTicket = new Map(mergePositionUpdates([], acceptedRows).map((row) => [getPositionTicket(row), row]));
  updatesByTicket.forEach((row) => {
    const ticket = getPositionTicket(row);
    const fields = positionUpdateRevisions.get(ticket)?.fields || new Map();
    Object.keys(row).forEach((field) => fields.set(field, revision));
    positionUpdateRevisions.set(ticket, { revision, fields });
  });
  cachedPositionsDataset = mergedRecords;
  cachedPositionsDatasetTime = Date.now();
  // Never persist an incomplete first slice as the entire position book.
  if (positionsDatasetComplete) writeStoredPositionsDataset(mergedRecords);

  const changedRecords = mergedRecords.filter((row) => changedTickets.has(getPositionTicket(row)));
  const logins = new Set(changedRecords.map((row) => String(row.login ?? row.Login ?? '')).filter(Boolean));
  logins.forEach((login) => {
    const current = accountPositionsRequests.peek(login);
    if (current === undefined) return;
    // Keep all pages of a previously loaded account while patching its tickets.
    const byTicket = new Map(current.map((row) => [String(row.position), row]));
    const accountUpdates = changedRecords.filter((row) => String(row.login ?? row.Login ?? '') === login);
    accountUpdates.forEach((raw) => {
      const ticket = getPositionTicket(raw);
      const existing = byTicket.get(ticket);
      if (!existing && !hasCompleteNewLivePosition(raw)) return;
      const base = existing ? { ...existing, lots: existing.volume } : undefined;
      // An account request may be newer than the global baseline. Patch only
      // fields present in this frame so its volume/stops cannot roll back.
      const patch = existing ? updatesByTicket.get(ticket) : raw;
      const [updated] = mergePositionUpdates(base ? [base] : [], [patch]);
      byTicket.set(ticket, normalizePositionRow(updated));
    });
    accountPositionsRequests.set(login, [...byTicket.values()]);
  });
};

export const fetchAllPositionsDataset = async ({ force = false, ...options } = {}) => {
  ensureAccountDataScope();
  const freshDataset = getFreshPositionsDataset();
  if (!force && freshDataset !== null && positionsDatasetComplete) return freshDataset;
  if (pendingPositionsDatasetPromise) {
    return pendingPositionsDatasetPromise;
  }

  const requestGeneration = positionsCacheGeneration;
  const revisionAtStart = positionsDatasetRevision;
  let allowCachedFallback = false;
  let datasetRequest;
  datasetRequest = (async () => {
    try {
      let response;
      try {
        response = await apiClient.getRaw('/PositionsAll', options);
      } catch (error) {
        allowCachedFallback = error?.name !== 'AbortError';
        throw error;
      }
      if (!response.ok) {
        allowCachedFallback = response.status >= 500;
        let serverMessage = '';
        try {
          const payload = JSON.parse(await response.text());
          const message = payload?.message ?? payload?.error?.message;
          if (typeof message === 'string') serverMessage = message.trim().slice(0, 300);
        } catch {
          // Non-JSON responses use the status without exposing the raw body.
        }
        if (response.status === 401 || response.status === 403) invalidatePositionsCache();
        const error = new Error(serverMessage || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      let text;
      try {
        text = await response.text();
      } catch (error) {
        allowCachedFallback = error?.name !== 'AbortError';
        throw error;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error('Invalid PositionsAll response', { cause: error });
      }
      const records = extractRows(parsed, ['positions']);
      if (!Array.isArray(parsed) && !['positions', 'rows', 'data', 'answer', 'records', 'items'].some((key) => Array.isArray(parsed?.[key]))) {
        throw new Error('Invalid PositionsAll snapshot');
      }
      validateCompletePositions(records);
      if (positionsCacheGeneration !== requestGeneration) {
        throw new Error('Positions request was invalidated.');
      }
      // Force bypasses freshness only; it must never bypass live-update ordering.
      const reconciled = reconcileLivePositions(records, revisionAtStart);
      publishCompletePositionsDataset(reconciled);
      return reconciled;
    } catch (error) {
      if (
        allowCachedFallback
        && positionsCacheGeneration === requestGeneration
        && positionsDatasetComplete
        && Array.isArray(cachedPositionsDataset)
      ) {
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
  ensureAccountDataScope();
  // 1. If we already have the cached positions in memory, filter and slice in < 1ms
  const freshDataset = getFreshPositionsDataset();
  if (freshDataset !== null) {
    if (positionsDatasetComplete) return normalizePagedResult(freshDataset, params, normalizePositionRow, ['positions']);
    const complete = await fetchAllPositionsDataset(options);
    return normalizePagedResult(complete, params, normalizePositionRow, ['positions']);
  }

  // Account details is direct user interaction. Keep dashboard and workspace
  // PositionsAll probes from competing with its much smaller request.
  const waitedForAccountPositions = await waitForAccountPositionRequests();
  if (waitedForAccountPositions) {
    // Let the resolved modal state commit and paint before a global streaming
    // fallback starts parsing rows on the same main thread.
    await new Promise((resolve) => setTimeout(resolve, ACCOUNT_POSITIONS_PAINT_GRACE_MS));
  }
  const datasetAfterPriorityWait = getFreshPositionsDataset();
  if (datasetAfterPriorityWait !== null && positionsDatasetComplete) {
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
  const revisionAtStart = positionsDatasetRevision;
  const collectedRows = [];
  const pagedResult = await getPaged('/PositionsAll', params, normalizePositionRow, ['positions'], {
    stream: true,
    ...options,
    requireRowsArray: true,
    onRow: (row) => {
      collectedRows.push(row);
      options.onRow?.(row);
    },
  });
  validateCompletePositions(pagedResult.rows);

  // A websocket snapshot that landed while PositionsAll streamed is fresher
  // than this response. Serve the newer dataset so the grid never repaints
  // stale rows, and never let the stale page overwrite the live cache.
  if (positionsCacheGeneration === requestGeneration && positionsDatasetRevision !== revisionAtStart) {
    const freshDataset = getFreshPositionsDataset();
    if (freshDataset !== null && positionsDatasetComplete) {
      return normalizePagedResult(freshDataset, params, normalizePositionRow, ['positions']);
    }
  }

  const filters = params.filters && typeof params.filters === 'object' ? params.filters : {};
  const isCompleteUnfilteredSnapshot = Number(params.offset || 0) === 0
    && !String(params.search || '').trim()
    && Object.keys(filters).length === 0
    && pagedResult.hasMore === false;

  // A filtered or truncated page is not a complete global dataset. Caching it
  // as one can incorrectly make another account appear to have no positions.
  if (isCompleteUnfilteredSnapshot && positionsCacheGeneration === requestGeneration) {
    const snapshotRows = collectedRows.length ? collectedRows : pagedResult.rows;
    validateCompletePositions(snapshotRows);
    const reconciled = reconcileLivePositions(snapshotRows, revisionAtStart);
    publishCompletePositionsDataset(reconciled);
    return normalizePagedResult(reconciled, params, normalizePositionRow, ['positions']);
  }

  // 4. In the background (non-blocking), warm the full dataset for instant dropdown filtering & search
  const requestedLimit = Number(params.limit || 30);
  if (
    positionsCacheGeneration === requestGeneration
    && (!positionsDatasetComplete || getFreshPositionsDataset() === null)
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
export const groupSymbolOverridesGet = (group) => apiClient.get(`/GroupSymbolOverridesGet?${query({ group })}`);
export const groupSymbolOverridesSave = (group, changes) => apiClient.post('/GroupSymbolOverridesSave', { group, changes });
export const symbolGet = (symbol) => apiClient.get(`/SymbolGet?${query({ symbol })}`);
export const symbolsParams = async (symbols) => {
  const batches = chunkSymbolNames(symbols);
  if (batches.length === 0) return [];

  const results = await Promise.all(batches.map((batch) => (
    apiClient.get(`/SymbolsParams?${arrayQuery('symbols[]', batch)}`)
  )));
  return results.flatMap((rows) => (Array.isArray(rows) ? rows : getRecords(rows, 'symbols')));
};

// v2 includes the available feed catalogue as well as configured instruments.
const SYMBOL_MANAGEMENT_CACHE_KEY = 'rtx5_symbol_management_v2';
const SYMBOL_MANAGEMENT_CACHE_FRESH_MS = 60_000;
const SYMBOL_MANAGEMENT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SYMBOLS_LIST_CACHE_KEY = 'rtx5_symbols_list_v1';
const SYMBOLS_LIST_CACHE_FRESH_MS = 60_000;
const SYMBOLS_LIST_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

let symbolsListCache = null;
let symbolsListRequest = null;
let symbolsListScope = '';
let symbolsListGeneration = 0;

let symbolManagementCache = null;
let symbolManagementRequest = null;
let symbolManagementProgress = null;
let symbolManagementGeneration = 0;
const symbolManagementProgressListeners = new Set();
let symbolManagementScope = '';
const getSymbolManagementScope = () => {
  updateDynamicEndpoints();
  const claims = authService.getSessionClaims();
  return buildPermissionSessionFingerprint({
    token: authService.getSessionScopeKey(),
    login: claims.login,
    brokerId: `${claims.brokerId || ''}|${API_HOST}`,
  });
};

const readStoredSymbolsList = (scope) => {
  try {
    const raw = typeof sessionStorage === 'undefined'
      ? null
      : sessionStorage.getItem(SYMBOLS_LIST_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const savedAt = Number(cached?.savedAt);
    const age = Date.now() - savedAt;
    return Array.isArray(cached?.symbols)
      && cached.scope === scope
      && Number.isFinite(savedAt)
      && savedAt > 0
      && age >= 0
      && age <= SYMBOLS_LIST_CACHE_MAX_AGE_MS
      ? cached : null;
  } catch {
    return null;
  }
};

const currentSymbolsListScope = () => {
  const scope = getSymbolManagementScope();
  if (scope !== symbolsListScope) {
    symbolsListGeneration += 1;
    symbolsListScope = scope;
    symbolsListCache = null;
    symbolsListRequest = null;
  }
  return scope;
};

const invalidateSymbolsListCache = () => {
  symbolsListGeneration += 1;
  symbolsListCache = null;
  symbolsListRequest = null;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SYMBOLS_LIST_CACHE_KEY);
  } catch {
    // Storage is optional; in-memory invalidation is still authoritative.
  }
};

const awaitSymbolsListWithSignal = (request, signal) => {
  if (!signal) return request;
  const abortError = () => new DOMException('The operation was aborted.', 'AbortError');
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    request.then(
      (result) => { signal.removeEventListener('abort', onAbort); resolve(result); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
};

export const peekSymbolsList = () => {
  const scope = currentSymbolsListScope();
  if (symbolsListCache) {
    const age = Date.now() - Number(symbolsListCache.savedAt);
    if (age < 0 || age > SYMBOLS_LIST_CACHE_MAX_AGE_MS) symbolsListCache = null;
  }
  if (!symbolsListCache) symbolsListCache = readStoredSymbolsList(scope);
  return symbolsListCache
    ? { symbols: symbolsListCache.symbols, savedAt: symbolsListCache.savedAt }
    : null;
};

export const symbolsList = ({ force = false, signal } = {}) => {
  const scope = currentSymbolsListScope();
  const cached = peekSymbolsList();
  if (!force && cached && Date.now() - cached.savedAt < SYMBOLS_LIST_CACHE_FRESH_MS) {
    return awaitSymbolsListWithSignal(Promise.resolve(cached.symbols), signal);
  }
  if (!symbolsListRequest) {
    const generation = symbolsListGeneration;
    const request = apiClient.get('/SymbolsList', { signal: AbortSignal.timeout(15_000) }).then((symbols) => {
      if (generation !== symbolsListGeneration || scope !== getSymbolManagementScope()) {
        throw new Error('The symbol list request was invalidated.');
      }
      if (!Array.isArray(symbols)) throw new Error('The server returned an invalid symbol list.');
      const next = { symbols, savedAt: Date.now(), scope };
      symbolsListCache = next;
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(SYMBOLS_LIST_CACHE_KEY, JSON.stringify(next));
        }
      } catch {
        // A full or unavailable browser cache must not hide live symbols.
      }
      return symbols;
    }).finally(() => {
      if (symbolsListRequest === request) symbolsListRequest = null;
    });
    symbolsListRequest = request;
  }
  return awaitSymbolsListWithSignal(symbolsListRequest, signal);
};

const readStoredSymbolManagementData = () => {
  try {
    const raw = typeof sessionStorage === 'undefined'
      ? null
      : sessionStorage.getItem(SYMBOL_MANAGEMENT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed?.symbols)
      || parsed.scope !== symbolManagementScope
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
  if (!Array.isArray(data?.symbols)) return;
  const cached = {
    symbols: data.symbols,
    categories: Array.isArray(data.categories) ? data.categories : [],
    savedAt: Date.now(),
    scope: symbolManagementScope,
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
  const scope = getSymbolManagementScope();
  if (symbolManagementScope !== scope) {
    symbolManagementGeneration += 1;
    symbolManagementScope = scope;
    symbolManagementCache = null;
    symbolManagementProgress = null;
    symbolManagementRequest = null;
    symbolManagementProgressListeners.clear();
  }
  if (symbolManagementRequest && symbolManagementProgress?.symbols?.length) return symbolManagementProgress;
  if (symbolManagementCache) return symbolManagementCache;
  symbolManagementCache = readStoredSymbolManagementData();
  return symbolManagementCache || symbolManagementProgress;
};

export const invalidateSymbolManagementData = () => {
  invalidateSymbolsListCache();
  symbolManagementGeneration += 1;
  symbolManagementRequest = null;
  symbolManagementCache = null;
  symbolManagementProgress = null;
  symbolManagementProgressListeners.clear();
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

const fetchSymbolManagementData = async () => {
  const generation = symbolManagementGeneration;
  const scope = symbolManagementScope;
  const isCurrent = () => generation === symbolManagementGeneration && scope === getSymbolManagementScope();
  // Bound stalled requests while completed rows remain available for review.
  const signal = AbortSignal.timeout(15_000);
  const data = await loadSymbolManagement({
    getNames: () => symbolsList({ signal }),
    getAvailableNames: () => fetchAvailableSymbolNames({ signal }),
    getCategories: () => apiClient.get('/SymbolCategoryList', { signal }),
    getParams: async batch => {
      const response = await apiClient.get('/SymbolsParams?' + arrayQuery('symbols[]', batch), { signal });
      return Array.isArray(response) ? response : getRecords(response, 'symbols');
    },
    getCategorySymbols: category => apiClient.get('/SymbolsByCategory?' + query({ category }), { signal }),
    onProgress: data => {
      if (isCurrent()) notifySymbolManagementProgress(data);
    },
    cachedSymbols: peekSymbolManagementData()?.symbols || [],
  });
  // A superseded load settles quietly: it must not replace the fresh request's
  // cache, progress or listeners.
  if (!isCurrent()) return data;
  // Feed-only records are valid catalogue entries with unavailable settings.
  // Failures and incomplete (partial) responses remain stale, so the next
  // visit retries rather than caching them as a fresh, complete entry.
  if (!data.error && data.symbols.every(row => !row.__managementPartial)) writeStoredSymbolManagementData(data);
  else symbolManagementCache = { ...data, savedAt: 0, scope: symbolManagementScope };
  return data;
};

export const symbolManagementList = ({ force = false, onProgress } = {}) => {
  const cached = peekSymbolManagementData();
  if (typeof onProgress === 'function') {
    symbolManagementProgressListeners.add(onProgress);
    if (symbolManagementRequest && symbolManagementProgress) {
      onProgress(symbolManagementProgress);
    }
  }

  if (
    !force
    && Array.isArray(cached?.symbols)
    && Date.now() - Number(cached.savedAt || 0) < SYMBOL_MANAGEMENT_CACHE_FRESH_MS
  ) {
    onProgress?.({ ...cached, partial: false });
    symbolManagementProgressListeners.delete(onProgress);
    return Promise.resolve(cached);
  }

  if (!symbolManagementRequest) {
    const request = fetchSymbolManagementData().finally(() => {
      if (symbolManagementRequest === request) {
        symbolManagementRequest = null;
        symbolManagementProgress = null;
        symbolManagementProgressListeners.clear();
      }
    });
    symbolManagementRequest = request;
  }

  return symbolManagementRequest;
};

export const preloadSymbolManagementData = () => symbolManagementList().catch(() => undefined);

// Query-cache invalidation alone cannot bypass these module/storage caches.
// Detach old in-flight work before any caller starts its authoritative reload.
export const invalidateRealtimeCaches = (entity = '') => {
  clearOnlineUsersSnapshot();
  advanceRealtimeCacheRevision();
  accountDetailsCacheGeneration += 1;
  accountDetailsFirstPage = null;
  accountDetailsFirstPageAt = 0;
  accountDetailsFirstPagePromise = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(ACCOUNT_DETAILS_CACHE_KEY);
      sessionStorage.removeItem('rtx5_sidebar_accounts_cache_v2');
    }
  } catch { /* Storage is optional; in-memory generations still invalidate. */ }
  invalidatePositionsCache();
  if (!entity || ['resync', 'instruments', 'symbols', 'groups', 'group_symbol_settings', 'brokers'].includes(entity)) {
    invalidateSymbolManagementData();
  }
};
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
export const symbolSessionSet = (symbol, sessions) => apiClient.post(`/SymbolSessionSet?${query({ symbol })}`, sessions);

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
  invalidateRealtimeCaches,
  peekStoredPositionsDataset,
  clearPositionsStorageCache,
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
