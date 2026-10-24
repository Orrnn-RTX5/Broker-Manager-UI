export const GROUP_SYMBOL_STATUS = {
  global: { label: 'Global', hint: 'Follows the global Symbol Management setting.' },
  override_off: { label: 'Disabled for group', hint: 'Disabled for this group only.' },
  not_in_allow_list: { label: 'Not allowed', hint: "Not in this group's allowed-symbol list." },
  blocked_list: { label: 'Blocked', hint: "In this group's blocked-symbol list." },
  outside_feed_scope: { label: 'Outside feed', hint: "Not in the broker's feed symbol scope." },
  disabled_globally: { label: 'Globally disabled', hint: 'Disabled in Symbol Management.' },
};

export const GROUP_SYMBOL_FILTERS = [
  { value: 'all', label: 'All symbols' },
  { value: 'on', label: 'Enabled' },
  { value: 'off', label: 'Disabled' },
  { value: 'overrides', label: 'Group overrides' },
];

const EDITABLE_STATUSES = new Set(['global', 'override_off']);
const upper = (value) => String(value ?? '').trim().toUpperCase();

const parseOptionalNonNegativeInt = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = Number(raw);
  return Number.isInteger(num) && num >= 0 && num <= 2147483647 ? num : null;
};

export const validateStopsLevelOverride = (rawValue) => {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
    return { value: null, error: null };
  }
  const num = Number(String(rawValue).trim());
  if (!Number.isInteger(num) || num < 0 || num > 2147483647) {
    return {
      value: null,
      error: 'Stops level override must be blank (inherit) or a whole number between 0 and 2147483647.',
    };
  }
  return { value: num, error: null };
};

export const normalizeGroupSymbolOverrides = (response) => {
  const groupTrading = response?.group_trading !== false;
  const rows = (Array.isArray(response?.symbols) ? response.symbols : [])
    .map((raw) => {
      const hasStopsFields = raw?.stops_level_points !== undefined
        || raw?.stopsLevelPoints !== undefined
        || raw?.instrument_stops_level_points !== undefined
        || raw?.instrumentStopsLevelPoints !== undefined;
      const stopsLevelPoints = parseOptionalNonNegativeInt(raw?.stops_level_points ?? raw?.stopsLevelPoints);
      const instRaw = Number(raw?.instrument_stops_level_points ?? raw?.instrumentStopsLevelPoints ?? 0);
      const instrumentStopsLevelPoints = Number.isFinite(instRaw) && instRaw >= 0 ? Math.trunc(instRaw) : 0;
      const base = {
        symbol: String(raw?.symbol ?? '').trim(),
        category: String(raw?.category ?? ''),
        globalEnabled: raw?.global_enabled !== false,
        override: raw?.group_override === 'off' ? 'off' : null,
        status: GROUP_SYMBOL_STATUS[raw?.status] ? raw.status : 'global',
        effective: raw?.effective === true,
        groupTrading,
      };
      if (hasStopsFields) {
        base.stopsLevelPoints = stopsLevelPoints;
        base.instrumentStopsLevelPoints = instrumentStopsLevelPoints;
      }
      return base;
    })
    .filter((row) => row.symbol);

  return {
    rows,
    legacyAllowList: response?.legacy_allow_list === true,
    allowListCount: Number(response?.allow_list_count) || 0,
    groupTrading,
  };
};

export const isGroupSymbolEditable = (row) => EDITABLE_STATUSES.has(row?.status);

const isCompoundEntry = (entry) => entry !== null && typeof entry === 'object';

export const applyStagedOverride = (row, staged) => {
  const key = upper(row.symbol);
  if (!isGroupSymbolEditable(row) || !staged?.has(key)) return { ...row, staged: false };
  const entry = staged.get(key);
  if (!isCompoundEntry(entry)) {
    const override = entry;
    return {
      ...row,
      override,
      status: override === 'off' ? 'override_off' : 'global',
      effective: override !== 'off' && row.groupTrading !== false,
      staged: true,
    };
  }
  const override = entry.tradeChanged ? entry.tradeOverride : row.override;
  const stopsLevelPoints = entry.stopsChanged ? entry.stopsLevelPoints : (row.stopsLevelPoints ?? null);
  return {
    ...row,
    override,
    status: override === 'off' ? 'override_off' : 'global',
    effective: override !== 'off' && row.groupTrading !== false,
    stopsLevelPoints,
    staged: Boolean(entry.tradeChanged || entry.stopsChanged),
  };
};

export const toggleStagedOverride = (staged, row) => {
  const next = new Map(staged);
  if (!isGroupSymbolEditable(row)) return next;
  const key = upper(row.symbol);
  const existing = next.has(key) ? next.get(key) : undefined;
  if (isCompoundEntry(existing)) {
    const initialTrade = existing.initialOverride !== undefined ? existing.initialOverride : row.override;
    const currentTrade = existing.tradeChanged ? existing.tradeOverride : initialTrade;
    const desiredTrade = currentTrade === 'off' ? null : 'off';
    const tradeChanged = desiredTrade !== initialTrade;
    if (!tradeChanged && !existing.stopsChanged) {
      next.delete(key);
    } else if (!existing.stopsChanged) {
      next.set(key, desiredTrade);
    } else {
      next.set(key, { ...existing, initialOverride: initialTrade, tradeOverride: desiredTrade, tradeChanged });
    }
    return next;
  }
  const initialTrade = existing !== undefined ? (existing === 'off' ? null : 'off') : row.override;
  const current = existing !== undefined ? existing : row.override;
  const desired = current === 'off' ? null : 'off';
  if (desired === initialTrade) next.delete(key);
  else next.set(key, desired);
  return next;
};

export const stageGroupSymbolStopsOverride = (staged, row, rawValue) => {
  const next = new Map(staged);
  if (!isGroupSymbolEditable(row)) return next;
  const key = upper(row.symbol);
  const existing = next.has(key) ? next.get(key) : undefined;
  const initialStops = isCompoundEntry(existing) && existing.initialStops !== undefined
    ? existing.initialStops
    : (row.stopsLevelPoints ?? null);
  const initialOverride = isCompoundEntry(existing) && existing.initialOverride !== undefined
    ? existing.initialOverride
    : (existing !== undefined && !isCompoundEntry(existing) ? (existing === 'off' ? null : 'off') : row.override);
  const trimmed = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
  const desiredStops = trimmed === '' ? null : Number(trimmed);
  if (desiredStops !== null && (!Number.isInteger(desiredStops) || desiredStops < 0 || desiredStops > 2147483647)) {
    return next;
  }
  const stopsChanged = desiredStops !== initialStops;
  const tradeOverride = isCompoundEntry(existing)
    ? (existing.tradeChanged ? existing.tradeOverride : initialOverride)
    : (existing !== undefined ? existing : initialOverride);
  const tradeChanged = tradeOverride !== initialOverride;
  if (!tradeChanged && !stopsChanged) {
    next.delete(key);
  } else if (tradeChanged && !stopsChanged) {
    next.set(key, tradeOverride);
  } else {
    next.set(key, {
      initialOverride,
      initialStops,
      tradeOverride,
      tradeChanged,
      stopsLevelPoints: desiredStops,
      stopsChanged,
    });
  }
  return next;
};

export const buildGroupSymbolOverrideChanges = (staged) => (
  [...(staged || new Map()).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([symbol, entry]) => {
      if (!isCompoundEntry(entry)) {
        return [{ symbol, trade_allowed: entry !== 'off' }];
      }
      if (!entry.tradeChanged && !entry.stopsChanged) return [];
      const item = { symbol };
      if (entry.tradeChanged) item.trade_allowed = entry.tradeOverride !== 'off';
      if (entry.stopsChanged) item.stops_level_points = entry.stopsLevelPoints ?? null;
      return [item];
    })
);

export const filterGroupSymbolRows = (rows, query, filter) => {
  const needle = upper(query);
  return rows.filter((row) => {
    if (needle && !upper(row.symbol).includes(needle) && !upper(row.category).includes(needle)) return false;
    if (filter === 'on') return row.effective;
    if (filter === 'off') return !row.effective;
    if (filter === 'overrides') return row.override === 'off' || (row.stopsLevelPoints !== undefined && row.stopsLevelPoints !== null);
    return true;
  });
};

export const summarizeGroupSymbols = (rows) => ({
  total: rows.length,
  enabled: rows.filter((row) => row.effective).length,
  overrides: rows.filter((row) => row.override === 'off' || (row.stopsLevelPoints !== undefined && row.stopsLevelPoints !== null)).length,
});
