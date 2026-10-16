export const MARKET_WATCH_TICK_CHART_LIMIT = 300;

/** MT5 draws one tick step every ~2px column; denser history scrolls off the left. */
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

const coordinate = (value) => (Math.round(value * 100) / 100).toString();

const clamp = (value, minimum, maximum) => (
  Math.min(maximum, Math.max(minimum, value))
);

const inferPriceDecimals = (value) => {
  if (!Number.isFinite(value)) return 2;
  const text = value.toFixed(5).replace(/0+$/, '');
  const dotIndex = text.indexOf('.');
  if (dotIndex === -1) return 2;
  return clamp(text.length - dotIndex - 1, 2, 5);
};

/** Prints a price at broker digits, or inferred precision (minimum 2 decimals). */
export const formatTickChartPrice = (value, digits) => {
  const safeDigits = Number.isInteger(digits) && digits >= 0
    ? digits
    : inferPriceDecimals(value);
  return Number(value).toFixed(safeDigits);
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
  { width, height, fontSize, digits = null, formatDate, formatTime }
) {
  const candidates = (points || []).slice(-MARKET_WATCH_TICK_CHART_LIMIT);
  if (candidates.length === 0 || width <= 0 || height <= 0) return null;

  const inferredDigits = digits ?? candidates.reduce(
    (maxD, p) => Math.max(maxD, inferPriceDecimals(p.bid), inferPriceDecimals(p.ask)),
    2
  );

  const characterWidth = fontSize * CHARACTER_WIDTH_RATIO;
  const textWidth = (text) => String(text).length * characterWidth;
  const widestPrice = candidates.reduce((widest, point) => Math.max(
    widest,
    textWidth(formatTickChartPrice(point.ask, inferredDigits)),
    textWidth(formatTickChartPrice(point.bid, inferredDigits)),
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
  const visibleCount = clamp(Math.floor(drawWidth / MIN_TICK_SPACING_PX) + 1, 1, candidates.length);
  const visible = candidates.slice(-visibleCount);
  const latest = visible[visible.length - 1];

  let minimum = Math.min(...visible.map((point) => Math.min(point.bid, point.ask)));
  let maximum = Math.max(...visible.map((point) => Math.max(point.bid, point.ask)));
  const brokerStep = 10 ** -inferredDigits;
  const observedRange = maximum - minimum;
  const padding = observedRange > 0
    ? observedRange * PRICE_PADDING_RATIO
    : Math.max(brokerStep * 5, Math.abs(maximum) * 0.0001, Number.EPSILON);
  minimum -= padding;
  maximum += padding;
  const priceRange = maximum - minimum;

  const minimumLabelSpacing = fontSize * MIN_PRICE_LABEL_SPACING_RATIO;
  const { step, decimals } = niceStep(priceRange * minimumLabelSpacing / Math.max(plotHeight, 1), brokerStep);
  const lineCount = Math.ceil(priceRange / step) + 1;
  const labelDigits = Math.max(inferredDigits, decimals);
  const yAt = (price) => plot.top + (1 - (price - minimum) / priceRange) * plotHeight;
  const xAt = (index) => (
    visibleCount === 1
      ? plot.left
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
      segments.push(`H${coordinate(xAt(index))}V${coordinate(yAt(visible[index][side]))}`);
    }
    segments.push(`H${coordinate(plot.right)}`);
    return segments.join('');
  };

  const separators = [];
  for (let index = 1; index < visible.length; index += 1) {
    if (formatDate(visible[index].timestamp) !== formatDate(visible[index - 1].timestamp)) {
      separators.push(xAt(index));
    }
  }

  const timeTicks = [];
  const dateLabel = formatDate(visible[0].timestamp);
  const lastLabel = formatTime(latest.timestamp);
  const lastX = visible.length === 1 ? plot.left + drawWidth : xAt(visible.length - 1);
  const firstEnd = plot.left + textWidth(dateLabel) + TIME_LABEL_GAP_PX;
  timeTicks.push({ x: plot.left, label: dateLabel });
  if (visible.length > 1) {
    const spacing = textWidth('00:00') + TIME_LABEL_GAP_PX * 2;
    const indexStep = visibleCount === 1 ? 0 : drawWidth / (visibleCount - 1);
    for (let x = plot.left + spacing; x < lastX; x += spacing) {
      const index = indexStep > 0 ? Math.round((x - plot.left) / indexStep) : 0;
      const tickX = xAt(index);
      const label = formatTime(visible[index].timestamp).slice(0, 5);
      if (tickX < firstEnd || tickX + textWidth(label) + TIME_LABEL_GAP_PX > lastX) continue;
      timeTicks.push({ x: tickX, label });
    }
    if (lastX >= firstEnd) timeTicks.push({ x: lastX, label: lastLabel, isLast: true });
  } else if (lastX >= firstEnd) {
    timeTicks.push({ x: lastX, label: lastLabel, isLast: true });
  }

  const tagHeight = Math.ceil(fontSize + 4);
  const halfTag = tagHeight / 2;
  let askY = yAt(latest.ask);
  let bidY = yAt(latest.bid);
  if (bidY - askY < tagHeight) {
    const middle = (askY + bidY) / 2;
    askY = middle - halfTag;
    bidY = middle + halfTag;
  }
  askY = clamp(askY, plot.top + halfTag, plot.bottom - halfTag * 3);
  bidY = clamp(Math.max(bidY, askY + tagHeight), plot.top + halfTag * 3, plot.bottom - halfTag);

  return {
    plot,
    axisWidth,
    axisHeight,
    tickLength: AXIS_TICK_PX,
    visibleCount,
    bidPath: stepPath('bid'),
    askPath: stepPath('ask'),
    priceTicks,
    timeTicks,
    separators,
    askTag: { y: askY, label: formatTickChartPrice(latest.ask, labelDigits) },
    bidTag: { y: bidY, label: formatTickChartPrice(latest.bid, labelDigits) },
    tagHeight,
    latest,
  };
}
