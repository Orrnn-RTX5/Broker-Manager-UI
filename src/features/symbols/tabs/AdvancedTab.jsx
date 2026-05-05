import { useState, useEffect } from 'react';
import { Save, Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  marketDepthConfigGet, marketDepthConfigSet,
  symbolVisibilityList, symbolVisibilitySet,
} from '../../../services/api';
import { buildFeedWsUrl } from '../../../config/endpoints';

// ─── Market Depth Section ──────────────────────────────────────────────────────
const MarketDepthSection = ({ allSymbols, loadingSymbols }) => {
  const [symbol, setSymbol] = useState('');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!symbol) { setConfig(null); return; }
    setLoading(true);
    marketDepthConfigGet(symbol)
      .then(d => setConfig(d || {}))
      .catch(() => setConfig({}))
      .finally(() => setLoading(false));
  }, [symbol]);

  const handleSave = async () => {
    setSaving(true);
    setErr('');
    try {
      await marketDepthConfigSet({ symbol, ...config });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => setConfig(c => ({ ...c, [k]: v }));

  return (
    <div className="ui-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Market Depth Config</h3>
        {symbol && config && (
          <button onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <><Save size={13} /> Save</>}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs shrink-0" style={{ color: 'var(--text-2)' }}>Symbol:</label>
        {loadingSymbols ? (
          <div className="flex items-center gap-2 py-1 px-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 size={12} className="animate-spin" /> Loading symbols…
          </div>
        ) : (
          <select className="ui-input ui-input-sm" style={{ width: 200 }} value={symbol} onChange={e => setSymbol(e.target.value)}>
            <option value="">— select —</option>
            {allSymbols.map(s => <option key={s.symbol || s} value={s.symbol || s}>{s.symbol || s}</option>)}
          </select>
        )}
      </div>
      {loading && <div className="text-xs" style={{ color: 'var(--muted)' }}><Loader2 size={12} className="animate-spin inline mr-1" />Loading…</div>}
      {config && !loading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Depth Levels</label>
            <input type="number" className="ui-input ui-input-sm" value={config.depth_levels ?? 10} onChange={e => set('depth_levels', +e.target.value)} min={1} max={50} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Update Interval (ms)</label>
            <input type="number" className="ui-input ui-input-sm" value={config.update_interval_ms ?? 100} onChange={e => set('update_interval_ms', +e.target.value)} min={50} />
          </div>
          <div className="flex items-center gap-2 col-span-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" checked={config.enabled ?? true} onChange={e => set('enabled', e.target.checked)} />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" checked={config.aggregate ?? false} onChange={e => set('aggregate', e.target.checked)} />
              Aggregate Levels
            </label>
          </div>
        </div>
      )}
      {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
    </div>
  );
};

// ─── Visibility Modal ──────────────────────────────────────────────────────────
const VisibilityModal = ({ allSymbols, loadingSymbols, onClose, onSuccess }) => {
  const [form, setForm] = useState({ symbol: '', group: '', visible: true });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.symbol || !form.group) { setErr('Symbol and Group are required.'); return; }
    setSaving(true);
    setErr('');
    try {
      await symbolVisibilitySet(form);
      onSuccess();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="ui-card w-full max-w-sm p-6 flex flex-col gap-4" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Set Symbol Visibility</h2>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"><X size={14} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Symbol *</label>
            {loadingSymbols ? (
              <div className="flex items-center gap-2 py-1 px-2 text-xs" style={{ color: 'var(--muted)' }}>
                <Loader2 size={12} className="animate-spin" /> Loading symbols…
              </div>
            ) : (
              <select className="ui-input ui-input-sm" value={form.symbol} onChange={e => set('symbol', e.target.value)}>
                <option value="">— select —</option>
                {allSymbols.map(s => <option key={s.symbol || s} value={s.symbol || s}>{s.symbol || s}</option>)}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Group *</label>
            <input className="ui-input ui-input-sm" value={form.group} onChange={e => set('group', e.target.value)} placeholder="e.g. Real\\Standard" />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={form.visible} onChange={e => set('visible', e.target.checked)} />
            Visible
          </label>
        </div>
        {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
            {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Visibility Section ────────────────────────────────────────────────────────
const VisibilitySection = ({ allSymbols, loadingSymbols }) => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = () => {
    setLoading(true);
    symbolVisibilityList().then(d => setRules(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="ui-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Symbol Visibility Rules</h3>
        <button onClick={() => setShowModal(true)} className="ui-btn ui-btn-secondary ui-btn-sm">
          <Plus size={13} /> Set Visibility
        </button>
      </div>
      {loading ? (
        <div className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}>
          <Loader2 size={13} className="animate-spin inline mr-1" />Loading…
        </div>
      ) : (
        <table className="ui-grid w-full text-xs">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Group</th>
              <th>Visible</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-6" style={{ color: 'var(--muted)' }}>No visibility rules configured.</td></tr>
            ) : rules.map((r, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--accent-text)', fontWeight: 500 }}>{r.symbol}</td>
                <td style={{ color: 'var(--text-2)' }}>{r.group}</td>
                <td>
                  <span className={`ui-badge text-[10px] ${r.visible ? 'ui-badge-success' : 'ui-badge-danger'}`}>
                    {r.visible ? 'Visible' : 'Hidden'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showModal && (
        <VisibilityModal
          allSymbols={allSymbols}
          loadingSymbols={loadingSymbols}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
};

// ─── Main Tab ──────────────────────────────────────────────────────────────────
const AdvancedTab = () => {
  const [allSymbols, setAllSymbols] = useState([]);
  const [loadingSymbols, setLoadingSymbols] = useState(true);

  useEffect(() => {
    setLoadingSymbols(true);
    const ws = new WebSocket(buildFeedWsUrl());
    const symbolSet = new Set();
    
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', symbols: ['*'] }));
    ws.onmessage = (e) => {
      try {
        const messages = e.data.trim().split('\n');
        for (let i = 0; i < messages.length; i++) {
          if (!messages[i]) continue;
          const msg = JSON.parse(messages[i]);
          if (msg.symbol) symbolSet.add(msg.symbol);
        }
      } catch (err) {}
    };

    const timer = setTimeout(() => {
      setAllSymbols(Array.from(symbolSet).sort());
      setLoadingSymbols(false);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }, 3000);

    ws.onerror = () => {
      setAllSymbols([]);
      setLoadingSymbols(false);
    };

    return () => {
      clearTimeout(timer);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  return (
    <div className="h-full flex flex-col gap-4 overflow-auto">
      <MarketDepthSection allSymbols={allSymbols} loadingSymbols={loadingSymbols} />
      <VisibilitySection allSymbols={allSymbols} loadingSymbols={loadingSymbols} />
    </div>
  );
};

export default AdvancedTab;
