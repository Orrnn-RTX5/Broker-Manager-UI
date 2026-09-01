import apiClient from './apiClient';
import { buildPositionUpdatesWsUrl } from '../config/endpoints';
import {
  PositionSyncClient,
  POSITION_SYNC_POLL_MS,
  getWsTicket,
  isPositionMutation,
} from './positionSyncCore';

export { PositionSyncClient, POSITION_SYNC_POLL_MS, getWsTicket, isPositionMutation };

const positionSync = new PositionSyncClient({
  requestTicket: () => apiClient.get('/api/v1/manager/ws-ticket'),
  buildUrl: buildPositionUpdatesWsUrl,
});

export const startPositionSync = () => positionSync.start();
export const stopPositionSync = () => positionSync.stop();
export const subscribeToPositionSync = (listener) => positionSync.subscribe(listener);
