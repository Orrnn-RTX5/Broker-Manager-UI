import { ACTIVITY_RANGES, buildActivitySeries } from './dashboardActivityData.js';

const STORAGE_KEY = 'rtx5_dashboard_activity_snapshot_v1';
const SNAPSHOT_VERSION = 1;
const MAX_AGE_MS = 30 * 60_000;
const CLOCK_SKEW_MS = 60_000;
const MAX_STORED_CHARS = 24_000;
const MAX_POINTS_PER_RANGE = 40;

const isNumberOrNull = (value) => value === null || Number.isFinite(value);

const isValidPoint = (point, asOf) => point &&
  Number.isFinite(point.timestamp) &&
  point.timestamp <= asOf &&
  point.timestamp >= asOf - ACTIVITY_RANGES['30D'].durationMs - ACTIVITY_RANGES['30D'].bucketMs &&
  isNumberOrNull(point.volume) &&
  (point.volume === null || point.volume >= 0) &&
  isNumberOrNull(point.equity) &&
  isNumberOrNull(point.equityAsOf) &&
  (point.equityAsOf === null || point.equityAsOf <= asOf) &&
  typeof point.volumePartial === 'boolean';

const isValidSnapshot = (snapshot) => snapshot?.version === SNAPSHOT_VERSION &&
  typeof snapshot.scope === 'string' &&
  snapshot.scope.length > 0 &&
  snapshot.scope !== 'anonymous' &&
  Number.isFinite(snapshot.asOf) &&
  typeof snapshot.partial === 'boolean' &&
  snapshot.seriesByRange &&
  Object.keys(ACTIVITY_RANGES).every((range) => {
    const points = snapshot.seriesByRange[range];
    return Array.isArray(points) &&
      points.length > 0 &&
      points.length <= MAX_POINTS_PER_RANGE &&
      points.every((point) => isValidPoint(point, snapshot.asOf));
  });

const compactPoint = (point) => ({
  timestamp: point.timestamp,
  equity: point.equity,
  equityAsOf: point.equityAsOf,
  volumePartial: point.volumePartial,
  volume: point.volume,
  ...(point.volume > 0
    ? {
        buyVolume: point.buyVolume ?? 0,
        sellVolume: point.sellVolume ?? 0,
        tradeCount: point.deals ?? 0,
      }
    : {}),
});

// Cache only derived chart points. Deal rows, account logins and other PII never enter storage.
export const createActivitySnapshot = ({
  scope,
  asOf,
  deals,
  realLogins,
  equityHistory = [],
  volumeCoverageFrom = null,
  volumeCoverageTo = asOf,
  partial = false,
}) => {
  if (!scope || scope === 'anonymous' || !Number.isFinite(asOf) ||
      !Array.isArray(deals) || !(realLogins instanceof Set)) return null;

  const seriesByRange = Object.fromEntries(Object.keys(ACTIVITY_RANGES).map((range) => [
    range,
    buildActivitySeries({
      range,
      now: asOf,
      deals,
      realLogins,
      equityHistory,
      volumeCoverageFrom,
      volumeCoverageTo,
    }).map(compactPoint),
  ]));
  const snapshot = { version: SNAPSHOT_VERSION, scope, asOf, partial, seriesByRange };
  return isValidSnapshot(snapshot) ? snapshot : null;
};

export const writeActivitySnapshot = (storage, snapshot) => {
  if (!isValidSnapshot(snapshot)) return false;
  try {
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > MAX_STORED_CHARS) return false;
    storage?.setItem(STORAGE_KEY, serialized);
    return Boolean(storage);
  } catch {
    return false;
  }
};

export const readActivitySnapshot = (storage, scope, now = Date.now()) => {
  if (!scope || scope === 'anonymous' || !Number.isFinite(now)) return null;
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_STORED_CHARS) return null;
    const snapshot = JSON.parse(raw);
    if (!isValidSnapshot(snapshot) || snapshot.scope !== scope ||
        snapshot.asOf > now + CLOCK_SKEW_MS || now - snapshot.asOf > MAX_AGE_MS) return null;
    return {
      asOf: snapshot.asOf,
      partial: snapshot.partial,
      seriesByRange: snapshot.seriesByRange,
      cached: true,
    };
  } catch {
    return null;
  }
};
