import apiClient from './apiClient';
import { buildAccountMetricsWsUrl } from '../config/endpoints';
import { PositionSyncClient } from './positionSyncCore';
import { liveTradingState } from './liveTradingState.js';

const clients = new Map();
const watchers = new Map();
let timer;
function reconcile() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const logins = [...watchers.keys()].sort();
    const desired = new Map();
    for (let i = 0; i < logins.length; i += 100) {
      const batch = logins.slice(i, i + 100); desired.set(batch.join(','), batch);
    }
    for (const [key, client] of clients) if (!desired.has(key)) {
      liveTradingState.invalidateMetrics(key.split(',')); client.stop(); clients.delete(key);
    }
    for (const [key, batch] of desired) {
      if (clients.has(key)) continue;
      const client = new PositionSyncClient({
        requestTicket: () => apiClient.post('/api/v1/manager/ws-ticket', { path: '/OnAccountMetrics', logins: batch.map(Number) }),
        buildUrl: buildAccountMetricsWsUrl,
      });
      client.subscribe((event) => {
        if (event.payload) liveTradingState.ingest(event.payload);
        if (event.type === 'connection' && event.reason === 'disconnected') liveTradingState.invalidateMetrics(batch);
      });
      clients.set(key, client); client.start();
    }
  }, 50);
}
export function watchAccountMetrics(login) {
  const key = String(login);
  watchers.set(key, (watchers.get(key) || 0) + 1); reconcile();
  return () => { const count = (watchers.get(key) || 1) - 1; if (count) watchers.set(key, count); else watchers.delete(key); reconcile(); };
}
export function stopAccountMetrics() { clearTimeout(timer); clients.forEach((client) => client.stop()); clients.clear(); watchers.clear(); }
