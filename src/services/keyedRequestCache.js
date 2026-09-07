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

  const get = (value, options) => {
    const key = normalizeKey(value);
    if (!key) return Promise.resolve([]);

    const hit = cached.get(key);
    if (hit && now() - hit.savedAt < ttlMs) return Promise.resolve(hit.value);
    if (pending.has(key)) return pending.get(key);

    const generation = getGeneration(key);
    const request = Promise.resolve()
      .then(() => load(key, options))
      .then((result) => {
        // An invalidation that happens while the loader is in flight must win.
        // The old result may still resolve for its original caller, but it must
        // never repopulate the cache or block the trailing fresh request.
        if (generationMatches(key, generation)) {
          cached.set(key, { value: result, savedAt: now() });
        }
        return result;
      })
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });

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
      .then((result) => {
        if (generationMatches(key, generation)) {
          cached.set(key, { value: result, savedAt: now() });
        }
        return result;
      })
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });

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

  return { adopt, get, hasPending, invalidate, peek, replaceIf };
};
