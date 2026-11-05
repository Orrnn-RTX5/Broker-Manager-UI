// Account reads that carry live metrics (equity, margin, free margin, margin
// level, profit, storage, floating). With metricsNullable=1 the server answers a
// missing live metric with null, which this UI renders as "—"; without it the
// whole read fails with 503 METRICS_UNAVAILABLE. The flag only says this client
// can render null: it never turns a missing metric into a number.
export const METRICS_NULLABLE_PATHS = Object.freeze([
  '/AccountDetails',
  '/AccountDetailsMany',
  '/AccountsSummary',
  '/api/v1/manager/accounts',
]);

const isReadMethod = (method) => !method || String(method).toUpperCase() === 'GET';

// Adds metricsNullable=1 to a GET of one of the paths above; every other
// endpoint, and the existing query text, is returned unchanged.
export const withMetricsNullable = (endpoint, method) => {
  const raw = String(endpoint ?? '');
  if (!isReadMethod(method)) return raw;
  const queryAt = raw.indexOf('?');
  const path = queryAt === -1 ? raw : raw.slice(0, queryAt);
  if (!METRICS_NULLABLE_PATHS.includes(path)) return raw;
  const params = (queryAt === -1 ? '' : raw.slice(queryAt + 1))
    .split('&')
    .filter((part) => part !== '' && !/^metricsNullable(=|$)/.test(part));
  params.push('metricsNullable=1');
  return `${path}?${params.join('&')}`;
};

// A live account metric as sent by the server: null when the server marks the
// row's metrics unavailable or sends the field as null, otherwise the first
// present key's value; `fallback` only when none of the keys is present at all.
export const accountMetricValue = (record, keys, fallback = 0) => {
  if (!record || typeof record !== 'object') return fallback;
  if (record.metricsAvailable === false || record.MetricsAvailable === false) return null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    if (value === null) return null;
    if (value !== undefined) return value;
  }
  return fallback;
};
