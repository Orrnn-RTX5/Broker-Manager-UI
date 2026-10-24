import { showResult } from '../../store/resultDialogStore.js';
import { Children, cloneElement, useId, useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import AccountDialog from './AccountDialog';
import {
  accountRestrictGet, accountRestrictSet, accountRestrictClear,
  accountSpreadSet, accountExecutionSet, accountBookSet,
} from '../../services/tradeApi';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';
import { hasSpreadSymbol, normalizeSpreadSymbol } from './accountSpreadSymbol.js';

const Toggle = ({ label, checked, onChange, disabled, tone = 'accent' }) => (
  <label className={`account-restrictions-toggle-card ${checked ? `is-active is-${tone}` : ''} ${disabled ? 'is-disabled' : ''}`}>
    <span className="account-restrictions-toggle-copy">
      <span className="account-restrictions-toggle-label">{label}</span>
    </span>
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`account-restrictions-switch ${checked ? `is-checked is-${tone}` : ''}`}
    >
      <span className="account-restrictions-switch-thumb" />
    </button>
  </label>
);

const Field = ({ label, hint, unit, children }) => {
  const id = useId();
  const child = Children.only(children);
  const fieldId = child.props.id || id;
  return (
    <div className="account-restrictions-field">
      <div className="account-restrictions-field-head">
        <label htmlFor={fieldId}>{label}</label>
        {hint && <span className="account-restrictions-field-hint">{hint}</span>}
      </div>
      <div className={`account-restrictions-input-wrap ${unit ? 'has-unit' : ''}`}>
        {cloneElement(child, { id: fieldId })}
        {unit && <span className="account-restrictions-input-unit" aria-hidden="true">{unit}</span>}
      </div>
    </div>
  );
};

const BASIC_RESTRICTION_FIELDS = [
  'no_trading',
  'no_deposit',
  'no_withdraw',
  'close_only',
  'max_lot',
  'max_total_lot',
  'custom_leverage',
  'comment',
];

const TRADE_RESTRICTION_FIELDS = [
  'spread_markup',
  'a_book_override',
  'b_book_override',
  'execution_delay_ms',
];

const pickFields = (source, keys) =>
  keys.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});

const AccountRestrictionsModal = ({ login, onClose }) => {
  const { canAct } = usePermissions();
  const canEditRestrictions = canAct(PERMISSIONS.EDIT_ACCOUNTS);
  const canManipulateRestrictionTrades = canAct(PERMISSIONS.MANIPULATE_TRADES);
  const canSaveTradeRestrictionFields = canEditRestrictions && canManipulateRestrictionTrades;
  const canChangeAnyRestriction = canEditRestrictions || canManipulateRestrictionTrades;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasRestriction, setHasRestriction] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Form state
  const [form, setForm] = useState({
    no_trading: false, no_deposit: false, no_withdraw: false, close_only: false,
    max_lot: 0, max_total_lot: 0, spread_markup: 0, custom_leverage: 0,
    a_book_override: false, b_book_override: false, execution_delay_ms: 0, comment: '',
  });

  // Spread/Execution/Book controls. The spread symbol starts blank and the
  // override refuses to submit blank: no invented symbol may reach the wire
  // (a hardcoded default here would target the wrong symbol).
  const [spreadSymbol, setSpreadSymbol] = useState('');
  const [spreadMarkup, setSpreadMarkup] = useState(0);
  const [execMode, setExecMode] = useState('market');
  const [execDelay, setExecDelay] = useState(0);
  const [book, setBook] = useState('auto');

  const fetchRestrictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const result = await accountRestrictGet(login);
      if (!result || (Array.isArray(result) && result.length === 0)) {
        setData(null);
        setHasRestriction(false);
        return;
      }
      setData(result);
      setHasRestriction(true);
      setForm({
        no_trading: result.noTrading || false,
        no_deposit: result.noDeposit || false,
        no_withdraw: result.noWithdraw || false,
        close_only: result.closeOnly || false,
        max_lot: result.maxLot || 0,
        max_total_lot: result.maxTotalLot || 0,
        spread_markup: result.customSpreadMarkup || 0,
        custom_leverage: result.customLeverage || 0,
        a_book_override: result.aBookOverride || false,
        b_book_override: result.bBookOverride || false,
        execution_delay_ms: result.executionDelayMs || 0,
        comment: result.notes || '',
      });
      if (result.aBookOverride) setBook('a');
      else if (result.bBookOverride) setBook('b');
      else setBook('auto');
      setExecDelay(result.executionDelayMs || 0);
    } catch (failure) {
      setHasRestriction(false);
      const absent = failure.status === 404 && /restriction|record.*not found|no.*record/i.test(failure.message);
      if (!absent) { setLoadFailed(true); setError(failure.message || 'Unable to load account restrictions.'); }
    } finally {
      setLoading(false);
    }
  }, [login]);

  useEffect(() => { fetchRestrictions(); }, [fetchRestrictions]);

  const handleSave = async () => {
    if (!canEditRestrictions) { showResult.error('Your role does not have permission to set account restrictions.'); return; }
    setSaving(true);
    setError(null);
    try {
      const allowedFields = canManipulateRestrictionTrades
        ? [...BASIC_RESTRICTION_FIELDS, ...TRADE_RESTRICTION_FIELDS]
        : BASIC_RESTRICTION_FIELDS;
      await accountRestrictSet({ login, ...pickFields(form, allowedFields) });
      setHasRestriction(true);
      showResult.success(`Restrictions updated for login ${login}`);
      fetchRestrictions();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!canEditRestrictions) { showResult.error('Your role does not have permission to clear account restrictions.'); return; }
    setSaving(true);
    try {
      await accountRestrictClear(login);
      setHasRestriction(false);
      setForm({
        no_trading: false, no_deposit: false, no_withdraw: false, close_only: false,
        max_lot: 0, max_total_lot: 0, spread_markup: 0, custom_leverage: 0,
        a_book_override: false, b_book_override: false, execution_delay_ms: 0, comment: '',
      });
      showResult.success(`Restrictions cleared for login ${login}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSpreadSet = async () => {
    if (!canManipulateRestrictionTrades) { showResult.error('Your role does not have permission to change spread overrides.'); return; }
    if (!hasRestriction) { showResult.info('Save a restriction first before setting spread overrides.'); return; }
    if (!hasSpreadSymbol(spreadSymbol)) { showResult.error('Enter a symbol before setting a spread override.'); return; }
    setSaving(true);
    try {
      await accountSpreadSet({ login, symbol: normalizeSpreadSymbol(spreadSymbol), markup: spreadMarkup });
      showResult.success(`Spread markup set: ${normalizeSpreadSymbol(spreadSymbol)} = ${spreadMarkup}`);
    } catch (err) {
      showResult.error(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExecSet = async () => {
    if (!canManipulateRestrictionTrades) { showResult.error('Your role does not have permission to change execution settings.'); return; }
    if (!hasRestriction) { showResult.info('Save a restriction first before setting execution mode.'); return; }
    setSaving(true);
    try {
      await accountExecutionSet({ login, mode: execMode, delay_ms: execDelay });
      showResult.success(`Execution set: ${execMode}, delay ${execDelay}ms`);
    } catch (err) {
      showResult.error(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleBookSet = async () => {
    if (!canManipulateRestrictionTrades) { showResult.error('Your role does not have permission to change book assignment.'); return; }
    if (!hasRestriction) { showResult.info('Save a restriction first before setting book.'); return; }
    setSaving(true);
    try {
      await accountBookSet({ login, book });
      showResult.success(`Book set to: ${book}`);
    } catch (err) {
      showResult.error(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <>
    <AccountDialog
      title={`Account Restrictions · ${login}`}
      className="account-restrictions-dialog"
      onClose={onClose}
      busy={saving}
      footer={
        <div className="account-restrictions-footer-actions">
          <button type="button" className="account-panel-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="account-panel-button is-primary" onClick={handleSave} disabled={loading || saving || loadFailed || !canEditRestrictions}>{saving ? 'Saving…' : hasRestriction ? 'Save Changes' : 'Create Restrictions'}</button>
        </div>
      }>
          {loading && (
            <div className="account-restrictions-loading" role="status">Loading account restrictions…</div>
          )}

          {error && (
            <div className="account-panel-error" role="alert"><span>{error}</span>{loadFailed && <button type="button" className="account-panel-button" onClick={fetchRestrictions}>Retry</button>}</div>
          )}

          {!loading && !loadFailed && (
            <>
              {!canChangeAnyRestriction && (
                <div className="account-restrictions-banner is-warning">
                  <AlertTriangle size={14} className="account-restrictions-banner-icon" />
                  <span>Read-only: your role does not have permission to change account restrictions or trade overrides.</span>
                </div>
              )}

              {canEditRestrictions && !canManipulateRestrictionTrades && (
                <div className="account-restrictions-banner is-info">
                  <Info size={14} className="account-restrictions-banner-icon" />
                  <span>Spread, execution, and book controls require manipulate_trades.</span>
                </div>
              )}

              {/* Trading Flags */}
              <section className="ui-card account-restrictions-section">
                <div className="account-restrictions-section-head">
                  <div className="account-restrictions-section-title-wrap">
                    <h4 className="account-restrictions-section-title">Trading Flags</h4>
                  </div>
                </div>
                <div className="account-restrictions-grid-2">
                  <Toggle
                    label="No Trading"
                    checked={form.no_trading}
                    onChange={v => set('no_trading', v)}
                    disabled={!canEditRestrictions}
                    tone="danger"
                  />
                  <Toggle
                    label="No Deposit"
                    checked={form.no_deposit}
                    onChange={v => set('no_deposit', v)}
                    disabled={!canEditRestrictions}
                    tone="warn"
                  />
                  <Toggle
                    label="No Withdraw"
                    checked={form.no_withdraw}
                    onChange={v => set('no_withdraw', v)}
                    disabled={!canEditRestrictions}
                    tone="warn"
                  />
                  <Toggle
                    label="Close Only"
                    checked={form.close_only}
                    onChange={v => set('close_only', v)}
                    disabled={!canEditRestrictions}
                    tone="accent"
                  />
                </div>
              </section>

              {/* Limits */}
              <section className="ui-card account-restrictions-section">
                <div className="account-restrictions-section-head">
                  <div className="account-restrictions-section-title-wrap">
                    <h4 className="account-restrictions-section-title">Limits</h4>
                  </div>
                </div>
                <div className="account-restrictions-grid-2 is-fields">
                  <Field label="Max Lot" hint="Single order cap" unit="LOTS">
                    <input type="number" step="0.01" value={form.max_lot} onChange={e => set('max_lot', Number(e.target.value))} className="ui-input ui-input-sm tabular" disabled={!canEditRestrictions} />
                  </Field>
                  <Field label="Max Total Lot" hint="Aggregate open volume" unit="LOTS">
                    <input type="number" step="0.01" value={form.max_total_lot} onChange={e => set('max_total_lot', Number(e.target.value))} className="ui-input ui-input-sm tabular" disabled={!canEditRestrictions} />
                  </Field>
                  <Field label="Spread Markup" hint="Additional markup" unit="PTS">
                    <input type="number" step="1" value={form.spread_markup} onChange={e => set('spread_markup', Number(e.target.value))} className="ui-input ui-input-sm tabular" disabled={!canSaveTradeRestrictionFields} />
                  </Field>
                  <Field label="Custom Leverage" hint="Account leverage ratio" unit="1 : X">
                    <input type="number" step="1" value={form.custom_leverage} onChange={e => set('custom_leverage', Number(e.target.value))} className="ui-input ui-input-sm tabular" disabled={!canEditRestrictions} />
                  </Field>
                </div>
              </section>

              {/* Routing */}
              <section className="ui-card account-restrictions-section">
                <div className="account-restrictions-section-head">
                  <div className="account-restrictions-section-title-wrap">
                    <h4 className="account-restrictions-section-title">Routing & Execution</h4>
                  </div>
                </div>
                <div className="account-restrictions-grid-2">
                  <Toggle
                    label="A-Book Override"
                    checked={form.a_book_override}
                    onChange={v => set('a_book_override', v)}
                    disabled={!canSaveTradeRestrictionFields}
                    tone="accent"
                  />
                  <Toggle
                    label="B-Book Override"
                    checked={form.b_book_override}
                    onChange={v => set('b_book_override', v)}
                    disabled={!canSaveTradeRestrictionFields}
                    tone="accent"
                  />
                </div>
                <div className="account-restrictions-grid-2 is-fields account-restrictions-exec-row">
                  <Field label="Execution Delay (ms)" hint="Synthetic fill latency" unit="MS">
                    <input type="number" step="1" value={form.execution_delay_ms} onChange={e => set('execution_delay_ms', Number(e.target.value))} className="ui-input ui-input-sm tabular" disabled={!canSaveTradeRestrictionFields} />
                  </Field>
                  {/* Comment */}
                  <Field label="Comment" hint="Compliance / audit note">
                    <input type="text" value={form.comment} onChange={e => set('comment', e.target.value)} className="ui-input ui-input-sm" placeholder="e.g. KYC pending" disabled={!canEditRestrictions} />
                  </Field>
                </div>
              </section>

              {/* Advanced Controls (require existing restriction row) */}
              {hasRestriction && (
                <section className="ui-card account-restrictions-section is-advanced">
                  <div className="account-restrictions-section-head">
                    <div className="account-restrictions-section-title-wrap">
                      <h4 className="account-restrictions-section-title">Live Symbol & Execution Overrides</h4>
                    </div>
                  </div>

                  <div className="account-restrictions-advanced-block">
                    <h4 className="account-restrictions-subhead">Per-Symbol Spread Override</h4>
                    <div className="account-restrictions-inline-bar">
                      <Field label="Symbol">
                        <input type="text" value={spreadSymbol} onChange={e => setSpreadSymbol(e.target.value)} className="ui-input ui-input-sm" placeholder="Symbol" />
                      </Field>
                      <Field label="Markup" unit="PTS">
                        <input type="number" step="1" value={spreadMarkup} onChange={e => setSpreadMarkup(Number(e.target.value))} className="ui-input ui-input-sm tabular" />
                      </Field>
                      <button
                        className="ui-btn ui-btn-primary ui-btn-sm account-restrictions-inline-btn"
                        onClick={handleSpreadSet}
                        disabled={saving || !canManipulateRestrictionTrades || !hasSpreadSymbol(spreadSymbol)}
                        title={!canManipulateRestrictionTrades ? 'Your role does not have permission to change spread overrides.' : (!hasSpreadSymbol(spreadSymbol) ? 'Enter a symbol before setting a spread override.' : undefined)}
                      >
                        Set
                      </button>
                    </div>
                    {data?.spreadOverrides && Object.keys(data.spreadOverrides).length > 0 && (
                      <div className="account-restrictions-override-tags">
                        {Object.entries(data.spreadOverrides).map(([sym, val]) => (
                          <span key={sym} className="ui-badge ui-badge-neutral">{sym}: {val}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="account-restrictions-advanced-grid">
                    <div className="account-restrictions-advanced-block">
                      <h4 className="account-restrictions-subhead">Execution Mode</h4>
                      <div className="account-restrictions-inline-bar">
                        <Field label="Mode">
                          <select value={execMode} onChange={e => setExecMode(e.target.value)} className="ui-input ui-input-sm">
                            <option value="instant">Instant</option>
                            <option value="market">Market</option>
                            <option value="requote">Requote</option>
                          </select>
                        </Field>
                        <Field label="Delay (ms)" unit="MS">
                          <input type="number" step="1" value={execDelay} onChange={e => setExecDelay(Number(e.target.value))} className="ui-input ui-input-sm tabular" />
                        </Field>
                        <button className="ui-btn ui-btn-primary ui-btn-sm account-restrictions-inline-btn" onClick={handleExecSet} disabled={saving || !canManipulateRestrictionTrades}>Set</button>
                      </div>
                    </div>

                    <div className="account-restrictions-advanced-block">
                      <h4 className="account-restrictions-subhead">Book Assignment</h4>
                      <div className="account-restrictions-inline-bar">
                        <Field label="Book">
                          <select value={book} onChange={e => setBook(e.target.value)} className="ui-input ui-input-sm">
                            <option value="auto">Auto</option>
                            <option value="a">A-Book</option>
                            <option value="b">B-Book</option>
                          </select>
                        </Field>
                        <button className="ui-btn ui-btn-primary ui-btn-sm account-restrictions-inline-btn" onClick={handleBookSet} disabled={saving || !canManipulateRestrictionTrades}>Set</button>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
    </AccountDialog>
    {confirmClear && <AccountDialog title={`Clear account restrictions · ${login}`} className="account-action-dialog" onClose={() => setConfirmClear(false)} busy={saving}
      footer={<>
        <button type="button" className="account-panel-button" disabled={saving} onClick={() => setConfirmClear(false)}>Cancel</button>
        <button type="button" className="account-panel-button is-danger" disabled={saving} onClick={async () => { await handleClear(); setConfirmClear(false); }}>{saving ? 'Clearing…' : 'Clear restrictions'}</button>
      </>}><p className="account-action-message">Remove all restrictions and trade overrides for account {login}?</p></AccountDialog>}
    </>
  );
};

export default AccountRestrictionsModal;
