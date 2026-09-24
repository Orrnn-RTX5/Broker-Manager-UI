import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Loader2, X } from 'lucide-react';
import { symbolMappingList, symbolMappingCreate } from '../../../services/api';

const MappingFormModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({ lpName: '', lpSymbol: '', internalSymbol: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await symbolMappingCreate(form);
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
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Add LP Mapping</h2>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>LP Name *</label>
            <input className="ui-input ui-input-sm" value={form.lpName} onChange={e => set('lpName', e.target.value)} required placeholder="e.g. PrimeXM" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>LP Symbol *</label>
            <input className="ui-input ui-input-sm" value={form.lpSymbol} onChange={e => set('lpSymbol', e.target.value)} required placeholder="e.g. EUR/USD" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Internal Symbol *</label>
            <input className="ui-input ui-input-sm" value={form.internalSymbol} onChange={e => set('internalSymbol', e.target.value)} required placeholder="e.g. EURUSD" />
          </div>
          {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
          <div className="flex justify-end gap-2 mt-1">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">Cancel</button>
            <button type="submit" disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
              {saving ? <Loader2 size={13} className="animate-spin" /> : 'Add Mapping'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const LpMappingsTab = () => {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await symbolMappingList();
      setMappings(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search) return mappings;
    const q = search.toLowerCase();
    return mappings.filter(m =>
      (m.lpName || '').toLowerCase().includes(q) ||
      (m.lpSymbol || '').toLowerCase().includes(q) ||
      (m.internalSymbol || '').toLowerCase().includes(q)
    );
  }, [mappings, search]);

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input className="ui-input ui-input-sm" style={{ paddingLeft: 30, width: 220 }} placeholder="Search mappings…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex-1" />
        <button onClick={() => setShowModal(true)} className="ui-btn ui-btn-primary ui-btn-sm">
          <Plus size={13} /> Add Mapping
        </button>
      </div>

      <div className="ui-card flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--muted)' }}>
            <Loader2 size={16} className="animate-spin mr-2" /> Loading mappings…
          </div>
        ) : (
          <table className="ui-grid w-full">
            <thead>
              <tr>
                <th>LP Name</th>
                <th>LP Symbol</th>
                <th>Internal Symbol</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>No mappings found.</td></tr>
              ) : filtered.map((m, i) => (
                <tr key={m.id || i}>
                  <td style={{ color: 'var(--accent-text)', fontWeight: 500 }}>{m.lpName}</td>
                  <td style={{ color: 'var(--text-2)' }}>{m.lpSymbol}</td>
                  <td style={{ color: 'var(--text)' }}>{m.internalSymbol}</td>
                  <td>
                    <span className={`ui-status ${m.enabled !== false ? 'ui-status-ok' : 'ui-status-danger'}`}>
                      {m.enabled !== false ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <MappingFormModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
};

export default LpMappingsTab;
