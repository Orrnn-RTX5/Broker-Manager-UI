export const ACTIVITY_RANGES = Object.freeze({
  '1H': { durationMs: 60 * 60_000, bucketMs: 5 * 60_000 },
  '6H': { durationMs: 6 * 60 * 60_000, bucketMs: 30 * 60_000 },
  '24H': { durationMs: 24 * 60 * 60_000, bucketMs: 2 * 60 * 60_000 },
  '7D': { durationMs: 7 * 24 * 60 * 60_000, bucketMs: 12 * 60 * 60_000 },
  '30D': { durationMs: 30 * 24 * 60 * 60_000, bucketMs: 24 * 60 * 60_000 },
});

export const ACTIVITY_CHART_TYPES = Object.freeze([
  {
    id: 'combo',
    label: 'Combo',
    description: 'Vertical volume histogram bars with smooth account equity spline and moving average',
  },
  {
    id: 'candlestick',
    label: 'Candlestick',
    description: 'Institutional OHLC financial candlesticks with high-low wicks and bottom volume strip',
  },
  {
    id: 'flow',
    label: 'Delta Flow',
    description: 'Zero-axis diverging butterfly oscillator (+Buy above zero / -Sell below zero) with net delta',
  },
  {
    id: 'profile',
    label: 'Profile & Donut',
    description: 'Radial order-flow donut gauges paired with horizontal volume-by-interval profile bars',
  },
  {
    id: 'bubble',
    label: 'Bubble Matrix',
    description: 'Multi-dimensional execution bubble matrix sized by lot volume and colored by side dominance',
  },
  {
    id: 'cumulative',
    label: 'Cumulative',
    description: 'Cumulative volume run-rate area with stepped equity trajectory and mean baseline',
  },
]);

const EQUITY_HISTORY_MS = ACTIVITY_RANGES['30D'].durationMs;
const EQUITY_OBSERVATION_MS = 5 * 60_000;
const MAX_EQUITY_OBSERVATIONS = 9_000;

const roundLots = (value) => Math.round(value * 1_000_000) / 1_000_000;

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

function* activityDeals(deals, realLogins, start, now) {
  const seenDeals = new Set();
  for (const deal of Array.isArray(deals) ? deals : []) {
    const time = getDealTimestamp(deal);
    const volume = finiteNumber(deal?.volume);
    const login = String(deal?.login ?? '').trim();
    const ticket = String(deal?.ticket ?? '').trim();
    const symbol = String(deal?.symbol ?? '').trim();
    const action = String(deal?.action ?? '').trim().toLowerCase();
    if (time === null || time < start || time > now || volume === null || volume <= 0 ||
        !symbol || !['buy', 'sell', 'deal_buy', 'deal_sell', '0', '1'].includes(action) ||
        (realLogins && !realLogins.has(login))) continue;
    if (ticket && ticket !== '0') {
      if (seenDeals.has(ticket)) continue;
      seenDeals.add(ticket);
    }
    const side = ['sell', 'deal_sell', '1'].includes(action) ? 'sell' : 'buy';
    yield { time, volume, symbol, side };
  }
}

export const buildSymbolActivity = ({ range = '24H', now = Date.now(), deals = [], realLogins = null } = {}) => {
  const { durationMs } = ACTIVITY_RANGES[range] || ACTIVITY_RANGES['24H'];
  const symbols = new Map();
  let totalVolume = 0;
  let totalDeals = 0;
  for (const { symbol, volume } of activityDeals(deals, realLogins, now - durationMs, now)) {
    const row = symbols.get(symbol) || { symbol, volume: 0, deals: 0 };
    row.volume += volume;
    row.deals += 1;
    symbols.set(symbol, row);
    totalVolume += volume;
    totalDeals += 1;
  }
  const rows = [...symbols.values()]
    .sort((a, b) => b.volume - a.volume || b.deals - a.deals || a.symbol.localeCompare(b.symbol))
    .map((row) => ({ ...row, share: row.volume / totalVolume * 100, volume: roundLots(row.volume) }));
  return { rows, totalVolume: roundLots(totalVolume), totalDeals };
};

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
    buckets.set(timestamp, {
      timestamp,
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
      deals: 0,
      equity: null,
    });
  }

  for (const { time, volume, side } of activityDeals(deals, realLogins, start, now)) {
    const bucket = buckets.get(Math.floor(time / bucketMs) * bucketMs);
    if (bucket) {
      bucket.volume += volume;
      if (side === 'sell') bucket.sellVolume += volume;
      else bucket.buyVolume += volume;
      bucket.deals += 1;
    }
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

  return [...buckets.values()].map((point) => {
    const hasCoverage = volumeCoverageFrom !== null && point.timestamp <= volumeCoverageTo &&
      (volumeCoverageFrom <= start || point.timestamp >= volumeCoverageFrom);
    return {
      timestamp: point.timestamp,
      equity: point.equity,
      equityAsOf: point.equityAsOf ?? null,
      volumePartial: point.timestamp < start || point.timestamp + bucketMs > volumeCoverageTo,
      volume: hasCoverage ? roundLots(point.volume) : null,
      buyVolume: hasCoverage ? roundLots(point.buyVolume) : null,
      sellVolume: hasCoverage ? roundLots(point.sellVolume) : null,
      deals: hasCoverage ? point.deals : null,
    };
  });
};

export const buildActivityChartModel = ({
  series = [],
  range = '24H',
  volumeAsOf = null,
  currentEquity = null,
} = {}) => {
  const { bucketMs } = ACTIVITY_RANGES[range] || ACTIVITY_RANGES['24H'];
  const baseSeries = Array.isArray(series) ? series : [];
  const lastPoint = baseSeries.at(-1);
  const rawPoints = lastPoint && lastPoint.volume !== null && volumeAsOf > lastPoint.timestamp &&
    volumeAsOf < lastPoint.timestamp + bucketMs
    ? [
        ...baseSeries,
        {
          ...lastPoint,
          bucketStart: lastPoint.timestamp,
          timestamp: volumeAsOf,
          equity: null,
          equityAsOf: null,
          volumePartial: true,
        },
      ]
    : baseSeries;

  let runningVolume = 0;
  let totalVolume = 0;
  let totalBuyVolume = 0;
  let totalSellVolume = 0;
  let totalDeals = 0;
  let coveredBuckets = 0;
  let activeBuckets = 0;
  let peakVolume = 0;
  let peakTimestamp = null;

  for (const pt of baseSeries) {
    if (pt.volume !== null && Number.isFinite(pt.volume)) {
      coveredBuckets += 1;
      totalVolume += pt.volume;
      const buy = Number.isFinite(pt.buyVolume) ? pt.buyVolume : pt.volume * 0.5;
      const sell = Number.isFinite(pt.sellVolume) ? pt.sellVolume : Math.max(0, pt.volume - buy);
      totalBuyVolume += buy;
      totalSellVolume += sell;
      totalDeals += Number.isFinite(pt.deals) ? pt.deals : (pt.volume > 0 ? 1 : 0);
      if (pt.volume > 0) activeBuckets += 1;
      if (pt.volume > peakVolume) {
        peakVolume = pt.volume;
        peakTimestamp = pt.timestamp;
      }
    }
  }

  const equityReadings = baseSeries
    .filter((pt) => pt.equity !== null && Number.isFinite(pt.equity))
    .map((pt) => ({ timestamp: pt.equityAsOf ?? pt.timestamp, equity: pt.equity }));
  const fallbackEquity = finiteNumber(currentEquity);
  const effectiveEquityValues = equityReadings.length
    ? equityReadings.map((item) => item.equity)
    : (fallbackEquity !== null ? [fallbackEquity] : []);

  const firstEquity = effectiveEquityValues.length ? effectiveEquityValues[0] : null;
  const latestEquity = effectiveEquityValues.length ? effectiveEquityValues.at(-1) : null;
  const minEquity = effectiveEquityValues.length ? Math.min(...effectiveEquityValues) : null;
  const maxEquity = effectiveEquityValues.length ? Math.max(...effectiveEquityValues) : null;
  const avgEquity = effectiveEquityValues.length
    ? effectiveEquityValues.reduce((sum, val) => sum + val, 0) / effectiveEquityValues.length
    : null;
  const equityDelta = firstEquity !== null && latestEquity !== null ? latestEquity - firstEquity : 0;
  const equityDeltaPct = firstEquity && Math.abs(firstEquity) > 0
    ? (equityDelta / Math.abs(firstEquity)) * 100
    : 0;

  const equitySpan = maxEquity !== null && minEquity !== null ? maxEquity - minEquity : 0;
  const equityPad = maxEquity !== null
    ? Math.max(1, equitySpan * 0.16, Math.abs(maxEquity) * 0.002)
    : 1;
  const equityDomain = minEquity !== null && maxEquity !== null
    ? [minEquity - equityPad, maxEquity + equityPad]
    : [0, 100];

  let carriedEquity = firstEquity;
  let prevCloseVal = firstEquity ?? (peakVolume > 0 ? peakVolume * 0.35 : 0);
  const candleUnitSpan = equitySpan > 0
    ? equitySpan * 0.08
    : (firstEquity !== null && Math.abs(firstEquity) > 0 ? Math.abs(firstEquity) * 0.0012 : Math.max(1, peakVolume * 0.12));

  const points = rawPoints.map((pt, index) => {
    const isSyntheticTail = index === rawPoints.length - 1 && rawPoints.length > baseSeries.length;
    const hasVol = pt.volume !== null && Number.isFinite(pt.volume);
    if (hasVol && !isSyntheticTail) {
      runningVolume = roundLots(runningVolume + pt.volume);
    }
    const buyVol = hasVol
      ? roundLots(Number.isFinite(pt.buyVolume) ? pt.buyVolume : pt.volume * 0.5)
      : null;
    const sellVol = hasVol
      ? roundLots(Number.isFinite(pt.sellVolume) ? pt.sellVolume : Math.max(0, pt.volume - (buyVol || 0)))
      : null;
    const sellVolumeNeg = sellVol !== null ? -sellVol : null;
    const netDelta = buyVol !== null && sellVol !== null ? roundLots(buyVol - sellVol) : null;
    const buyPct = hasVol && pt.volume > 0 ? Math.round((buyVol / pt.volume) * 100) : null;
    const sellPct = buyPct !== null ? 100 - buyPct : null;
    const dealsCount = hasVol ? (Number.isFinite(pt.deals) ? pt.deals : (pt.volume > 0 ? 1 : 0)) : null;

    const windowSlice = rawPoints
      .slice(Math.max(0, index - 2), index + 1)
      .map((item) => item.volume)
      .filter((val) => val !== null && Number.isFinite(val));
    const volumeMA = windowSlice.length
      ? roundLots(windowSlice.reduce((sum, val) => sum + val, 0) / windowSlice.length)
      : null;

    const prevVol = index > 0 ? rawPoints[index - 1]?.volume : null;
    const volumeImpulse = !hasVol || prevVol === null || !Number.isFinite(prevVol)
      ? 'flat'
      : pt.volume > prevVol
        ? 'up'
        : pt.volume < prevVol
          ? 'down'
          : 'flat';

    if (pt.equity !== null && Number.isFinite(pt.equity)) {
      carriedEquity = pt.equity;
    }
    const equityPlot = pt.equity !== null && Number.isFinite(pt.equity)
      ? pt.equity
      : carriedEquity;

    const volRatio = peakVolume > 0 && hasVol ? pt.volume / peakVolume : 0;
    const flowSkew = hasVol && pt.volume > 0 && netDelta !== null ? netDelta / pt.volume : 0;
    const candleOpen = prevCloseVal;
    const rawCandleClose = equityPlot !== null
      ? (equityPlot !== candleOpen ? equityPlot : candleOpen + flowSkew * candleUnitSpan * (0.4 + volRatio))
      : (hasVol ? pt.volume : candleOpen);
    const candleBodyMin = Math.min(candleOpen, rawCandleClose);
    const candleBodyMax = Math.max(candleOpen, rawCandleClose);
    const wickUp = candleUnitSpan * (0.25 + (buyPct !== null ? (buyPct / 100) * 0.65 : 0.25)) * Math.max(0.25, volRatio);
    const wickDown = candleUnitSpan * (0.25 + (sellPct !== null ? (sellPct / 100) * 0.65 : 0.25)) * Math.max(0.25, volRatio);
    const candleHigh = candleBodyMax + wickUp;
    const candleLow = candleBodyMin - wickDown;
    const candleBullish = rawCandleClose >= candleOpen;
    prevCloseVal = rawCandleClose;

    const bubbleRadius = hasVol && pt.volume > 0
      ? Math.round(6 + Math.sqrt(volRatio) * 14)
      : 0;

    return {
      ...pt,
      bucketStart: pt.bucketStart ?? pt.timestamp,
      bucketEnd: (pt.bucketStart ?? pt.timestamp) + bucketMs,
      buyVolume: buyVol,
      sellVolume: sellVol,
      sellVolumeNeg,
      netDelta,
      buyPct,
      sellPct,
      deals: dealsCount,
      cumulativeVolume: hasVol ? runningVolume : null,
      volumeMA,
      volumeImpulse,
      isPeakVolume: hasVol && peakVolume > 0 && pt.volume === peakVolume && pt.timestamp === peakTimestamp,
      equityPlot,
      candleOpen,
      candleClose: rawCandleClose,
      candleHigh,
      candleLow,
      candleBullish,
      bubbleRadius,
    };
  });

  const avgVolume = coveredBuckets > 0 ? roundLots(totalVolume / coveredBuckets) : 0;
  const buySharePct = totalVolume > 0 ? Math.round((totalBuyVolume / totalVolume) * 1000) / 10 : 50;
  const sellSharePct = totalVolume > 0 ? Math.round((100 - buySharePct) * 10) / 10 : 50;

  return {
    points,
    equityDomain,
    summary: {
      totalVolume: roundLots(totalVolume),
      totalBuyVolume: roundLots(totalBuyVolume),
      totalSellVolume: roundLots(totalSellVolume),
      netVolumeDelta: roundLots(totalBuyVolume - totalSellVolume),
      buySharePct,
      sellSharePct,
      totalDeals,
      avgLotPerDeal: totalDeals > 0 ? roundLots(totalVolume / totalDeals) : 0,
      coveredBuckets,
      activeBuckets,
      peakVolume: roundLots(peakVolume),
      peakTimestamp,
      avgVolume,
      firstEquity,
      latestEquity,
      minEquity,
      maxEquity,
      avgEquity,
      equityDelta,
      equityDeltaPct,
      equityCount: equityReadings.length,
    },
  };
};
