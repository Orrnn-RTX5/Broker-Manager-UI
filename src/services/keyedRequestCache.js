const normalizeKey = (value) => String(value ?? '').trim();

/**
 * Keeps short-lived successful results and shares one in-flight request per key.
 * Empty arrays are valid cached results; this is important for accounts that do
 * not currently have an open position.
 */
export const createKeyedRequestCache = ({ load, ttlMs = 5_000, now = Date.now }) => {
  if (typeof load !== 'function') throw new TypeError('A load function is required');

  const cached = new Map();
  const pending = new Map();
  const superseded = new WeakSet();
  const keyGenerations = new Map();
  let cacheGeneration = 0;

  const getGeneration = (key) => ({
    cache: cacheGeneration,
    key: keyGenerations.get(key) || 0,
  });

  const generationMatches = (key, generation) => (
    cacheGeneration === generation.cache
    && (keyGenerations.get(key) || 0) === generation.key
  );

  const resolveResult = (key, generation, request, result) => {
    // Invalidated requests still resolve for their original callers, but must
    // never repopulate the cache or block a trailing fresh request.
    if (!generationMatches(key, generation)) return result;

    // A live write wins for both the cache and callers awaiting an older load.
    // Read the current entry so repeated live writes and empty snapshots win.
    const latest = cached.get(key);
    if (superseded.has(request) && latest) return latest.value;

    cached.set(key, { value: result, savedAt: now() });
    return result;
  };

  const get = (value, options) => {
    const key = normalizeKey(value);
    if (!key) return Promise.resolve([]);

    const hit = cached.get(key);
    if (hit && now() - hit.savedAt < ttlMs) return Promise.resolve(hit.value);
    if (pending.has(key)) return pending.get(key);

    const generation = getGeneration(key);
    const request = Promise.resolve()
      .then(() => load(key, options))
      .then((result) => resolveResult(key, generation, request, result))
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
    request.catch(() => undefined);

    pending.set(key, request);
    return request;
  };

  const adopt = (value, sourcePromise) => {
    const key = normalizeKey(value);
    if (!key) return Promise.resolve([]);

    const hit = cached.get(key);
    if (hit && now() - hit.savedAt < ttlMs) return Promise.resolve(hit.value);
    if (pending.has(key)) return pending.get(key);

    const generation = getGeneration(key);
    const request = Promise.resolve(sourcePromise)
      .then((result) => resolveResult(key, generation, request, result))
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
    request.catch(() => undefined);

    pending.set(key, request);
    return request;
  };

  const invalidate = (value) => {
    const key = normalizeKey(value);
    if (key) {
      cached.delete(key);
      pending.delete(key);
      keyGenerations.set(key, (keyGenerations.get(key) || 0) + 1);
      return;
    }

    cached.clear();
    pending.clear();
    keyGenerations.clear();
    cacheGeneration += 1;
  };

  const peek = (value) => {
    const key = normalizeKey(value);
    if (!key) return undefined;
    const hit = cached.get(key);
    if (!hit || now() - hit.savedAt >= ttlMs) return undefined;
    return hit.value;
  };

  const hasPending = (value) => {
    const key = normalizeKey(value);
    return Boolean(key && pending.has(key));
  };

  const replaceIf = (value, expectedValue, nextValue) => {
    const key = normalizeKey(value);
    if (!key) return false;
    const hit = cached.get(key);
    if (!hit || hit.value !== expectedValue) return false;
    cached.set(key, { value: nextValue, savedAt: now() });
    return true;
  };

  // Directly store a value produced outside the loader (e.g. a websocket
  // snapshot) and prevent an older in-flight load from restoring stale data.
  const set = (value, nextValue) => {
    const key = normalizeKey(value);
    if (!key) return;
    const request = pending.get(key);
    if (request) superseded.add(request);
    cached.set(key, { value: nextValue, savedAt: now() });
  };

  return { adopt, get, hasPending, invalidate, peek, replaceIf, set };
};
