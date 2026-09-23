import apiClient from './apiClient';
import { liveTradingState } from './liveTradingState.js';
import { stopAccountMetrics } from './accountMetricsSync.js';
import { buildPositionUpdatesWsUrl, getPositionUpdatesWsPath } from '../config/endpoints';
import {
  PositionSyncClient,
  POSITION_SYNC_POLL_MS,
  getWsTicket,
  getPositionUpdateLogin,
  isPositionMutation,
  requiresPositionReconciliation,
} from './positionSyncCore';

export { PositionSyncClient, POSITION_SYNC_POLL_MS, getWsTicket, getPositionUpdateLogin, isPositionMutation, requiresPositionReconciliation };

const positionSync = new PositionSyncClient({
  requestTicket: () => apiClient.post('/api/v1/manager/ws-ticket', { path: getPositionUpdatesWsPath() }),
  buildUrl: buildPositionUpdatesWsUrl,
});

positionSync.subscribe((event) => { if (event.payload) liveTradingState.ingest(event.payload); });
export const startPositionSync = () => positionSync.start();
export const stopPositionSync = () => { positionSync.stop(); stopAccountMetrics(); liveTradingState.reset(); };
export const subscribeToPositionSync = (listener) => positionSync.subscribe(listener);
