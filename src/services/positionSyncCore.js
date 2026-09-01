export const POSITION_SYNC_POLL_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export const getWsTicket = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  const source = payload.data || payload.answer || payload.result || payload;
  return String(source?.ticket || source?.ws_ticket || source?.wsTicket || '').trim();
};

export const isPositionMutation = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
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
  } = {}) {
    this.requestTicket = requestTicket;
    this.createSocket = createSocket;
    this.buildUrl = buildUrl;
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
      socket.onopen = () => {
        if (!this.running || connectionId !== this.connectionId) return;
        this.reconnectAttempt = 0;
        this.emit({ type: 'snapshot', reason: 'connected' });
      };
      socket.onmessage = (event) => {
        const payload = parseMessage(event.data);
        if (isPositionMutation(payload)) this.emit({ type: 'position', payload });
      };
      socket.onerror = () => {
        if (socket.readyState === 0 || socket.readyState === 1) socket.close();
      };
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        if (this.running && connectionId === this.connectionId) this.scheduleReconnect();
      };
    } catch {
      if (connectionId === this.connectionId) this.socket = null;
      this.scheduleReconnect();
    }
  }
}
