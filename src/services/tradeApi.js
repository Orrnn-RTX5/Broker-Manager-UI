// Trade API client — routes through the /ext-api Vite proxy (port 8091).
// All endpoints send BOTH the Bearer header AND the ?id query param for
// maximum compatibility with the broker backend (see design note).

const TRADE_BASE = '/ext-api';

const getToken = () => localStorage.getItem('authToken') || '';

const headers = () => ({
  accept: 'application/json',
  Authorization: `Bearer ${getToken()}`,
});

const jsonHeaders = () => ({
  ...headers(),
  'Content-Type': 'application/json',
});

// Append ?id=<token> to every URL, preserving existing query params.
const withToken = (path) => {
  const sep = path.includes('?') ? '&' : '?';
  return `${TRADE_BASE}${path}${sep}id=${encodeURIComponent(getToken())}`;
};

// Unified error extraction — surfaces { message, code } from the API spec.
const parseError = async (res) => {
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  const msg = body?.message || body?.error || `HTTP ${res.status}`;
  const err = new Error(msg);
  err.code = body?.code;
  err.status = res.status;
  throw err;
};

const getJson = async (path) => {
  const res = await fetch(withToken(path), { method: 'GET', headers: headers() });
  if (!res.ok) await parseError(res);
  return res.json();
};

const postJson = async (path, body) => {
  const res = await fetch(withToken(path), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
};

// ────────── ORDER ──────────
export const orderModify = ({ ticket, stoploss, takeprofit }) => {
  const qs = new URLSearchParams({ ticket: String(ticket) });
  if (stoploss   !== undefined && stoploss   !== null) qs.set('stoploss', String(stoploss));
  if (takeprofit !== undefined && takeprofit !== null) qs.set('takeprofit', String(takeprofit));
  return getJson(`/OrderModify?${qs.toString()}`);
};

export const orderDelete = (ticket) =>
  getJson(`/OrderDelete?ticket=${encodeURIComponent(ticket)}`);

// ────────── POSITION ──────────
export const positionPriceChange = (ticket, new_price) =>
  getJson(`/PositionPriceChange?ticket=${ticket}&new_price=${new_price}`);

export const positionVolumeChange = (ticket, new_lots) =>
  getJson(`/PositionVolumeChange?ticket=${ticket}&new_lots=${new_lots}`);

export const positionCommentChange = ({ ticket, comment, magic }) => {
  const qs = new URLSearchParams({ ticket: String(ticket) });
  if (comment !== undefined) qs.set('comment', comment);
  if (magic   !== undefined) qs.set('magic', String(magic));
  return getJson(`/PositionCommentChange?${qs.toString()}`);
};

export const positionForceClose = ({ ticket, price, comment }) => {
  const qs = new URLSearchParams({ ticket: String(ticket), price: String(price) });
  if (comment) qs.set('comment', comment);
  return getJson(`/PositionForceClose?${qs.toString()}`);
};

export const positionForceCloseAll = ({ login, symbol, comment }) => {
  const qs = new URLSearchParams({ login: String(login) });
  if (symbol)  qs.set('symbol', symbol);
  if (comment) qs.set('comment', comment);
  return getJson(`/PositionForceCloseAll?${qs.toString()}`);
};

export const positionFlip = (ticket) =>
  getJson(`/PositionFlip?ticket=${ticket}`);

// ────────── DEAL ──────────
export const dealAdd       = (payload) => postJson('/DealAdd', payload);
export const dealAddBatch  = (payload) => postJson('/DealAddBatch', payload);
export const dealUpdate    = (payload) => postJson('/DealUpdate', payload);
export const dealUpdateBatch = (payload) => postJson('/DealUpdateBatch', payload);
export const dealPerform   = (payload) => postJson('/DealPerform', payload);

// Orders also exposes an S/L+T/P modifier, which Positions' S/L+T/P modifier
// calls into (per the API spec — OrderModify works on open positions too).
// Keeping a semantic alias here so the Position adapter stays readable.
export const positionModifyStops = orderModify;
