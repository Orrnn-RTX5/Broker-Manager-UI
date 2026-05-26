// Central place for all network endpoints.
// All IPs live in .env (VITE_API_HOST, VITE_WS_HOST, VITE_API_HOST_EXT).
// Components should import from here — never hardcode a host.

export const API_HOST = import.meta.env.VITE_API_HOST 
export const WS_HOST = import.meta.env.VITE_WS_HOST 
export const API_HOST_EXT = import.meta.env.VITE_API_HOST_EXT 
export const DEFAULT_MT5_SERVER = import.meta.env.VITE_DEFAULT_MT5_SERVER 

// Safely gets the base WebSocket host (removing trailing paths like /ws/feed if present)
const getBaseWsHost = () => {
  const host = WS_HOST || 'wss://testbrokerbackend.orrnn.com';
  return host.replace(/\/ws\/feed\/?$/, '');
};

// WebSocket URL builders
export const buildFeedWsUrl = () => {
  if (!WS_HOST) return 'wss://testbrokerbackend.orrnn.com/ws/feed';
  if (WS_HOST.endsWith('/ws/feed')) {
    return WS_HOST;
  }
  return `${WS_HOST}/ws/feed`;
};

export const buildMetricsWsUrl = (token, login) => {
  const base = getBaseWsHost();
  return `${base}/manager/OnAccountMetrics?id=${token}&login=${login}`;
};
