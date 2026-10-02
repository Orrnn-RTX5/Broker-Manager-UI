import apiClient from './apiClient';
import { applyPositionsSnapshot, fetchAllPositionsDataset } from './api.js';
import { buildPositionUpdatesWsUrl } from '../config/endpoints';
import { liveTradingState } from './liveTradingState.js';
import {
  PositionSyncClient,
  POSITION_SYNC_POLL_MS,
  getWsTicket,
  getPositionSnapshotRows,
  getPositionUpdateLogin,
  isPositionMutation,
  requiresPositionReconciliation,
} from './positionSyncCore';

export { PositionSyncClient, POSITION_SYNC_POLL_MS, getWsTicket, getPositionSnapshotRows, getPositionUpdateLogin, isPositionMutation, requiresPositionReconciliation };

const positionSync = new PositionSyncClient({
  // Tickets bind to the backend route; proxy prefixes belong only in the URL.
  requestTicket: () => apiClient.post('/api/v1/manager/ws-ticket', { path: '/OnPositionUpdate' }),
  buildUrl: buildPositionUpdatesWsUrl,
  onSnapshot: applyPositionsSnapshot,
});

let reconciliation;
let sessionGeneration = 0;

// Partial frames update tickets; only HTTP can confirm absent tickets closed.
// Notify readers after reconciliation finishes, including when the book empties
// and no subsequent price frame arrives to wake the grids.
positionSync.subscribe((event) => {
  const needsReconciliation = (event?.type === 'snapshot' && ['poll', 'connected'].includes(event.reason))
    || (event?.type === 'position' && (!event.snapshot || getPositionSnapshotRows(event.payload)?.length === 0));
  if (!needsReconciliation || reconciliation) return;
  const generation = sessionGeneration;
  const request = fetchAllPositionsDataset({ force: true });
  reconciliation = request;
  request.then(() => {
    if (generation === sessionGeneration) positionSync.emit({ type: 'snapshot', reason: 'reconciled' });
  }).catch(() => undefined).finally(() => {
    if (reconciliation === request) reconciliation = null;
  });
});

positionSync.subscribe((event) => { if (event.payload) liveTradingState.ingest(event.payload); });
export const startPositionSync = () => positionSync.start();
export const stopPositionSync = () => {
  sessionGeneration += 1;
  reconciliation = null;
  positionSync.stop();
};
export const subscribeToPositionSync = (listener) => positionSync.subscribe(listener);
