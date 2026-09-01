export const ANALYTICS_VIEW_BY_PATH = Object.freeze({
  '/analytics/online-users': 'online-users',
  '/analytics/open-positions': 'open-positions',
  '/analytics/open-orders': 'open-orders',
});

const MAX_REPORTS = 100;
const activeTimings = new Map();
const reports = [];
let sequence = 0;

const now = () => globalThis.performance?.now?.() ?? Date.now();
const isTimestamp = (value) => Number.isFinite(value);
const duration = (end, start) => (
  isTimestamp(end) && isTimestamp(start) ? Math.max(0, end - start) : null
);

export const buildAnalyticsDurations = (marks = {}) => ({
  clickToRequest: duration(marks.requestStarted, marks.interactionStarted),
  requestToResponse: duration(marks.responseReceived, marks.requestStarted),
  responseToProcessed: duration(marks.dataProcessed, marks.responseReceived),
  processedToVisible: duration(marks.dataVisible, marks.dataProcessed),
  clickToRouteVisible: duration(marks.routeVisible, marks.interactionStarted),
  clickToDataVisible: duration(marks.dataVisible, marks.interactionStarted),
});

const addNativeMeasure = (report, label, endStage, startStage) => {
  const start = report.marks[startStage];
  const end = report.marks[endStage];
  if (!isTimestamp(start) || !isTimestamp(end)) return;

  try {
    globalThis.performance?.measure?.(
      `analytics:${report.view}:${report.interaction}:${report.id}:${label}`,
      { start, end }
    );
  } catch {
    // User Timing is diagnostic only and must never affect navigation.
  }
};

const publishReport = (report) => {
  reports.push(report);
  if (reports.length > MAX_REPORTS) reports.shift();

  addNativeMeasure(report, 'click-to-route-visible', 'routeVisible', 'interactionStarted');
  addNativeMeasure(report, 'click-to-data-visible', 'dataVisible', 'interactionStarted');
  addNativeMeasure(report, 'request', 'responseReceived', 'requestStarted');
  addNativeMeasure(report, 'process', 'dataProcessed', 'responseReceived');
  addNativeMeasure(report, 'render', 'dataVisible', 'dataProcessed');

  if (typeof window !== 'undefined') {
    window.__RTX5_ANALYTICS_TIMINGS__ = reports;
    try {
      window.dispatchEvent(new CustomEvent('analytics:timing', { detail: report }));
    } catch {
      // Older embedded browsers may not expose CustomEvent.
    }
  }
};

export const startAnalyticsTiming = (view, interaction = 'navigation') => {
  if (!view) return null;
  const timing = {
    id: ++sequence,
    view,
    interaction,
    marks: { interactionStarted: now() },
    metadata: {},
  };
  activeTimings.set(view, timing);
  return timing.id;
};

export const startAnalyticsNavigationTiming = (path) => {
  const view = ANALYTICS_VIEW_BY_PATH[path];
  return view ? startAnalyticsTiming(view, 'navigation') : null;
};

export const getActiveAnalyticsTimingId = (view) => activeTimings.get(view)?.id ?? null;

export const markAnalyticsTiming = (view, stage, metadata = {}, expectedId) => {
  const timing = activeTimings.get(view);
  if (!timing || !stage) return false;
  if (expectedId !== undefined && timing.id !== expectedId) return false;
  if (!isTimestamp(timing.marks[stage])) timing.marks[stage] = now();
  Object.assign(timing.metadata, metadata);
  return true;
};

export const completeAnalyticsTiming = (
  view,
  { stage = 'dataVisible', outcome = 'success', metadata = {} } = {}
) => {
  const timing = activeTimings.get(view);
  if (!timing) return null;

  markAnalyticsTiming(view, stage, metadata);
  const report = Object.freeze({
    id: timing.id,
    view: timing.view,
    interaction: timing.interaction,
    outcome,
    marks: Object.freeze({ ...timing.marks }),
    durations: Object.freeze(buildAnalyticsDurations(timing.marks)),
    metadata: Object.freeze({ ...timing.metadata }),
  });

  activeTimings.delete(view);
  publishReport(report);
  return report;
};

export const getAnalyticsTimingReports = () => reports.slice();

export const resetAnalyticsTimings = () => {
  activeTimings.clear();
  reports.length = 0;
  sequence = 0;
};
