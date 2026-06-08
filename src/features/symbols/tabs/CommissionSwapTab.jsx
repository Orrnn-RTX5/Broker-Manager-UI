import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2, X } from 'lucide-react';
import {
  commissionScheduleList, commissionScheduleCreate, commissionScheduleDelete,
  dynamicLeverageList, dynamicLeverageCreate, dynamicLeverageDelete,
  swapFreeGroupList, swapFreeGroupSet, swapFreeGroupDelete,
} from '../../../services/api';
import { useFeedSymbols } from '../../../hooks/useFeedSymbols';

// ─── Generic delete-capable table ─────────────────────────────────────────────
const DeletableTable = ({ rows, columns, idKey, onDelete, deletingId, emptyMsg }) => (
  <table className="ui-grid w-full text-xs">
    <thead>
      <tr>
        {columns.map(c => <th key={c.key}>{c.label}</th>)}
        <th style={{ textAlign: 'right' }}>Actions</th>
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 ? (
        <tr><td colSpan={columns.length + 1} className="text-center py-6 text-xs" style={{ color: 'var(--muted)' }}>{emptyMsg}</td></tr>
      ) : rows.map((row, i) => (
        <tr key={row[idKey] || i}>
          {columns.map(c => (
            <td key={c.key} style={{ color: c.accent ? 'var(--accent-text)' : 'var(--text-2)' }}>
              {row[c.key] ?? '—'}
            </td>
          ))}
          <td style={{ textAlign: 'right' }}>
            <button
              onClick={() => onDelete(row[idKey] || i, row)}
              disabled={deletingId === (row[idKey] || i)}
              className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
              style={{ color: 'var(--danger)' }}
            >
              {deletingId === (row[idKey] || i) ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

// ─── Commission Section ────────────────────────────────────────────────────────
const CommissionSection = ({ symbol }) => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', commissionType: 'per_lot', value: 0, minCharge: 0, maxCharge: 0 });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    if (!symbol) return;
    setLoading(true);
    commissionScheduleList(symbol).then(d => setSchedules(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, [symbol]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await commissionScheduleCreate({ ...form, symbol });
      setShowForm(false);
      setForm({ name: '', commissionType: 'per_lot', value: 0, minCharge: 0, maxCharge: 0 });
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this commission schedule?')) return;
    setDeletingId(id);
    try { await commissionScheduleDelete(id); load(); } catch (e) { alert(e.message); } finally { setDeletingId(null); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="ui-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Commission Schedules</h3>
        {symbol && <button onClick={() => setShowForm(v => !v)} className="ui-btn ui-btn-secondary ui-btn-sm"><Plus size={13} /> Add</button>}
      </div>
      {showForm && (
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2 items-end p-3 rounded" style={{ background: 'var(--surface-2)' }}>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Name</label>
            <input className="ui-input ui-input-sm" value={form.name} onChange={e => set('name', e.target.value)} required style={{ width: 130 }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Type</label>
            <select className="ui-input ui-input-sm" value={form.commissionType} onChange={e => set('commissionType', e.target.value)}>
              <option value="per_lot">Per Lot</option>
              <option value="percent">Percent</option>
              <option value="per_deal">Per Deal</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Value</label>
            <input type="number" className="ui-input ui-input-sm" value={form.value} onChange={e => set('value', +e.target.value)} step={0.01} style={{ width: 80 }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Min</label>
            <input type="number" className="ui-input ui-input-sm" value={form.minCharge} onChange={e => set('minCharge', +e.target.value)} step={0.01} style={{ width: 80 }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Max</label>
            <input type="number" className="ui-input ui-input-sm" value={form.maxCharge} onChange={e => set('maxCharge', +e.target.value)} step={0.01} style={{ width: 80 }} />
          </div>
          {err && <p className="text-xs w-full" style={{ color: 'var(--danger)' }}>{err}</p>}
          <button type="submit" disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
            {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="ui-btn ui-btn-ghost ui-btn-sm"><X size={12} /></button>
        </form>
      )}
      {loading ? (
        <div className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}><Loader2 size={13} className="animate-spin inline mr-1" />Loading…</div>
      ) : (
        <DeletableTable
          rows={schedules}
          idKey="id"
          onDelete={handleDelete}
          deletingId={deletingId}
          emptyMsg={symbol ? 'No commission schedules.' : 'Select a symbol first.'}
          columns={[
            { key: 'name', label: 'Name', accent: true },
            { key: 'commissionType', label: 'Type' },
            { key: 'value', label: 'Value' },
            { key: 'minCharge', label: 'Min' },
            { key: 'maxCharge', label: 'Max' },
          ]}
        />
      )}
    </div>
  );
};

// ─── Dynamic Leverage Section ──────────────────────────────────────────────────
const DynamicLeverageSection = ({ symbol }) => {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leverage: 500, volumeFrom: 0, volumeTo: 10 });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    if (!symbol) return;
    setLoading(true);
    dynamicLeverageList(symbol).then(d => setTiers(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  }, [symbol]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await dynamicLeverageCreate({ ...form, symbol });
      setShowForm(false);
      setForm({ leverage: 500, volumeFrom: 0, volumeTo: 10 });
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this leverage tier?')) return;
    setDeletingId(id);
    try { await dynamicLeverageDelete(id); load(); } catch (e) { alert(e.message); } finally { setDeletingId(null); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="ui-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Dynamic Leverage</h3>
        {symbol && <button onClick={() => setShowForm(v => !v)} className="ui-btn ui-btn-secondary ui-btn-sm"><Plus size={13} /> Add Tier</button>}
      </div>
      {showForm && (
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2 items-end p-3 rounded" style={{ background: 'var(--surface-2)' }}>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Leverage</label>
            <input type="number" className="ui-input ui-input-sm" value={form.leverage} onChange={e => set('leverage', +e.target.value)} min={1} style={{ width: 90 }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Volume From (lots)</label>
            <input type="number" className="ui-input ui-input-sm" value={form.volumeFrom} onChange={e => set('volumeFrom', +e.target.value)} step={0.01} style={{ width: 100 }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Volume To (lots)</label>
            <input type="number" className="ui-input ui-input-sm" value={form.volumeTo} onChange={e => set('volumeTo', +e.target.value)} step={0.01} style={{ width: 100 }} />
          </div>
          {err && <p className="text-xs w-full" style={{ color: 'var(--danger)' }}>{err}</p>}
          <button type="submit" disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
            {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="ui-btn ui-btn-ghost ui-btn-sm"><X size={12} /></button>
        </form>
      )}
      {loading ? (
        <div className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}><Loader2 size={13} className="animate-spin inline mr-1" />Loading…</div>
      ) : (
        <DeletableTable
          rows={tiers}
          idKey="id"
          onDelete={handleDelete}
          deletingId={deletingId}
          emptyMsg={symbol ? 'No leverage tiers.' : 'Select a symbol first.'}
          columns={[
            { key: 'leverage', label: 'Leverage', accent: true },
            { key: 'volumeFrom', label: 'Volume From' },
            { key: 'volumeTo', label: 'Volume To' },
          ]}
        />
      )}
    </div>
  );
};

// ─── Swap-Free Section ─────────────────────────────────────────────────────────
const SwapFreeSection = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ group_name: '', swap_free_mode: 'full' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    swapFreeGroupList().then(d => setGroups(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await swapFreeGroupSet(form);
      setShowForm(false);
      setForm({ group_name: '', swap_free_mode: 'full' });
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this swap-free config?')) return;
    setDeletingId(id);
    try { await swapFreeGroupDelete(id); load(); } catch (e) { alert(e.message); } finally { setDeletingId(null); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="ui-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Swap-Free Groups (Islamic)</h3>
        <button onClick={() => setShowForm(v => !v)} className="ui-btn ui-btn-secondary ui-btn-sm"><Plus size={13} /> Add</button>
      </div>
      {showForm && (
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2 items-end p-3 rounded" style={{ background: 'var(--surface-2)' }}>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Group Name</label>
            <input className="ui-input ui-input-sm" value={form.group_name} onChange={e => set('group_name', e.target.value)} required placeholder="e.g. Real\\Islamic" style={{ width: 180 }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px]" style={{ color: 'var(--text-3)' }}>Mode</label>
            <select className="ui-input ui-input-sm" value={form.swap_free_mode} onChange={e => set('swap_free_mode', e.target.value)}>
              <option value="full">Full</option>
              <option value="partial">Partial</option>
            </select>
          </div>
          {err && <p className="text-xs w-full" style={{ color: 'var(--danger)' }}>{err}</p>}
          <button type="submit" disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
            {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
          </button>
          <button type="button" onClick={() => setShowForm(false)} className="ui-btn ui-btn-ghost ui-btn-sm"><X size={12} /></button>
        </form>
      )}
      {loading ? (
        <div className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}><Loader2 size={13} className="animate-spin inline mr-1" />Loading…</div>
      ) : (
        <DeletableTable
          rows={groups}
          idKey="id"
          onDelete={handleDelete}
          deletingId={deletingId}
          emptyMsg="No swap-free groups configured."
          columns={[
            { key: 'group_name', label: 'Group', accent: true },
            { key: 'swap_free_mode', label: 'Mode' },
          ]}
        />
      )}
    </div>
  );
};

// ─── Main Tab ──────────────────────────────────────────────────────────────────
const CommissionSwapTab = () => {
  const { symbols: allSymbols, loading: loadingSymbols, error: symbolLoadError } = useFeedSymbols();
  const [selectedSymbol, setSelectedSymbol] = useState('');

  return (
    <div className="h-full flex flex-col gap-4 overflow-auto">
      <div className="flex items-center gap-3 shrink-0">
        <label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-2)' }}>Symbol (for commission & leverage):</label>
        {loadingSymbols ? (
          <div className="flex items-center gap-2 py-1 px-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 size={12} className="animate-spin" /> Loading symbols…
          </div>
        ) : symbolLoadError ? (
          <div className="py-1 px-2 text-xs" style={{ color: 'var(--warning, var(--muted))' }}>
            {symbolLoadError}
          </div>
        ) : (
          <select className="ui-input ui-input-sm" style={{ width: 200 }} value={selectedSymbol} onChange={e => setSelectedSymbol(e.target.value)}>
            <option value="">— select symbol —</option>
            {allSymbols.map(s => <option key={s.symbol || s} value={s.symbol || s}>{s.symbol || s}</option>)}
          </select>
        )}
      </div>
      <CommissionSection symbol={selectedSymbol} />
      <DynamicLeverageSection symbol={selectedSymbol} />
      <SwapFreeSection />
    </div>
  );
};

export default CommissionSwapTab;
