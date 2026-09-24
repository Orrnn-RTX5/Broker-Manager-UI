import { getPositionSnapshotRows } from '../../services/positionSyncCore.js';

// MetaTrader-style request journal for the operations terminal. Entries are
// derived from the live /OnPositionUpdate stream: full snapshots are diffed
// against the previously seen tickets (open / close / modify), and lifecycle
// mutation frames are logged directly.
export const JOURNAL_COLUMNS = ['Time', 'Dealer', 'Login', 'Request', 'Answer'];
const MAX_JOURNAL_ENTRIES = 500;
// Snapshot frames stream at ~1 Hz, so a frame generated just before a lifecycle
// event can arrive after it. Recent open/close mutations are remembered for a
// few snapshot cycles so a stale snapshot cannot flap the ticket (phantom
// close -> open -> close) and journal the same trade multiple times.
const RECENT_MUTATION_GRACE_MS = 10_000;
const MAX_RECENT_MUTATIONS = 500;
// The feed cycles per-(login, symbol) slices, so each slice's first frame is
// its baseline — the positions it already held are history, not fresh opens.
// The window covers several slice cycles after the feed connects.
const SNAPSHOT_SEED_WINDOW_MS = 8_000;

let entries = [];
let nextEntryId = 1;
let knownPositions = new Map();
let recentMutations = new Map();
let seededScopes = new Set();
let snapshotStartedAt = 0;
let snapshotInitialized = false;
const listeners = new Set();

export const getTradeJournalEntries = () => entries;

// Low-level subscription used by tradeJournal.js, which additionally wires the
// store to the position sync feed. Kept separate so this module stays free of
// service-layer imports and testable under plain node.
export const addTradeJournalListener = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => {
  listeners.forEach((listener) => listener(entries));
};

export const clearTradeJournal = () => {
  entries = [];
  notify();
};

const firstValue = (...values) => values.find((v) => v !== undefined && v !== null && v !== '');

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const sameNumber = (a, b) => {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left === undefined || right === undefined) return true;
  return Math.abs(left - right) < 1e-9;
};

const pad2 = (value) => String(value).padStart(2, '0');

export const formatJournalTime = (date = new Date()) => (
  `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())} `
  + `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
);

// Mutation frames carry the lifecycle verb in `action`, so side detection must
// scan every field that can hold a buy/sell marker and match substrings only.
const readSide = (row = {}, payload = {}) => {
  const candidates = [
    row.side, row.type, row.direction, row.cmd, row.trade_side, row.order_side,
    row.deal_type, row.action, row.behavior,
    payload.side, payload.type, payload.direction, payload.cmd, payload.trade_side,
  ];
  for (const raw of candidates) {
    const text = String(raw ?? '').toLowerCase();
    if (text.includes('sell')) return 'sell';
    if (text.includes('buy')) return 'buy';
  }
  return '';
};

const normalizeJournalRecord = (row = {}, payload = {}) => ({
  ticket: firstValue(row.ticket, row.position, row.positionTicket, row.Ticket, row.order, row.order_ticket),
  login: firstValue(row.account_login, row.accountLogin, row.login, row.Login, row.user_login, payload.login),
  dealer: firstValue(row.dealer, row.dealer_login, row.dealerLogin, payload.dealer),
  symbol: firstValue(row.symbol, row.Symbol),
  side: readSide(row, payload),
  kind: firstValue(row.order_type, row.orderType, row.kind, row.pending_type, row.pendingType),
  volume: firstValue(row.volume, row.lots, row.volumeLots),
  price: firstValue(row.price_open, row.priceOpen, row.price, row.price_current, row.priceCurrent),
  sl: firstValue(row.price_sl, row.priceSl, row.sl),
  tp: firstValue(row.price_tp, row.priceTp, row.tp),
});

const mergeDefined = (base = {}, update = {}) => {
  const merged = { ...base };
  Object.entries(update).forEach(([key, value]) => {
    if (value !== undefined && value !== '') merged[key] = value;
  });
  return merged;
};

const ACTION_VERBS = {
  open: 'open', opened: 'open',
  close: 'close', closed: 'close',
  increase: 'increase', increased: 'increase',
  decrease: 'decrease', decreased: 'decrease',
  reverse: 'reverse', reversed: 'reverse',
  partiallyclosed: 'partially close', partialclose: 'partially close',
  modify: 'modify', modified: 'modify', update: 'modify', updated: 'modify',
  activate: 'activate', activated: 'activate',
};

const readAction = (payload = {}) => {
  const source = payload.data && !Array.isArray(payload.data) ? payload.data : payload;
  return String(
    firstValue(source.action, source.event, source.event_type, source.eventType, source.type) ?? ''
  ).toLowerCase().replace(/[\s_-]/g, '');
};

// Position payloads arrive either bare or wrapped in data/position/update
// envelopes; arrays are snapshots and are handled by recordPositionSnapshot.
const unwrapRecord = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const source = firstValue(payload.data, payload.position, payload.update, payload.record, payload);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  return source;
};

const formatVolume = (value) => {
  const parsed = toNumber(value);
  return parsed === undefined ? '' : parsed.toFixed(2);
};

const formatPrice = (value) => (value === undefined || value === null || value === '' ? '' : String(value));

// Request lines mirror the MetaTrader manager journal phrasing, e.g.
// "market buy 0.02 XAUUSD", "for '61928' sell 0.5 XAUUSD at 4308.89,
// close #13404703" and "modify #13404701 sell 0.1 XAUUSD -> sl: 4315.30,
// tp: 4289.57".
export const buildJournalRequest = (verb, record) => {
  const ticket = record.ticket !== undefined ? `#${record.ticket}` : '';
  const core = [record.side, formatVolume(record.volume), record.symbol].filter(Boolean).join(' ');
  const at = formatPrice(record.price) ? `at ${formatPrice(record.price)}` : '';
  switch (verb) {
    case 'open':
      return core ? `market ${core}` : ['open', ticket].filter(Boolean).join(' ');
    case 'close': {
      const prefix = record.login !== undefined ? `for '${record.login}'` : 'market';
      const head = [prefix, core, at].filter(Boolean).join(' ');
      return ticket ? `${head}, close ${ticket}` : head;
    }
    case 'modify': {
      const sl = formatPrice(record.sl);
      const tp = formatPrice(record.tp);
      const change = sl || tp ? ` -> sl: ${sl || '0'}, tp: ${tp || '0'}` : '';
      return ['modify', ticket, core].filter(Boolean).join(' ') + change;
    }
    case 'activate': {
      const kind = String(record.kind ?? '').toLowerCase();
      // Pending types like "buy stop" already carry the side word.
      const body = kind.includes('buy') || kind.includes('sell')
        ? [kind, formatVolume(record.volume), record.symbol]
        : [kind, record.side, formatVolume(record.volume), record.symbol];
      return ['activate', ticket, ...body, at].filter(Boolean).join(' ');
    }
    case 'increase':
    case 'decrease': {
      const volume = formatVolume(record.volume);
      return [verb, ticket, record.side, record.symbol, volume ? `-> volume ${volume}` : '']
        .filter(Boolean).join(' ');
    }
    default:
      return [verb, ticket, core, at].filter(Boolean).join(' ');
  }
};

const readAnswer = (payload = {}, record = {}, verb = '') => {
  const explicit = firstValue(payload.answer, payload.result, payload.status_text);
  if (typeof explicit === 'string' && explicit.trim()) return explicit;
  const price = formatPrice(record.price);
  return price && verb !== 'modify' ? `Done at ${price}` : 'Done';
};

const pushEntry = ({ verb, record, answer }) => {
  entries = [...entries, {
    id: nextEntryId++,
    time: formatJournalTime(),
    dealer: record.dealer ?? '—',
    login: record.login ?? '—',
    request: buildJournalRequest(verb, record),
    answer: answer ?? 'Done',
    side: record.side || '',
    detail: record,
  }].slice(-MAX_JOURNAL_ENTRIES);
  notify();
};

const pruneRecentMutations = (now = Date.now()) => {
  if (recentMutations.size === 0) return;
  const pruned = new Map();
  recentMutations.forEach((until, key) => {
    if (until > now) pruned.set(key, until);
  });
  recentMutations = pruned;
};

const noteLifecycleMutation = (key, verb) => {
  if (verb !== 'open' && verb !== 'close') return;
  pruneRecentMutations();
  if (recentMutations.size >= MAX_RECENT_MUTATIONS) return;
  recentMutations.set(key, { verb, until: Date.now() + RECENT_MUTATION_GRACE_MS });
};

const recentMutation = (key, now = Date.now()) => {
  const muted = recentMutations.get(key);
  if (muted && muted.until <= now) {
    recentMutations.delete(key);
    return null;
  }
  return muted || null;
};

const journalStateSame = (a = {}, b = {}) => (
  sameNumber(a.volume, b.volume) && sameNumber(a.sl, b.sl) && sameNumber(a.tp, b.tp)
);

const journalScopeKey = (record) => `${record.login ?? ''}|${record.symbol ?? ''}`;

// Diff an open-position frame against the tickets seen previously. Frames only
// cover their own (login, symbol) slices, so the diff runs per covered slice:
// a ticket absent inside a covered slice closed, while tickets in slices the
// frame does not cover are simply kept.
export const recordPositionSnapshot = (rows, now = Date.now()) => {
  if (!Array.isArray(rows)) return;
  if (!snapshotInitialized) snapshotStartedAt = now;
  const inSeedWindow = now - snapshotStartedAt < SNAPSHOT_SEED_WINDOW_MS;
  const next = new Map();
  const coveredScopes = new Set();
  rows.forEach((row) => {
    const record = normalizeJournalRecord(row);
    if (record.ticket === undefined) return;
    const scope = journalScopeKey(record);
    coveredScopes.add(scope);
    const key = String(record.ticket);
    // A snapshot row generated before the ticket's close frame must not
    // resurrect it as a fresh open.
    if (recentMutation(key, now)?.verb === 'close') return;
    next.set(key, record);
    const previous = knownPositions.get(key);
    if (!previous) {
      // Inside the seed window a slice's first frame is its baseline; past it,
      // every new ticket is a real open.
      if (snapshotInitialized && (seededScopes.has(scope) || !inSeedWindow)) {
        pushEntry({ verb: 'open', record, answer: readAnswer({}, record, 'open') });
      }
      return;
    }
    const changed = !sameNumber(previous.volume, record.volume)
      || !sameNumber(previous.sl, record.sl)
      || !sameNumber(previous.tp, record.tp);
    if (changed) pushEntry({ verb: 'modify', record, answer: 'Done' });
  });
  knownPositions.forEach((previous, key) => {
    if (next.has(key)) return;
    const muted = recentMutation(key, now);
    if (muted && muted.verb === 'open') {
      // The snapshot predates the open frame. Dropping the ticket would print
      // a phantom close and the next snapshot would re-open it again.
      next.set(key, previous);
      return;
    }
    // A ticket outside the covered slices was not reported closed.
    if (!coveredScopes.has(journalScopeKey(previous))) {
      next.set(key, previous);
      return;
    }
    pushEntry({ verb: 'close', record: previous, answer: 'Done' });
  });
  coveredScopes.forEach((scope) => seededScopes.add(scope));
  knownPositions = next;
  snapshotInitialized = true;
};

// Log a single lifecycle frame (opened/closed/modified/…) and mirror its
// effect onto the known tickets so the next snapshot diff does not log the
// same change a second time. Frames can also trail the snapshot that already
// reflected them, so a mutation already visible in the mirror is not journaled
// again.
export const recordPositionMutation = (payload) => {
  const rows = getPositionSnapshotRows(payload);
  if (rows) {
    recordPositionSnapshot(rows);
    return;
  }
  const record = normalizeJournalRecord(unwrapRecord(payload) ?? {}, payload);
  const verb = ACTION_VERBS[readAction(payload)] || 'update';
  if (record.ticket === undefined) {
    pushEntry({ verb, record, answer: readAnswer(payload, record, verb) });
    return;
  }

  const key = String(record.ticket);
  const previous = knownPositions.get(key);
  noteLifecycleMutation(key, verb);
  const merged = mergeDefined(previous, record);

  if (verb === 'close') {
    // Once snapshots seed state, a close for an unknown ticket was already
    // journaled by the diff that removed it.
    if (!previous && snapshotInitialized) return;
    knownPositions.delete(key);
  } else if (previous) {
    knownPositions.set(key, merged);
    // A second open for a known ticket, or a modify/update frame whose
    // journal-tracked fields (volume, S/L, T/P) are unchanged, only repeats
    // what the feed already logged.
    if (verb === 'open' || ((verb === 'modify' || verb === 'update') && journalStateSame(merged, previous))) return;
  } else {
    knownPositions.set(key, merged);
  }

  pushEntry({ verb, record: merged, answer: readAnswer(payload, merged, verb) });
};

export const resetTradeJournal = () => {
  entries = [];
  nextEntryId = 1;
  knownPositions = new Map();
  recentMutations = new Map();
  seededScopes = new Set();
  snapshotStartedAt = 0;
  snapshotInitialized = false;
  notify();
};
