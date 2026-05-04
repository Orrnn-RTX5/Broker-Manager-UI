import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, Copy, ToggleLeft, ToggleRight, Edit2, Loader2, ChevronDown, X } from 'lucide-react';
import {
  symbolList, symbolGet, symbolAdd, symbolUpdate, symbolEnable, symbolDisable,
  symbolClone, symbolCategoryList,
} from '../../../services/api';
import { buildFeedWsUrl } from '../../../config/endpoints';

// ─── Add / Edit Modal ──────────────────────────────────────────────────────────
const SymbolFormModal = ({ symbol: existing, categories, onClose, onSuccess }) => {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    symbol: existing?.symbol || '',
    description: existing?.description || '',
    digits: existing?.digits ?? 5,
    contractSize: existing?.contractSize ?? 100000,
    spread: existing?.spread ?? 0,
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
      if (isEdit) {
        await symbolUpdate({ symbol: form.symbol, description: form.description, digits: form.digits, contractSize: form.contractSize, spread: form.spread });
      } else {
        await symbolAdd({ symbol: form.symbol, description: form.description, digits: form.digits, contractSize: form.contractSize, spread: form.spread, category: form.category });
      }
      onSuccess();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
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
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Contract Size</label>
            <input type="number" className="ui-input ui-input-sm" value={form.contractSize} onChange={e => set('contractSize', +e.target.value)} min={1} />
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
const CloneModal = ({ categories, onClose, onSuccess }) => {
  const [baseSymbols, setBaseSymbols] = useState([]);
  const [loadingSymbols, setLoadingSymbols] = useState(true);
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

  // Fetch symbol names from the FIX WebSocket feed (same as MarketData.jsx)
  useEffect(() => {
    setLoadingSymbols(true);

    // Step 1: Connect to WebSocket
    const ws = new WebSocket(buildFeedWsUrl());
    const symbolSet = new Set();  // collect unique names

    ws.onopen = () => {
      // Step 2: Subscribe to all symbols
      ws.send(JSON.stringify({ type: 'subscribe', symbols: ['*'] }));
    };

    ws.onmessage = (e) => {
      try {
        // Step 3: Parse each message, extract symbol name
        const messages = e.data.trim().split('\n');
        for (let i = 0; i < messages.length; i++) {
          if (!messages[i]) continue;
          const msg = JSON.parse(messages[i]);
          if (msg.symbol) {
            symbolSet.add(msg.symbol);
          }
        }
      } catch (err) {
        // ignore parse errors
      }
    };

    // Step 4: After 3 seconds, stop and store the collected symbols
    const timer = setTimeout(() => {
      // Convert Set → sorted Array
      const Symbols = Array.from(symbolSet).sort();
      setBaseSymbols(Symbols);
      setLoadingSymbols(false);

      // Close WebSocket
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }, 3000);

    ws.onerror = () => {
      setBaseSymbols([]);
      setLoadingSymbols(false);
    };

    // Cleanup
    return () => {
      clearTimeout(timer);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="ui-card w-full max-w-md p-6 flex flex-col gap-4" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Clone Symbol</h2>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Source Symbol *</label>
            {loadingSymbols ? (
              <div className="flex items-center gap-2 py-1 px-2 text-xs" style={{ color: 'var(--muted)' }}>
                <Loader2 size={12} className="animate-spin" /> Loading symbols…
              </div>
            ) : (
              <select className="ui-input ui-input-sm" value={form.baseSymbol} onChange={e => set('baseSymbol', e.target.value)} required>
                <option value="">— select —</option>
                {baseSymbols.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
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
const SymbolsTab = () => {
  const [symbols, setSymbols] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterEnabled, setFilterEnabled] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'clone'
  const [editTarget, setEditTarget] = useState(null);
  const [togglingSymbol, setTogglingSymbol] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [symsResult, catsResult] = await Promise.allSettled([symbolList(), symbolCategoryList()]);
      if (symsResult.status === 'fulfilled') {
        setSymbols(Array.isArray(symsResult.value) ? symsResult.value : []);
      }
      if (catsResult.status === 'fulfilled') {
        setCategories(Array.isArray(catsResult.value) ? catsResult.value : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
      alert('Error: ' + e.message);
    } finally {
      setTogglingSymbol(null);
    }
  };

  const filtered = useMemo(() => {
    return symbols.filter(s => {
      if (search && !(s.symbol || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCategory && s.category !== filterCategory) return false;
      if (filterType === 'base' && s.symbolType !== 'base') return false;
      if (filterType === 'derived' && s.symbolType !== 'derived') return false;
      if (filterEnabled === 'enabled' && !s.enabled) return false;
      if (filterEnabled === 'disabled' && s.enabled) return false;
      return true;
    });
  }, [symbols, search, filterCategory, filterType, filterEnabled]);

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative">
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
        <div className="flex-1" />
        <button onClick={() => setModal('clone')} className="ui-btn ui-btn-secondary ui-btn-sm">
          <Copy size={13} /> Clone
        </button>
        <button onClick={() => { setEditTarget(null); setModal('add'); }} className="ui-btn ui-btn-primary ui-btn-sm">
          <Plus size={13} /> Add Symbol
        </button>
      </div>

      {/* Table */}
      <div className="ui-card flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--muted)' }}>
            <Loader2 size={16} className="animate-spin mr-2" /> Loading symbols…
          </div>
        ) : (
          <table className="ui-grid w-full">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Type</th>
                <th>Category</th>
                <th>Digits</th>
                <th>Contract Size</th>
                <th>Spread</th>
                <th>Calc Mode</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>No symbols found.</td></tr>
              ) : filtered.map(s => (
                <tr key={s.symbol}>
                  <td style={{ color: 'var(--accent-text)', fontWeight: 500 }}>
                    {s.symbol}
                    {s.symbolType === 'derived' && s.parentSymbol && (
                      <span className="ml-2 ui-badge ui-badge-primary text-[10px]">derived: {s.parentSymbol}</span>
                    )}
                  </td>
                  <td>
                    <span className={`ui-badge text-[10px] ${s.symbolType === 'derived' ? 'ui-badge-warning' : 'ui-badge-success'}`}>
                      {s.symbolType || 'base'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-2)' }}>{s.category || '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{s.digits ?? '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{s.contractSize ?? '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>
                    {s.spread ?? '—'}
                    {s.spreadMarkupPips > 0 && <span className="ml-1 text-[10px]" style={{ color: 'var(--warning)' }}>(+{s.spreadMarkupPips})</span>}
                  </td>
                  <td style={{ color: 'var(--text-2)' }}>{s.calcMode || '—'}</td>
                  <td>
                    <span className={`ui-badge text-[10px] ${s.enabled ? 'ui-badge-success' : 'ui-badge-danger'}`}>
                      {s.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggle(s)}
                        disabled={togglingSymbol === s.symbol}
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
                        className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
          onSuccess={() => { setModal(null); setEditTarget(null); load(); }}
        />
      )}
      {modal === 'clone' && (
        <CloneModal
          categories={categories}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
};

export default SymbolsTab;
