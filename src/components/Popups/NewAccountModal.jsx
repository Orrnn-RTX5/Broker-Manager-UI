import { useState, useEffect, useRef } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, ChevronDown, Check, Eye, EyeOff } from 'lucide-react';
import { useGroupList } from '../../hooks/useGroupList';
import { createManagerAccount } from '../../services/managerAccountApi';
import {
  ACCOUNT_MODES,
  ACCOUNT_MODE_DEFAULT,
  buildNewAccountPayload,
  inheritGroupSettings,
} from './newAccountWizard';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];
const LEVERAGES = [1, 10, 25, 50, 100, 200, 300, 400, 500];
const COUNTRIES = ['India', 'United States', 'United Kingdom', 'Australia', 'Canada', 'Germany', 'France', 'Japan'];

const Field = ({ id, label, required = false, hint, children }) => (
  <div className="new-account-field">
    <div className="new-account-field-label">
      <label htmlFor={id} style={{ color: 'var(--text-2)' }}>
        {label}{required && <span aria-hidden="true" style={{ color: 'var(--danger)' }}> *</span>}
      </label>
      {hint && <span style={{ color: 'var(--muted)' }}>{hint}</span>}
    </div>
    {children}
  </div>
);

const PasswordField = ({ id, label, value, onChange }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <Field id={id} label={label} required>
      <div className="new-account-password-input">
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          name={id}
          className="ui-input"
          value={value}
          onChange={onChange}
          required
          autoComplete="new-password"
        />
        <button
          type="button"
          className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
          onClick={() => setIsVisible((visible) => !visible)}
          aria-label={`${isVisible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={isVisible}
        >
          {isVisible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </Field>
  );
};

const GroupCombobox = ({ id, value, onChange, groups = [], loading = false, hasMore = false, onSearchChange, searchValue }) => {
  // Search text lives only in `searchValue` (the list filter) and is never
  // written to `value`/form.Group. Only an explicit option click calls
  // onChange, so typing without picking leaves Group '' and submit fails
  // closed via buildNewAccountPayload.
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
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="new-account-group-combobox relative w-full">
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          className="ui-input ui-input-sm w-full pr-8"
          value={isOpen ? searchValue : value}
          onFocus={() => setIsOpen(true)}
          onChange={handleInputChange}
          placeholder="Select group…"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={`${id}-options`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen((prev) => !prev)}
          className="new-account-select-toggle"
          aria-label="Show account groups"
          aria-expanded={isOpen}
        >
          <ChevronDown size={14} className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div
          id={`${id}-options`}
          role="listbox"
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
                <button
                  type="button"
                  key={g.name}
                  onClick={() => handleSelect(g.name)}
                  className="px-3 py-2 cursor-pointer flex items-center justify-between transition-colors"
                  role="option"
                  aria-selected={isSelected}
                  style={{
                    width: '100%',
                    border: 0,
                    background: isSelected ? 'var(--accent-soft)' : 'transparent',
                    color: isSelected ? 'var(--accent-text)' : 'var(--text)',
                    textAlign: 'left',
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
                </button>
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

const NewAccountModalContent = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({
    Group: '',
    Leverage: 100,
    FirstName: '', LastName: '', Email: '', Phone: '',
    Country: 'India', Currency: '', AccountMode: ACCOUNT_MODE_DEFAULT,
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

  // UI-4 follow-up: the wizard NEVER auto-fills Group. Opening, list
  // refreshes, and searches leave Group exactly as the operator left it
  // ('' until an explicit pick), so an empty choice fails closed on submit
  // instead of silently creating under the first row. Leverage and currency
  // still follow the EXPLICITLY selected group until the operator touches
  // them (see syncGroupDefaults), exactly like API-created accounts with
  // omitted fields.
  const leverageTouched = useRef(false);
  const currencyTouched = useRef(false);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const syncGroupDefaults = (groupName) => {
    const inherited = inheritGroupSettings({
      groups,
      groupName,
      leverageTouched: leverageTouched.current,
      currencyTouched: currencyTouched.current,
    });
    if (Object.keys(inherited).length === 0) return;
    setForm(prev => ({ ...prev, ...inherited }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Client-side RBAC guard (defence-in-depth; backend still enforces).
    if (!canCreate) {
      setResult({ success: false, message: 'Your role does not have permission to create accounts.' });
      return;
    }
    // The submitted group is the trimmed, visible selection. No fallback to
    // the first loaded group is applied here so an untouched/empty choice
    // fails closed instead of creating the account under an assumed group.
    let payload;
    try {
      payload = buildNewAccountPayload(form);
    } catch (err) {
      setResult({ success: false, message: err.message || 'Please review the account fields.' });
      return;
    }
    setLoading(true);
    setResult(null);

    // POST the payload as JSON to the versioned account writer so passwords and
    // account fields never appear in request URLs or browser history.

    try {
      const data = await createManagerAccount(payload);
      if (!Number.isFinite(Number(data?.login))) throw new Error(data?.message || 'Account creation failed.');
      setResult({ success: true, data });
      onSuccess?.(data);
    } catch (err) {
      setResult({ success: false, message: err.message || 'An error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setResult(null);
    leverageTouched.current = false;
    currencyTouched.current = false;
    // Reset path never prefills the first row: Group stays empty with the
    // "Select group…" placeholder so a reopened wizard fails closed until
    // the operator explicitly picks a group (inheritance then applies via
    // syncGroupDefaults). Search text is cleared so it can never leak into
    // the next Group value.
    setGroupSearch('');
    setForm({
      Group: '',
      Leverage: 100,
      FirstName: '', LastName: '', Email: '', Phone: '', Country: 'India', Currency: '',
      AccountMode: ACCOUNT_MODE_DEFAULT,
      master_pass: '', investor_pass: '',
    });
    if (onClose) onClose();
  };

  return (
    <div
      className="ui-modal-backdrop new-account-modal-backdrop"
      style={{ zIndex: 99999 }}
      onMouseDown={(event) => {
        if (!loading && event.target === event.currentTarget) handleClose();
      }}
    >
      <div className="ui-modal new-account-modal" role="dialog" aria-modal="true" aria-labelledby="new-account-title">
        <div className="ui-modal-header new-account-modal-header">
          <span className="new-account-header-copy">
            <span id="new-account-title">New account</span>
            <small>Configure account settings and secure access</small>
          </span>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm new-account-close" onClick={handleClose} aria-label="Close new account dialog" disabled={loading}>
            <X size={16} />
          </button>
        </div>

        <div className="ui-modal-body new-account-modal-body">
          {result ? (
            <div className={`new-account-result ${result.success ? 'is-success' : 'is-error'}`}>
              {result.success ? (
                <>
                  <div className="new-account-result-icon" style={{ background: 'var(--ok-soft)', color: 'var(--ok)', borderColor: 'var(--ok-border)' }}>
                    <CheckCircle2 size={30} />
                  </div>
                  <div>
                    <h2>Account created</h2>
                    <p>Your new trading account is ready to use.</p>
                  </div>
                  <div className="new-account-login" style={{ color: 'var(--text-2)', borderColor: 'var(--border)' }}>
                    <span>Trading login</span>
                    <strong className="tabular">{result.data.login}</strong>
                  </div>
                  <button type="button" className="ui-btn ui-btn-primary" onClick={handleClose}>Done</button>
                </>
              ) : (
                <>
                  <div className="new-account-result-icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>
                    <AlertCircle size={30} />
                  </div>
                  <div>
                    <h2>Account creation failed</h2>
                    <p>{result.message}</p>
                  </div>
                  <button className="ui-btn ui-btn-secondary" onClick={() => setResult(null)}>Try Again</button>
                </>
              )}
            </div>
          ) : (
            <form id="new-account-form" className="new-account-form" onSubmit={handleSubmit} autoComplete="off">
              <section className="new-account-section">
                <div className="new-account-section-heading">
                  <div>
                    <h2>Account setup</h2>
                    <p>Select the account group, leverage, base currency, and accounting mode. Leverage and currency follow the selected group until changed. Accounting mode cannot be changed after creation.</p>
                  </div>
                </div>
                <div className="new-account-settings-grid">
                  <div className="new-account-group-field">
                    <Field id="new-account-group" label="Group" required>
                      <GroupCombobox
                        id="new-account-group"
                        value={form.Group}
                        onChange={(selectedGroup) => { set('Group', selectedGroup); syncGroupDefaults(selectedGroup); }}
                        groups={groups}
                        loading={loadingGroups}
                        hasMore={hasMoreGroups}
                        searchValue={groupSearch}
                        onSearchChange={setGroupSearch}
                      />
                    </Field>
                  </div>
                  <Field id="new-account-leverage" label="Leverage" required>
                    <select id="new-account-leverage" className="ui-select" value={form.Leverage} onChange={(event) => { leverageTouched.current = true; set('Leverage', Number(event.target.value)); }}>
                      {[...new Set([...LEVERAGES, form.Leverage])].sort((a, b) => a - b).map((leverage) => <option key={leverage} value={leverage}>1:{leverage}</option>)}
                    </select>
                  </Field>
                  <Field id="new-account-currency" label="Currency" required>
                    <select id="new-account-currency" className="ui-select" value={form.Currency} required onChange={(event) => { currencyTouched.current = true; set('Currency', event.target.value); }}>
                      <option value="" disabled>Select currency…</option>
                      {[...new Set([...CURRENCIES, form.Currency].filter(Boolean))].sort().map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                    </select>
                  </Field>
                  <Field id="new-account-mode" label="Account mode" required hint="Cannot be changed after creation">
                    <select id="new-account-mode" className="ui-select" value={form.AccountMode} required onChange={(event) => set('AccountMode', event.target.value)}>
                      {ACCOUNT_MODES.map((mode) => <option key={mode} value={mode}>{mode === 'hedging' ? 'Hedging' : 'Netting'}</option>)}
                    </select>
                  </Field>
                  <Field id="new-account-country" label="Country" required>
                    <select id="new-account-country" className="ui-select" value={form.Country} onChange={(event) => set('Country', event.target.value)}>
                      {COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                    </select>
                  </Field>
                </div>
              </section>

              <div className="new-account-details-grid">
                <section className="new-account-section">
                  <div className="new-account-section-heading">
                    <div>
                      <h2>Client details</h2>
                      <p>Use the account holder's contact information.</p>
                    </div>
                  </div>
                  <div className="new-account-contact-grid">
                    <Field id="new-account-first-name" label="First name" required>
                      <input id="new-account-first-name" className="ui-input" value={form.FirstName} onChange={(event) => set('FirstName', event.target.value)} required autoComplete="given-name" />
                    </Field>
                    <Field id="new-account-last-name" label="Last name" required>
                      <input id="new-account-last-name" className="ui-input" value={form.LastName} onChange={(event) => set('LastName', event.target.value)} required autoComplete="family-name" />
                    </Field>
                    <Field id="new-account-email" label="Email" required>
                      <input id="new-account-email" type="email" name="new_user_email" className="ui-input" value={form.Email} onChange={(event) => set('Email', event.target.value)} required autoComplete="off" />
                    </Field>
                    <Field id="new-account-phone" label="Phone" hint="Optional">
                      <input id="new-account-phone" type="tel" className="ui-input" value={form.Phone} onChange={(event) => set('Phone', event.target.value)} autoComplete="tel" />
                    </Field>
                  </div>
                </section>

                <section className="new-account-section new-account-security-section">
                  <div className="new-account-section-heading">
                    <div>
                      <h2>Secure access</h2>
                      <p>Set separate master and investor passwords.</p>
                    </div>
                  </div>
                  <div className="new-account-password-grid">
                    <PasswordField id="new-account-master-password" label="Master password" value={form.master_pass} onChange={(event) => set('master_pass', event.target.value)} />
                    <PasswordField id="new-account-investor-password" label="Investor password" value={form.investor_pass} onChange={(event) => set('investor_pass', event.target.value)} />
                  </div>
                </section>
              </div>
            </form>
          )}
        </div>

        {!result && (
          <div className="ui-modal-footer new-account-modal-footer">
            {!canCreate && (
              <span className="new-account-permission-note" style={{ color: 'var(--danger-text)' }}>
                You do not have permission to create accounts.
              </span>
            )}
            {canCreate && <span className="new-account-required-note" style={{ color: 'var(--muted)' }}>Fields marked * are required</span>}
            <button type="button" onClick={handleClose} disabled={loading} className="ui-btn ui-btn-secondary ui-btn-sm">Cancel</button>
            <button type="submit" form="new-account-form" disabled={loading || !canCreate} className="ui-btn ui-btn-primary ui-btn-sm">
              {loading ? <><Loader2 size={13} className="animate-spin" /> Creating...</> : 'Create Account'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const NewAccountModal = ({ isOpen, onClose, onSuccess }) => {
  if (!isOpen) return null;

  return <NewAccountModalContent onClose={onClose} onSuccess={onSuccess} />;
};

export default NewAccountModal;
