// Central place for all network endpoints.
// All IPs live in .env (VITE_API_HOST, VITE_WS_HOST, VITE_API_HOST_EXT).
// Components should import from here — never hardcode a host.

export const API_HOST = import.meta.env.VITE_API_HOST || 'http://backend.orrnn.com';
export const WS_HOST = import.meta.env.VITE_WS_HOST || 'ws://backend.orrnn.com';
export const API_HOST_EXT = import.meta.env.VITE_API_HOST_EXT || 'http://backend.orrnn.com:8091';
export const DEFAULT_MT5_SERVER = import.meta.env.VITE_DEFAULT_MT5_SERVER || 'backend.orrnn.com';

// WebSocket URL builders
export const buildFeedWsUrl = () => `${WS_HOST}/ws/feed`;

export const buildMetricsWsUrl = (token, login) =>
  `${WS_HOST}/manager/OnAccountMetrics?id=${token}&login=${login}`;
