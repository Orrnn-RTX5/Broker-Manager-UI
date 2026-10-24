import { useState, useEffect, useId, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, AlertCircle, Loader2, ChevronDown, Check, Eye, EyeOff } from 'lucide-react';
import { useGroupList } from '../../hooks/useGroupList';
import { createManagerAccount } from '../../services/managerAccountApi';
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
          placeholder="Search or select group..."
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

export const NewAccountModalContent = ({ onClose, onSuccess, embedded = false, screenNumber }) => {
  const instanceId = useId();
  const fid = (suffix) => `${instanceId}-${suffix}`;
  const queryClient = useQueryClient();

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

    // POST the payload as JSON to the versioned account writer so passwords and
    // account fields never appear in request URLs or browser history.
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
      const data = await createManagerAccount(payload);
      if (!Number.isFinite(Number(data?.login))) throw new Error(data?.message || 'Account creation failed.');
      setResult({ success: true, data });
      queryClient.invalidateQueries({ queryKey: ['sidebar-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['trading-accounts'] });
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
    setForm({
      Group: 'demo\\forex-hedge-usd-01', Leverage: 100,
      FirstName: '', LastName: '', Email: '', Phone: '', Country: 'India', Currency: 'USD',
      master_pass: '', investor_pass: '',
    });
    if (onClose) onClose();
  };

  const modalCard = (
    <div
      className={`ui-modal new-account-modal${embedded ? ' new-account-embedded' : ''}`}
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : 'true'}
      aria-labelledby={fid('title')}
    >
      <div className="ui-modal-header new-account-modal-header">
        <span className="new-account-header-copy">
          <span id={fid('title')}>
            New account{screenNumber ? <span className="multi-screen-badge">#{screenNumber}</span> : null}
          </span>
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
          <form id={fid('form')} className="new-account-form" onSubmit={handleSubmit} autoComplete="off">
            <section className="new-account-section">
              <div className="new-account-section-heading">
                <div>
                  <h2>Account setup</h2>
                  <p>Select the account group, leverage, and base currency.</p>
                </div>
              </div>
              <div className="new-account-settings-grid">
                <div className="new-account-group-field">
                  <Field id={fid('group')} label="Group" required>
                    <GroupCombobox
                      id={fid('group')}
                      value={form.Group}
                      onChange={(selectedGroup) => set('Group', selectedGroup)}
                      groups={groups}
                      loading={loadingGroups}
                      hasMore={hasMoreGroups}
                      searchValue={groupSearch}
                      onSearchChange={setGroupSearch}
                    />
                  </Field>
                </div>
                <Field id={fid('leverage')} label="Leverage" required>
                  <select id={fid('leverage')} className="ui-select" value={form.Leverage} onChange={(event) => set('Leverage', Number(event.target.value))}>
                    {LEVERAGES.map((leverage) => <option key={leverage} value={leverage}>1:{leverage}</option>)}
                  </select>
                </Field>
                <Field id={fid('currency')} label="Currency" required>
                  <select id={fid('currency')} className="ui-select" value={form.Currency} onChange={(event) => set('Currency', event.target.value)}>
                    {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </Field>
                <Field id={fid('country')} label="Country" required>
                  <select id={fid('country')} className="ui-select" value={form.Country} onChange={(event) => set('Country', event.target.value)}>
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
                  <Field id={fid('first-name')} label="First name" required>
                    <input id={fid('first-name')} className="ui-input" value={form.FirstName} onChange={(event) => set('FirstName', event.target.value)} required autoComplete="given-name" />
                  </Field>
                  <Field id={fid('last-name')} label="Last name" required>
                    <input id={fid('last-name')} className="ui-input" value={form.LastName} onChange={(event) => set('LastName', event.target.value)} required autoComplete="family-name" />
                  </Field>
                  <Field id={fid('email')} label="Email" required>
                    <input id={fid('email')} type="email" name="new_user_email" className="ui-input" value={form.Email} onChange={(event) => set('Email', event.target.value)} required autoComplete="off" />
                  </Field>
                  <Field id={fid('phone')} label="Phone" hint="Optional">
                    <input id={fid('phone')} type="tel" className="ui-input" value={form.Phone} onChange={(event) => set('Phone', event.target.value)} autoComplete="tel" />
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
                  <PasswordField id={fid('master-password')} label="Master password" value={form.master_pass} onChange={(event) => set('master_pass', event.target.value)} />
                  <PasswordField id={fid('investor-password')} label="Investor password" value={form.investor_pass} onChange={(event) => set('investor_pass', event.target.value)} />
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
          <button type="submit" form={fid('form')} disabled={loading || !canCreate} className="ui-btn ui-btn-primary ui-btn-sm">
            {loading ? <><Loader2 size={13} className="animate-spin" /> Creating...</> : 'Create Account'}
          </button>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return modalCard;
  }

  return (
    <div
      className="ui-modal-backdrop new-account-modal-backdrop"
      style={{ zIndex: 99999 }}
      onMouseDown={(event) => {
        if (!loading && event.target === event.currentTarget) handleClose();
      }}
    >
      {modalCard}
    </div>
  );
};

const NewAccountModal = ({ isOpen, onClose, onSuccess, embedded = false, screenNumber }) => {
  if (!isOpen && !embedded) return null;

  return <NewAccountModalContent onClose={onClose} onSuccess={onSuccess} embedded={embedded} screenNumber={screenNumber} />;
};

export default NewAccountModal;
