import { useState, useEffect, useRef } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, UserPlus, ChevronDown, Check } from 'lucide-react';
import { useGroupList } from '../../hooks/useGroupList';
import { fetchManagerApi } from '../../services/managerFetch';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];
const LEVERAGES = [1, 10, 25, 50, 100, 200, 300, 400, 500];
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Australia', 'Canada', 'Germany', 'France', 'Japan'];

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>{label}</label>
    {children}
  </div>
);

const GroupCombobox = ({ value, onChange, groups = [], loading = false, hasMore = false, onSearchChange, searchValue }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (groupName) => {
    onChange(groupName);
    onSearchChange('');
    setIsOpen(false);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    onSearchChange(val);
    onChange(val);
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          className="ui-input ui-input-sm w-full pr-8"
          value={isOpen ? searchValue : value}
          onFocus={() => setIsOpen(true)}
          onChange={handleInputChange}
          placeholder="Search or select group..."
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen((prev) => !prev)}
          className="absolute right-2 text-xs flex items-center justify-center p-1"
          style={{ color: 'var(--muted)', cursor: 'pointer' }}
        >
          <ChevronDown size={14} className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border max-h-56 overflow-auto py-1 text-xs"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {loading ? (
            <div className="px-3 py-2 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
              <Loader2 size={13} className="animate-spin" />
              <span>Loading groups…</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="px-3 py-2 text-center" style={{ color: 'var(--muted)' }}>
              No groups found
            </div>
          ) : (
            groups.map((g) => {
              const isSelected = g.name === value;
              return (
                <div
                  key={g.name}
                  onClick={() => handleSelect(g.name)}
                  className="px-3 py-2 cursor-pointer flex items-center justify-between transition-colors"
                  style={{
                    background: isSelected ? 'var(--accent-soft)' : 'transparent',
                    color: isSelected ? 'var(--accent-text)' : 'var(--text)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--surface-3)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span className="truncate font-medium">{g.name}</span>
                  {isSelected && <Check size={13} style={{ color: 'var(--accent-text)' }} />}
                </div>
              );
            })
          )}
          {hasMore && (
            <div className="px-3 py-1.5 border-t text-[11px]" style={{ borderColor: 'var(--border-2)', color: 'var(--muted)' }}>
              Showing first 100 matches. Search to narrow.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const NewAccountModal = ({ isOpen, onClose, onSuccess }) => {
  const [form, setForm] = useState({
    Group: 'demo\\forex-hedge-usd-01',
    Leverage: 100,
    FirstName: '', LastName: '', Email: '', Phone: '',
    Country: 'India', Currency: 'USD',
    master_pass: '', investor_pass: '',
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [groupSearch, setGroupSearch] = useState('');
  const { groups, hasMore: hasMoreGroups, loading: loadingGroups } = useGroupList({
    limit: 100,
    offset: 0,
    search: groupSearch,
    sort_by: 'name',
    sort_dir: 'asc',
  });
  const { canAct } = usePermissions();
  const canCreate = canAct(PERMISSIONS.MANAGE_ACCOUNTS);

  useEffect(() => {
    if (!groupSearch && !loadingGroups && groups && groups.length > 0) {
      if (!groups.find(g => g.name === form.Group)) {
        setForm(prev => ({ ...prev, Group: groups[0].name }));
      }
    }
  }, [groups, loadingGroups, form.Group, groupSearch]);

  if (!isOpen) return null;

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Client-side RBAC guard (defence-in-depth; backend still enforces).
    if (!canCreate) {
      setResult({ success: false, message: 'Your role does not have permission to create accounts.' });
      return;
    }
    setLoading(true);
    setResult(null);

    // POST the payload as a JSON body so the cleartext master/investor passwords
    // (and all other fields) stay out of the request URL, server access logs, and
    // browser history (fe-manager-ui-03 / fe-manager-ui-08). The backend exposes
    // /AccountCreate over POST JSON, mirroring /UserPasswordChange.
    const payload = {
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
    };

    try {
      const response = await fetchManagerApi('/AccountCreate', {
        method: 'POST',
        headers: { accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
            <form id="new-account-form" onSubmit={handleSubmit} autoComplete="off">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Field label="Group">
                    <GroupCombobox
                      value={form.Group}
                      onChange={(selectedGroup) => set('Group', selectedGroup)}
                      groups={groups}
                      loading={loadingGroups}
                      hasMore={hasMoreGroups}
                      searchValue={groupSearch}
                      onSearchChange={setGroupSearch}
                    />
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
                    <input type="email" name="new_user_email" className="ui-input" value={form.Email} onChange={e => set('Email', e.target.value)} required autoComplete="off" />
                  </Field>
                </div>
                <div className="space-y-3">
                  <Field label="Phone">
                    <input className="ui-input" value={form.Phone} onChange={e => set('Phone', e.target.value)} autoComplete="off" />
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
                    className="rounded-lg p-3 space-y-2.5"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Passwords</div>
                    <Field label="Master">
                      <input type="password" name="master_pass" className="ui-input" value={form.master_pass} onChange={e => set('master_pass', e.target.value)} required autoComplete="new-password" />
                    </Field>
                    <Field label="Investor">
                      <input type="password" name="investor_pass" className="ui-input" value={form.investor_pass} onChange={e => set('investor_pass', e.target.value)} required autoComplete="new-password" />
                    </Field>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {!result && (
          <div className="ui-modal-footer">
            {!canCreate && (
              <span className="text-xs mr-auto" style={{ color: 'var(--danger-text)' }}>
                You do not have permission to create accounts.
              </span>
            )}
            <button type="button" onClick={handleClose} className="ui-btn ui-btn-secondary ui-btn-sm">Cancel</button>
            <button type="submit" form="new-account-form" disabled={loading || !canCreate} className="ui-btn ui-btn-primary ui-btn-sm">
              {loading ? <><Loader2 size={13} className="animate-spin" /> Creating…</> : 'Create Account'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewAccountModal;
