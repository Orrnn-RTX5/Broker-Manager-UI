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

  const url = `/api/manager/AccountDetailsMany?id=${token}`;
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

  const res = await fetch(`/api/manager/PositionsAll?id=${token}`, {
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
    if (typeof p.action === 'string') type = p.action.toLowerCase();
    else if (p.Action === 0 || p.action === 0) type = 'buy';
    else if (p.Action === 1 || p.action === 1) type = 'sell';

    let volume = p.lots !== undefined ? p.lots : (p.volumeExt !== undefined ? p.volumeExt : (p.Volume !== undefined ? p.Volume : 0));
    if (volume >= 100) volume = volume / 10000;

    let comment = p.comment !== undefined ? p.comment : (p.reason !== undefined ? p.reason : 'Unknown');

    return {
      position: p.positionTicket || p.Position || p.ticket || p.position || 0,
      login: String(p.login || p.Login || ''),
      name: p.accountName || p.AccountName || '',
      email: p.username || p.Username || '',
      symbol: p.symbol || p.Symbol || '',
      type,
      volume,
      priceOpen: p.priceOpen || p.PriceOpen || p.Price || p.price || 0,
      priceCurrent: p.priceCurrent || p.PriceCurrent || 0,
      priceSl: p.priceSl || 0,
      priceTp: p.priceTp || 0,
      profit: p.profit || 0,
      comment: String(comment),
      swap: p.storage || p.Storage || p.swap || p.Swap || 0,
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

export const getOrders = async () => {
  const token = localStorage.getItem('authToken');
  if (!token) throw new Error('No authentication token found');

  const url = `/api/manager/BrokerOrders?limit=100&offset=0&id=${token}`;
  const res = await fetch(url, {
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
    if (typeof p.type === 'string') type = p.type.toLowerCase();
    else if (p.type === 0) type = 'buy';
    else if (p.type === 1) type = 'sell';

    let volume = p.volume !== undefined ? p.volume : 0;
    if (volume >= 100) volume = volume / 10000;

    return {
      ticket: p.ticket || 0,
      login: String(p.login || ''),
      name: p.accountName || p.username || '', // Map name to schema appropriately
      email: p.username || '',
      group: p.accountGroup || '',
      symbol: p.symbol || '',
      type,
      side: p.side || '',
      volume,
      priceOpen: p.priceOpen || 0,
      priceSl: p.priceSl || 0,
      priceTp: p.priceTp || 0,
      status: p.status || '',
      timeSetup: p.timeSetup || 0,
      timeDone: p.timeDone || 0,
      comment: String(p.comment || ''),
    };
  });
};

export const getBrokerDeals = async () => {
  const token = localStorage.getItem('authToken');
  if (!token) throw new Error('No authentication token found');

  const url = `/api/manager/BrokerDeals?limit=100&offset=0&id=${token}`;
  const res = await fetch(url, {
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
    return {
      ticket: p.ticket || 0,
      orderTicket: p.orderTicket || 0,
      login: String(p.login || ''),
      username: p.username || '',
      accountName: p.accountName || '',
      accountGroup: p.accountGroup || '',
      symbol: p.symbol || '',
      action: p.action || '',
      entry: p.entry || '',
      volume: p.volume !== undefined ? p.volume : 0,
      price: p.price || 0,
      profit: p.profit || 0,
      commission: p.commission || 0,
      swap: p.swap || 0,
      fee: p.fee || 0,
      time: p.time || 0,
      comment: String(p.comment || ''),
    };
  });
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
  getOrders,
  getBrokerDeals,
  getOpenPositions,
  getAdvertisingCampaigns,
};
