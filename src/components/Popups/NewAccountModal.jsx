import { useState, useEffect, useId, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, AlertCircle, Loader2, ChevronDown, Check, Eye, EyeOff, Move } from 'lucide-react';
import { useGroupList } from '../../hooks/useGroupList';
import { createManagerAccount } from '../../services/managerAccountApi';
import {
  ACCOUNT_MODE_CREATE_OPTIONS,
  ACCOUNT_MODE_DEFAULT,
  buildSubmittableAccountPayload,
  countrySuggestions,
  currencyOptions,
  inheritGroupSettings,
  resolveDefaultCountry,
  resolveDefaultCurrency,
} from './newAccountWizard';
import { getBrokerInfo } from '../../services/brokerAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';

const LEVERAGES = [1, 10, 25, 50, 100, 200, 300, 400, 500];
// Country suggestion presets for the free-text Country input (datalist).
// LEVERAGES deliberately stays a <select> preset while Country is free text:
// the leverage range is fully covered by the preset plus group inheritance,
// and leverage is validated fail-closed in buildNewAccountPayload — whereas
// Country is backend-optional free text with an unbounded value space no
// preset list can cover. Currency options come from currencyOptions() (the
// union of the loaded groups' allowed/deposit currencies, literal fallback
// only when that union is empty); the current value is merged in at render
// so an exotic inherited value stays visible. No currency is ever
// preselected: Currency starts '' via resolveDefaultCurrency (no group
// selected at open) and only group inheritance or an explicit pick sets it.
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

const PasswordField = ({ id, label, value, onChange, required = true }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <Field id={id} label={label} required={required} hint={required ? undefined : 'Optional'}>
      <div className="new-account-password-input">
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          name={id}
          className="ui-input"
          value={value}
          onChange={onChange}
          required={required}
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

export const NewAccountModalContent = ({
  onClose,
  onSuccess,
  embedded = false,
  screenNumber,
  isMovable: controlledMovable,
  onToggleMovable,
  onMoveButtonPointerDown,
  onHeaderPointerDown,
}) => {
  // Sweep W5/W4: NO tenant-meaningful hardcoded defaults reach the wire.
  // Group starts '' (never auto-filled), Leverage starts '' (no 1:100
  // placeholder), Currency starts '' (no USD default: resolveDefaultCurrency
  // with no group selected emits ''). Leverage and currency arrive only via
  // explicit group inheritance (syncGroupDefaults) or an explicit operator
  // pick; submit fails closed on empty group/leverage/
  // currency/master_pass via buildSubmittableAccountPayload. Backend contract
  // mirror (verified read-only against the manager AccountCreate handler):
  // ONLY master_pass + Group are backend-required, so only those gate
  // submit — FirstName/LastName/Email/Phone/investor_pass/Country stay
  // optional and pass through exactly as sent. Country starts '' unless the
  // broker config carries one (resolveDefaultCountry over getBrokerInfo);
  // the backend stores Country exactly as sent (optional free text), so an
  // empty Country passes through untouched and no value is ever invented.
  // UI-3b: the Currency <select> offers currencyOptions(groups) — the union
  // of the loaded groups' allowed/deposit currencies, literal fallback only
  // when that union is empty — with no entry auto-selected (empty initial +
  // placeholder); LEVERAGES stays a generic <select> preset; COUNTRIES are
  // suggestion presets for the free-text Country input (see the Country
  // field below).
  const instanceId = useId();
  const fid = (suffix) => `${instanceId}-${suffix}`;
  const queryClient = useQueryClient();
  const [localMovable, setLocalMovable] = useState(false);
  const [localPosition, setLocalPosition] = useState({ x: 0, y: 0 });
  const suppressToggleClickRef = useRef(false);
  const isMovable = controlledMovable !== undefined ? Boolean(controlledMovable) : localMovable;

  const handleToggleMovable = (event) => {
    if (onToggleMovable) {
      onToggleMovable(event);
      return;
    }
    if (suppressToggleClickRef.current) {
      suppressToggleClickRef.current = false;
      return;
    }
    setLocalMovable((prev) => {
      const next = !prev;
      if (!next) setLocalPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleLocalMoveButtonPointerDown = (event) => {
    if (onMoveButtonPointerDown) {
      onMoveButtonPointerDown(event);
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const basePos = { ...localPosition };
    let moved = false;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!moved && Math.hypot(dx, dy) >= 4) {
        moved = true;
        suppressToggleClickRef.current = true;
        setLocalMovable(true);
      }
      if (moved) {
        moveEvent.preventDefault();
        setLocalPosition({
          x: basePos.x + dx,
          y: basePos.y + dy,
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleLocalPointerDown = (event) => {
    if (onHeaderPointerDown) {
      onHeaderPointerDown(event);
      return;
    }
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, input, select, textarea, a, label, [role="listbox"], [role="option"], [role="combobox"]')) return;
    if (!isMovable) {
      handleLocalMoveButtonPointerDown(event);
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const basePos = { ...localPosition };
    const onMove = (moveEvent) => {
      moveEvent.preventDefault();
      setLocalPosition({
        x: basePos.x + (moveEvent.clientX - startX),
        y: basePos.y + (moveEvent.clientY - startY),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const [form, setForm] = useState({
    Group: '',
    Leverage: '',
    FirstName: '', LastName: '', Email: '', Phone: '',
    Country: resolveDefaultCountry(getBrokerInfo(), false), Currency: resolveDefaultCurrency(), AccountMode: ACCOUNT_MODE_DEFAULT,
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
    // inheritGroupSettings always keys untouched Leverage/Currency (fresh
    // group value, or '' when the new group has none), so this spread both
    // applies fresh inheritance AND clears previously-inherited stale values
    // on every group switch. Touched (explicit operator) picks are omitted
    // from the result and therefore never cleared.
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
    // The engine-creatability gate runs first so netting can never reach the
    // wire even if component state is forced.
    let payload;
    try {
      payload = buildSubmittableAccountPayload(form);
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
    leverageTouched.current = false;
    currencyTouched.current = false;
    // Reset path never prefills the first row: Group stays empty with the
    // "Select group…" placeholder so a reopened wizard fails closed until
    // the operator explicitly picks a group (inheritance then applies via
    // syncGroupDefaults). Search text is cleared so it can never leak into
    // the next Group value. Country re-resolves from the broker config (empty
    // when the config carries none) so no default is ever invented here.
    // Currency re-resolves with no group selected (always '') so the
    // placeholder returns and nothing is preselected.
    setGroupSearch('');
    setForm({
      Group: '',
      Leverage: '',
      FirstName: '', LastName: '', Email: '', Phone: '', Country: resolveDefaultCountry(getBrokerInfo(), false), Currency: resolveDefaultCurrency(),
      AccountMode: ACCOUNT_MODE_DEFAULT,
      master_pass: '', investor_pass: '',
    });
    if (onClose) onClose();
  };

  const modalCard = (
    <div
      className={`ui-modal new-account-modal${embedded ? ' new-account-embedded' : ''}${isMovable ? ' is-movable' : ''}`}
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : 'true'}
      aria-labelledby={fid('title')}
      onPointerDown={!embedded ? handleLocalPointerDown : undefined}
      style={!embedded && isMovable && (localPosition.x || localPosition.y)
        ? { transform: `translate3d(${localPosition.x}px, ${localPosition.y}px, 0)` }
        : undefined}
    >
      <div
        className={`ui-modal-header new-account-modal-header${isMovable ? ' is-movable' : ''}`}
        onPointerDown={handleLocalPointerDown}
      >
        <span className="new-account-header-copy">
          <span id={fid('title')}>
            New account{screenNumber ? <span className="multi-screen-badge">#{screenNumber}</span> : null}
          </span>
          <small>Configure account settings and secure access</small>
        </span>
        <div className="new-account-header-actions">
          <button
            type="button"
            className={`ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm new-account-move-toggle${isMovable ? ' is-active' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              handleToggleMovable(event);
            }}
            onPointerDown={handleLocalMoveButtonPointerDown}
            aria-label={isMovable ? 'Dock new account window' : 'Make new account window movable'}
            aria-pressed={isMovable}
            title={isMovable ? 'Movable mode ON — drag header or icon to move (click to dock)' : 'Click or drag to move window'}
            data-testid={screenNumber ? `new-account-move-toggle-${screenNumber}` : 'new-account-move-toggle'}
          >
            <Move size={14} />
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm new-account-close"
            onClick={handleClose}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label="Close new account dialog"
            disabled={loading}
          >
            <X size={16} />
          </button>
        </div>
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
                  <p>Select the account group, leverage, base currency, and accounting mode. Leverage and currency follow the selected group until changed. Accounting mode cannot be changed after creation.</p>
                </div>
              </div>
              <div className="new-account-settings-grid">
                <div className="new-account-group-field">
                  <Field id={fid('group')} label="Group" required>
                    <GroupCombobox
                      id={fid('group')}
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
                <Field id={fid('leverage')} label="Leverage" required>
                  <select id={fid('leverage')} className="ui-select" value={form.Leverage} required onChange={(event) => { leverageTouched.current = true; set('Leverage', Number(event.target.value)); }}>
                    <option value="" disabled>Select leverage…</option>
                    {[...new Set([...LEVERAGES, form.Leverage].filter((v) => v !== '' && v !== null && v !== undefined))].sort((a, b) => a - b).map((leverage) => <option key={leverage} value={leverage}>1:{leverage}</option>)}
                  </select>
                </Field>
                <Field id={fid('currency')} label="Currency" required>
                  <select id={fid('currency')} className="ui-select" value={form.Currency} required onChange={(event) => { currencyTouched.current = true; set('Currency', event.target.value); }}>
                    <option value="" disabled>Select currency…</option>
                    {[...new Set([...currencyOptions(groups), form.Currency].filter(Boolean))].sort().map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </Field>
                <Field id={fid('mode')} label="Account mode" required hint="Cannot be changed after creation">
                  <select id={fid('mode')} className="ui-select" value={form.AccountMode} required onChange={(event) => set('AccountMode', event.target.value)}>
                    {ACCOUNT_MODE_CREATE_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
                  </select>
                </Field>
                <Field id={fid('country')} label="Country" hint="Optional">
                  {/*
                    Backend Country is optional FREE TEXT, so this is a text
                    input with datalist suggestions (generic COUNTRIES
                    presets + the broker-configured country when present +
                    the current value), never a restrictive <select>.
                    H8: free text also means a broker-seeded country can
                    always be cleared back to empty — the old disabled
                    placeholder <option> made empty unselectable. Empty
                    passes through untouched per the backend contract.
                  */}
                  <input
                    id={fid('country')}
                    className="ui-input"
                    value={form.Country}
                    onChange={(event) => set('Country', event.target.value)}
                    placeholder="Type or select a country…"
                    list={fid('country-suggestions')}
                    autoComplete="country-name"
                  />
                  <datalist id={fid('country-suggestions')}>
                    {countrySuggestions({ presets: COUNTRIES, brokerInfo: getBrokerInfo(), current: form.Country }).map((country) => (
                      <option key={country} value={country} />
                    ))}
                  </datalist>
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
                  {/*
                    Backend contract mirror: FirstName/LastName/Email are
                    OPTIONAL in the manager AccountCreate handler, so these
                    inputs carry no `required` and never gate submit — the
                    canonical builder passes them through exactly as sent.
                  */}
                  <Field id={fid('first-name')} label="First name" hint="Optional">
                    <input id={fid('first-name')} className="ui-input" value={form.FirstName} onChange={(event) => set('FirstName', event.target.value)} autoComplete="given-name" />
                  </Field>
                  <Field id={fid('last-name')} label="Last name" hint="Optional">
                    <input id={fid('last-name')} className="ui-input" value={form.LastName} onChange={(event) => set('LastName', event.target.value)} autoComplete="family-name" />
                  </Field>
                  <Field id={fid('email')} label="Email" hint="Optional">
                    <input id={fid('email')} type="email" name="new_user_email" className="ui-input" value={form.Email} onChange={(event) => set('Email', event.target.value)} autoComplete="off" />
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
                  {/*
                    Backend contract mirror: master_pass is REQUIRED
                    (fail-closed in the builder) while investor_pass is
                    OPTIONAL (policy-checked server-side only when present).
                  */}
                  <PasswordField id={fid('master-password')} label="Master password" value={form.master_pass} onChange={(event) => set('master_pass', event.target.value)} />
                  <PasswordField id={fid('investor-password')} label="Investor password" value={form.investor_pass} onChange={(event) => set('investor_pass', event.target.value)} required={false} />
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

const NewAccountModal = ({ isOpen, onClose, onSuccess, embedded = false, screenNumber, isMovable, onToggleMovable, onMoveButtonPointerDown, onHeaderPointerDown }) => {
  if (!isOpen && !embedded) return null;

  return (
    <NewAccountModalContent
      onClose={onClose}
      onSuccess={onSuccess}
      embedded={embedded}
      screenNumber={screenNumber}
      isMovable={isMovable}
      onToggleMovable={onToggleMovable}
      onMoveButtonPointerDown={onMoveButtonPointerDown}
      onHeaderPointerDown={onHeaderPointerDown}
    />
  );
};

export default NewAccountModal;
