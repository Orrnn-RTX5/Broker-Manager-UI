import { useCallback, useEffect, useRef, useState } from 'react';
import { getDataAccessScope } from '../../services/dataAccessScope.js';
import {
  SERVER_JOURNAL_PAGE,
  describeServerJournalError,
  fetchServerJournal,
  isServerJournalDenied,
  mergeServerJournalPages,
} from './serverJournal.js';

const LIVE_INTERVAL_MS = 5000;

// The last page is kept per committed access scope, so re-opening the tab (or a
// dock remount) shows it at once without crossing a permission/group change.
let memory = null;

// Server journal state for the operations terminal. It loads when the Journal
// tab opens, when the filter changes and when the manager's access changes
// (`accessKey`, from the polled session); it only polls while Live is on.
export default function useServerJournal(enabled, accessKey = '') {
  // The manager login can survive a role/group change. Bind cached rows to the
  // committed authority snapshot so a remount cannot restore rows from the
  // manager's previous access scope.
  const owner = getDataAccessScope();
  const [remembered] = useState(() => (memory?.owner === owner ? memory : null));
  const [filter, setFilterState] = useState(remembered?.filter ?? 'all');
  const [entries, setEntries] = useState(remembered?.entries ?? []);
  const [cursor, setCursor] = useState(remembered?.cursor ?? '');
  const [scope, setScope] = useState(remembered?.scope ?? null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(remembered?.loaded ?? false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const requestSeq = useRef(0);
  const entriesRef = useRef(entries);
  const filterRef = useRef(filter);
  const loadedRef = useRef(loaded);

  useEffect(() => {
    entriesRef.current = entries;
    filterRef.current = filter;
    memory = { owner, filter, entries, cursor, scope, loaded };
  }, [owner, filter, entries, cursor, scope, loaded]);

  const clearRows = useCallback(() => {
    entriesRef.current = [];
    setEntries([]);
    setCursor('');
    setScope(null);
  }, []);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    const seq = ++requestSeq.current;
    if (!quiet) setLoading(true);
    try {
      const data = await fetchServerJournal({ filter, limit: SERVER_JOURNAL_PAGE });
      if (seq !== requestSeq.current) return;
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
      setCursor(data?.next_cursor || '');
      setScope(data?.scope || null);
      setError('');
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // Access revoked: drop what is on screen. Other errors keep the rows.
      if (isServerJournalDenied(err)) {
        clearRows();
        setLive(false);
      }
      setError(describeServerJournalError(err));
    } finally {
      if (seq === requestSeq.current) {
        loadedRef.current = true;
        setLoaded(true);
        if (!quiet) setLoading(false);
      }
    }
  }, [filter, clearRows]);

  // Also re-runs when accessKey changes, so a grant or revoke shows within one
  // session poll instead of after a page reload.
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(() => refresh({ quiet: loadedRef.current }), 0);
    return () => clearTimeout(timer);
  }, [enabled, refresh, accessKey]);

  useEffect(() => {
    if (!enabled || !live) return undefined;
    const timer = setInterval(() => refresh({ quiet: true }), LIVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, live, refresh]);

  const setFilter = useCallback((next) => {
    if (next === filterRef.current) return;
    filterRef.current = next;
    entriesRef.current = [];
    requestSeq.current++; // drop replies for the previous filter
    loadedRef.current = false;
    setLoaded(false);
    setError('');
    setEntries([]);
    setCursor('');
    setFilterState(next);
  }, []);

  const loadOlder = useCallback(async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setLive(false);
    const seq = requestSeq.current;
    try {
      const data = await fetchServerJournal({ filter, cursor, limit: SERVER_JOURNAL_PAGE });
      if (seq !== requestSeq.current) return;
      setEntries((current) => mergeServerJournalPages(current, Array.isArray(data?.entries) ? data.entries : []));
      setCursor(data?.next_cursor || '');
    } catch (err) {
      if (isServerJournalDenied(err)) {
        requestSeq.current++;
        clearRows();
      }
      setError(describeServerJournalError(err));
    } finally {
      setLoadingOlder(false);
    }
  }, [cursor, filter, loadingOlder, clearRows]);

  return { filter, setFilter, entries, cursor, scope, loading: loading || (enabled && !loaded), loadingOlder, error, live, setLive, refresh, loadOlder, clear: clearRows };
}
