import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DockTitleSlotContext } from '../../components/docking/DockTitleSlotContext';
import { useQueryClient } from '@tanstack/react-query';
import { API_HOST } from '../../config/endpoints.js';
import usePagedData from '../../hooks/usePagedData';
import { getSessionClaims, getSessionScopeKey } from '../../services/authService.js';
import { getPositionsPage, invalidateGlobalPositionsCache } from '../../services/api';
import { subscribeToPositionSync, requiresPositionReconciliation } from '../../services/positionSync';
import { useLivePositions } from '../../hooks/useLiveTrading';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint.js';
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

// The open-trades grid is the panel's default view and the Exposure tab.
// Exposure shows that grid on the first click. Alerts stays on its list.
// Other tabs toggle off when clicked again and return to the trades grid.
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
  summary: 'Account summary',
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

function TerminalDock({ isAuthenticated = false }) {
  const titleSlot = useContext(DockTitleSlotContext);
  const queryClient = useQueryClient();
  const { login, brokerId } = getSessionClaims();
  const sessionScope = getSessionScopeKey();
  const terminalScope = !String(login ?? '').trim() || !String(brokerId ?? '').trim() || !sessionScope
    ? ''
    : buildPermissionSessionFingerprint({ token: sessionScope, login, brokerId: `${brokerId}|${API_HOST}` });
  const cachedInitial = useMemo(() => readStoredTerminalPage(terminalScope), [terminalScope]);
  const [activeTab, setActiveTab] = useState('trades');
  const [journalEntries, setJournalEntries] = useState(() => getTradeJournalEntries());
  const [selectedTradeKey, setSelectedTradeKey] = useState(null);
  const [selectedJournalId, setSelectedJournalId] = useState(null);
  const [expandedJournalIds, setExpandedJournalIds] = useState(() => new Set());
  const [terminalSearch, setTerminalSearch] = useState('');
  const { alerts: marginAlerts } = useMarginAlerts(isAuthenticated);
  const journalWrapRef = useRef(null);
  const terminalRef = useRef(null);

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
    enabled: isAuthenticated,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    initialData: cachedInitial,
    initialDataUpdatedAt: cachedInitial?.timestamp,
    placeholderData: (previousData) => previousData || cachedInitial,
  });

  const missingViewPositions = /\bview_positions\b/i.test(String(error?.message || ''));
  const positionsAccessDenied = isError && (Number(error?.status) === 403 || missingViewPositions);
  const liveRows = useLivePositions(snapshotRows, undefined, page === 0, data?.liveRevision || 0);
  const rows = useMemo(() => [...liveRows].sort((a, b) => Number(b.position) - Number(a.position)).slice(0, 30), [liveRows]);
  const presentedRows = positionsAccessDenied ? [] : rows;
  useEffect(() => {
    if (!positionsAccessDenied) return;
    clearStoredTerminalPage();
  }, [positionsAccessDenied]);
  useEffect(() => {
    if (page === 0 && isFetchedAfterMount && !isLoading && !isError) {
      writeStoredTerminalPage({ rows: snapshotRows, total, hasMore, timestamp: dataUpdatedAt }, terminalScope);
    }
  }, [snapshotRows, total, hasMore, page, isFetchedAfterMount, isLoading, isError, dataUpdatedAt, terminalScope]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    // Coalesce bursts without repeatedly cancelling a slow PositionsAll request.
    // The shared sync service also emits a fallback poll every 30 seconds.
    let timer;
    const unsubscribe = subscribeToPositionSync((event) => {
      if (event.type === 'position' && !requiresPositionReconciliation(event.payload)) return;
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        queryClient.invalidateQueries({ queryKey: TERMINAL_POSITIONS_QUERY_KEY }, { cancelRefetch: false });
      }, 200);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [isAuthenticated, queryClient]);

  useEffect(() => subscribeToTradeJournal((next) => setJournalEntries(next)), []);

  // Keep the journal pinned to the newest entry, but never yank the view while
  // the user is reading older rows.
  useEffect(() => {
    if (activeTab !== 'journal') return;
    const el = journalWrapRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
  }, [journalEntries, activeTab]);

  useEffect(() => {
    if (activeTab === 'journal' && journalWrapRef.current) {
      journalWrapRef.current.scrollTop = journalWrapRef.current.scrollHeight;
    }
  }, [activeTab]);

  const handleManualRefresh = () => {
    invalidateGlobalPositionsCache();
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

  const toggleJournalExpand = (id) => {
    setExpandedJournalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const searchNeedle = terminalSearch.trim().toLowerCase();
  const showingTrades = activeTab === 'trades' || activeTab === 'exposure';
  const visibleRows = searchNeedle
    ? presentedRows.filter((row) => tradeCells(row).join(' ').toLowerCase().includes(searchNeedle))
    : presentedRows;
  const visibleJournal = searchNeedle
    ? journalEntries.filter((entry) => [
        entry.time, entry.dealer, entry.login, entry.request, entry.answer, entry.detail?.symbol,
      ].join(' ').toLowerCase().includes(searchNeedle))
    : journalEntries;

  const controls = (
      <div className="cc-terminal-tabs cc-terminal-title-controls" role="group" aria-label="Terminal controls">
        <span className="cc-trade-status" role="status">
          {activeTab === 'journal'
            ? (!isAuthenticated ? 'Sign in to view trade requests' : 'Trade requests · live feed')
            : showingTrades
              ? (isError
                ? (positionsAccessDenied ? 'Positions access denied - contact broker administrator' : 'Trade refresh failed — retry')
                : (isFetching && presentedRows.length === 0)
                  ? 'Synchronizing trades…'
                  : 'Open trades · auto-refresh')
              : (!isAuthenticated ? 'Sign in to view the terminal' : (TAB_STATUS[activeTab] || 'Terminal'))}
        </span>
        {showingTrades ? (
          <>
            <button type="button" onClick={handleManualRefresh} disabled={!isAuthenticated || isFetching}>Refresh</button>
            <button type="button" aria-label="Previous trades" onClick={prevPage} disabled={!isAuthenticated || positionsAccessDenied || page === 0 || isFetching}>Previous</button>
            <span className="cc-trade-page">{presentedRows.length ? `${offset + 1}–${offset + presentedRows.length}` : `Page ${page + 1}`}</span>
            <button type="button" aria-label="Next trades" onClick={nextPage} disabled={!isAuthenticated || positionsAccessDenied || !hasMore || isFetching}>Next</button>
          </>
        ) : activeTab === 'journal' ? (
          <button type="button" onClick={clearTradeJournal} disabled={!journalEntries.length}>Clear</button>
        ) : null}
      </div>
  );

  return (
    <div className="cc-terminal" ref={terminalRef}>
      {titleSlot ? createPortal(controls, titleSlot) : controls}
      {activeTab === 'journal' ? (
        <div className="cc-terminal-table-wrap" ref={journalWrapRef}>
          <table className="cc-terminal-table cc-journal-table" aria-label="Trade request journal">
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
                {JOURNAL_COLUMNS.map((label) => <th key={label} scope="col">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleJournal.map((entry) => (
                <JournalRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedJournalIds.has(entry.id)}
                  selected={selectedJournalId === entry.id}
                  onToggleExpand={() => toggleJournalExpand(entry.id)}
                  onSelect={() => setSelectedJournalId((prev) => (prev === entry.id ? null : entry.id))}
                />
              ))}
              {!visibleJournal.length && <tr><td colSpan={JOURNAL_COLUMNS.length + 1}>
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
                          ) : column === 'Profit' ? (
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
        <TerminalTabContent tab={activeTab} search={terminalSearch} isAuthenticated={isAuthenticated} />
      )}
      <div className="cc-terminal-tabs cc-terminal-bottom" role="tablist" aria-label="Terminal views">
        {TERMINAL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'is-active' : ''}
            onClick={() => setActiveTab((prev) => {
              if (tab.id === 'exposure' || tab.id === 'alerts') return tab.id;
              return prev === tab.id ? 'trades' : tab.id;
            })}
          >
            {tab.label}
            {tab.id === 'summary' && marginAlerts.length > 0 && (
              <b className="is-alert" title={`${marginAlerts.length} margin alert${marginAlerts.length === 1 ? '' : 's'}`}>
                {marginAlerts.length > 99 ? '99+' : marginAlerts.length}
              </b>
            )}
            {tab.id === 'journal' && journalEntries.length > 0 && (
              <b>{journalEntries.length > 99 ? '99+' : journalEntries.length}</b>
            )}
          </button>
        ))}
        <input
          type="search"
          className="cc-terminal-search"
          placeholder="Search"
          aria-label="Search terminal rows"
          value={terminalSearch}
          onChange={(event) => setTerminalSearch(event.target.value)}
        />
      </div>
    </div>
  );
}

function JournalRow({ entry, expanded, selected, onToggleExpand, onSelect }) {
  return (
    <>
      <tr
        className={sideRowClass(entry.side, selected)}
        onClick={onSelect}
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
        <td>{entry.time}</td>
        <td title={String(entry.dealer)}>{entry.dealer}</td>
        <td title={String(entry.login)}>{entry.login}</td>
        <td title={entry.request}>{entry.request}</td>
        <td title={entry.answer}>{entry.answer}</td>
      </tr>
      {expanded && (
        <tr className="cc-journal-detail">
          <td className="cc-journal-expander-col"></td>
          <td colSpan={JOURNAL_COLUMNS.length}>{journalDetailText(entry)}</td>
        </tr>
      )}
    </>
  );
}

// The workspace rebuilds its dock panel elements on every route change;
// the terminal only depends on isAuthenticated, so skip those re-renders.
export default memo(TerminalDock);
