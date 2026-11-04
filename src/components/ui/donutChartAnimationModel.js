const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export function easeOutCubic(progress) {
  const clamped = Math.max(0, Math.min(1, toFiniteNumber(progress, 1)));
  return 1 - Math.pow(1 - clamped, 3);
}

export function buildDonutChartSignature(data = [], totalValue) {
  const safeData = Array.isArray(data)
    ? data.filter((item) => toFiniteNumber(item?.value, 0) > 0)
    : [];
  const computedTotal = safeData.reduce(
    (sum, item) => sum + Math.max(0, toFiniteNumber(item?.value, 0)),
    0
  );
  const explicitTotal = toFiniteNumber(totalValue, NaN);
  const safeTotal =
    Number.isFinite(explicitTotal) && explicitTotal > 0 ? explicitTotal : computedTotal;

  if (safeData.length === 0 || safeTotal <= 0) {
    return 'donut:empty';
  }

  const tokens = safeData.map((item, idx) => {
    const label = String(item?.label ?? idx).trim();
    const val = Math.max(0, toFiniteNumber(item?.value, 0));
    const pct = ((val / safeTotal) * 100).toFixed(2);
    return `${label}:${val}:${pct}`;
  });

  return `donut:${safeTotal}:${tokens.join('|')}`;
}

export function buildDonutStateSnapshot(segments = [], totalValue = 0) {
  const map = { __total__: Math.max(0, toFiniteNumber(totalValue, 0)) };
  if (!Array.isArray(segments)) return map;
  for (let idx = 0; idx < segments.length; idx += 1) {
    const seg = segments[idx];
    const key = String(seg?.label ?? idx);
    map[key] = {
      ratio: Math.max(0, Math.min(1, toFiniteNumber(seg?.animatedRatio ?? seg?.ratio, 0))),
      value: Math.max(0, toFiniteNumber(seg?.animatedValue ?? seg?.value, 0)),
    };
  }
  return map;
}

export function interpolateDonutChartSegments(
  data = [],
  totalValue,
  fromStateByLabel = {},
  rawProgress = 1,
  {
    isInitialEntrance = true,
    reducedMotion = false,
    staggerStep = 0.08,
  } = {}
) {
  const safeData = Array.isArray(data) ? data : [];
  const computedTotal = safeData.reduce(
    (sum, item) => sum + Math.max(0, toFiniteNumber(item?.value, 0)),
    0
  );
  const explicitTotal = toFiniteNumber(totalValue, NaN);
  const safeTotal =
    Number.isFinite(explicitTotal) && explicitTotal >= 0 ? explicitTotal : computedTotal;

  const clampedProgress = reducedMotion
    ? 1
    : Math.max(0, Math.min(1, toFiniteNumber(rawProgress, 1)));
  const isStatic =
    clampedProgress >= 1 - 1e-4 || safeData.length === 0 || safeTotal <= 0;
  const overallEased = isStatic ? 1 : easeOutCubic(clampedProgress);
  const rotationDeg = isStatic
    ? 0
    : Number(((isInitialEntrance ? -18 : -6) * (1 - overallEased)).toFixed(2));
  const scale = isStatic
    ? 1
    : isInitialEntrance
      ? Number((0.96 + 0.04 * overallEased).toFixed(4))
      : 1;

  const fromTotal = isInitialEntrance
    ? 0
    : Math.max(0, toFiniteNumber(fromStateByLabel?.__total__, safeTotal));
  const animatedTotal = isStatic
    ? safeTotal
    : Math.max(0, Math.round(fromTotal + (safeTotal - fromTotal) * overallEased));

  const rawItems = safeData.map((segment, index) => {
    const targetValue = Math.max(0, toFiniteNumber(segment?.value, 0));
    const targetRatio =
      safeTotal > 0 ? Math.max(0, Math.min(1, targetValue / safeTotal)) : 0;
    const targetPercentage = targetRatio * 100;
    const key = String(segment?.label ?? index);

    if (isStatic) {
      return {
        raw: segment,
        index,
        key,
        targetValue,
        targetRatio,
        targetPercentage,
        rawAnimatedRatio: targetRatio,
        animatedValue: targetValue,
        sliceProgress: 1,
      };
    }

    const prevEntry = fromStateByLabel?.[key] || null;
    const fromRatio = isInitialEntrance
      ? 0
      : Math.max(0, Math.min(1, toFiniteNumber(prevEntry?.ratio, 0)));
    const fromValue = isInitialEntrance
      ? 0
      : Math.max(0, toFiniteNumber(prevEntry?.value, 0));

    const staggerOffset = isInitialEntrance
      ? Math.min(0.32, index * Math.max(0, toFiniteNumber(staggerStep, 0.08)))
      : 0;
    const localRaw =
      staggerOffset > 0
        ? Math.max(0, Math.min(1, (clampedProgress - staggerOffset) / (1 - staggerOffset)))
        : clampedProgress;
    const sliceProgress = easeOutCubic(localRaw);

    const rawAnimatedRatio = Math.max(
      0,
      Math.min(1, fromRatio + (targetRatio - fromRatio) * sliceProgress)
    );
    const animatedValue = Math.max(
      0,
      Math.round(fromValue + (targetValue - fromValue) * sliceProgress)
    );

    return {
      raw: segment,
      index,
      key,
      targetValue,
      targetRatio,
      targetPercentage,
      rawAnimatedRatio,
      animatedValue,
      sliceProgress,
    };
  });

  const sumAnimatedRatio = rawItems.reduce((sum, item) => sum + item.rawAnimatedRatio, 0);
  const ratioScale = !isStatic && sumAnimatedRatio > 1 ? 1 / sumAnimatedRatio : 1;

  let targetCumulativeOffset = 0;
  let animatedCumulativeOffset = 0;

  const segments = rawItems.map((item) => {
    const offset = targetCumulativeOffset;
    targetCumulativeOffset += item.targetPercentage;

    const animatedRatio = isStatic
      ? item.targetRatio
      : item.rawAnimatedRatio * ratioScale;
    const animatedPercentage = isStatic
      ? item.targetPercentage
      : animatedRatio * 100;
    const animatedOffset = isStatic ? offset : animatedCumulativeOffset;
    animatedCumulativeOffset += animatedPercentage;

    const percentLabel =
      safeTotal > 0 ? `${item.targetPercentage.toFixed(2)}%` : '0.00%';
    const animatedPercentLabel = isStatic
      ? percentLabel
      : safeTotal > 0
        ? `${animatedPercentage.toFixed(2)}%`
        : '0.00%';

    return {
      ...item.raw,
      index: item.index,
      value: item.targetValue,
      ratio: item.targetRatio,
      percentage: item.targetPercentage,
      offset,
      animatedValue: item.animatedValue,
      animatedRatio,
      animatedPercentage,
      animatedOffset,
      percentLabel,
      animatedPercentLabel,
      sliceProgress: item.sliceProgress,
    };
  });

  return {
    segments,
    totalValue: safeTotal,
    animatedTotal,
    isStatic,
    isInitialEntrance,
    overallEased,
    rotationDeg,
    scale,
    reducedMotion: Boolean(reducedMotion),
  };
}
