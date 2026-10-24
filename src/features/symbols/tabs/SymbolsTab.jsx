import { showResult } from '../../../store/resultDialogStore.js';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Copy, ToggleLeft, ToggleRight, Edit2, Loader2, RefreshCw, ChevronDown, X } from 'lucide-react';
import {
  symbolManagementList, peekSymbolManagementData,
  symbolAdd, symbolUpdate, symbolEnable, symbolDisable, symbolClone,
} from '../../../services/api';
import { useFeedSymbols } from '../../../hooks/useFeedSymbols';
import { getSymbolTableWindow } from '../../../utils/symbolTableWindow.js';

// ─── Add / Edit Modal ──────────────────────────────────────────────────────────
const SymbolFormModal = ({ symbol: existing, categories, onClose, onSuccess }) => {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    symbol: existing?.symbol || '',
    description: existing?.description || '',
    digits: existing?.digits ?? 5,
    contractSize: existing?.contractSize ?? 100000,
    spread: existing?.spread ?? 0,
    stopsLevelPoints: existing?.stops_level_points ?? existing?.stopsLevelPoints ?? 0,
    calcMode: existing?.calcMode || '',
    category: existing?.category || '',
    enabled: existing?.enabled ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const rawStops = form.stopsLevelPoints;
      const stopsLevelPoints = rawStops === '' || rawStops === null || rawStops === undefined ? 0 : Number(rawStops);
      if (!Number.isInteger(stopsLevelPoints) || stopsLevelPoints < 0 || stopsLevelPoints > 2147483647) {
        throw new Error('Stops level points must be a whole number between 0 and 2147483647.');
      }
      if (isEdit) {
        await symbolUpdate({
          symbol: form.symbol,
          description: form.description,
          digits: form.digits,
          contractSize: form.contractSize,
          spread: form.spread,
          stops_level_points: stopsLevelPoints,
        });
      } else {
        await symbolAdd({
          symbol: form.symbol,
          description: form.description,
          digits: form.digits,
          contractSize: form.contractSize,
          spread: form.spread,
          stops_level_points: stopsLevelPoints,
          category: form.category,
        });
      }
      onSuccess();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'transparent' }}>
      <div className="ui-card w-full max-w-md p-6 flex flex-col gap-4" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{isEdit ? 'Edit Symbol' : 'Add Symbol'}</h2>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Symbol *</label>
            <input className="ui-input ui-input-sm" value={form.symbol} onChange={e => set('symbol', e.target.value)} required disabled={isEdit} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Description</label>
            <input className="ui-input ui-input-sm" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Digits</label>
              <input type="number" className="ui-input ui-input-sm" value={form.digits} onChange={e => set('digits', +e.target.value)} min={0} max={8} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Spread (pts)</label>
              <input type="number" className="ui-input ui-input-sm" value={form.spread} onChange={e => set('spread', +e.target.value)} min={0} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Contract Size</label>
              <input type="number" className="ui-input ui-input-sm" value={form.contractSize} onChange={e => set('contractSize', +e.target.value)} min={1} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Stops Level (pts)</label>
              <input
                type="number"
                className="ui-input ui-input-sm"
                aria-label="Stops Level (pts)"
                placeholder="0 (no minimum)"
                value={form.stopsLevelPoints}
                onChange={e => set('stopsLevelPoints', e.target.value === '' ? '' : +e.target.value)}
                min={0}
                max={2147483647}
                step={1}
              />
            </div>
          </div>
          {!isEdit && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Category</label>
              <select className="ui-input ui-input-sm" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">— none —</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          )}
          {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
          <div className="flex justify-end gap-2 mt-1">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">Cancel</button>
            <button type="submit" disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
              {saving ? <Loader2 size={13} className="animate-spin" /> : (isEdit ? 'Save' : 'Add Symbol')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Clone Modal ───────────────────────────────────────────────────────────────
// localStorage cache for symbol names (instant open after first use)
const SYMBOL_CACHE_KEY = 'rtx-clone-symbol-names-cache';
const readSymbolCache = () => {
  try {
    const raw = localStorage.getItem(SYMBOL_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};
const writeSymbolCache = (names) => {
  try { localStorage.setItem(SYMBOL_CACHE_KEY, JSON.stringify(names)); } catch { /* quota */ }
};

const CloneModal = ({ categories, onClose, onSuccess }) => {
  const cached = useMemo(() => readSymbolCache(), []);
  const {
    symbols: baseSymbols,
    loading: loadingSymbols,
    refreshing,
    error: symbolLoadError,
  } = useFeedSymbols({ initialSymbols: cached, onSymbols: writeSymbolCache });
  // If we have cached names, never block the dropdown — refresh silently in the background.
  const [form, setForm] = useState({
    baseSymbol: '',
    newSymbol: '',
    description: '',
    spreadMarkupPips: 0,
    contractSize: 100000,
    minVolume: 0.01,
    maxVolume: 100,
    volumeStep: 0.01,
    category: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Fetch symbol names from the FIX WebSocket feed.
  // Cache hit  → render instantly, refresh silently in background.
  // Cache miss → animated skeleton until first batch arrives (max 3s).
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await symbolClone(form);
      onSuccess();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'transparent' }}>
      <div className="ui-card w-full max-w-md p-6 flex flex-col gap-4" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Clone Symbol</h2>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
              Source Symbol *
              {refreshing && (
                <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--muted)' }}>
                  <Loader2 size={10} className="animate-spin" /> refreshing
                </span>
              )}
            </label>
            {loadingSymbols ? (
              <div className="ui-input ui-input-sm relative overflow-hidden flex items-center" style={{ pointerEvents: 'none' }}>
                <span
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent 0%, var(--surface-2, rgba(255,255,255,0.08)) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'rtxSkeletonShimmer 1.2s linear infinite',
                  }}
                />
                <span className="relative inline-flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                  <Loader2 size={12} className="animate-spin" />
                  Loading symbols from feed…
                </span>
                <style>{`@keyframes rtxSkeletonShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
              </div>
            ) : (
              <>
                <select
                  className="ui-input ui-input-sm"
                  value={form.baseSymbol}
                  onChange={e => set('baseSymbol', e.target.value)}
                  required
                  disabled={Boolean(symbolLoadError) && baseSymbols.length === 0}
                >
                <option value="">— select —</option>
                  {baseSymbols.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {symbolLoadError && (
                  <p className="text-[11px]" style={{ color: 'var(--warning, var(--muted))' }}>{symbolLoadError}</p>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>New Symbol Name *</label>
            <input className="ui-input ui-input-sm" value={form.newSymbol} onChange={e => set('newSymbol', e.target.value)} required placeholder="e.g. EURUSDpro" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Description</label>
            <input className="ui-input ui-input-sm" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Spread Markup (pips)</label>
              <input type="number" className="ui-input ui-input-sm" value={form.spreadMarkupPips} onChange={e => set('spreadMarkupPips', +e.target.value)} min={0} step={0.1} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Contract Size</label>
              <input type="number" className="ui-input ui-input-sm" value={form.contractSize} onChange={e => set('contractSize', +e.target.value)} min={1} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Min Vol</label>
              <input type="number" className="ui-input ui-input-sm" value={form.minVolume} onChange={e => set('minVolume', +e.target.value)} step={0.01} min={0.01} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Max Vol</label>
              <input type="number" className="ui-input ui-input-sm" value={form.maxVolume} onChange={e => set('maxVolume', +e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Vol Step</label>
              <input type="number" className="ui-input ui-input-sm" value={form.volumeStep} onChange={e => set('volumeStep', +e.target.value)} step={0.01} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Category</label>
            <select className="ui-input ui-input-sm" value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="">— none —</option>
              {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
          <div className="flex justify-end gap-2 mt-1">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">Cancel</button>
            <button type="submit" disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
              {saving ? <Loader2 size={13} className="animate-spin" /> : 'Clone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main Tab ──────────────────────────────────────────────────────────────────
const SymbolsTab = ({ actionsHost }) => {
  const initialData = useMemo(() => peekSymbolManagementData(), []);
  const [symbols, setSymbols] = useState(() => initialData?.symbols || []);
  const [categories, setCategories] = useState(() => initialData?.categories || []);
  const [loading, setLoading] = useState(() => !initialData?.symbols?.length);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'clone'
  const [editTarget, setEditTarget] = useState(null);
  const [togglingSymbol, setTogglingSymbol] = useState(null);
  const hasSymbolsRef = useRef(Boolean(initialData?.symbols?.length));
  const mountedRef = useRef(true);
  const tableRef = useRef(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 200 });

  useEffect(() => {
    const element = tableRef.current;
    const observer = new ResizeObserver(() => {
      const height = element.clientHeight;
      setViewport(current => current.height === height ? current : { ...current, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    tableRef.current.scrollTop = 0;
    setViewport(current => ({ ...current, scrollTop: 0 }));
  }, [search, filterCategory, filterType, filterEnabled]);

  const load = useCallback(async ({ force = false, blocking = !hasSymbolsRef.current } = {}) => {
    setLoadError('');
    setRefreshing(true);
    if (blocking) setLoading(true);
    try {
      const data = await symbolManagementList({
        force,
        onProgress: (progress) => {
          if (!mountedRef.current) return;
          if (Array.isArray(progress?.symbols) && progress.symbols.length > 0) {
            hasSymbolsRef.current = true;
            setSymbols(progress.symbols);
            setLoading(false);
          }
          if (Array.isArray(progress?.categories) && progress.categories.length > 0) {
            setCategories(progress.categories);
          }
        },
      });

      if (!mountedRef.current) return;
      setLoadError(data?.error || '');
      if (Array.isArray(data?.symbols)) {
        hasSymbolsRef.current = data.symbols.length > 0;
        setSymbols(data.symbols);
      }
      if (Array.isArray(data?.categories)) {
        setCategories(data.categories);
      }
    } catch (error) {
      // Keep any cached or progressive rows visible when a background refresh fails.
      if (mountedRef.current) {
        setLoadError(error.message || 'Could not load symbol details. Please retry.');
        setSymbols(previous => previous.map(row => ({ ...row, __managementLoading: false })));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const handleToggle = async (sym) => {
    setTogglingSymbol(sym.symbol);
    try {
      if (sym.enabled) {
        await symbolDisable(sym.symbol);
      } else {
        await symbolEnable(sym.symbol);
      }
      setSymbols(prev => prev.map(s => s.symbol === sym.symbol ? { ...s, enabled: !s.enabled } : s));
    } catch (e) {
      showResult.error('Error: ' + e.message);
    } finally {
      setTogglingSymbol(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search && !filterCategory && !filterType && !filterEnabled) return symbols;
    const searchTerm = search.toLowerCase();
    return symbols.filter(s => {
      if (searchTerm && !(s.symbol || '').toLowerCase().includes(searchTerm)) return false;
      if (filterCategory && s.category !== filterCategory) return false;
      if (filterType === 'base' && s.symbolType !== 'base') return false;
      if (filterType === 'derived' && s.symbolType !== 'derived') return false;
      if (typeof s.enabled !== 'boolean' && filterEnabled) return false;
      if (filterEnabled === 'enabled' && !s.enabled) return false;
      if (filterEnabled === 'disabled' && s.enabled) return false;
      return true;
    });
  }, [symbols, search, filterCategory, filterType, filterEnabled]);

  const rowWindow = getSymbolTableWindow(filtered.length, viewport.scrollTop, viewport.height);

  return (
    <div className="symbols-tab h-full min-h-0 flex flex-col gap-3 overflow-hidden">
      {/* Toolbar */}
      <div className="symbols-toolbar shrink-0">
        <div className="symbols-search relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input className="ui-input ui-input-sm" style={{ paddingLeft: 30, width: 200 }} placeholder="Search symbols…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="ui-input ui-input-sm" value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ width: 150 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <select className="ui-input ui-input-sm" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 130 }}>
          <option value="">All Types</option>
          <option value="base">Base</option>
          <option value="derived">Derived</option>
        </select>
        <select className="ui-input ui-input-sm" value={filterEnabled} onChange={e => setFilterEnabled(e.target.value)} style={{ width: 130 }}>
          <option value="">All Status</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>
        {actionsHost && createPortal(<>
        <button onClick={() => setModal('clone')} className="ui-btn ui-btn-secondary ui-btn-sm">
          <Copy size={13} /> Clone
        </button>
        <button onClick={() => { setEditTarget(null); setModal('add'); }} className="ui-btn ui-btn-primary ui-btn-sm">
          <Plus size={13} /> Add Symbol
        </button>
        </>, actionsHost)}

      {/* Table */}
      <div className="flex items-center justify-between gap-2 shrink-0 text-xs" style={{ color: 'var(--text-3)' }}>
        <span role="status" aria-live="polite">
          {filtered.length === symbols.length ? `${symbols.length} symbols` : `${filtered.length} of ${symbols.length} symbols`}
          {refreshing ? ' · Updating catalogue…' : ''}
        </span>
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => load({ force: true, blocking: false })} disabled={refreshing}>
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      {loadError && <div role="alert" className="flex items-center justify-between gap-3 p-2 text-xs" style={{ color: 'var(--danger-text)', background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)' }}>
        <span>{loadError}</span><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => load({ force: true, blocking: false })}>Retry</button>
      </div>}
      <div ref={tableRef} className="symbols-table ui-card flex-1 min-h-0 overflow-auto"
        onScroll={event => {
          const scrollTop = event.currentTarget.scrollTop;
          setViewport(current => current.scrollTop === scrollTop ? current : { ...current, scrollTop });
        }}>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--muted)' }}>
            <Loader2 size={16} className="animate-spin mr-2" /> Loading symbols…
          </div>
        ) : (
          <table className="ui-grid w-full" aria-rowcount={filtered.length + 1}>
            <colgroup>
              <col className="symbols-column-symbol" />
              <col className="symbols-column-type" />
              <col className="symbols-column-category" />
              <col className="symbols-column-digits" />
              <col className="symbols-column-contract" />
              <col className="symbols-column-spread" />
              <col className="symbols-column-stops" />
              <col className="symbols-column-calc-mode" />
              <col className="symbols-column-status" />
              <col className="symbols-column-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Type</th>
                <th scope="col">Category</th>
                <th scope="col">Digits</th>
                <th scope="col">Contract Size</th>
                <th scope="col">Spread</th>
                <th scope="col">Stops (pts)</th>
                <th scope="col">Calc Mode</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rowWindow.top > 0 && <tr aria-hidden="true"><td colSpan={10} style={{ height: rowWindow.top, padding: 0, border: 0 }} /></tr>}
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>No symbols found.</td></tr>
              ) : filtered.slice(rowWindow.start, rowWindow.end).map((s, index) => (
                <tr key={s.symbol} aria-rowindex={rowWindow.start + index + 2}>
                  <td className="symbol-name-cell" style={{ color: 'var(--accent-text)', fontWeight: 400 }}>
                    {s.symbol}
                    {s.symbolType === 'derived' && s.parentSymbol && (
                      <span className="ml-2 ui-status ui-status-neutral">derived: {s.parentSymbol}</span>
                    )}
                  </td>
                  <td>
                    <span className={`ui-status ${s.__managementPartial && !s.symbolType ? '' : s.symbolType === 'derived' ? 'ui-status-warn' : 'ui-status-ok'}`}>
                      {s.__managementFeedOnly ? 'Feed only' : s.symbolType || (s.__managementPartial ? (s.__managementLoading === false ? 'Unavailable' : 'Loading…') : 'base')}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-2)' }}>{s.category || '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{s.digits ?? '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{s.contractSize ?? '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>
                    {s.spread ?? '—'}
                    {s.spreadMarkupPips > 0 && <span className="ml-1 text-[10px]" style={{ color: 'var(--warning)' }}>(+{s.spreadMarkupPips})</span>}
                  </td>
                  <td style={{ color: 'var(--text-2)' }}>{s.stops_level_points ?? s.stopsLevelPoints ?? 0}</td>
                  <td style={{ color: 'var(--text-2)' }}>{s.calcMode || '—'}</td>
                  <td>
                    <span className={`ui-status ${typeof s.enabled !== 'boolean' ? '' : s.enabled ? 'ui-status-ok' : 'ui-status-danger'}`}>
                      {typeof s.enabled !== 'boolean' ? (s.__managementLoading === false ? 'Unavailable' : 'Loading…') : s.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleToggle(s)}
                        disabled={s.__managementPartial || typeof s.enabled !== 'boolean' || togglingSymbol === s.symbol}
                        className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                        title={s.enabled ? 'Disable' : 'Enable'}
                      >
                        {togglingSymbol === s.symbol
                          ? <Loader2 size={13} className="animate-spin" />
                          : s.enabled ? <ToggleRight size={14} style={{ color: 'var(--success)' }} /> : <ToggleLeft size={14} style={{ color: 'var(--muted)' }} />
                        }
                      </button>
                      <button
                        onClick={() => { setEditTarget(s); setModal('edit'); }}
                        disabled={s.__managementPartial}
                        className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rowWindow.bottom > 0 && <tr aria-hidden="true"><td colSpan={10} style={{ height: rowWindow.bottom, padding: 0, border: 0 }} /></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {(modal === 'add' || modal === 'edit') && (
        <SymbolFormModal
          symbol={editTarget}
          categories={categories}
          onClose={() => { setModal(null); setEditTarget(null); }}
          onSuccess={() => { setModal(null); setEditTarget(null); load({ force: true, blocking: false }); }}
        />
      )}
      {modal === 'clone' && (
        <CloneModal
          categories={categories}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); load({ force: true, blocking: false }); }}
        />
      )}
    </div>
  );
};

export default SymbolsTab;
