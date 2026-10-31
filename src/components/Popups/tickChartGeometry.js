export const MARKET_WATCH_TICK_CHART_LIMIT = 2_000;

/** MT5 draws one tick every ~2px column; denser history scrolls off the left. */
const MIN_TICK_SPACING_PX = 2;
/** Free space right of the newest tick, where both quotes run flat to the frame. */
const RIGHT_GAP_RATIO = 0.05;
/** Closest price labels may sit, in font heights; MT5 labels its axis about this densely. */
const MIN_PRICE_LABEL_SPACING_RATIO = 2.2;
const TIME_LABEL_GAP_PX = 10;
const AXIS_TICK_PX = 4;
const LABEL_PADDING_PX = 6;
const PRICE_PADDING_RATIO = 0.06;
const MAX_DIGITS = 10;
const NICE_STEPS = [1, 2, 2.5, 5, 10];
/** Average advance of the tabular digits in the UI sans font, per pixel of font size. */
const CHARACTER_WIDTH_RATIO = 0.62;
const CROSSHAIR_PILL_GAP_PX = 5;
const CROSSHAIR_PILL_INSET_PX = 2;

const coordinate = (value) => (Math.round(value * 100) / 100).toString();

const clamp = (value, minimum, maximum) => (
  Math.min(maximum, Math.max(minimum, value))
);

const BACKEND_PRECISION_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: MAX_DIGITS,
  useGrouping: false,
});

const normalizeDigits = (digits) => (
  Number.isInteger(digits) && digits >= 0 && digits <= MAX_DIGITS ? digits : null
);

const countObservedDecimals = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const formatted = BACKEND_PRECISION_FORMAT.format(num);
  const dotIndex = formatted.indexOf('.');
  return dotIndex === -1 ? 0 : clamp(formatted.length - dotIndex - 1, 0, MAX_DIGITS);
};

/** Prints a price at broker digits, or exactly as the backend sent it. */
export const formatTickChartPrice = (value, digits = null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  const validDigits = normalizeDigits(digits);
  return validDigits === null
    ? BACKEND_PRECISION_FORMAT.format(numeric)
    : numeric.toFixed(validDigits);
};

const niceStep = (rawStep, minimumStep) => {
  const safeRaw = Math.max(rawStep, minimumStep, Number.MIN_VALUE);
  const magnitude = 10 ** Math.floor(Math.log10(safeRaw));
  const multiplier = NICE_STEPS.find((candidate) => candidate * magnitude >= safeRaw) ?? 10;
  const step = multiplier * magnitude;
  const decimals = clamp(-Math.floor(Math.log10(step)) + (multiplier === 2.5 ? 1 : 0), 0, MAX_DIGITS);
  return { step, decimals };
};

/**
 * Lays out an MT5 Market Watch tick chart in pixels. Ticks are spaced evenly
 * by arrival order, not by time, and each quote is drawn as a step line that
 * holds its price until the next tick.
 */
export function buildTickChartGeometry(
  points,
  {
    width,
    height,
    fontSize,
    digits = null,
    endOffset = 0,
    includeBid = true,
    includeAsk = true,
    includeLast = false,
    formatDate,
    formatTime,
  }
) {
  const candidates = (points || []).slice(-MARKET_WATCH_TICK_CHART_LIMIT);
  if (candidates.length === 0 || width <= 0 || height <= 0) return null;

  const baseDigits = normalizeDigits(digits);
  const recentSample = candidates.slice(-128);
  const observedDigits = recentSample.reduce((maxDecimals, point) => Math.max(
    maxDecimals,
    countObservedDecimals(point.bid),
    countObservedDecimals(point.ask),
    point.last !== undefined && Number.isFinite(point.last) && point.last > 0
      ? countObservedDecimals(point.last)
      : 0,
  ), 0);
  const effectiveDigits = baseDigits === null
    ? null
    : clamp(Math.max(baseDigits, observedDigits), 0, MAX_DIGITS);

  const characterWidth = fontSize * CHARACTER_WIDTH_RATIO;
  const textWidth = (text) => String(text).length * characterWidth;
  const widestPrice = candidates.reduce((widest, point) => Math.max(
    widest,
    textWidth(formatTickChartPrice(point.ask, effectiveDigits)),
    textWidth(formatTickChartPrice(point.bid, effectiveDigits)),
    point.last !== undefined && Number.isFinite(point.last) && point.last > 0
      ? textWidth(formatTickChartPrice(point.last, effectiveDigits))
      : 0,
  ), 0);
  const axisWidth = Math.ceil(widestPrice + LABEL_PADDING_PX * 2 + AXIS_TICK_PX);
  const axisHeight = Math.ceil(fontSize + LABEL_PADDING_PX + AXIS_TICK_PX);
  const plot = {
    left: 0.5,
    top: 0.5,
    right: Math.max(1.5, width - axisWidth - 0.5),
    bottom: Math.max(1.5, height - axisHeight - 0.5),
  };
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;
  const drawWidth = plotWidth * (1 - RIGHT_GAP_RATIO);
  const maxVisibleSlots = clamp(Math.floor(drawWidth / MIN_TICK_SPACING_PX) + 1, 1, candidates.length);
  const safeOffset = Math.max(0, Math.min(Math.trunc(Number(endOffset) || 0), Math.max(0, candidates.length - maxVisibleSlots)));
  const endIndex = candidates.length - safeOffset;
  const startIndex = Math.max(0, endIndex - maxVisibleSlots);
  const visible = candidates.slice(startIndex, endIndex);
  const visibleCount = visible.length;
  const latest = visible[visible.length - 1];

  const getPointScalePrices = (point) => {
    const prices = [];
    if (includeBid !== false && Number.isFinite(point.bid) && point.bid > 0) prices.push(point.bid);
    if (includeAsk !== false && Number.isFinite(point.ask) && point.ask > 0) prices.push(point.ask);
    if (includeLast !== false && point.last !== undefined && Number.isFinite(point.last) && point.last > 0) {
      prices.push(point.last);
    }
    if (prices.length === 0) {
      if (Number.isFinite(point.bid) && point.bid > 0) prices.push(point.bid);
      if (Number.isFinite(point.ask) && point.ask > 0) prices.push(point.ask);
    }
    return prices;
  };

  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < visible.length; i += 1) {
    const prices = getPointScalePrices(visible[i]);
    for (let j = 0; j < prices.length; j += 1) {
      if (prices[j] < minimum) minimum = prices[j];
      if (prices[j] > maximum) maximum = prices[j];
    }
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    minimum = latest.bid;
    maximum = latest.ask;
  }
  const brokerStep = effectiveDigits === null ? 0 : 10 ** -effectiveDigits;
  const observedRange = maximum - minimum;
  const padding = observedRange > 0
    ? observedRange * PRICE_PADDING_RATIO
    : Math.max(brokerStep * 5, Math.abs(maximum) * 0.00001, Number.EPSILON);
  minimum -= padding;
  maximum += padding;
  const priceRange = maximum - minimum;

  // The finest round step whose labels still clear each other.
  const minimumLabelSpacing = fontSize * MIN_PRICE_LABEL_SPACING_RATIO;
  const { step, decimals } = niceStep(priceRange * minimumLabelSpacing / Math.max(plotHeight, 1), brokerStep);
  const lineCount = Math.ceil(priceRange / step) + 1;
  const labelDigits = effectiveDigits === null ? decimals : Math.max(effectiveDigits, decimals);
  const yAt = (price) => plot.top + (1 - (price - minimum) / priceRange) * plotHeight;
  const xAt = (index) => (
    visibleCount === 1
      ? plot.left + drawWidth
      : plot.left + (index / (visibleCount - 1)) * drawWidth
  );

  const priceTicks = [];
  const firstLine = Math.ceil(minimum / step);
  for (let line = firstLine; line * step <= maximum && line - firstLine <= lineCount; line += 1) {
    const price = line * step;
    priceTicks.push({ y: yAt(price), label: price.toFixed(labelDigits) });
  }

  const stepPath = (side) => {
    const segments = [`M${coordinate(xAt(0))} ${coordinate(yAt(visible[0][side]))}`];
    for (let index = 1; index < visible.length; index += 1) {
      segments.push(`L${coordinate(xAt(index))} ${coordinate(yAt(visible[index][side]))}`);
    }
    segments.push(`H${coordinate(plot.right)}`);
    return segments.join('');
  };

  const lastPoints = visible
    .map((point, index) => (
      point.last !== undefined && Number.isFinite(point.last) && point.last > 0
        ? { index, price: point.last }
        : null
    ))
    .filter((entry) => entry !== null);
  let lastPath = null;
  let lastTag = null;
  if (lastPoints.length > 0) {
    const segments = [`M${coordinate(xAt(lastPoints[0].index))} ${coordinate(yAt(lastPoints[0].price))}`];
    for (let index = 1; index < lastPoints.length; index += 1) {
      segments.push(`L${coordinate(xAt(lastPoints[index].index))} ${coordinate(yAt(lastPoints[index].price))}`);
    }
    segments.push(`H${coordinate(plot.right)}`);
    lastPath = segments.join('');
  }

  const separators = [];
  for (let index = 1; index < visible.length; index += 1) {
    if (formatDate(visible[index].timestamp) !== formatDate(visible[index - 1].timestamp)) {
      separators.push(xAt(index));
    }
  }

  // First label carries the date, the last the newest tick's full time, and
  // regularly spaced labels in between read HH:MM, all in broker server time.
  const timeTicks = [];
  const dateLabel = formatDate(visible[0].timestamp);
  const lastLabel = formatTime(latest.timestamp);
  const lastX = xAt(visible.length - 1);
  const firstEnd = plot.left + textWidth(dateLabel) + TIME_LABEL_GAP_PX;
  timeTicks.push({ x: plot.left, label: dateLabel, isFirst: true });
  if (visible.length > 1) {
    const lastLabelWidth = textWidth(lastLabel);
    const lastLabelStart = Math.min(lastX, plot.right - lastLabelWidth) - TIME_LABEL_GAP_PX;
    const spacing = textWidth('00:00') + TIME_LABEL_GAP_PX * 2.3;
    const indexStep = visibleCount === 1 ? 0 : drawWidth / (visibleCount - 1);
    for (let x = plot.left + spacing; x < lastX; x += spacing) {
      const index = indexStep > 0 ? Math.round((x - plot.left) / indexStep) : 0;
      const tickX = xAt(index);
      const previousX = timeTicks[timeTicks.length - 1]?.x ?? Number.NEGATIVE_INFINITY;
      const label = formatTime(visible[index].timestamp).slice(0, 5);
      if (tickX <= previousX || tickX < firstEnd || tickX + textWidth(label) > lastLabelStart) continue;
      timeTicks.push({ x: tickX, label });
    }
    if (lastX >= firstEnd) timeTicks.push({ x: lastX, label: lastLabel, isLast: true });
  }

  const tagHeight = Math.ceil(fontSize + 4);
  const halfTag = tagHeight / 2;
  const askLineY = clamp(yAt(latest.ask), plot.top, plot.bottom);
  const bidLineY = clamp(yAt(latest.bid), plot.top, plot.bottom);
  let askY = askLineY;
  let bidY = bidLineY;
  if (includeAsk !== false && includeBid !== false) {
    if (bidY - askY < tagHeight) {
      const middle = (askY + bidY) / 2;
      askY = middle - halfTag;
      bidY = middle + halfTag;
    }
    askY = clamp(askY, plot.top + halfTag, plot.bottom - halfTag * 3);
    bidY = clamp(Math.max(bidY, askY + tagHeight), plot.top + halfTag * 3, plot.bottom - halfTag);
  } else {
    askY = clamp(askLineY, plot.top + halfTag, plot.bottom - halfTag);
    bidY = clamp(bidLineY, plot.top + halfTag, plot.bottom - halfTag);
  }
  if (lastPoints.length > 0) {
    const latestLast = lastPoints[lastPoints.length - 1].price;
    const lastLineY = clamp(yAt(latestLast), plot.top, plot.bottom);
    const lastY = clamp(lastLineY, plot.top + halfTag, plot.bottom - halfTag);
    lastTag = { y: lastY, lineY: lastLineY, label: formatTickChartPrice(latestLast, effectiveDigits) };
  }

  return {
    plot,
    axisWidth,
    axisHeight,
    tickLength: AXIS_TICK_PX,
    totalCount: candidates.length,
    visibleCount,
    visiblePoints: visible,
    lastX,
    minimumPrice: minimum,
    maximumPrice: maximum,
    labelDigits,
    effectiveDigits,
    bidPath: stepPath('bid'),
    askPath: stepPath('ask'),
    lastPath,
    priceTicks,
    timeTicks,
    separators,
    askTag: { y: askY, lineY: askLineY, label: formatTickChartPrice(latest.ask, effectiveDigits) },
    bidTag: { y: bidY, lineY: bidLineY, label: formatTickChartPrice(latest.bid, effectiveDigits) },
    lastTag,
    tagHeight,
    latest,
  };
}

/**
 * Computes MT5 Market Watch tick chart crosshair lines, right-axis price badge,
 * bottom-axis `YYYY.MM.DD HH:MM:SS` timestamp badge, and in-plot `Bid / Ask`
 * quote pill for a pointer position inside the plot area.
 */
export function buildTickChartCrosshair(
  geometry,
  pointer,
  {
    fontSize = 11,
    digits = null,
    formatDate = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '.'),
    formatTime = (ms) => new Date(ms).toISOString().slice(11, 19),
  } = {}
) {
  if (!geometry || !pointer || !Array.isArray(geometry.visiblePoints) || geometry.visiblePoints.length === 0) {
    return null;
  }
  const { plot, visibleCount, visiblePoints, minimumPrice, maximumPrice, labelDigits, tagHeight } = geometry;
  const effectiveDigits = geometry.effectiveDigits !== undefined
    ? geometry.effectiveDigits
    : normalizeDigits(digits);

  if (
    pointer.x < plot.left
    || pointer.x > plot.right
    || pointer.y < plot.top
    || pointer.y > plot.bottom
  ) {
    return null;
  }

  const plotWidth = Math.max(1, plot.right - plot.left);
  const plotHeight = Math.max(1, plot.bottom - plot.top);
  const drawWidth = plotWidth * (1 - RIGHT_GAP_RATIO);
  const ratio = drawWidth > 0 ? clamp((pointer.x - plot.left) / drawWidth, 0, 1) : 0;
  const index = visibleCount <= 1
    ? 0
    : clamp(Math.round(ratio * (visibleCount - 1)), 0, visibleCount - 1);
  const point = visiblePoints[index];
  const x = visibleCount <= 1
    ? plot.left + drawWidth
    : plot.left + (index / (visibleCount - 1)) * drawWidth;
  const y = clamp(pointer.y, plot.top, plot.bottom);

  const priceRange = maximumPrice - minimumPrice;
  const price = minimumPrice + (1 - (y - plot.top) / plotHeight) * priceRange;
  const halfTag = tagHeight / 2;
  const priceTagY = clamp(y, plot.top + halfTag, plot.bottom - halfTag);
  const priceTagLabel = formatTickChartPrice(price, effectiveDigits ?? labelDigits);

  const characterWidth = fontSize * CHARACTER_WIDTH_RATIO;
  const textWidth = (text) => String(text).length * characterWidth;

  const timeLabel = `${formatDate(point.timestamp)} ${formatTime(point.timestamp)}`;
  const timeTagWidth = Math.min(plotWidth, Math.ceil(textWidth(timeLabel) + LABEL_PADDING_PX * 2));
  const timeTagX = clamp(
    x - timeTagWidth / 2,
    plot.left,
    Math.max(plot.left, plot.right - timeTagWidth),
  );
  const timeTagY = plot.bottom + 1;

  const pillLabel = `${formatTickChartPrice(point.bid, effectiveDigits)} / ${formatTickChartPrice(point.ask, effectiveDigits)}`;
  const pillWidth = Math.min(
    Math.max(1, plotWidth - CROSSHAIR_PILL_INSET_PX * 2),
    Math.ceil(textWidth(pillLabel) + LABEL_PADDING_PX * 2),
  );
  const pillHeight = tagHeight;
  const rawPillX = x + 2 + pillWidth <= plot.right - CROSSHAIR_PILL_INSET_PX
    ? x + 2
    : x - pillWidth - 2;
  const pillX = clamp(
    rawPillX,
    plot.left + CROSSHAIR_PILL_INSET_PX,
    Math.max(plot.left + CROSSHAIR_PILL_INSET_PX, plot.right - pillWidth - CROSSHAIR_PILL_INSET_PX),
  );
  const rawPillY = y - pillHeight - CROSSHAIR_PILL_GAP_PX >= plot.top + CROSSHAIR_PILL_INSET_PX
    ? y - pillHeight - CROSSHAIR_PILL_GAP_PX
    : y + CROSSHAIR_PILL_GAP_PX;
  const pillY = clamp(
    rawPillY,
    plot.top + CROSSHAIR_PILL_INSET_PX,
    Math.max(plot.top + CROSSHAIR_PILL_INSET_PX, plot.bottom - pillHeight - CROSSHAIR_PILL_INSET_PX),
  );

  return {
    index,
    point,
    x,
    y,
    price,
    priceTagY,
    priceLabel: priceTagLabel,
    timeTagX,
    timeTagWidth,
    timeLabel,
    priceTag: {
      y: priceTagY,
      label: priceTagLabel,
    },
    timeTag: {
      x: timeTagX,
      y: timeTagY,
      width: timeTagWidth,
      height: tagHeight,
      label: timeLabel,
    },
    quotePill: {
      x: pillX,
      y: pillY,
      width: pillWidth,
      height: pillHeight,
      label: pillLabel,
    },
  };
}
