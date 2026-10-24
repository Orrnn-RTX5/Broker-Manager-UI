import { getDataAccessScope, assertDataAccessScope, matchesDataAccessScope } from './dataAccessScope.js';

// /AccountsOnline returns only authorized connections, and each Online
// Users view only pages, searches and sorts that list locally. One shared
// snapshot serves them all: concurrent callers share a single request, and the
// last result is kept in memory and in this tab's sessionStorage so a click or
// a hard refresh can render immediately while a fresh copy loads.

export const ONLINE_USERS_SNAPSHOT_KEY = 'rtx5_online_users_snapshot_v2';

// Callers arriving this soon after a response reuse it instead of refetching
// (e.g. the dashboard charts and its grid mounting together).
const REUSE_WINDOW_MS = 2_000;

let memory = null; // { scope, rows, fetchedAt }
let inflight = null; // { scope, promise }

const currentScope = getDataAccessScope;

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

const readStored = (scope) => {
  try {
    const raw = storage()?.getItem(ONLINE_USERS_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if ((parsed?.scope !== scope && !matchesDataAccessScope(parsed?.scope)) || !Array.isArray(parsed.rows)) return null;
    return { scope, rows: parsed.rows, fetchedAt: Number(parsed.fetchedAt) || 0 };
  } catch {
    return null;
  }
};

const writeStored = (snapshot) => {
  try {
    storage()?.setItem(ONLINE_USERS_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota or private mode: the in-memory snapshot still serves this page.
  }
};

/** Last known snapshot for the signed-in account, without any network work. */
export const peekOnlineUsersSnapshot = () => {
  const scope = currentScope();
  if (memory && (memory.scope === scope || matchesDataAccessScope(memory.scope))) return memory;
  const stored = readStored(scope);
  if (stored) memory = stored;
  return stored;
};

/**
 * Returns the shared snapshot, loading it with `load()` when it is missing or
 * older than `maxAgeMs`. `load` resolves to the normalized row list.
 */
export const fetchOnlineUsersSnapshot = async (load, { maxAgeMs = REUSE_WINDOW_MS } = {}) => {
  const scope = currentScope();
  const known = peekOnlineUsersSnapshot();
  if (known && Date.now() - known.fetchedAt < maxAgeMs) return known;
  if (inflight && (inflight.scope === scope || matchesDataAccessScope(inflight.scope))) return inflight.promise;

  const promise = Promise.resolve()
    .then(load)
    .then((rows) => {
      const snapshot = { scope: currentScope(), rows: Array.isArray(rows) ? rows : [], fetchedAt: Date.now() };
      if (matchesDataAccessScope(scope)) {
        memory = snapshot;
        writeStored(snapshot);
      }
      assertDataAccessScope(scope);
      return snapshot;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  promise.catch(() => undefined);
  inflight = { scope, promise };
  return promise;
};

export const clearOnlineUsersSnapshot = () => {
  memory = null;
  inflight = null;
  try {
    storage()?.removeItem(ONLINE_USERS_SNAPSHOT_KEY);
  } catch {
    // Ignore storage errors.
  }
};

const SEARCH_FIELDS = ['login', 'name', 'group', 'ip', 'country'];

const compareValues = (a, b) => {
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
};

/** Applies a view's search, sort and paging to the shared row list. */
export const pageOnlineUsers = (rows = [], params = {}) => {
  const search = String(params.search || '').trim().toLowerCase();
  let result = search
    ? rows.filter((row) => SEARCH_FIELDS.some((key) => String(row?.[key] ?? '').toLowerCase().includes(search)))
    : rows;

  const sortBy = params.sort_by;
  if (sortBy) {
    const direction = params.sort_dir === 'desc' ? -1 : 1;
    result = [...result].sort((a, b) => direction * compareValues(a?.[sortBy], b?.[sortBy]));
  }

  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.max(1, Number(params.limit) || 30);
  return {
    rows: result.slice(offset, offset + limit),
    total: result.length,
    hasMore: offset + limit < result.length,
  };
};

/** Synchronous page from the last snapshot, for React Query initialData. */
export const peekOnlineUsersPage = (params = {}) => {
  const snapshot = peekOnlineUsersSnapshot();
  return snapshot ? pageOnlineUsers(snapshot.rows, params) : undefined;
};

export const peekOnlineUsersUpdatedAt = () => peekOnlineUsersSnapshot()?.fetchedAt || undefined;
