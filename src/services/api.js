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
  console.log("=== getTradingAccounts CALLED ===");
  const token = localStorage.getItem('authToken');
  console.log("Token from localStorage:", token);
  if (!token) throw new Error('No authentication token found');

  const url = `http://69.197.178.27/manager/AccountDetailsMany?id=${token}`;
  console.log("Fetching URL:", url);
  const res = await fetch(url, {
    headers: { 'accept': 'application/json' }
  });
  console.log("Fetch response status:", res.status);

  const text = await res.text();
  console.log("Raw response (first 200 chars):", text.substring(0, 200));
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON format error. Server returned: ${text.substring(0, 100)}...`);
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);

  const records = Array.isArray(data) ? data : data.answer || [];
  console.log("Parsed records count:", records.length);

  return records.map(p => ({
    login: String(p.login || p.Login || ''),
    name: p.Name || p.name || '',
    group: p.Group || p.group || '',
    country: p.Country || p.country || '',
    client: p.client || p.Client || '',
    balance: p.balance !== undefined ? p.balance : (p.Balance !== undefined ? p.Balance : 0),
    equity: p.equity !== undefined ? p.equity : (p.Equity !== undefined ? p.Equity : 0),
    profit: p.profit !== undefined ? p.profit : (p.Profit !== undefined ? p.Profit : 0),
    currency: p.Currency || p.currency || '',
  }));
};

export const getPositions = async () => {
  const token = localStorage.getItem('authToken');
  if (!token) throw new Error('No authentication token found');

  const res = await fetch(`http://69.197.178.27/manager/PositionsAll?id=${token}`, {
    headers: { 'accept': 'application/json' }
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON format error. Server returned: ${text.substring(0, 100)}...`);
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);

  const records = Array.isArray(data) ? data : data.answer || [];

  return records.map(p => {
    let type = 'unknown';
    if (p.Action === 0 || p.action === 0) type = 'buy';
    else if (p.Action === 1 || p.action === 1) type = 'sell';
    else if (typeof p.Type === 'string') type = p.Type.toLowerCase();
    else if (typeof p.type === 'string') type = p.type.toLowerCase();

    let volume = p.Volume !== undefined ? p.Volume : (p.volume !== undefined ? p.volume : 0);
    if (volume >= 100) volume = volume / 10000;

    let reason = p.Reason !== undefined ? p.Reason : (p.reason !== undefined ? p.reason : 'Unknown');
    if (reason === 1) reason = 'Client';
    else if (reason === 2) reason = 'Expert';
    else if (reason === 4) reason = 'Mobile';
    else if (typeof reason === 'number') reason = `Reason ${reason}`;

    return {
      login: String(p.Login || p.login || ''),
      position: p.Position || p.ticket || p.position || 0,
      symbol: p.Symbol || p.symbol || '',
      type,
      volume,
      priceOpen: p.PriceOpen || p.priceOpen || p.Price || p.price || 0,
      priceCurrent: p.PriceCurrent || p.priceCurrent || 0,
      reason: String(reason),
      swap: p.Storage || p.swap || p.Swap || 0,
    };
  });
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
