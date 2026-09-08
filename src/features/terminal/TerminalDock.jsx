import { useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DockTitleSlotContext } from '../../components/docking/DockTitleSlotContext';
import { useQueryClient } from '@tanstack/react-query';
import usePagedData from '../../hooks/usePagedData';
import { getPositionsPage, invalidateGlobalPositionsCache } from '../../services/api';
import { subscribeToPositionSync } from '../../services/positionSync';
import { TRADE_COLUMNS, tradeCells } from './terminalTrades.js';

const QUERY_KEY = ['terminal-positions'];
const PARAMS = { sort_by: 'position', sort_dir: 'desc' };
const fetchTrades = (params, options) => {
  invalidateGlobalPositionsCache();
  return getPositionsPage(params, options);
};

export default function TerminalDock({ isAuthenticated = false }) {
  const titleSlot = useContext(DockTitleSlotContext);
  const queryClient = useQueryClient();
  const { rows, page, offset, hasMore, isLoading, isFetching, isError, refetch, nextPage, prevPage } = usePagedData({
    queryKey: QUERY_KEY,
    queryFn: fetchTrades,
    params: PARAMS,
    pageSize: 30,
    enabled: isAuthenticated,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    placeholderData: () => undefined,
  });

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    // Coalesce bursts without repeatedly cancelling a slow PositionsAll request.
    // The shared sync service also emits a fallback poll every 30 seconds.
    let timer;
    const unsubscribe = subscribeToPositionSync((event) => {
      if (event?.reason === 'connected' || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        queryClient.invalidateQueries({ queryKey: QUERY_KEY }, { cancelRefetch: false });
      }, 1000);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [isAuthenticated, queryClient]);

  const controls = (
      <div className="cc-terminal-tabs cc-terminal-title-controls" role="group" aria-label="Trade controls">
        <span className="cc-trade-status" role="status">
          {!isAuthenticated ? 'Sign in to view trades' : isError ? 'Trade refresh failed — retry' : isFetching ? 'Synchronizing trades…' : 'Open trades · auto-refresh'}
        </span>
        <button type="button" onClick={() => refetch()} disabled={!isAuthenticated || isFetching}>Refresh</button>
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
