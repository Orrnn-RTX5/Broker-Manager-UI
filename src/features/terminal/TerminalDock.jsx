import { useContext, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DockTitleSlotContext } from '../../components/docking/DockTitleSlotContext';
import { useQueryClient } from '@tanstack/react-query';
import usePagedData from '../../hooks/usePagedData';
import { getPositionsPage, invalidateGlobalPositionsCache } from '../../services/api';
import { subscribeToPositionSync, requiresPositionReconciliation } from '../../services/positionSync';
import { useLivePositions } from '../../hooks/useLiveTrading';
import {
  TRADE_COLUMNS,
  tradeCells,
  TERMINAL_POSITIONS_QUERY_KEY,
  TERMINAL_POSITIONS_PARAMS,
  readStoredTerminalPage,
  writeStoredTerminalPage,
} from './terminalTrades.js';

const fetchTrades = (params, options) => {
  return getPositionsPage(params, options);
};

export default function TerminalDock({ isAuthenticated = false }) {
  const titleSlot = useContext(DockTitleSlotContext);
  const queryClient = useQueryClient();
  const cachedInitial = useMemo(() => readStoredTerminalPage(), []);
  const { rows: snapshotRows, data, page, offset, hasMore, total, isLoading, isFetching, isError, refetch, nextPage, prevPage } = usePagedData({
    queryKey: TERMINAL_POSITIONS_QUERY_KEY,
    queryFn: fetchTrades,
    params: TERMINAL_POSITIONS_PARAMS,
    pageSize: 30,
    enabled: isAuthenticated,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    initialData: cachedInitial,
    placeholderData: (previousData) => previousData || cachedInitial,
  });

  const liveRows = useLivePositions(snapshotRows, undefined, page === 0, data?.liveRevision || 0);
  const rows = useMemo(() => [...liveRows].sort((a, b) => Number(b.position) - Number(a.position)).slice(0, 30), [liveRows]);
  useEffect(() => {
    if (page === 0 && !isLoading) {
      writeStoredTerminalPage({ rows, total, hasMore });
    }
  }, [rows, total, hasMore, page, isLoading]);

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

  const handleManualRefresh = () => {
    invalidateGlobalPositionsCache();
    refetch();
  };

  const controls = (
      <div className="cc-terminal-tabs cc-terminal-title-controls" role="group" aria-label="Trade controls">
        <span className="cc-trade-status" role="status">
          {!isAuthenticated
            ? 'Sign in to view trades'
            : isError
              ? 'Trade refresh failed — retry'
              : (isFetching && rows.length === 0)
                ? 'Synchronizing trades…'
                : 'Open trades · auto-refresh'}
        </span>
        <button type="button" onClick={handleManualRefresh} disabled={!isAuthenticated || isFetching}>Refresh</button>
        <button type="button" aria-label="Previous trades" onClick={prevPage} disabled={!isAuthenticated || page === 0 || isFetching}>Previous</button>
        <span className="cc-trade-page">{rows.length ? `${offset + 1}–${offset + rows.length}` : `Page ${page + 1}`}</span>
        <button type="button" aria-label="Next trades" onClick={nextPage} disabled={!isAuthenticated || !hasMore || isFetching}>Next</button>
      </div>
  );

  return (
    <div className="cc-terminal">
      {titleSlot ? createPortal(controls, titleSlot) : controls}
      <div className="cc-terminal-table-wrap">
        <table className="cc-terminal-table cc-terminal-trades" aria-label="Synchronized open trades" aria-busy={isFetching}>
          <thead><tr>{TRADE_COLUMNS.map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.login}-${row.position}`}>
                {tradeCells(row).map((cell, index) => <td key={TRADE_COLUMNS[index]} title={String(cell)}>{cell}</td>)}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={TRADE_COLUMNS.length}>
              {!isAuthenticated ? 'Sign in to view trader positions.' : isLoading ? 'Loading trades…' : isError ? 'Unable to load trades. Use Refresh to try again.' : 'No open trades on this page.'}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
