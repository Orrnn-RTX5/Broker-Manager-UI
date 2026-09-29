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

export const normalizeGroupSymbolOverrides = (response) => {
  const groupTrading = response?.group_trading !== false;
  const rows = (Array.isArray(response?.symbols) ? response.symbols : [])
    .map((raw) => ({
      symbol: String(raw?.symbol ?? '').trim(),
      category: String(raw?.category ?? ''),
      globalEnabled: raw?.global_enabled !== false,
      override: raw?.group_override === 'off' ? 'off' : null,
      status: GROUP_SYMBOL_STATUS[raw?.status] ? raw.status : 'global',
      effective: raw?.effective === true,
      groupTrading,
    }))
    .filter((row) => row.symbol);

  return {
    rows,
    legacyAllowList: response?.legacy_allow_list === true,
    allowListCount: Number(response?.allow_list_count) || 0,
    groupTrading,
  };
};

export const isGroupSymbolEditable = (row) => EDITABLE_STATUSES.has(row?.status);

export const applyStagedOverride = (row, staged) => {
  const key = upper(row.symbol);
  if (!isGroupSymbolEditable(row) || !staged.has(key)) return { ...row, staged: false };
  const override = staged.get(key);
  return {
    ...row,
    override,
    status: override === 'off' ? 'override_off' : 'global',
    effective: override !== 'off' && row.groupTrading !== false,
    staged: true,
  };
};

export const toggleStagedOverride = (staged, row) => {
  const next = new Map(staged);
  if (!isGroupSymbolEditable(row)) return next;
  const key = upper(row.symbol);
  const current = next.has(key) ? next.get(key) : row.override;
  const desired = current === 'off' ? null : 'off';
  if (desired === row.override) next.delete(key);
  else next.set(key, desired);
  return next;
};

export const buildGroupSymbolOverrideChanges = (staged) => (
  [...staged.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([symbol, override]) => ({ symbol, trade_allowed: override !== 'off' }))
);

export const filterGroupSymbolRows = (rows, query, filter) => {
  const needle = upper(query);
  return rows.filter((row) => {
    if (needle && !upper(row.symbol).includes(needle) && !upper(row.category).includes(needle)) return false;
    if (filter === 'on') return row.effective;
    if (filter === 'off') return !row.effective;
    if (filter === 'overrides') return row.override === 'off';
    return true;
  });
};

export const summarizeGroupSymbols = (rows) => ({
  total: rows.length,
  enabled: rows.filter((row) => row.effective).length,
  overrides: rows.filter((row) => row.override === 'off').length,
});
