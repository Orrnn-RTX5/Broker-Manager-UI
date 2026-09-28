import { fetchManagerApi } from './managerFetch';
import { getAccountDetailsManyPage } from './api';
import { normalizePagedStreamResult } from '../utils/pagination';
import { normalizeAccount, normalizeSidebarAccountPage } from '../utils/sidebarAccountRows.js';
import { collectAccountPages } from '../utils/collectAccountPages.js';
import { getRealtimeCacheRevision } from './realtimeCacheRevision.js';

export { normalizeAccount, normalizeSidebarAccountPage } from '../utils/sidebarAccountRows.js';

export const SIDEBAR_ACCOUNT_PAGE_SIZE = 30;
const SIDEBAR_CACHE_KEY = 'rtx5_sidebar_accounts_cache_v3';

const isRecordObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const extractRows = (data) => {
  if (Array.isArray(data)) return data;
  if (!isRecordObject(data)) return [];

  const rowKeys = ['accounts', 'answer', 'data', 'records', 'record', 'account', 'user'];
  for (const key of rowKeys) {
    const value = data[key];
    if (Array.isArray(value)) return value;
    if (isRecordObject(value) && (value.login || value.Login)) return [value];
  }

  return data.login || data.Login ? [data] : [];
};

export const getInitialCachedSidebarAccounts = () => {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage?.getItem(SIDEBAR_CACHE_KEY) : null;
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
      const normalized = normalizeSidebarAccountPage(parsed);
      if (normalized?.rows.length > 0) return normalized;
      window.sessionStorage?.removeItem(SIDEBAR_CACHE_KEY);
    }
  } catch {
    // Ignore storage parse errors.
  }
  return undefined;
};

const saveCachedAccounts = (data) => {
  if (!data || !Array.isArray(data.rows)) return;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(SIDEBAR_CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // Storage can be unavailable or full; the in-memory query cache still works.
  }
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected response: ${text.slice(0, 80)}`);
  }
};

export const fetchSidebarAccounts = async ({
  search = '',
  offset = 0,
  limit = SIDEBAR_ACCOUNT_PAGE_SIZE,
  signal,
} = {}) => {
  const searchValue = String(search || '').trim();
  const isExactLoginSearch = /^\d+$/.test(searchValue) && searchValue.length > 0;
  const params = new URLSearchParams();
  let endpoint = '/AccountDetailsMany';

  if (isExactLoginSearch) {
    endpoint = '/AccountDetails';
    params.set('login', searchValue);
  } else if (offset === 0 && !searchValue) {
    const page = await getAccountDetailsManyPage({ limit, offset: 0 }, { signal });
    const result = normalizeSidebarAccountPage(page) || {
      rows: [],
      total: page.total ?? 0,
      hasMore: false,
      nextOffset: 0,
    };
    return result;
  } else {
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (searchValue) params.set('search', searchValue);
  }

  const response = await fetchManagerApi(`${endpoint}?${params.toString()}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal,
  });

  if (!isExactLoginSearch) {
    const page = await normalizePagedStreamResult(
      response,
      { limit, offset, search: searchValue },
      normalizeAccount,
      ['accounts'],
      { signal, serverPaged: true },
    );
    const result = {
      rows: page.rows || [],
      total: page.total ?? null,
      hasMore: Boolean(page.hasMore),
      nextOffset: page.nextOffset ?? offset + (page.rows?.length || 0),
    };
    return result;
  }

  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `API error ${response.status}`);
  }
  const list = extractRows(data).slice(0, limit).map(normalizeAccount);
  return {
    rows: list,
    total: list.length,
    hasMore: false,
    nextOffset: list.length,
  };
};

export const fetchSidebarAccountDetails = async (login, { signal } = {}) => {
  const response = await fetchManagerApi(`/AccountDetails?${new URLSearchParams({ login: String(login) })}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal,
  });
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `API error ${response.status}`);
  }

  const account = normalizeAccount(extractRows(data)[0] || data);
  return { ...account, login: account.login || String(login) };
};

export const fetchAllSidebarAccounts = async ({ search = '', signal } = {}) => {
  const revision = getRealtimeCacheRevision();
  const result = await collectAccountPages((offset) => fetchSidebarAccounts({
    search, offset, limit: 500, signal,
  }), { signal });
  if (!String(search).trim() && revision === getRealtimeCacheRevision()) saveCachedAccounts(result);
  return result;
};

export const getSidebarAccountsQueryOptions = (search = '') => ({
  queryKey: ['sidebar-accounts', String(search || '').trim()],
  queryFn: ({ signal }) => fetchAllSidebarAccounts({
    search,
    signal,
  }),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  meta: { suppressGlobalLoader: true },
});
