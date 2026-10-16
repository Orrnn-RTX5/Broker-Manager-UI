import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader, Plus, X } from 'lucide-react';
import ibApi from '../../../services/ibApi';
import {
  buildIBCreatePayload,
  isEligibleIBParent,
  normalizeIBAccount,
  normalizeRecords,
  validateIBCreateInput,
} from '../ibDomain';

const Field = ({ label, children, hint }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>{label}</span>
    {children}
    {hint && <span className="text-[10px]" style={{ color: 'var(--muted)' }}>{hint}</span>}
  </label>
);

const IBCreateModal = ({ parentLogin = '', onClose, onSuccess }) => {
  const [form, setForm] = useState({
    login: '',
    parent_ib_login: parentLogin ? String(parentLogin) : '',
    company_name: '',
    referral_code: '',
    notes: '',
  });
  const [ibOptions, setIbOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoadingOptions(true);
    ibApi.list()
      .then((data) => {
        if (!alive) return;
        setIbOptions(normalizeRecords(data, ['accounts']).map(normalizeIBAccount));
      })
      .catch(() => {
        if (alive) setIbOptions([]);
      })
      .finally(() => {
        if (alive) setLoadingOptions(false);
      });
    return () => { alive = false; };
  }, []);

  const usableParentOptions = useMemo(() => (
    ibOptions.filter(isEligibleIBParent)
  ), [ibOptions]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async () => {
    const errors = validateIBCreateInput(form);
    if (errors.length) {
      setError(errors[0]);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const result = await ibApi.create(buildIBCreatePayload(form));
      onSuccess?.(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create IB.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'transparent' }}>
      <div className="ui-card flex flex-col" style={{ width: 460, maxHeight: '88vh', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2">
            <Plus size={15} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Create IB account</span>
          </div>
          <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-y-auto">
          {error && (
            <div className="text-xs px-3 py-2 rounded flex items-center gap-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
              <AlertTriangle size={13} /> {error}
            </div>
          )}

          <Field label="Trading account login *" hint="The account must already exist in the current broker.">
            <input type="number" value={form.login} onChange={(event) => setField('login', event.target.value)} className="ui-input ui-input-sm" autoFocus />
          </Field>

          <Field label="Parent IB" hint="Leave blank for a top-level IB. Only approved or active IBs can be selected as parents.">
            <select
              value={form.parent_ib_login}
              onChange={(event) => setField('parent_ib_login', event.target.value)}
              className="ui-input ui-input-sm"
              disabled={loadingOptions}
            >
              <option value="">Top-level IB</option>
              {usableParentOptions.map((ib) => (
                <option key={ib.login} value={ib.login}>
                  {ib.login} {ib.company_name ? `- ${ib.company_name}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Company name">
            <input value={form.company_name} onChange={(event) => setField('company_name', event.target.value)} className="ui-input ui-input-sm" />
          </Field>
          <Field label="Referral code" hint="Backend generates a code when blank.">
            <input value={form.referral_code} onChange={(event) => setField('referral_code', event.target.value)} className="ui-input ui-input-sm" />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} className="ui-input ui-input-sm" rows={3} />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
            Create IB
          </button>
        </div>
      </div>
    </div>
  );
};

export default IBCreateModal;
