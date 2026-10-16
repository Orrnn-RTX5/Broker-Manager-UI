import { normalizePositionSyncPayload } from './positionSyncCore.js';

// Server values are authoritative. Never calculate monetary P/L in the browser.
export class LiveTradingState {
  constructor({ scheduleNotification = typeof window === 'undefined' ? null : (callback) => setTimeout(callback, 50) } = {}) {
    this.positions = new Map(); this.metrics = new Map(); this.listeners = new Set(); this.revision = 0;
    this.scheduleNotification = scheduleNotification;
    this.notificationPending = false;
  }
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  snapshot = () => this.revision;
  notify() {
    // Apply every server value/version immediately, but publish one UI update
    // per burst. Per-ticket socket frames otherwise force synchronous React
    // renders faster than grids can paint and starve clicks and HTTP callbacks.
    this.revision += 1;
    if (!this.scheduleNotification) { [...this.listeners].forEach((fn) => fn()); return; }
    if (this.notificationPending) return;
    this.notificationPending = true;
    this.scheduleNotification(() => {
      this.notificationPending = false;
      // React can unsubscribe/resubscribe while a synchronous store update
      // renders. Iterating the live Set revisits newly registered listeners.
      [...this.listeners].forEach((fn) => fn());
    });
  }
  reset() { this.positions.clear(); this.metrics.clear(); this.notify(); }
  invalidateMetrics(logins) {
    let changed = false;
    for (const login of logins) {
      const current = this.metrics.get(String(login));
      if (current && current.available !== false) { current.available = false; changed = true; }
    }
    if (changed) this.notify();
  }
  ingest(payload) {
    payload = normalizePositionSyncPayload(payload);
    if (payload?.type === 'metrics_update') {
      const row = payload.data;
      const token = String(payload.publication_token || '');
      if (!row?.login || !/^\d{20}$/.test(token) || BigInt(token) === 0n) return;
      const key = String(row.login), prior = this.metrics.get(key);
      if (prior && BigInt(token) <= BigInt(prior.token)) return;
      this.metrics.set(key, { token, row, available: true }); this.notify(); return;
    }
    if (payload?.type === 'state_changed' && payload.data?.entity === 'accounts') {
      this.invalidateMetrics([payload.data.account_login ?? payload.data.login]);
    }
    if (payload?.type === 'state_changed' && !(payload.data?.entity === 'positions' && payload.data?.operation === 'DELETE')) return;
    const records = Array.isArray(payload?.data) ? payload.data : [payload?.data || payload?.position || payload];
    let changed = false;
    for (const row of records) {
      if (!row || typeof row !== 'object') continue;
      const login = row.account_login ?? row.login ?? row.Login;
      const ticket = row.ticket ?? row.position_ticket ?? row.positionTicket ?? row.position ?? row.Position;
      if (!login || !ticket) continue;
      const key = `${login}:${ticket}`, prior = this.positions.get(key);
      const action = String(row.event ?? row.event_type ?? payload.type ?? row.action ?? '').toLowerCase();
      const closed = ['closed', 'position_closed', 'deleted'].includes(action) || row.status === 'closed' || (payload.type === 'state_changed' && row.operation === 'DELETE');
      const rawVersion = row.state_version_text ?? row.state_version ?? row.version;
      const version = rawVersion == null ? undefined : String(rawVersion);
      if (prior?.closed && !closed) continue; // A ticket is never reused; late ticks cannot resurrect it.
      if (version != null && !/^\d+$/.test(String(version))) continue;
      if (version != null && prior?.version != null && BigInt(version) < BigInt(prior.version)) continue;
      const priceTime = Number(row.price_time_msc || 0);
      const pnl = row.update_kind === 'pnl';
      if (pnl && version === prior?.version && priceTime && priceTime < (prior?.priceTime || 0)) continue;
      const sameVersion = version == null || prior?.version == null || String(version) === String(prior.version);
      const patch = sameVersion || !pnl ? { ...prior?.patch } : {};
      if (row.update_kind === 'snapshot' && row.pnl_available === false && (!prior || !sameVersion)) {
        patch.profit = null; patch.priceCurrent = null;
      }
      const fields = {
        priceCurrent: ['price_current', 'priceCurrent', 'PriceCurrent'], profit: ['profit', 'Profit'],
        priceOpen: ['price_open', 'priceOpen', 'PriceOpen'], priceSl: ['sl', 'price_sl', 'priceSl', 'PriceSl'],
        priceTp: ['tp', 'price_tp', 'priceTp', 'PriceTp'], swap: ['swap', 'storage'],
        volume: ['lots', 'volume_lots', 'volume'], comment: ['comment'], type: ['side'], symbol: ['symbol'],
      };
      for (const [target, names] of Object.entries(fields)) {
        if (pnl && !['profit', 'priceCurrent'].includes(target)) continue;
        if (!pnl && sameVersion && prior?.priceTime > priceTime && ['profit', 'priceCurrent'].includes(target)) continue;
        const field = names.find((name) => row[name] !== undefined);
        if (field) patch[target] = row[field] ?? 0;
      }
      const hasSnapshot = row.update_kind === 'snapshot' || (sameVersion && prior?.hasSnapshot);
      this.positions.set(key, { patch, closed, version: version ?? prior?.version, priceTime: sameVersion ? Math.max(priceTime, prior?.priceTime || 0) : priceTime, pnl, hasSnapshot, snapshotRevision: row.update_kind === 'snapshot' ? this.revision + 1 : prior?.snapshotRevision, login: String(login), ticket: String(ticket), raw: pnl ? prior?.raw || row : row,
        symbol: row.symbol ?? prior?.symbol, side: row.side ?? prior?.side ?? (row.action === 1 ? 'sell' : 'buy') }); changed = true;
    }
    if (changed) this.notify();
  }
  overlayRows(rows, login, includeNew = false, snapshotRevision = 0) {
    const source = [...rows];
    if (includeNew) for (const live of this.positions.values()) {
      if (!live.hasSnapshot || live.closed || live.snapshotRevision <= snapshotRevision || (login && String(login) !== live.login)) continue;
      if (source.some((row) => String(row.login || login) === live.login && String(row.position || row.ticket) === live.ticket)) continue;
      // A sparse price frame cannot stand in for a complete open trade. Wait
      // for a structural snapshot or HTTP row before creating a grid entry.
      if (!String(live.symbol || '').trim() || !(Number(live.patch.volume) > 0) || !(Number(live.patch.priceOpen) > 0)) continue;
      const raw = live.raw;
      const name = raw.account_name || raw.accountName || raw.name || '';
      const email = raw.account_email || raw.accountEmail || raw.email || '';
      if (!String(name).trim() || !String(email).trim()) continue;
      // Snapshot events have sufficient identity; tick-only records never create rows.
      source.push({ login: live.login, position: live.ticket, symbol: live.symbol,
        type: live.side, name, email,
        state_version: live.version, ...live.patch });
    }
    return source.flatMap((row) => {
      const live = this.positions.get(`${row.login || login}:${row.position || row.ticket}`);
      if (live?.closed) return [];
      if (!live) return [row];
      if (row.state_version != null && live.version != null) {
        if (BigInt(row.state_version) > BigInt(live.version)) return [row];
        if (live.pnl && !live.hasSnapshot && BigInt(row.state_version) !== BigInt(live.version)) return [row];
      }
      return [{ ...row, ...live.patch }];
    });
  }
  account(login) { const current = this.metrics.get(String(login)); return current?.available === false ? undefined : current?.row; }
}
export const liveTradingState = new LiveTradingState();
