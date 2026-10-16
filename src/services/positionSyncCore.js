export const POSITION_SYNC_POLL_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

// Manager's dual NATS feed deduplicates v1/v2 by event ID. Either envelope
// may win, so consume their identical domain data with one canonical type.
export const normalizePositionSyncPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || payload.schema_version !== 2) return payload;
  const entity = String(payload.entity || '').toLowerCase();
  const action = String(payload.action || '').toLowerCase();
  if (!['position', 'state', 'account', 'order', 'deal'].includes(entity) || !/^[a-z_]+$/.test(action)) return payload;
  const inheritIdentity = (row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    return { ...row, account_login: row.account_login ?? payload.account_login, broker_id: row.broker_id ?? payload.broker_id };
  };
  return { ...payload, type: `${entity}_${action}`,
    data: Array.isArray(payload.data) ? payload.data.map(inheritIdentity) : inheritIdentity(payload.data) };
};

export const requiresPositionReconciliation = (payload) => {
  const event = normalizePositionSyncPayload(payload);
  if (!event || typeof event !== 'object') return false;
  if (event.type === 'state_changed') return true;
  if (['position_opened', 'position_closed', 'position_increased', 'position_decreased', 'position_reversed', 'position_modified'].includes(event.type)) return true;
  const rows = Array.isArray(event.data) ? event.data : [event.data];
  return event.type === 'position_update' && rows.some(row => row?.status === 'closed');
};

export const getWsTicket = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  const source = payload.data || payload.answer || payload.result || payload;
  return String(source?.ticket || source?.ws_ticket || source?.wsTicket || '').trim();
};

export const getPositionUpdateLogin = (payload) => {
  const queue = [payload];
  const visited = new Set();
  const containerKeys = ['data', 'position', 'update', 'payload', 'answer', 'record', 'account'];

  while (queue.length > 0 && visited.size < 24) {
    const source = queue.shift();
    if (!source || typeof source !== 'object' || visited.has(source)) continue;
    visited.add(source);

    const login = source.login
      ?? source.Login
      ?? source.account_login
      ?? source.accountLogin
      ?? source.user_login
      ?? source.userLogin;
    if (login !== undefined && login !== null && String(login).trim()) return login;

    if (Array.isArray(source)) {
      source.forEach((item) => queue.push(item));
      continue;
    }
    containerKeys.forEach((key) => queue.push(source[key]));
  }

  return undefined;
};

// The OnPositionUpdate channel sends { data: [...] } frames that can cover
// only part of the open-position book. Preserve empty arrays for the cache
// reconciler, which decides what the frame means using its scope and metadata.
export const getPositionSnapshotRows = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const rows = payload.data ?? payload.positions ?? payload.answer;
  return Array.isArray(rows) ? rows : null;
};

export const isPositionMutation = (payload) => {
  payload = normalizePositionSyncPayload(payload);
  if (!payload || typeof payload !== 'object') return false;
  if (['position_update', 'position_opened', 'position_closed', 'position_increased', 'position_decreased', 'position_reversed', 'position_modified', 'metrics_update'].includes(payload.type)) return true;
  if (payload.type === 'state_changed' && payload.data && typeof payload.data === 'object') return true;
  if (getPositionSnapshotRows(payload)) return true;
  const source = payload.data || payload.position || payload.update || payload;
  const action = String(
    source.action || source.event || source.type || source.event_type || source.eventType || ''
  ).toLowerCase().replace(/[\s_-]/g, '');

  if (['opened', 'closed', 'increased', 'decreased', 'reversed', 'partiallyclosed', 'partialclose'].includes(action)) {
    return true;
  }
  return !['', 'ping', 'pong', 'heartbeat', 'connected', 'error'].includes(action);
};

const parseMessage = (data) => {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

export class PositionSyncClient {
  constructor({
    requestTicket,
    createSocket = (url) => new WebSocket(url),
    buildUrl,
    // Browser timer methods must be invoked with the Window/global receiver.
    // Calling a detached native method through this client instance causes
    // Chromium/Electron to throw "Illegal invocation".
    setTimeoutFn = (...args) => globalThis.setTimeout(...args),
    clearTimeoutFn = (...args) => globalThis.clearTimeout(...args),
    setIntervalFn = (...args) => globalThis.setInterval(...args),
    clearIntervalFn = (...args) => globalThis.clearInterval(...args),
    pollMs = POSITION_SYNC_POLL_MS,
    onSnapshot,
  } = {}) {
    this.requestTicket = requestTicket;
    this.createSocket = createSocket;
    this.buildUrl = buildUrl;
    this.onSnapshot = onSnapshot;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.pollMs = pollMs;
    this.listeners = new Set();
    this.socket = null;
    this.reconnectTimer = null;
    this.pollTimer = null;
    this.reconnectAttempt = 0;
    this.running = false;
    this.connectionId = 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    this.listeners.forEach((listener) => listener(event));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.pollTimer = this.setIntervalFn(() => this.emit({ type: 'snapshot', reason: 'poll' }), this.pollMs);
    this.connect();
  }

  stop() {
    this.running = false;
    this.connectionId += 1;
    if (this.reconnectTimer) this.clearTimeoutFn(this.reconnectTimer);
    if (this.pollTimer) this.clearIntervalFn(this.pollTimer);
    this.reconnectTimer = null;
    this.pollTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) socket.close(1000, 'Manager session ended');
  }

  scheduleReconnect() {
    if (!this.running || this.reconnectTimer) return;
    const delay = Math.min(1_000 * (2 ** this.reconnectAttempt), MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  async connect() {
    if (!this.running || this.socket) return;
    const connectionId = ++this.connectionId;
    try {
      const ticket = getWsTicket(await this.requestTicket());
      if (!ticket) throw new Error('Manager websocket ticket was not returned.');
      if (!this.running || connectionId !== this.connectionId) return;
      const socket = this.createSocket(this.buildUrl(ticket));
      this.socket = socket;
      const isCurrentConnection = () => (
        this.running && connectionId === this.connectionId && this.socket === socket
      );
      let openedAt = 0;
      socket.onopen = () => {
        if (!isCurrentConnection()) return;
        openedAt = Date.now();
        this.emit({ type: 'snapshot', reason: 'connected' });
      };
      socket.onmessage = (event) => {
        if (!isCurrentConnection()) return;
        if (openedAt > 0 && Date.now() - openedAt >= 5_000) {
          this.reconnectAttempt = 0;
        }
        const payload = normalizePositionSyncPayload(parseMessage(event.data));
        if (!isPositionMutation(payload)) return;
        const snapshotRows = getPositionSnapshotRows(payload);
        if (snapshotRows) {
          // Warm the shared position caches before subscribers re-read them so
          // a ~1 Hz snapshot stream never turns into a PositionsAll storm.
          try {
            this.onSnapshot?.(snapshotRows);
          } catch {
            // Cache writes must never break the socket pump.
          }
        }
        this.emit({ type: 'position', payload, snapshot: Boolean(snapshotRows) });
      };
      socket.onerror = () => {
        if (!isCurrentConnection()) return;
        if (socket.readyState === 0 || socket.readyState === 1) socket.close();
      };
      socket.onclose = () => {
        if (!isCurrentConnection()) return;
        this.socket = null;
        this.scheduleReconnect();
      };
    } catch {
      if (!this.running || connectionId !== this.connectionId) return;
      this.socket = null;
      this.scheduleReconnect();
    }
  }
}
