import apiClient from './apiClient';
import { buildPositionUpdatesWsUrl, getPositionUpdatesWsPath } from '../config/endpoints';
import {
  PositionSyncClient,
  POSITION_SYNC_POLL_MS,
  getWsTicket,
  getPositionUpdateLogin,
  isPositionMutation,
} from './positionSyncCore';

export { PositionSyncClient, POSITION_SYNC_POLL_MS, getWsTicket, getPositionUpdateLogin, isPositionMutation };

const positionSync = new PositionSyncClient({
  requestTicket: () => apiClient.post('/api/v1/manager/ws-ticket', { path: getPositionUpdatesWsPath() }),
  buildUrl: buildPositionUpdatesWsUrl,
});

export const startPositionSync = () => positionSync.start();
export const stopPositionSync = () => positionSync.stop();
export const subscribeToPositionSync = (listener) => positionSync.subscribe(listener);
