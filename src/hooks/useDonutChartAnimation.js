import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDonutChartSignature,
  buildDonutStateSnapshot,
  interpolateDonutChartSegments,
} from '../components/ui/donutChartAnimationModel';

const EMPTY_FROM_STATE = Object.freeze({});

export function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setReducedMotion(Boolean(event.matches));
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
    return undefined;
  }, []);

  return reducedMotion;
}

export function useDonutChartAnimation(
  data = [],
  totalValue,
  {
    initialDurationMs = 680,
    updateDurationMs = 520,
    staggerStep = 0.08,
  } = {}
) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const chartSignature = useMemo(
    () => buildDonutChartSignature(data, totalValue),
    [data, totalValue]
  );

  const completedSignatureRef = useRef(null);
  const displayedStateByLabelRef = useRef({});
  const rafIdRef = useRef(null);

  const [animState, setAnimState] = useState(() => ({
    signature: null,
    progress: prefersReducedMotion ? 1 : 0,
    isInitialEntrance: true,
    fromStateByLabel: {},
    completedStateByLabel: {},
  }));

  useEffect(() => {
    if (rafIdRef.current && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (String(chartSignature).endsWith(':empty')) {
      completedSignatureRef.current = chartSignature;
      displayedStateByLabelRef.current = {};
      return undefined;
    }

    if (prefersReducedMotion) {
      completedSignatureRef.current = chartSignature;
      return undefined;
    }

    // Do not replay animation once this exact data signature has completed
    if (completedSignatureRef.current === chartSignature) {
      return undefined;
    }

    const isFirstLoad =
      completedSignatureRef.current === null ||
      String(completedSignatureRef.current).endsWith(':empty');
    const fromStateSnapshot = isFirstLoad
      ? {}
      : { ...displayedStateByLabelRef.current };

    const durationMs = Math.max(1, isFirstLoad ? initialDurationMs : updateDurationMs);
    const startTime =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    const step = (nowTimestamp) => {
      const now =
        typeof nowTimestamp === 'number'
          ? nowTimestamp
          : typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
      const rawProgress = Math.max(0, Math.min(1, (now - startTime) / durationMs));
      if (rawProgress >= 1) {
        completedSignatureRef.current = chartSignature;
        rafIdRef.current = null;
      }
      setAnimState((prev) => ({
        signature: chartSignature,
        progress: rawProgress,
        isInitialEntrance: isFirstLoad,
        fromStateByLabel: fromStateSnapshot,
        completedStateByLabel:
          rawProgress >= 1
            ? displayedStateByLabelRef.current
            : prev.completedStateByLabel,
      }));

      if (rawProgress < 1) {
        rafIdRef.current = requestAnimationFrame(step);
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      rafIdRef.current = requestAnimationFrame(step);
    } else {
      completedSignatureRef.current = chartSignature;
    }

    return () => {
      if (rafIdRef.current && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [chartSignature, prefersReducedMotion, initialDurationMs, updateDurationMs]);

  const isEmptySignature = String(chartSignature).endsWith(':empty');
  const isMatchingSignature = animState.signature === chartSignature;
  const hasPriorCompleted =
    animState.signature !== null && !String(animState.signature).endsWith(':empty');

  const effectiveProgress =
    prefersReducedMotion || isEmptySignature
      ? 1
      : isMatchingSignature
        ? animState.progress
        : 0;
  const effectiveIsInitialEntrance = isMatchingSignature
    ? animState.isInitialEntrance
    : !hasPriorCompleted;
  const effectiveFromState = isMatchingSignature
    ? animState.fromStateByLabel
    : hasPriorCompleted
      ? animState.completedStateByLabel
      : EMPTY_FROM_STATE;

  const interpolated = useMemo(
    () =>
      interpolateDonutChartSegments(
        data,
        totalValue,
        effectiveFromState,
        effectiveProgress,
        {
          isInitialEntrance: effectiveIsInitialEntrance,
          reducedMotion: prefersReducedMotion,
          staggerStep,
        }
      ),
    [
      data,
      totalValue,
      effectiveFromState,
      effectiveProgress,
      effectiveIsInitialEntrance,
      prefersReducedMotion,
      staggerStep,
    ]
  );

  useEffect(() => {
    displayedStateByLabelRef.current = buildDonutStateSnapshot(
      interpolated.segments,
      interpolated.animatedTotal
    );
  }, [interpolated]);

  return {
    ...interpolated,
    signature: chartSignature,
  };
}

export default useDonutChartAnimation;
