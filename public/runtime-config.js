// Deploy-time override for Trivanta Markets. Takes precedence over the VITE_*
// values baked into the bundle, so it must match .env.web.
window.__RTX_RUNTIME_CONFIG__ = {
  BACKEND_TARGET: 'web',
  API_HOST: 'https://trivanta.orrnn.com',
  API_HOST_EXT: 'https://trivanta.orrnn.com',
  REPORTS_API_HOST: 'https://trivanta.orrnn.com',
  WS_HOST: 'wss://trivanta.orrnn.com',
  MANAGER_WS_HOST: 'wss://trivanta.orrnn.com',
  WS_FEED_PATH: '/ws/feed',
  FEED_WS_URL: 'wss://trivanta.orrnn.com/ws/feed',
  FEED_STATUS_URL: 'https://trivanta.orrnn.com/ws/feed/status',
  FEED_BROKER_ID: 'trivanta-markets',
  BROKER_ID: 'trivanta-markets',
  VITE_BROKER_ID: 'trivanta-markets',
  DEFAULT_MT5_SERVER: 'trivanta.orrnn.com',
  DISCOVERY_BASE_URL: 'https://superadmin-prod.orrnn.com',
  USE_MOCK_DISCOVERY: 'false',
  MARKET_DATA_SOURCE: 'manager',
  REPORTS_SUMMARY_ENABLED: 'false'
};
window.RUNTIME_CONFIG = window.__RTX_RUNTIME_CONFIG__;
