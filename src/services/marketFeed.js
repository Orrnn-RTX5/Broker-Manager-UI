import apiClient from './apiClient';
import { buildFeedWsUrl, buildManagerMarketWsUrl, isManagerMarketFeed } from '../config/endpoints';
import { getWsTicket } from './positionSyncCore';

export const prepareMarketFeed = async () => {
  if (!isManagerMarketFeed()) return { url: buildFeedWsUrl(), subscribe: true };

  // Direct LP ticks are broadcast by the manager backend. Each connection gets
  // a new single-use ticket from the logged-in session, not a bridge feed token.
  const response = await apiClient.post('/api/v1/manager/ws-ticket', { path: '/OnTick' });
  return { url: buildManagerMarketWsUrl(getWsTicket(response)), subscribe: false };
};
