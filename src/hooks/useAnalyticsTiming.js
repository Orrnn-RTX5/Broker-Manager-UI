import { useLayoutEffect } from 'react';
import {
  completeAnalyticsTiming,
  markAnalyticsTiming,
} from '../utils/analyticsPerformance.js';

const EMPTY_METADATA = Object.freeze({});

const scheduleAfterPaint = (callback, frames = 1) => {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    const timer = globalThis.setTimeout(callback, 0);
    return () => globalThis.clearTimeout(timer);
  }

  let cancelled = false;
  let frameId = null;
  const run = (remaining) => {
    frameId = globalThis.requestAnimationFrame(() => {
      if (cancelled) return;
      if (remaining > 1) run(remaining - 1);
      else callback();
    });
  };
  run(frames);

  return () => {
    cancelled = true;
    if (frameId !== null) globalThis.cancelAnimationFrame?.(frameId);
  };
};

export const useAnalyticsRouteTiming = (view, { completeOnRoute = false } = {}) => {
  useLayoutEffect(() => {
    markAnalyticsTiming(view, 'routeCommitted');
    return scheduleAfterPaint(() => {
      markAnalyticsTiming(view, 'routeVisible');
      if (completeOnRoute) {
        completeAnalyticsTiming(view, {
          stage: 'routeVisible',
          outcome: 'route-ready',
          metadata: { dataRequestRequired: false },
        });
      }
    });
  }, [completeOnRoute, view]);
};

export const useAnalyticsDataTiming = (
  view,
  { settled, outcome = 'success', dataVersion = 0, metadata = EMPTY_METADATA }
) => {
  useLayoutEffect(() => {
    if (!settled) return undefined;
    markAnalyticsTiming(view, 'dataCommitted');

    // Give the parent route's one-frame marker time to run first even though
    // child layout effects are committed before parent layout effects.
    return scheduleAfterPaint(() => {
      completeAnalyticsTiming(view, {
        stage: 'dataVisible',
        outcome,
        metadata,
      });
    }, 2);
  }, [dataVersion, metadata, outcome, settled, view]);
};
