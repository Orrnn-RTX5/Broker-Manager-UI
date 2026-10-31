import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSearch,
  FolderOpen,
  ListFilter,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import './TerminalJournal.css';
import { DockTitleSlotContext } from '../../components/docking/DockTitleSlotContext';
import { useQueryClient } from '@tanstack/react-query';
import { API_HOST } from '../../config/endpoints.js';
import usePagedData from '../../hooks/usePagedData';
import { usePermissions } from '../../hooks/usePermissions';
import { getSessionClaims, getSessionScopeKey } from '../../services/authService.js';
import { getPositionsPage, invalidateGlobalPositionsCache } from '../../services/api';
import { subscribeToPositionSync, requiresPositionReconciliation } from '../../services/positionSync';
import { useLivePositions } from '../../hooks/useLiveTrading';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import {
  TRADE_COLUMNS,
  tradeCells,
  TERMINAL_POSITIONS_QUERY_KEY,
  TERMINAL_POSITIONS_PARAMS,
  readStoredTerminalPage,
  writeStoredTerminalPage,
  clearStoredTerminalPage,
} from './terminalTrades.js';
import {
  JOURNAL_COLUMNS,
  clearTradeJournal,
  getTradeJournalEntries,
  subscribeToTradeJournal,
} from './tradeJournal.js';
import TerminalTabContent from './TerminalTabContent.jsx';
import TradeCommentCell from './TradeCommentCell.jsx';
import useMarginAlerts from './useMarginAlerts.js';
import useServerJournal from './useServerJournal.js';
import {
  SERVER_JOURNAL_COLUMNS,
  SERVER_JOURNAL_FILTERS,
  describeServerJournalScope,
  formatServerJournalTime,
  matchesServerJournalSearch,
  serverJournalAccessKey,
  serverJournalDetail,
  serverJournalLogin,
  severityClass,
} from './serverJournalCore.js';

const fetchTrades = (params, options) => {
  return getPositionsPage(params, options);
};

const rowSide = (value) => {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('sell')) return 'sell';
  if (text.includes('buy')) return 'buy';
  return '';
};

const sideRowClass = (side, isSelected) => [
  side === 'sell' ? 'is-sell' : side === 'buy' ? 'is-buy' : '',
  isSelected ? 'is-selected' : '',
].filter(Boolean).join(' ') || undefined;

// Journal opens by default when Broker Manager starts or when Layout is reset.
const TERMINAL_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'exposure', label: 'Exposure' },
  { id: 'news', label: 'News' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'dealing', label: 'Dealing' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'search', label: 'Search' },
  { id: 'journal', label: 'Journal' },
];

const TAB_STATUS = {
  summary: 'Symbol summary · auto-refresh',
  exposure: 'Symbol exposure',
  news: 'News',
  calendar: 'Economic calendar',
  dealing: 'Dealer queue · auto-refresh',
  alerts: 'Alerts',
  search: 'Search positions',
};

const journalDetailText = (entry) => {
  const d = entry.detail || {};
  const parts = [
    d.ticket !== undefined ? `Ticket #${d.ticket}` : '',
    d.side ? d.side.toUpperCase() : '',
    Number.isFinite(Number(d.volume)) ? Number(d.volume).toFixed(2) : '',
    d.symbol || '',
    d.price !== undefined && d.price !== '' ? `@ ${d.price}` : '',
    d.sl !== undefined && d.sl !== '' && d.sl !== 0 ? `S/L ${d.sl}` : '',
    d.tp !== undefined && d.tp !== '' && d.tp !== 0 ? `T/P ${d.tp}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No additional request details.';
};

const formatServerEntryCopyText = (entry) => {
  if (!entry) return '';
  const time = formatServerJournalTime(entry.time);
  const severity = entry.severity ? entry.severity.charAt(0).toUpperCase() + entry.severity.slice(1) : 'Info';
  const login = serverJournalLogin(entry);
  const detail = serverJournalDetail(entry);
  return [
    time,
    severity,
    entry.source || '',
    entry.action || '',
    String(login ?? ''),
    entry.group || '—',
    entry.message || '',
    detail && detail !== 'No additional details.' ? `(${detail})` : '',
  ].filter(Boolean).join('\t');
};

const formatTradeRequestCopyText = (entry) => {
  if (!entry) return '';
  const detail = journalDetailText(entry);
  return [
    entry.time || '',
    String(entry.dealer ?? ''),
    String(entry.login ?? ''),
    entry.request || '',
    entry.answer || '',
    detail && detail !== 'No additional request details.' ? `(${detail})` : '',
  ].filter(Boolean).join('\t');
};

function TerminalDock({ isAuthenticated = false }) {
  const { slot: titleSlot } = useContext(DockTitleSlotContext) || {};
  const queryClient = useQueryClient();
  const { resolved, hasPermission, isAdmin, role, permissions, accessRevision } = usePermissions();
  const canViewPositions = resolved && hasPermission(PERMISSIONS.VIEW_POSITIONS);
  const { login, brokerId } = getSessionClaims();
  const sessionScope = getSessionScopeKey();
  const terminalScope = !String(login ?? '').trim() || !String(brokerId ?? '').trim() || !sessionScope
    ? ''
    : buildPermissionSessionFingerprint({ token: sessionScope, login, brokerId: `${brokerId}|${API_HOST}` });
  const cachedInitial = useMemo(
    () => canViewPositions ? readStoredTerminalPage(terminalScope) : undefined,
    [terminalScope, canViewPositions]
  );
  const [activeTab, setActiveTab] = useState('journal');
  const [journalEntries, setJournalEntries] = useState(() => getTradeJournalEntries());
  const [selectedTradeKey, setSelectedTradeKey] = useState(null);
  const [selectedJournalId, setSelectedJournalId] = useState(null);
  const [expandedJournalIds, setExpandedJournalIds] = useState(() => new Set());
  const [terminalSearch, setTerminalSearch] = useState('');
  // The Journal tab opens on the server journal; the live trade-request feed is
  // one click away. The server journal loads once and only polls while Live is on.
  const [journalMode, setJournalMode] = useState('server');
  const [expandedServerIds, setExpandedServerIds] = useState(() => new Set());
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [journalAutoScroll, setJournalAutoScroll] = useState(true);
  const [journalAutoArrange, setJournalAutoArrange] = useState(true);
  const [journalShowGrid, setJournalShowGrid] = useState(true);
  const [hiddenServerCols, setHiddenServerCols] = useState(() => new Set());
  const [hiddenRequestCols, setHiddenRequestCols] = useState(() => new Set());
  const [journalContextMenu, setJournalContextMenu] = useState(null);
  const [viewerModalState, setViewerModalState] = useState(null);

  const journalAccessKey = serverJournalAccessKey({ isAdmin, role, permissions, revision: accessRevision });
  const serverJournal = useServerJournal(
    isAuthenticated && activeTab === 'journal' && journalMode === 'server',
    journalAccessKey,
  );
  const { alerts: marginAlerts } = useMarginAlerts(isAuthenticated);
  const journalWrapRef = useRef(null);
  const serverJournalWrapRef = useRef(null);
  const terminalRef = useRef(null);

  useEffect(() => {
    const handleResetLayout = () => {
      setActiveTab('journal');
      setJournalMode('server');
      setTerminalSearch('');
      setSelectedTradeKey(null);
      setSelectedJournalId(null);
      setSelectedServerId(null);
      setViewerModalState(null);
      setJournalContextMenu(null);
    };
    window.addEventListener('manager:reset-layout', handleResetLayout);
    return () => window.removeEventListener('manager:reset-layout', handleResetLayout);
  }, []);

  useEffect(() => {
    if (selectedTradeKey === null) return undefined;
    const clearSelectionOutsideTerminal = (event) => {
      // Include the dock header, where the terminal controls are portaled.
      const terminal = terminalRef.current?.closest('[data-panel-id]') || terminalRef.current;
      if (terminal && !terminal.contains(event.target)) setSelectedTradeKey(null);
    };
    document.addEventListener('pointerdown', clearSelectionOutsideTerminal, true);
    return () => document.removeEventListener('pointerdown', clearSelectionOutsideTerminal, true);
  }, [selectedTradeKey]);

  const { rows: snapshotRows, data, dataUpdatedAt, isFetchedAfterMount, page, offset, hasMore, total, isLoading, isFetching, isError, error, refetch, nextPage, prevPage } = usePagedData({
    queryKey: [...TERMINAL_POSITIONS_QUERY_KEY, terminalScope],
    queryFn: fetchTrades,
    params: TERMINAL_POSITIONS_PARAMS,
    pageSize: 30,
    enabled: isAuthenticated && canViewPositions,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    initialData: cachedInitial,
    initialDataUpdatedAt: cachedInitial?.timestamp,
    placeholderData: (previousData) => previousData || cachedInitial,
  });

  const missingViewPositions = /\bview_positions\b/i.test(String(error?.message || ''));
  const positionsAccessDenied = (resolved && !canViewPositions)
    || (isError && (Number(error?.status) === 403 || missingViewPositions));
  const showPositionViews = canViewPositions && !positionsAccessDenied;
  const liveRows = useLivePositions(snapshotRows, undefined, page === 0 && showPositionViews, data?.liveRevision || 0);
  const rows = useMemo(() => [...liveRows].sort((a, b) => Number(b.position) - Number(a.position)).slice(0, 30), [liveRows]);
  const presentedRows = showPositionViews ? rows : [];
  useEffect(() => {
    if (!positionsAccessDenied) return;
    clearStoredTerminalPage();
  }, [positionsAccessDenied]);
  useEffect(() => {
    if (showPositionViews && page === 0 && isFetchedAfterMount && !isLoading && !isError) {
      writeStoredTerminalPage({ rows: snapshotRows, total, hasMore, timestamp: dataUpdatedAt }, terminalScope);
    }
  }, [snapshotRows, total, hasMore, page, isFetchedAfterMount, isLoading, isError, dataUpdatedAt, terminalScope, showPositionViews]);

  useEffect(() => {
    if (!isAuthenticated || !showPositionViews) return undefined;
    // Coalesce bursts without repeatedly cancelling a slow PositionsAll request.
    // The shared sync service also emits a fallback poll every 30 seconds.
    let timer;
    const unsubscribe = subscribeToPositionSync((event) => {
      if (event.type === 'position' && !requiresPositionReconciliation(event.payload)) return;
      // Wait for the sync service's authoritative HTTP reconciliation instead
      // of refetching once on connect/poll and again when it completes.
      if (event.type !== 'position' && event.reason !== 'reconciled') return;
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        queryClient.invalidateQueries({ queryKey: TERMINAL_POSITIONS_QUERY_KEY }, { cancelRefetch: false });
      }, 200);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [isAuthenticated, showPositionViews, queryClient]);

  useEffect(() => subscribeToTradeJournal((next) => setJournalEntries(next)), []);

  // Keep the journal pinned to the newest entry when Auto Scroll is enabled,
  // but never yank the view while the user is reading older rows.
  useEffect(() => {
    if (!journalAutoScroll || activeTab !== 'journal') return;
    if (journalMode === 'requests') {
      const el = journalWrapRef.current;
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
    } else if (journalMode === 'server') {
      const el = serverJournalWrapRef.current;
      if (el && el.scrollTop < 60) el.scrollTop = 0;
    }
  }, [journalEntries, serverJournal.entries, activeTab, journalMode, journalAutoScroll]);

  useEffect(() => {
    if (journalAutoScroll && activeTab === 'journal' && journalMode === 'requests' && journalWrapRef.current) {
      journalWrapRef.current.scrollTop = journalWrapRef.current.scrollHeight;
    }
  }, [activeTab, journalMode, journalAutoScroll]);

  const handleManualRefresh = () => {
    invalidateGlobalPositionsCache();
    queryClient.invalidateQueries({ queryKey: ['terminal-positions-book'] });
    queryClient.invalidateQueries({ queryKey: ['terminal-exposure-api'] });
    refetch();
  };

  const handleCommentSaved = (row, comment) => {
    invalidateGlobalPositionsCache();
    queryClient.setQueriesData({ queryKey: TERMINAL_POSITIONS_QUERY_KEY }, (data) => {
      if (!data?.rows) return data;
      return { ...data, rows: data.rows.map((item) => (
        String(item.position) === String(row.position) && String(item.login) === String(row.login)
          ? { ...item, comment } : item
      )) };
    });
    queryClient.invalidateQueries({ queryKey: TERMINAL_POSITIONS_QUERY_KEY });
  };

  const toggleJournalExpand = useCallback((id) => {
    setExpandedJournalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleServerExpand = useCallback((id) => {
    setExpandedServerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const searchNeedle = terminalSearch.trim().toLowerCase();
  const visibleTab = !showPositionViews && ['exposure', 'search'].includes(activeTab)
    ? 'summary' : activeTab;
  const showingTrades = visibleTab === 'trades' && showPositionViews;
  const showingServerJournal = visibleTab === 'journal' && journalMode === 'server';
  const visibleServerJournal = searchNeedle
    ? serverJournal.entries.filter((entry) => matchesServerJournalSearch(entry, searchNeedle))
    : serverJournal.entries;
  const serverJournalStatus = !isAuthenticated
    ? 'Sign in to view the journal'
    : serverJournal.error
      || (serverJournal.loading && !serverJournal.entries.length ? 'Loading journal…' : describeServerJournalScope(serverJournal.scope) || 'Journal');
  const visibleRows = searchNeedle
    ? presentedRows.filter((row) => tradeCells(row).join(' ').toLowerCase().includes(searchNeedle))
    : presentedRows;
  const visibleJournal = searchNeedle
    ? journalEntries.filter((entry) => [
        entry.time, entry.dealer, entry.login, entry.request, entry.answer, entry.detail?.symbol,
      ].join(' ').toLowerCase().includes(searchNeedle))
    : journalEntries;

  const visibleServerColumns = useMemo(
    () => SERVER_JOURNAL_COLUMNS.filter((col) => !hiddenServerCols.has(col)),
    [hiddenServerCols]
  );

  const visibleRequestColumns = useMemo(
    () => JOURNAL_COLUMNS.filter((col) => !hiddenRequestCols.has(col)),
    [hiddenRequestCols]
  );

  const handleToggleColumn = useCallback((column) => {
    if (showingServerJournal) {
      setHiddenServerCols((prev) => {
        const next = new Set(prev);
        if (next.has(column)) {
          next.delete(column);
        } else if (SERVER_JOURNAL_COLUMNS.length - next.size > 1) {
          next.add(column);
        }
        return next;
      });
    } else {
      setHiddenRequestCols((prev) => {
        const next = new Set(prev);
        if (next.has(column)) {
          next.delete(column);
        } else if (JOURNAL_COLUMNS.length - next.size > 1) {
          next.add(column);
        }
        return next;
      });
    }
  }, [showingServerJournal]);

  const handleCopyJournalEntry = useCallback(async (targetEntry) => {
    let text = '';
    if (showingServerJournal) {
      const entry = targetEntry || visibleServerJournal.find((item) => item.id === selectedServerId) || visibleServerJournal[0];
      text = entry ? formatServerEntryCopyText(entry) : visibleServerJournal.map(formatServerEntryCopyText).join('\n');
    } else {
      const entry = targetEntry || visibleJournal.find((item) => item.id === selectedJournalId) || visibleJournal[0];
      text = entry ? formatTradeRequestCopyText(entry) : visibleJournal.map(formatTradeRequestCopyText).join('\n');
    }
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // Clipboard write may be restricted in non-secure contexts.
    }
  }, [showingServerJournal, visibleServerJournal, selectedServerId, visibleJournal, selectedJournalId]);

  const handleOpenJournalEntry = useCallback((targetEntry) => {
    if (showingServerJournal) {
      const entry = targetEntry || visibleServerJournal.find((item) => item.id === selectedServerId) || visibleServerJournal[0];
      if (entry) {
        setSelectedServerId(entry.id);
        setExpandedServerIds((prev) => {
          const next = new Set(prev);
          next.add(entry.id);
          return next;
        });
      }
      setViewerModalState({
        dialogType: 'entry',
        mode: 'server',
        entry: entry || null,
      });
    } else {
      const entry = targetEntry || visibleJournal.find((item) => item.id === selectedJournalId) || visibleJournal[0];
      if (entry) {
        setSelectedJournalId(entry.id);
        setExpandedJournalIds((prev) => {
          const next = new Set(prev);
          next.add(entry.id);
          return next;
        });
      }
      setViewerModalState({
        dialogType: 'entry',
        mode: 'requests',
        entry: entry || null,
      });
    }
  }, [showingServerJournal, visibleServerJournal, selectedServerId, visibleJournal, selectedJournalId]);

  const handleOpenJournalViewer = useCallback((targetEntry) => {
    if (showingServerJournal) {
      const entry = targetEntry || visibleServerJournal.find((item) => item.id === selectedServerId) || visibleServerJournal[0] || null;
      setViewerModalState({ dialogType: 'viewer', mode: 'server', entry });
    } else {
      const entry = targetEntry || visibleJournal.find((item) => item.id === selectedJournalId) || visibleJournal[0] || null;
      setViewerModalState({ dialogType: 'viewer', mode: 'requests', entry });
    }
  }, [showingServerJournal, visibleServerJournal, selectedServerId, visibleJournal, selectedJournalId]);

  const handleClearJournal = useCallback(() => {
    if (showingServerJournal) {
      serverJournal.clear?.();
      setSelectedServerId(null);
      setExpandedServerIds(new Set());
    } else {
      clearTradeJournal();
      setSelectedJournalId(null);
      setExpandedJournalIds(new Set());
    }
  }, [showingServerJournal, serverJournal]);

  const handleJournalContextMenu = useCallback((event, entry = null) => {
    event.preventDefault();
    event.stopPropagation();
    if (showingServerJournal && entry) {
      setSelectedServerId(entry.id);
    } else if (!showingServerJournal && entry) {
      setSelectedJournalId(entry.id);
    }
    setJournalContextMenu({
      x: event.clientX,
      y: event.clientY,
      entry,
    });
  }, [showingServerJournal]);

  useEffect(() => {
    if (visibleTab !== 'journal') return undefined;
    const handleKeyDown = (event) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );
      if (isInput) return;

      const terminal = terminalRef.current?.closest('[data-panel-id]') || terminalRef.current;
      const hasSelection = showingServerJournal ? selectedServerId !== null : selectedJournalId !== null;
      const insideTerminal = Boolean(terminal && terminal.contains(activeEl));
      if (!hasSelection && !insideTerminal) return;

      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'c') {
        const selectionText = typeof window !== 'undefined' ? String(window.getSelection?.() || '') : '';
        if (!selectionText) {
          event.preventDefault();
          void handleCopyJournalEntry(null);
        }
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        const key = event.key.toLowerCase();
        if (key === 'a') {
          event.preventDefault();
          setJournalAutoArrange((prev) => !prev);
        } else if (key === 'g') {
          event.preventDefault();
          setJournalShowGrid((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleTab, showingServerJournal, selectedServerId, selectedJournalId, handleCopyJournalEntry]);

  const controls = (
      <div className={`cc-terminal-tabs cc-terminal-title-controls${showingServerJournal ? ' cc-server-journal-controls' : ''}`} role="group" aria-label="Terminal controls">
        {showingServerJournal ? (
          <div className="cc-server-journal-heading">
            <span className="cc-server-journal-caption" role="status" title={serverJournalStatus}>
              {serverJournalStatus.replace(/^Journal\s*·\s*/i, '')}
            </span>
          </div>
        ) : <span className="cc-trade-status" role="status">
          {visibleTab === 'journal'
            ? (!isAuthenticated ? 'Sign in to view trade requests' : 'Trade requests · live feed')
            : showingTrades
              ? (isError
                ? (positionsAccessDenied ? 'Positions access denied - contact broker administrator' : 'Trade refresh failed — retry')
                : (isFetching && presentedRows.length === 0)
                  ? 'Synchronizing trades…'
                  : 'Open trades · auto-refresh')
              : (!isAuthenticated ? 'Sign in to view the terminal' : visibleTab === 'summary' && !showPositionViews ? 'Alerts' : (TAB_STATUS[visibleTab] || 'Terminal'))}
        </span>}
        {showingTrades ? (
          <>
            <button type="button" onClick={handleManualRefresh} disabled={!isAuthenticated || isFetching}>Refresh</button>
            <button type="button" aria-label="Previous trades" onClick={prevPage} disabled={!isAuthenticated || positionsAccessDenied || page === 0 || isFetching}>Previous</button>
            <span className="cc-trade-page">{presentedRows.length ? `${offset + 1}–${offset + presentedRows.length}` : `Page ${page + 1}`}</span>
            <button type="button" aria-label="Next trades" onClick={nextPage} disabled={!isAuthenticated || positionsAccessDenied || !hasMore || isFetching}>Next</button>
          </>
        ) : (visibleTab === 'summary' || visibleTab === 'exposure') && showPositionViews ? (
          <button type="button" onClick={handleManualRefresh} disabled={!isAuthenticated || isFetching}>Refresh</button>
        ) : visibleTab === 'journal' ? (
          <>
            {!showingServerJournal && <button type="button" aria-pressed={journalMode === 'server'} className={journalMode === 'server' ? 'is-active' : undefined}
              onClick={() => setJournalMode('server')}>Journal</button>}
            <button type="button" aria-pressed={journalMode === 'requests'} className={journalMode === 'requests' ? 'is-active' : undefined}
              onClick={() => setJournalMode('requests')}>Trade requests</button>
            {journalMode === 'server' ? (
              <>
                <label className="cc-server-journal-search">
                  <Search size={12} aria-hidden="true" />
                  <input type="search" aria-label="Search journal" placeholder="Search journal…" value={terminalSearch}
                    onChange={(event) => setTerminalSearch(event.target.value)} />
                </label>
                <div className="cc-server-journal-filter">
                  <ListFilter size={12} aria-hidden="true" />
                  <select aria-label="Journal filter" value={serverJournal.filter} disabled={!isAuthenticated}
                    onChange={(event) => serverJournal.setFilter(event.target.value)}>
                    {SERVER_JOURNAL_FILTERS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  <ChevronDown size={11} aria-hidden="true" />
                </div>
                <label className={`cc-server-journal-live${serverJournal.live ? ' is-live' : ''}`} title="Refresh every 5 seconds">
                  <input type="checkbox" checked={serverJournal.live} disabled={!isAuthenticated}
                    onChange={(event) => serverJournal.setLive(event.target.checked)} /> Live
                </label>
                <button type="button" className="cc-server-journal-refresh" aria-label="Refresh journal" title="Refresh journal"
                  onClick={() => serverJournal.refresh()} disabled={!isAuthenticated || serverJournal.loading}>
                  <RefreshCw size={13} aria-hidden="true" />
                </button>
              </>
            ) : (
              <button type="button" onClick={clearTradeJournal} disabled={!journalEntries.length}>Clear</button>
            )}
          </>
        ) : null}
      </div>
  );

  const journalTableModifierClasses = [
    !journalShowGrid ? 'is-no-grid' : '',
    !journalAutoArrange ? 'is-manual-arrange' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`cc-terminal${showingServerJournal ? ' cc-terminal-journal' : ''}`} ref={terminalRef} tabIndex={-1}>
      {titleSlot ? createPortal(controls, titleSlot) : null}
      {showingServerJournal ? (
        <div
          className="cc-terminal-table-wrap"
          ref={serverJournalWrapRef}
          onContextMenu={(event) => handleJournalContextMenu(event, null)}
        >
          <table
            className={`cc-terminal-table cc-journal-table cc-server-journal-table ${journalTableModifierClasses}`.trim()}
            aria-label="Server journal"
            aria-busy={serverJournal.loading}
          >
            <thead>
              <tr>
                <th scope="col" className="cc-journal-expander-col"></th>
                {visibleServerColumns.map((label) => <th key={label} scope="col">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleServerJournal.map((entry, index) => (
                <ServerJournalRow
                  key={entry.id}
                  entry={entry}
                  visibleColumns={visibleServerColumns}
                  alternate={index % 2 === 1}
                  expanded={expandedServerIds.has(entry.id)}
                  selected={selectedServerId === entry.id}
                  onToggleExpand={() => toggleServerExpand(entry.id)}
                  onSelect={() => setSelectedServerId((prev) => (prev === entry.id ? null : entry.id))}
                  onContextMenu={(event) => handleJournalContextMenu(event, entry)}
                />
              ))}
              {!visibleServerJournal.length && <tr><td colSpan={visibleServerColumns.length + 1}>
                {!isAuthenticated
                  ? 'Sign in to view the journal.'
                  : serverJournal.loading
                    ? 'Loading journal…'
                    : serverJournal.error
                      ? serverJournal.error
                      : serverJournal.entries.length
                        ? 'No journal entries match the search.'
                        : 'No journal events for this filter.'}
              </td></tr>}
              {serverJournal.cursor && !searchNeedle && (
                <tr className="cc-server-journal-more"><td colSpan={visibleServerColumns.length + 1}>
                  <button type="button" onClick={serverJournal.loadOlder} disabled={serverJournal.loadingOlder}>
                    {serverJournal.loadingOlder ? 'Loading…' : 'Load older events'}
                  </button>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : visibleTab === 'journal' ? (
        <div
          className="cc-terminal-table-wrap"
          ref={journalWrapRef}
          onContextMenu={(event) => handleJournalContextMenu(event, null)}
        >
          <table
            className={`cc-terminal-table cc-journal-table ${journalTableModifierClasses}`.trim()}
            aria-label="Trade request journal"
          >
            <thead>
              <tr>
                <th scope="col" className="cc-journal-expander-col">
                  <button
                    type="button"
                    className="cc-journal-expander cc-journal-clear"
                    title="Clear journal"
                    aria-label="Clear journal"
                    onClick={clearTradeJournal}
                    disabled={!journalEntries.length}
                  >×</button>
                </th>
                {visibleRequestColumns.map((label) => <th key={label} scope="col">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleJournal.map((entry) => (
                <JournalRow
                  key={entry.id}
                  entry={entry}
                  visibleColumns={visibleRequestColumns}
                  expanded={expandedJournalIds.has(entry.id)}
                  selected={selectedJournalId === entry.id}
                  onToggleExpand={() => toggleJournalExpand(entry.id)}
                  onSelect={() => setSelectedJournalId((prev) => (prev === entry.id ? null : entry.id))}
                  onContextMenu={(event) => handleJournalContextMenu(event, entry)}
                />
              ))}
              {!visibleJournal.length && <tr><td colSpan={visibleRequestColumns.length + 1}>
                {!isAuthenticated
                  ? 'Sign in to view trade requests.'
                  : journalEntries.length
                    ? 'No journal entries match the search.'
                    : 'No trade requests yet — buy, sell and modify activity will appear here.'}
              </td></tr>}
            </tbody>
          </table>
        </div>
      ) : showingTrades ? (
        <div className="cc-terminal-table-wrap">
          <table className="cc-terminal-table cc-terminal-trades" aria-label="Synchronized open trades" aria-busy={isFetching}>
            <thead><tr>{TRADE_COLUMNS.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {visibleRows.map((row) => {
                const tradeKey = `${row.login}-${row.position}`;
                const profitClassName = Number(row.profit) < 0 ? 'is-negative' : 'is-positive';
                return (
                  <tr
                    key={tradeKey}
                    className={sideRowClass(rowSide(row.type ?? row.action), selectedTradeKey === tradeKey)}
                    aria-selected={selectedTradeKey === tradeKey}
                    onClick={() => setSelectedTradeKey(tradeKey)}
                  >
                    {tradeCells(row).map((cell, index) => {
                      const column = TRADE_COLUMNS[index];
                      return (
                        <td key={column} title={String(cell)}>
                          {column === 'Action' ? (
                            <span className="cc-trade-side">{cell}</span>
                          ) : column === 'Profit / Loss' ? (
                            <span className={`cc-trade-profit ${profitClassName}`}>{cell}</span>
                          ) : column === 'Comment' ? (
                            <TradeCommentCell row={row} disabled={!isAuthenticated} onSaved={(comment) => handleCommentSaved(row, comment)} />
                          ) : cell}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!visibleRows.length && <tr><td colSpan={TRADE_COLUMNS.length}>
                {!isAuthenticated
                  ? 'Sign in to view trader positions.'
                  : isLoading
                    ? 'Loading trades…'
                    : isError
                      ? (positionsAccessDenied
                        ? (missingViewPositions
                          ? 'This manager account needs View Positions permission. Ask a broker administrator to enable it.'
                          : 'This manager account cannot access positions. Ask a broker administrator to check its permissions.')
                        : 'Unable to load trades. Use Refresh to try again.')
                      : presentedRows.length
                        ? 'No trades match the search.'
                        : 'No open trades on this page.'}
              </td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <TerminalTabContent tab={visibleTab} search={terminalSearch} isAuthenticated={isAuthenticated} canViewPositions={showPositionViews} />
      )}
      <div className="cc-terminal-tabs cc-terminal-bottom" role="tablist" aria-label="Terminal views">
        {TERMINAL_TABS.filter((tab) => showPositionViews || !['exposure', 'search'].includes(tab.id)).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={visibleTab === tab.id}
            className={visibleTab === tab.id ? 'is-active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'summary' && marginAlerts.length > 0 && (
              <b className="is-alert" title={`${marginAlerts.length} margin alert${marginAlerts.length === 1 ? '' : 's'}`}>
                {marginAlerts.length > 99 ? '99+' : marginAlerts.length}
              </b>
            )}
            {tab.id === 'journal' && !showingServerJournal && journalEntries.length > 0 && (
              <b>{journalEntries.length > 99 ? '99+' : journalEntries.length}</b>
            )}
          </button>
        ))}
        {!titleSlot && (
          <div className="cc-terminal-bottom-controls">
            {controls}
          </div>
        )}
        {showingServerJournal ? (
          <span className="cc-server-journal-count">
            {searchNeedle ? `${visibleServerJournal.length} of ${serverJournal.entries.length}` : visibleServerJournal.length}
            {' '}{serverJournal.entries.length === 1 ? 'event' : 'events'}
          </span>
        ) : <input
          type="search"
          className="cc-terminal-search"
          placeholder="Search"
          aria-label="Search terminal rows"
          value={terminalSearch}
          onChange={(event) => setTerminalSearch(event.target.value)}
        />}
      </div>

      {journalContextMenu && (
        <JournalContextMenu
          x={journalContextMenu.x}
          y={journalContextMenu.y}
          entry={journalContextMenu.entry}
          autoScroll={journalAutoScroll}
          autoArrange={journalAutoArrange}
          showGrid={journalShowGrid}
          allColumns={showingServerJournal ? ['Time', 'Source'] : JOURNAL_COLUMNS}
          hiddenColumns={showingServerJournal ? hiddenServerCols : hiddenRequestCols}
          onOpen={() => handleOpenJournalEntry(journalContextMenu.entry)}
          onCopy={() => void handleCopyJournalEntry(journalContextMenu.entry)}
          onViewer={() => handleOpenJournalViewer(journalContextMenu.entry)}
          onClear={handleClearJournal}
          onToggleAutoScroll={() => setJournalAutoScroll((prev) => !prev)}
          onToggleAutoArrange={() => setJournalAutoArrange((prev) => !prev)}
          onToggleGrid={() => setJournalShowGrid((prev) => !prev)}
          onToggleColumn={handleToggleColumn}
          onClose={() => setJournalContextMenu(null)}
        />
      )}

      {viewerModalState && (
        <JournalViewerModal
          dialogType={viewerModalState.dialogType}
          mode={viewerModalState.mode}
          initialEntry={viewerModalState.entry}
          serverEntries={serverJournal.entries}
          requestEntries={journalEntries}
          onCopyEntry={(entry) => void handleCopyJournalEntry(entry)}
          onClose={() => setViewerModalState(null)}
        />
      )}
    </div>
  );
}

function JournalContextMenu({
  x,
  y,
  autoScroll,
  autoArrange,
  showGrid,
  allColumns,
  hiddenColumns,
  onOpen,
  onCopy,
  onViewer,
  onClear,
  onToggleAutoScroll,
  onToggleAutoArrange,
  onToggleGrid,
  onToggleColumn,
  onClose,
}) {
  const menuRef = useRef(null);
  const [columnsSubmenuOpen, setColumnsSubmenuOpen] = useState(false);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const menuWidth = 184;
  const menuHeight = 236;
  const safeLeft = typeof window !== 'undefined'
    ? Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8))
    : x;
  const safeTop = typeof window !== 'undefined'
    ? Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8))
    : y;
  const flipSubmenuLeft = typeof window !== 'undefined' && safeLeft + menuWidth + 160 > window.innerWidth;

  const portalRoot = (typeof document !== 'undefined' && document.querySelector('.rtx5-command-shell')) || document.body;

  return createPortal(
    <div
      ref={menuRef}
      className={`cc-journal-context-menu${flipSubmenuLeft ? ' flip-submenu-left' : ''}`}
      role="menu"
      aria-label="Journal context menu"
      style={{ left: safeLeft, top: safeTop }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setColumnsSubmenuOpen(false)}
        onClick={() => {
          onOpen();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-open" aria-hidden="true">
          <FolderOpen size={13} strokeWidth={1.8} />
        </span>
        <span className="cc-journal-ctx-label">Open</span>
      </button>

      <button
        type="button"
        role="menuitem"
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setColumnsSubmenuOpen(false)}
        onClick={() => {
          onCopy();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-copy" aria-hidden="true">
          <Copy size={13} strokeWidth={1.8} />
        </span>
        <span className="cc-journal-ctx-label">Copy</span>
        <span className="cc-journal-ctx-shortcut">Ctrl+C</span>
      </button>

      <button
        type="button"
        role="menuitem"
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setColumnsSubmenuOpen(false)}
        onClick={() => {
          onViewer();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-viewer" aria-hidden="true">
          <FileSearch size={13} strokeWidth={1.8} />
        </span>
        <span className="cc-journal-ctx-label">Viewer</span>
      </button>

      <button
        type="button"
        role="menuitem"
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setColumnsSubmenuOpen(false)}
        onClick={() => {
          onClear();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-clear" aria-hidden="true">
          <X size={13} strokeWidth={2} />
        </span>
        <span className="cc-journal-ctx-label">Clear</span>
      </button>

      <div className="cc-journal-context-menu-separator" role="separator" />

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={autoScroll}
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setColumnsSubmenuOpen(false)}
        onClick={() => {
          onToggleAutoScroll();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
          {autoScroll ? <Check size={12} strokeWidth={2.4} /> : null}
        </span>
        <span className="cc-journal-ctx-label">Auto Scroll</span>
      </button>

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={autoArrange}
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setColumnsSubmenuOpen(false)}
        onClick={() => {
          onToggleAutoArrange();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
          {autoArrange ? <Check size={12} strokeWidth={2.4} /> : null}
        </span>
        <span className="cc-journal-ctx-label">Auto Arrange</span>
        <span className="cc-journal-ctx-shortcut">A</span>
      </button>

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={showGrid}
        className="cc-journal-context-menu-item"
        onMouseEnter={() => setColumnsSubmenuOpen(false)}
        onClick={() => {
          onToggleGrid();
          onClose();
        }}
      >
        <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
          {showGrid ? <Check size={12} strokeWidth={2.4} /> : null}
        </span>
        <span className="cc-journal-ctx-label">Grid</span>
        <span className="cc-journal-ctx-shortcut">G</span>
      </button>

      <div className="cc-journal-context-menu-separator" role="separator" />

      <div
        className="cc-journal-context-menu-submenu-wrap"
        onMouseEnter={() => setColumnsSubmenuOpen(true)}
        onMouseLeave={() => setColumnsSubmenuOpen(false)}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={columnsSubmenuOpen}
          className={`cc-journal-context-menu-item${columnsSubmenuOpen ? ' is-open' : ''}`}
          onClick={() => setColumnsSubmenuOpen((prev) => !prev)}
        >
          <span className="cc-journal-ctx-icon" aria-hidden="true" />
          <span className="cc-journal-ctx-label">Columns</span>
          <span className="cc-journal-ctx-arrow" aria-hidden="true">▸</span>
        </button>

        {columnsSubmenuOpen && (
          <div className="cc-journal-context-submenu" role="menu" aria-label="Journal columns">
            {allColumns.map((column) => {
              const checked = !hiddenColumns.has(column);
              return (
                <button
                  key={column}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  className="cc-journal-context-menu-item"
                  onClick={() => onToggleColumn(column)}
                >
                  <span className="cc-journal-ctx-icon is-check" aria-hidden="true">
                    {checked ? <Check size={12} strokeWidth={2.4} /> : null}
                  </span>
                  <span className="cc-journal-ctx-label">{column}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    portalRoot,
  );
}

function JournalViewerModal({
  dialogType = 'viewer',
  mode,
  initialEntry,
  serverEntries = [],
  requestEntries = [],
  onCopyEntry,
  onClose,
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(() => initialEntry?.id ?? null);
  const [copied, setCopied] = useState(false);

  const isServer = mode === 'server';
  const isEntryDialog = dialogType === 'entry';
  const entries = isServer ? serverEntries : requestEntries;
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return entries;
    return entries.filter((entry) =>
      isServer
        ? matchesServerJournalSearch(entry, needle)
        : [entry.time, entry.dealer, entry.login, entry.request, entry.answer, entry.detail?.symbol]
            .join(' ')
            .toLowerCase()
            .includes(needle)
    );
  }, [entries, isServer, needle]);

  const activeEntry = useMemo(
    () => (isEntryDialog ? (initialEntry || entries[0] || null) : (filtered.find((entry) => entry.id === selectedId) || filtered[0] || initialEntry || null)),
    [isEntryDialog, filtered, selectedId, initialEntry, entries]
  );

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const portalRoot = (typeof document !== 'undefined' && document.querySelector('.rtx5-command-shell')) || document.body;

  const handleCopy = () => {
    if (!activeEntry) return;
    onCopyEntry(activeEntry);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const activeSeverity = String(activeEntry?.severity || 'info').toLowerCase();
  const activeTone = isServer
    ? severityClass(activeSeverity)
    : (/reject|error|fail|denied/i.test(String(activeEntry?.answer || ''))
      ? 'is-error'
      : /done|ok/i.test(String(activeEntry?.answer || ''))
        ? 'is-success'
        : 'is-info');
  const activeSeverityLabel = isServer
    ? (activeEntry?.severity ? activeEntry.severity.charAt(0).toUpperCase() + activeEntry.severity.slice(1) : 'Info')
    : (activeEntry?.answer || 'Event');

  const diagnosticChips = useMemo(() => {
    if (!isServer || !activeEntry) return [];
    const chips = [];
    if (activeEntry.actor_id) {
      chips.push({
        key: 'actor',
        label: 'Actor',
        value: [activeEntry.actor_type, activeEntry.actor_id].filter(Boolean).join(' '),
      });
    }
    if (activeEntry.actor_ip) {
      chips.push({ key: 'ip', label: 'IP', value: activeEntry.actor_ip, mono: true });
    }
    if (activeEntry.result) {
      const isDenied = /denied|fail|error|reject/i.test(String(activeEntry.result));
      chips.push({
        key: 'result',
        label: 'Result',
        value: activeEntry.result,
        tone: isDenied ? 'is-error' : 'is-success',
      });
    }
    if (activeEntry.error_code) {
      chips.push({ key: 'code', label: 'Code', value: activeEntry.error_code, mono: true, tone: 'is-warn' });
    }
    if (activeEntry.metadata?.method && activeEntry.metadata?.path) {
      chips.push({
        key: 'endpoint',
        label: 'Endpoint',
        value: `${activeEntry.metadata.method} ${activeEntry.metadata.path}`,
        mono: true,
      });
    }
    if (activeEntry.request_id) {
      chips.push({ key: 'req', label: 'Request ID', value: activeEntry.request_id, mono: true });
    }
    return chips;
  }, [isServer, activeEntry]);

  return createPortal(
    <div className="cc-journal-viewer-backdrop" onClick={onClose}>
      <div
        className={`cc-journal-viewer-dialog${isEntryDialog ? ' is-entry-dialog' : ''} ${activeTone}`}
        role="dialog"
        aria-modal="true"
        aria-label={isEntryDialog ? 'Journal Entry' : 'Journal Viewer'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="cc-journal-viewer-header">
          <div className="cc-journal-viewer-title">
            <span className={`cc-journal-viewer-icon ${activeTone}`} aria-hidden="true">
              {isEntryDialog ? <FolderOpen size={14} /> : <FileSearch size={14} />}
            </span>
            <div className="cc-journal-viewer-title-group">
              <span className="cc-journal-viewer-heading-text">
                {isEntryDialog ? 'Journal Entry' : 'Journal Viewer'}
              </span>
              <span className="cc-journal-viewer-subtitle">
                {isEntryDialog
                  ? (isServer ? 'Server Audit Record' : 'Execution Audit Record')
                  : `${filtered.length} ${filtered.length === 1 ? 'event' : 'events'}`}
              </span>
            </div>
          </div>
          <div className="cc-journal-viewer-actions">
            {isEntryDialog && activeEntry && (
              <div className="cc-journal-viewer-header-badges">
                {activeEntry.category && (
                  <span className="cc-journal-category-badge">{activeEntry.category}</span>
                )}
                <span className={`cc-journal-status-pill ${activeTone}`}>
                  <span className="cc-journal-status-dot" aria-hidden="true" />
                  {activeSeverityLabel}
                </span>
              </div>
            )}
            {!isEntryDialog && (
              <>
                <label className="cc-journal-viewer-search">
                  <Search size={12} aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Filter journal entries…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button type="button" className="cc-journal-viewer-btn" onClick={handleCopy} disabled={!activeEntry}>
                  {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </>
            )}
            <button type="button" className="cc-journal-viewer-close" onClick={onClose} aria-label="Close dialog">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="cc-journal-viewer-body">
          {!isEntryDialog && (
            <div className="cc-journal-viewer-table-wrap">
              <table className="cc-terminal-table cc-journal-table cc-server-journal-table">
                <thead>
                  <tr>
                    {isServer
                      ? SERVER_JOURNAL_COLUMNS.map((col) => <th key={col}>{col}</th>)
                      : JOURNAL_COLUMNS.map((col) => <th key={col}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => {
                    const isSelected = activeEntry?.id === entry.id;
                    if (isServer) {
                      const loginVal = serverJournalLogin(entry);
                      const sevLabel = entry.severity ? entry.severity.charAt(0).toUpperCase() + entry.severity.slice(1) : 'Info';
                      return (
                        <tr
                          key={entry.id}
                          className={`cc-server-journal-row${isSelected ? ' is-selected' : ''}`}
                          onClick={() => setSelectedId(entry.id)}
                        >
                          <td className="cc-server-journal-time">{formatServerJournalTime(entry.time)}</td>
                          <td><span className={`cc-server-journal-severity ${severityClass(entry.severity)}`}>{sevLabel}</span></td>
                          <td>{entry.source}</td>
                          <td>{entry.action}</td>
                          <td>{loginVal}</td>
                          <td>{entry.group || '—'}</td>
                          <td>{entry.message}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr
                        key={entry.id}
                        className={`cc-server-journal-row${isSelected ? ' is-selected' : ''}`}
                        onClick={() => setSelectedId(entry.id)}
                      >
                        <td>{entry.time}</td>
                        <td>{entry.dealer}</td>
                        <td>{entry.login}</td>
                        <td>{entry.request}</td>
                        <td>{entry.answer}</td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={isServer ? SERVER_JOURNAL_COLUMNS.length : JOURNAL_COLUMNS.length}>
                        No journal entries match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeEntry ? (
            <div className="cc-journal-viewer-detail">
              <div className="cc-journal-viewer-detail-header">
                <div className="cc-journal-viewer-detail-label">Entry Details</div>
                {(activeEntry.request_id || activeEntry.id) && (
                  <span className="cc-journal-viewer-ref" title="Audit reference ID">
                    {activeEntry.request_id ? `REQ · ${activeEntry.request_id}` : `ID · ${activeEntry.id}`}
                  </span>
                )}
              </div>

              {isServer ? (
                <div className="cc-journal-entry-fields">
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Time</span>
                    <strong className="cc-journal-field-value is-mono">{formatServerJournalTime(activeEntry.time) || '—'}</strong>
                  </div>
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Severity</span>
                    <strong className="cc-journal-field-value">
                      <span className={`cc-journal-status-pill is-compact ${activeTone}`}>
                        <span className="cc-journal-status-dot" aria-hidden="true" />
                        {activeSeverityLabel}
                      </span>
                    </strong>
                  </div>
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Source</span>
                    <strong className="cc-journal-field-value">{activeEntry.source || '—'}</strong>
                  </div>
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Action</span>
                    <strong className="cc-journal-field-value is-mono is-accent">{activeEntry.action || '—'}</strong>
                  </div>
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Login</span>
                    <strong className="cc-journal-field-value is-mono">{serverJournalLogin(activeEntry)}</strong>
                  </div>
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Group</span>
                    <strong className="cc-journal-field-value is-mono">{activeEntry.group || '—'}</strong>
                  </div>
                </div>
              ) : (
                <div className="cc-journal-entry-fields is-four-cols">
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Time</span>
                    <strong className="cc-journal-field-value is-mono">{activeEntry.time || '—'}</strong>
                  </div>
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Dealer</span>
                    <strong className="cc-journal-field-value">{activeEntry.dealer || '—'}</strong>
                  </div>
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Login</span>
                    <strong className="cc-journal-field-value is-mono">{activeEntry.login || '—'}</strong>
                  </div>
                  <div className="cc-journal-field-cell">
                    <span className="cc-journal-field-label">Answer</span>
                    <strong className="cc-journal-field-value">
                      <span className={`cc-journal-status-pill is-compact ${activeTone}`}>
                        <span className="cc-journal-status-dot" aria-hidden="true" />
                        {activeEntry.answer || '—'}
                      </span>
                    </strong>
                  </div>
                </div>
              )}

              <div className="cc-journal-viewer-detail-content">
                {isServer ? (
                  <>
                    <div className={`cc-journal-detail-panel is-message ${activeTone}`}>
                      <div className="cc-journal-detail-panel-header">
                        <span className="cc-journal-detail-panel-title">Message</span>
                      </div>
                      <div className="cc-journal-detail-panel-body is-primary-text">
                        {activeEntry.message || '—'}
                      </div>
                    </div>

                    <div className="cc-journal-detail-panel is-diagnostics">
                      <div className="cc-journal-detail-panel-header">
                        <span className="cc-journal-detail-panel-title">Details &amp; Telemetry</span>
                        {diagnosticChips.length > 0 && (
                          <div className="cc-journal-telemetry-chips">
                            {diagnosticChips.map((chip) => (
                              <span
                                key={chip.key}
                                className={`cc-journal-telemetry-chip${chip.mono ? ' is-mono' : ''}${chip.tone ? ` ${chip.tone}` : ''}`}
                              >
                                <span className="cc-journal-telemetry-chip-key">{chip.label}:</span>
                                <strong className="cc-journal-telemetry-chip-val">{chip.value}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="cc-journal-detail-panel-code">
                        {serverJournalDetail(activeEntry)}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`cc-journal-detail-panel is-message ${activeTone}`}>
                      <div className="cc-journal-detail-panel-header">
                        <span className="cc-journal-detail-panel-title">Request</span>
                      </div>
                      <div className="cc-journal-detail-panel-body is-primary-text">
                        {activeEntry.request || '—'} ({activeEntry.answer || '—'})
                      </div>
                    </div>

                    <div className="cc-journal-detail-panel is-diagnostics">
                      <div className="cc-journal-detail-panel-header">
                        <span className="cc-journal-detail-panel-title">Details</span>
                      </div>
                      <div className="cc-journal-detail-panel-code">
                        {journalDetailText(activeEntry)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="cc-journal-viewer-detail">
              <div className="cc-journal-viewer-detail-content">No journal entry selected.</div>
            </div>
          )}
        </div>

        <footer className="cc-journal-viewer-footer">
          <div className="cc-journal-viewer-footer-meta">
            <span className="cc-journal-kbd-hint">
              <kbd>Esc</kbd> to close
            </span>
          </div>
          <div className="cc-journal-viewer-footer-actions">
            <button
              type="button"
              className={`cc-journal-viewer-btn${copied ? ' is-copied' : ''}`}
              onClick={handleCopy}
              disabled={!activeEntry}
            >
              {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy entry'}
            </button>
            <button type="button" className="cc-journal-viewer-btn is-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>,
    portalRoot,
  );
}

function JournalRow({ entry, visibleColumns = JOURNAL_COLUMNS, expanded, selected, onToggleExpand, onSelect, onContextMenu }) {
  const cellByColumn = {
    Time: <td key="Time">{entry.time}</td>,
    Dealer: <td key="Dealer" title={String(entry.dealer)}>{entry.dealer}</td>,
    Login: <td key="Login" title={String(entry.login)}>{entry.login}</td>,
    Request: <td key="Request" title={entry.request}>{entry.request}</td>,
    Answer: <td key="Answer" title={entry.answer}>{entry.answer}</td>,
  };
  return (
    <>
      <tr
        className={sideRowClass(entry.side, selected)}
        onClick={onSelect}
        onContextMenu={onContextMenu}
      >
        <td className="cc-journal-expander-col">
          <button
            type="button"
            className="cc-journal-expander"
            aria-label={expanded ? 'Collapse request details' : 'Expand request details'}
            aria-expanded={expanded}
            onClick={(event) => { event.stopPropagation(); onToggleExpand(); }}
          >{expanded ? '−' : '+'}</button>
        </td>
        {visibleColumns.map((col) => cellByColumn[col])}
      </tr>
      {expanded && (
        <tr className="cc-journal-detail" onContextMenu={onContextMenu}>
          <td className="cc-journal-expander-col"></td>
          <td colSpan={visibleColumns.length}>{journalDetailText(entry)}</td>
        </tr>
      )}
    </>
  );
}

function ServerJournalRow({ entry, visibleColumns = SERVER_JOURNAL_COLUMNS, alternate, expanded, selected, onToggleExpand, onSelect, onContextMenu }) {
  const login = serverJournalLogin(entry);
  const severityLabel = entry.severity ? entry.severity.charAt(0).toUpperCase() + entry.severity.slice(1) : 'Info';
  const cellByColumn = {
    Time: <td key="Time" className="cc-server-journal-time">{formatServerJournalTime(entry.time)}</td>,
    Type: <td key="Type"><span className={`cc-server-journal-severity ${severityClass(entry.severity)}`}>{severityLabel}</span></td>,
    Source: <td key="Source" title={entry.category}>{entry.source}</td>,
    Action: <td key="Action" title={entry.action}>{entry.action}</td>,
    Login: <td key="Login" title={String(login)}>{login}</td>,
    Group: <td key="Group" className="cc-server-journal-group" title={entry.group || ''}>{entry.group || '—'}</td>,
    Message: <td key="Message" title={entry.message}>{entry.message}</td>,
  };
  return (
    <>
      <tr
        className={`cc-server-journal-row${alternate ? ' is-alternate' : ''}${selected ? ' is-selected' : ''}`}
        onClick={onSelect}
        onContextMenu={onContextMenu}
      >
        <td className="cc-journal-expander-col">
          <button
            type="button"
            className="cc-journal-expander"
            aria-label={expanded ? 'Collapse journal details' : 'Expand journal details'}
            aria-expanded={expanded}
            onClick={(event) => { event.stopPropagation(); onToggleExpand(); }}
          >{expanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}</button>
        </td>
        {visibleColumns.map((col) => cellByColumn[col])}
      </tr>
      {expanded && (
        <tr className="cc-journal-detail" onContextMenu={onContextMenu}>
          <td className="cc-journal-expander-col"></td>
          <td colSpan={visibleColumns.length}>{serverJournalDetail(entry)}</td>
        </tr>
      )}
    </>
  );
}

// The workspace rebuilds its dock panel elements on every route change;
// the terminal only depends on isAuthenticated, so skip those re-renders.
export default memo(TerminalDock);
