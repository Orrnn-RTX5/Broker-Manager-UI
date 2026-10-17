import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { liveTradingState } from '../services/liveTradingState.js';
import { watchAccountMetrics } from '../services/accountMetricsSync.js';
import { liveAccountScope } from '../utils/onlineUsers.js';

const subscribeToNothing = () => () => {};
const zeroRevision = () => 0;

export function useLivePositions(rows, login, includeNew = false, snapshotRevision = 0) {
  const revision = useSyncExternalStore(liveTradingState.subscribe, liveTradingState.snapshot);
  return useMemo(() => {
    // A store update during render will trigger another render with its new revision.
    if (revision !== liveTradingState.snapshot()) return rows;
    return liveTradingState.overlayRows(rows, login, includeNew, snapshotRevision);
  }, [rows, login, includeNew, snapshotRevision, revision]);
}
export function useLiveAccountMetrics(login) {
  useSyncExternalStore(liveTradingState.subscribe, liveTradingState.snapshot);
  useEffect(() => login ? watchAccountMetrics(login) : undefined, [login]);
  return liveTradingState.account(login);
}
export function useLiveAccountRows(rows) {
  const scope = liveAccountScope(rows);
  // Position/order grids apply their own position overlay. Subscribing them
  // to account metrics here duplicates every live render with a fresh array.
  const revision = useSyncExternalStore(scope ? liveTradingState.subscribe : subscribeToNothing, scope ? liveTradingState.snapshot : zeroRevision);
  useEffect(() => {
    const releases = scope ? scope.split(',').map(watchAccountMetrics) : [];
    return () => releases.forEach((release) => release());
  }, [scope]);
  return useMemo(() => {
    if (!scope) return rows;
    if (revision !== liveTradingState.snapshot()) return rows;
    return rows.map((row) => {
      const live = liveTradingState.account(row.login);
      if (!live || !('equity' in row || 'balance' in row)) return row;
      return { ...row, balance: live.balance, credit: live.credit, equity: live.equity,
        profit: live.floating_pnl, margin: live.used_margin, marginFree: live.free_margin,
        marginLevel: live.margin_level };
    });
  }, [rows, revision, scope]);
}
