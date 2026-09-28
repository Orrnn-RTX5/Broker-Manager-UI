export const ACTIVITY_RANGES = Object.freeze({
  '1H': { durationMs: 60 * 60_000, bucketMs: 5 * 60_000 },
  '6H': { durationMs: 6 * 60 * 60_000, bucketMs: 30 * 60_000 },
  '24H': { durationMs: 24 * 60 * 60_000, bucketMs: 2 * 60 * 60_000 },
  '7D': { durationMs: 7 * 24 * 60 * 60_000, bucketMs: 12 * 60 * 60_000 },
  '30D': { durationMs: 30 * 24 * 60 * 60_000, bucketMs: 24 * 60 * 60_000 },
});

const EQUITY_HISTORY_MS = ACTIVITY_RANGES['30D'].durationMs;
const EQUITY_OBSERVATION_MS = 5 * 60_000;
const MAX_EQUITY_OBSERVATIONS = 9_000;

export const parseActivityTimestamp = (value) => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const finiteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const appendEquityObservation = (history, observation, now = Date.now()) => {
  const timestamp = parseActivityTimestamp(observation?.timestamp);
  const equity = finiteNumber(observation?.equity);
  if (timestamp === null || equity === null || timestamp > now + 60_000) return history;

  const byBucket = new Map();
  for (const point of Array.isArray(history) ? history : []) {
    const time = parseActivityTimestamp(point?.timestamp);
    const value = finiteNumber(point?.equity);
    if (time !== null && value !== null && time >= now - EQUITY_HISTORY_MS && time <= now + 60_000) {
      byBucket.set(Math.floor(time / EQUITY_OBSERVATION_MS), { timestamp: time, equity: value });
    }
  }
  const observationBucket = Math.floor(timestamp / EQUITY_OBSERVATION_MS);
  if (!byBucket.has(observationBucket) || timestamp >= byBucket.get(observationBucket).timestamp) {
    byBucket.set(observationBucket, { timestamp, equity });
  }
  return [...byBucket.values()]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-MAX_EQUITY_OBSERVATIONS);
};

export const getDealTimestamp = (deal) => parseActivityTimestamp(
  deal?.time ?? deal?.timeDone ?? deal?.timeCreate ?? deal?.timestamp
);

export const buildActivitySeries = ({
  range = '24H',
  now = Date.now(),
  deals = [],
  equityHistory = [],
  volumeCoverageFrom = null,
  volumeCoverageTo = now,
  realLogins = null,
} = {}) => {
  const { durationMs, bucketMs } = ACTIVITY_RANGES[range] || ACTIVITY_RANGES['24H'];
  const start = now - durationMs;
  const firstBucket = Math.floor(start / bucketMs) * bucketMs;
  const lastBucket = Math.floor(now / bucketMs) * bucketMs;
  const buckets = new Map();
  for (let timestamp = firstBucket; timestamp <= lastBucket; timestamp += bucketMs) {
    buckets.set(timestamp, { timestamp, volume: 0, equity: null });
  }

  const seenDeals = new Set();
  for (const deal of Array.isArray(deals) ? deals : []) {
    const time = getDealTimestamp(deal);
    const volume = finiteNumber(deal?.volume);
    const login = String(deal?.login ?? '').trim();
    const ticket = String(deal?.ticket ?? '').trim();
    const action = String(deal?.action ?? '').trim().toLowerCase();
    if (time === null || time < start || time > now || volume === null || volume <= 0 ||
        !String(deal?.symbol ?? '').trim() || !['buy', 'sell', 'deal_buy', 'deal_sell', '0', '1'].includes(action) ||
        (realLogins && !realLogins.has(login))) continue;
    if (ticket && ticket !== '0') {
      if (seenDeals.has(ticket)) continue;
      seenDeals.add(ticket);
    }
    const bucket = buckets.get(Math.floor(time / bucketMs) * bucketMs);
    if (bucket) bucket.volume += volume;
  }

  for (const observation of Array.isArray(equityHistory) ? equityHistory : []) {
    const time = parseActivityTimestamp(observation?.timestamp);
    const equity = finiteNumber(observation?.equity);
    if (time === null || time < start || time > now || equity === null) continue;
    const bucket = buckets.get(Math.floor(time / bucketMs) * bucketMs);
    if (bucket && (bucket.equityAsOf === undefined || time >= bucket.equityAsOf)) {
      bucket.equity = equity;
      bucket.equityAsOf = time;
    }
  }

  return [...buckets.values()].map((point) => ({
    timestamp: point.timestamp,
    equity: point.equity,
    equityAsOf: point.equityAsOf ?? null,
    volumePartial: point.timestamp < start || point.timestamp + bucketMs > volumeCoverageTo,
    volume: volumeCoverageFrom !== null && point.timestamp <= volumeCoverageTo &&
      (volumeCoverageFrom <= start || point.timestamp >= volumeCoverageFrom)
      ? Math.round(point.volume * 1_000_000) / 1_000_000
      : null,
  }));
};
