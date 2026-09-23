import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { liveTradingState } from '../services/liveTradingState.js';
import { watchAccountMetrics } from '../services/accountMetricsSync.js';

export function useLivePositions(rows, login, includeNew = false, snapshotRevision = 0) {
  const revision = useSyncExternalStore(liveTradingState.subscribe, liveTradingState.snapshot);
  return useMemo(() => liveTradingState.overlayRows(rows, login, includeNew, snapshotRevision), [rows, login, includeNew, snapshotRevision, revision]);
}
export function useLiveAccountMetrics(login) {
  useSyncExternalStore(liveTradingState.subscribe, liveTradingState.snapshot);
  useEffect(() => login ? watchAccountMetrics(login) : undefined, [login]);
  return liveTradingState.account(login);
}
export function useLiveAccountRows(rows) {
  const revision = useSyncExternalStore(liveTradingState.subscribe, liveTradingState.snapshot);
  const scope = [...new Set(rows.filter((row) => row.login && ('equity' in row || 'balance' in row)).map((row) => String(row.login)))].sort().join(',');
  useEffect(() => {
    const releases = scope ? scope.split(',').map(watchAccountMetrics) : [];
    return () => releases.forEach((release) => release());
  }, [scope]);
  return useMemo(() => rows.map((row) => {
    const live = liveTradingState.account(row.login);
    if (!live || !('equity' in row || 'balance' in row)) return row;
    return { ...row, balance: live.balance, credit: live.credit, equity: live.equity,
      profit: live.floating_pnl, margin: live.used_margin, marginFree: live.free_margin,
      marginLevel: live.margin_level };
  }), [rows, revision]);
}
