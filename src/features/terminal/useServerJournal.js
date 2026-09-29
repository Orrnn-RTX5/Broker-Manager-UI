import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionScopeKey } from '../../services/authService.js';
import {
  SERVER_JOURNAL_PAGE,
  describeServerJournalError,
  fetchServerJournal,
  mergeServerJournalPages,
} from './serverJournal.js';

const LIVE_INTERVAL_MS = 5000;

// The last page is kept per signed-in session, so re-opening the tab (or a dock
// remount) shows it at once and refreshes quietly instead of blanking the list.
let memory = null;

// Server journal state for the operations terminal. It loads when the Journal
// tab opens and when the filter changes; it only polls while Live is on.
export default function useServerJournal(enabled) {
  const owner = getSessionScopeKey() || '';
  const [remembered] = useState(() => (memory?.owner === owner ? memory : null));
  const [filter, setFilterState] = useState(remembered?.filter ?? 'all');
  const [entries, setEntries] = useState(remembered?.entries ?? []);
  const [cursor, setCursor] = useState(remembered?.cursor ?? '');
  const [scope, setScope] = useState(remembered?.scope ?? null);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const requestSeq = useRef(0);
  const entriesRef = useRef(entries);
  const filterRef = useRef(filter);

  useEffect(() => {
    entriesRef.current = entries;
    filterRef.current = filter;
    memory = { owner, filter, entries, cursor, scope };
  }, [owner, filter, entries, cursor, scope]);

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
      setError(describeServerJournalError(err)); // rows already on screen stay
    } finally {
      if (seq === requestSeq.current && !quiet) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setTimeout(() => refresh({ quiet: entriesRef.current.length > 0 }), 0);
    return () => clearTimeout(timer);
  }, [enabled, refresh]);

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
      setError(describeServerJournalError(err));
    } finally {
      setLoadingOlder(false);
    }
  }, [cursor, filter, loadingOlder]);

  return { filter, setFilter, entries, cursor, scope, loading, loadingOlder, error, live, setLive, refresh, loadOlder };
}
