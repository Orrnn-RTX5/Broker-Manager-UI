import { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, UserPlus } from 'lucide-react';
import { useGroupList } from '../../hooks/useGroupList';
import { fetchManagerApi } from '../../services/managerFetch';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];
const LEVERAGES  = [1, 10, 25, 50, 100, 200, 300, 400, 500];
const COUNTRIES  = ['India', 'United States', 'United Kingdom', 'Australia', 'Canada', 'Germany', 'France', 'Japan'];

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>{label}</label>
    {children}
  </div>
);

const NewAccountModal = ({ isOpen, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    Group: 'demo\\forex-hedge-usd-01',
    Leverage: 100,
    FirstName: '', LastName: '', Email: '', Phone: '',
    Country: 'India', Currency: 'USD',
    master_pass: '', investor_pass: '',
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const { groups, loading: loadingGroups } = useGroupList();

  useEffect(() => {
    if (!loadingGroups && groups && groups.length > 0) {
      if (!groups.find(g => g.name === form.Group)) {
        setForm(prev => ({ ...prev, Group: groups[0].name }));
      }
    }
  }, [groups, loadingGroups, form.Group]);

  if (!isOpen) return null;

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const id = localStorage.getItem('authToken');
    if (!id) { setResult({ success: false, message: 'Not authenticated. Please log in again.' }); return; }

    setLoading(true);
    setResult(null);

    const params = new URLSearchParams({
      id,
      master_pass: form.master_pass,
      investor_pass: form.investor_pass,
      Group: form.Group,
      Leverage: form.Leverage,
      FirstName: form.FirstName,
      LastName: form.LastName,
      Email: form.Email,
      Phone: form.Phone,
      Country: form.Country,
      Currency: form.Currency,
    });

    try {
      const response = await fetchManagerApi(`/AccountCreate?${params.toString()}`, {
        method: 'GET', headers: { accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok || !data.login || typeof data.login !== 'number') {
        throw new Error(data?.error || data?.message || 'Account creation failed.');
      }
      setResult({ success: true, data });
    } catch (err) {
      setResult({ success: false, message: err.message || 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setResult(null);
    setForm({
      Group: 'demo\\forex-hedge-usd-01', Leverage: 100,
      FirstName: '', LastName: '', Email: '', Phone: '', Country: 'India', Currency: 'USD',
      master_pass: '', investor_pass: '',
    });
    if (onClose) onClose();
  };

  return (
    <div className="ui-modal-backdrop" style={{ zIndex: 99999 }}>
      <div className="ui-modal" style={{ width: 680 }}>
        <div className="ui-modal-header">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center mr-3"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <UserPlus size={15} />
          </span>
          New Account
          <span className="x" onClick={handleClose}><X size={16} /></span>
        </div>

        <div className="ui-modal-body">
          {result ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              {result.success ? (
                <>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
                    <CheckCircle2 size={30} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Account Created</h2>
                    <p className="text-sm mt-1 tabular" style={{ color: 'var(--text-3)' }}>Login: {result.data.login}</p>
                  </div>
                  <button className="ui-btn ui-btn-primary" onClick={() => { handleClose(); if (onSuccess) onSuccess(); }}>OK</button>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                    <AlertCircle size={30} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Creation Failed</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>{result.message}</p>
                  </div>
                  <button className="ui-btn ui-btn-secondary" onClick={() => setResult(null)}>Try Again</button>
                </>
              )}
            </div>
          ) : (
            <form id="new-account-form" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-3.5">
                  <Field label="Group">
                    <select className="ui-select" value={form.Group} onChange={e => set('Group', e.target.value)}>
                      {loadingGroups
                        ? <option value="">Loading groups…</option>
                        : groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Leverage">
                    <select className="ui-select" value={form.Leverage} onChange={e => set('Leverage', Number(e.target.value))}>
                      {LEVERAGES.map(l => <option key={l} value={l}>1:{l}</option>)}
                    </select>
                  </Field>
                  <Field label="First name">
                    <input className="ui-input" value={form.FirstName} onChange={e => set('FirstName', e.target.value)} required />
                  </Field>
                  <Field label="Last name">
                    <input className="ui-input" value={form.LastName} onChange={e => set('LastName', e.target.value)} required />
                  </Field>
                  <Field label="Email">
                    <input type="email" className="ui-input" value={form.Email} onChange={e => set('Email', e.target.value)} required />
                  </Field>
                </div>
                <div className="space-y-3.5">
                  <Field label="Phone">
                    <input className="ui-input" value={form.Phone} onChange={e => set('Phone', e.target.value)} />
                  </Field>
                  <Field label="Country">
                    <select className="ui-select" value={form.Country} onChange={e => set('Country', e.target.value)}>
                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Currency">
                    <select className="ui-select" value={form.Currency} onChange={e => set('Currency', e.target.value)}>
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <div
                    className="rounded-lg p-3.5 space-y-3"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Passwords</div>
                    <Field label="Master">
                      <input type="password" className="ui-input" value={form.master_pass} onChange={e => set('master_pass', e.target.value)} required />
                    </Field>
                    <Field label="Investor">
                      <input type="password" className="ui-input" value={form.investor_pass} onChange={e => set('investor_pass', e.target.value)} required />
                    </Field>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {!result && (
          <div className="ui-modal-footer">
            <button type="button" onClick={handleClose} className="ui-btn ui-btn-secondary ui-btn-sm">Cancel</button>
            <button type="submit" form="new-account-form" disabled={loading} className="ui-btn ui-btn-primary ui-btn-sm">
              {loading ? <><Loader2 size={13} className="animate-spin" /> Creating…</> : 'Create Account'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewAccountModal;
