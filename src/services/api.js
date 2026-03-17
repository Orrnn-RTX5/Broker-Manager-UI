/**
 * API Service Layer
 *
 * All functions here are STUBS. They intentionally throw errors so the
 * useDataSource hook falls back to dummy data gracefully.
 *
 * To wire in a real backend:
 *   1. Replace the throw lines with real fetch/axios calls.
 *   2. Return the response data.
 *   3. No changes needed in components — the hook handles the rest.
 *
 * Example of real implementation:
 *   export const getOnlineUsers = async () => {
 *     const res = await fetch(`${BASE_URL}/api/online-users`, { headers: authHeaders() });
 *     if (!res.ok) throw new Error(`HTTP ${res.status}`);
 *     return res.json();
 *   };
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  // 'Authorization': `Bearer ${localStorage.getItem('token')}`,
});

// ─── Online Users ──────────────────────────────────────────────────────────────
export const getOnlineUsers = async () => {
  // TODO: Replace with real API call
  // const res = await fetch(`${BASE_URL}/api/online-users`, { headers: authHeaders() });
  // if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // return res.json();
  throw new Error('API not yet integrated');
};

// ─── Clients ───────────────────────────────────────────────────────────────────
export const getClients = async () => {
  // TODO: Replace with real API call
  // const res = await fetch(`${BASE_URL}/api/clients`, { headers: authHeaders() });
  // if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // return res.json();
  throw new Error('API not yet integrated');
};

// ─── Trading Accounts ──────────────────────────────────────────────────────────
export const getTradingAccounts = async () => {
  // TODO: Replace with real API call
  // const res = await fetch(`${BASE_URL}/api/trading-accounts`, { headers: authHeaders() });
  // if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // return res.json();
  throw new Error('API not yet integrated');
};

// ─── Positions ─────────────────────────────────────────────────────────────────
export const getPositions = async () => {
  // TODO: Replace with real API call
  // const res = await fetch(`${BASE_URL}/api/positions`, { headers: authHeaders() });
  // if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // return res.json();
  throw new Error('API not yet integrated');
};

// ─── Analytics ─────────────────────────────────────────────────────────────────
export const getTradingAccountsAnalytics = async () => {
  throw new Error('API not yet integrated');
};

export const getOpenOrders = async () => {
  throw new Error('API not yet integrated');
};

export const getOpenPositions = async () => {
  throw new Error('API not yet integrated');
};

export const getAdvertisingCampaigns = async () => {
  throw new Error('API not yet integrated');
};

export default {
  getOnlineUsers,
  getClients,
  getTradingAccounts,
  getPositions,
  getTradingAccountsAnalytics,
  getOpenOrders,
  getOpenPositions,
  getAdvertisingCampaigns,
};
