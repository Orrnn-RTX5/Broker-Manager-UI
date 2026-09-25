const normalizeLogin = (login) => String(login ?? '').trim();

/**
 * Last-known /AccountDetails payloads, so the account window can paint from
 * memory on open while a background request revalidates it.
 *
 * - `peek` returns the last payload of any age (render immediately).
 * - `load` reuses a fresh payload or the in-flight request for the login;
 *   `force` always starts a new request (after writes, periodic refresh).
 * - Results are ordered by request start, so a slow older response never
 *   overwrites a newer one or a locally applied update.
 * - `clear` drops everything (session end) and ignores requests still running.
 */
export const createAccountDetailsStore = ({
  request,
  now = Date.now,
  freshMs = 10_000,
  maxEntries = 200,
} = {}) => {
  if (typeof request !== 'function') throw new TypeError('An account details request function is required');

  const entries = new Map();
  const pending = new Map();
  const listeners = new Set();
  let sequence = 0;
  let clearedThrough = 0;

  const notify = (login) => listeners.forEach((listener) => listener(login));

  const remember = (login, value, requestSequence, savedAt = now()) => {
    if (requestSequence <= clearedThrough) return value;
    const current = entries.get(login);
    if (current && current.sequence > requestSequence) return current.value;
    // Re-insert so Map order tracks recency for the size bound below.
    entries.delete(login);
    entries.set(login, { value, sequence: requestSequence, savedAt });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    notify(login);
    return value;
  };

  const isFresh = (entry) => Boolean(entry && now() - entry.savedAt < freshMs);

  const peek = (login) => entries.get(normalizeLogin(login))?.value;

  const load = (login, { force = false } = {}) => {
    const key = normalizeLogin(login);
    if (!key) return Promise.reject(new Error('Account login is required.'));

    const hit = entries.get(key);
    if (!force && isFresh(hit)) return Promise.resolve(hit.value);
    const inflight = pending.get(key);
    if (!force && inflight) return inflight;

    const requestSequence = ++sequence;
    // Start the request synchronously (prefetches race the open); a throw
    // still becomes a rejection.
    const promise = new Promise((resolve) => resolve(request(key)))
      .then((value) => remember(key, value, requestSequence))
      .finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      });
    pending.set(key, promise);
    return promise;
  };

  // Warms the cache ahead of an open; failures surface on the real load.
  const prefetch = (login) => load(login).catch(() => undefined);

  // Applies a saved write locally so reopening shows it before revalidation.
  // It keeps the entry's fetch time: a patch alone is not a fresh payload.
  const update = (login, patch) => {
    const key = normalizeLogin(login);
    if (!key || !patch || typeof patch !== 'object') return;
    const current = entries.get(key);
    remember(key, { ...(current?.value || {}), ...patch }, ++sequence, current?.savedAt ?? -Infinity);
  };

  const clear = () => {
    entries.clear();
    pending.clear();
    clearedThrough = sequence;
    notify('');
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { clear, load, peek, prefetch, subscribe, update };
};
