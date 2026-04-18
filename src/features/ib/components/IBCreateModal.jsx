import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { ibCreate } from '../../../services/api';

const Field = ({ label, children, hint }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>{label}</label>
    {children}
    {hint && <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{hint}</span>}
  </div>
);

const IBCreateModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({
    login: '', parent_ib_login: '', company_name: '', referral_code: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.login) { setError('Login is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        login: Number(form.login),
        ...(form.parent_ib_login ? { parent_ib_login: Number(form.parent_ib_login) } : { parent_ib_login: null }),
        ...(form.company_name  ? { company_name: form.company_name }   : {}),
        ...(form.referral_code ? { referral_code: form.referral_code } : {}),
        ...(form.notes         ? { notes: form.notes }                 : {}),
      };
      const result = await ibCreate(body);
      onSuccess?.(result);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="ui-card flex flex-col" style={{ width: 420, boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2">
            <Plus size={15} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>New IB Account</span>
          </div>
          <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {error && (
            <div className="text-xs px-3 py-2 rounded" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>{error}</div>
          )}
          <Field label="Login *">
            <input type="number" value={form.login} onChange={e => set('login', e.target.value)} className="ui-input ui-input-sm" placeholder="e.g. 5001" autoFocus />
          </Field>
          <Field label="Parent IB Login" hint="Leave blank for top-level IB">
            <input type="number" value={form.parent_ib_login} onChange={e => set('parent_ib_login', e.target.value)} className="ui-input ui-input-sm" placeholder="optional" />
          </Field>
          <Field label="Company Name">
            <input type="text" value={form.company_name} onChange={e => set('company_name', e.target.value)} className="ui-input ui-input-sm" placeholder="e.g. Acme Partners" />
          </Field>
          <Field label="Referral Code" hint="Auto-generated if blank (8-char hex)">
            <input type="text" value={form.referral_code} onChange={e => set('referral_code', e.target.value)} className="ui-input ui-input-sm" placeholder="optional" />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="ui-input ui-input-sm" rows={2} placeholder="optional" style={{ resize: 'vertical' }} />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create IB'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default IBCreateModal;
