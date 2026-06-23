/**
 * useDataSource - Universal "try API → fallback" hook
 *
 * Usage:
 *   const { data, isLoading, isFallback } = useDataSource(api.getClients, CLIENTS_FALLBACK);
 *
 * Behavior:
 *   - Calls fetchFn() on mount
 *   - On success → uses live data, isFallback = false
 *   - On error / timeout → silently uses fallbackData, isFallback = true
 *
 * To wire in a real API later:
 *   1. Replace the stub in src/services/api.js with a real fetch/axios call.
 *   2. No changes needed in components — the hook handles the rest.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const FETCH_TIMEOUT_MS = 8000; // 8 seconds before giving up and using fallback
const MANAGER_REFRESH_EVENT = 'manager:refresh-data';

const useDataSource = (fetchFn, fallbackData, options = {}) => {
  const { pollingInterval = null } = options; // optional polling in ms
  const [data, setData] = useState(fallbackData);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const fetchFnRef = useRef(fetchFn);
  const fallbackDataRef = useRef(fallbackData);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
    fallbackDataRef.current = fallbackData;
  }, [fetchFn, fallbackData]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // Race the fetch against a timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), FETCH_TIMEOUT_MS)
    );

    try {
      const result = await Promise.race([fetchFnRef.current(), timeoutPromise]);
      setData(result);
      setIsFallback(false);
    } catch (err) {
      console.warn(`[useDataSource] API call to backend failed: ${err.message}. FALLBACK: Disconnected state.`);
      setData(fallbackDataRef.current);
      setIsFallback(true);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    if (pollingInterval && pollingInterval > 0) {
      intervalRef.current = setInterval(load, pollingInterval);
    }

    const handleManagerRefresh = () => {
      load();
    };
    window.addEventListener(MANAGER_REFRESH_EVENT, handleManagerRefresh);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener(MANAGER_REFRESH_EVENT, handleManagerRefresh);
    };
  }, [load, pollingInterval]);

  return { data, isLoading, isFallback, error, reload: load };
};

export default useDataSource;
