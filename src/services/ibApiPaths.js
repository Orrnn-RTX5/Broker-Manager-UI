const FORBIDDEN_SCOPE_KEYS = new Set(['broker_id', 'brokerId']);

export const sanitizeIbPayload = (value = {}) => {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value).reduce((acc, [key, item]) => {
    if (FORBIDDEN_SCOPE_KEYS.has(key)) return acc;
    if (item === undefined || item === null || item === '') return acc;
    acc[key] = item;
    return acc;
  }, {});
};

export const buildIbEndpoint = (path, params = {}) => {
  const cleanPath = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  const search = new URLSearchParams();
  Object.entries(sanitizeIbPayload(params)).forEach(([key, value]) => {
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `${cleanPath}?${query}` : cleanPath;
};
