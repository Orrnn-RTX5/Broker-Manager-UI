import { showResult } from '../../store/resultDialogStore.js';
import { Children, cloneElement, useId, useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import AccountDialog from './AccountDialog';
import {
  accountRestrictGet, accountRestrictSet, accountRestrictClear,
  accountSpreadSet, accountExecutionSet, accountBookSet,
} from '../../services/tradeApi';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';
import { hasSpreadSymbol, normalizeSpreadSymbol } from './accountSpreadSymbol.js';

const Toggle = ({ label, checked, onChange, disabled }) => (
  <label className="flex items-center justify-between gap-2 py-1.5 cursor-pointer">
    <span className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</span>
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
      style={{ background: checked ? 'var(--accent)' : 'var(--border-3)' }}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full transition-transform"
        style={{
          background: 'white',
          transform: checked ? 'translateX(18px)' : 'translateX(3px)',
        }}
      />
    </button>
  </label>
);

const Field = ({ label, children }) => {
  const id = useId();
  const child = Children.only(children);
  const fieldId = child.props.id || id;
  return <div className="flex flex-col gap-1">
    <label htmlFor={fieldId} style={{ color: 'var(--text-3)' }}>{label}</label>
    {cloneElement(child, { id: fieldId })}
  </div>;
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
    <AccountDialog title={`Account Restrictions · ${login}`} className="account-restrictions-dialog" onClose={onClose} busy={saving}
      footer={<>
        <button type="button" className="account-panel-button is-danger" onClick={() => setConfirmClear(true)} disabled={loading || saving || loadFailed || !hasRestriction || !canEditRestrictions}>Clear All</button>
        <div>
          <button type="button" className="account-panel-button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="account-panel-button is-primary" onClick={handleSave} disabled={loading || saving || loadFailed || !canEditRestrictions}>{saving ? 'Saving…' : hasRestriction ? 'Save Changes' : 'Create Restrictions'}</button>
        </div>
      </>}>
          {loading && (
            <div className="account-restrictions-loading" role="status">Loading account restrictions…</div>
          )}

          {error && (
            <div className="account-panel-error" role="alert"><span>{error}</span>{loadFailed && <button type="button" className="account-panel-button" onClick={fetchRestrictions}>Retry</button>}</div>
          )}

          {!loading && !loadFailed && (
            <>
              {!canChangeAnyRestriction && (
                <div className="flex items-center gap-2 p-2 rounded text-xs" style={{ background: 'var(--warning-soft)', color: 'var(--warning-text)' }}>
                  <AlertTriangle size={14} /> Read-only: your role does not have permission to change account restrictions or trade overrides.
                </div>
              )}

              {canEditRestrictions && !canManipulateRestrictionTrades && (
                <div className="flex items-center gap-2 p-2 rounded text-xs" style={{ background: 'var(--info-soft)', color: 'var(--info-text)' }}>
                  Spread, execution, and book controls require manipulate_trades.
                </div>
              )}

              {!hasRestriction && (
                <div className="flex items-center gap-2 p-2 rounded text-xs" style={{ background: 'var(--info-soft)', color: 'var(--info-text)' }}>
                  No restrictions set for this account. Configure and save to create.
                </div>
              )}

              {/* Trading Flags */}
              <div className="ui-card p-3">
                <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Trading Flags</h4>
                <div className="grid grid-cols-2 gap-x-4">
                  <Toggle label="No Trading" checked={form.no_trading} onChange={v => set('no_trading', v)} disabled={!canEditRestrictions} />
                  <Toggle label="No Deposit" checked={form.no_deposit} onChange={v => set('no_deposit', v)} disabled={!canEditRestrictions} />
                  <Toggle label="No Withdraw" checked={form.no_withdraw} onChange={v => set('no_withdraw', v)} disabled={!canEditRestrictions} />
                  <Toggle label="Close Only" checked={form.close_only} onChange={v => set('close_only', v)} disabled={!canEditRestrictions} />
                </div>
              </div>

              {/* Limits */}
              <div className="ui-card p-3">
                <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Limits</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max Lot">
                    <input type="number" step="0.01" value={form.max_lot} onChange={e => set('max_lot', Number(e.target.value))} className="ui-input ui-input-sm" disabled={!canEditRestrictions} />
                  </Field>
                  <Field label="Max Total Lot">
                    <input type="number" step="0.01" value={form.max_total_lot} onChange={e => set('max_total_lot', Number(e.target.value))} className="ui-input ui-input-sm" disabled={!canEditRestrictions} />
                  </Field>
                  <Field label="Spread Markup">
                    <input type="number" step="1" value={form.spread_markup} onChange={e => set('spread_markup', Number(e.target.value))} className="ui-input ui-input-sm" disabled={!canSaveTradeRestrictionFields} />
                  </Field>
                  <Field label="Custom Leverage">
                    <input type="number" step="1" value={form.custom_leverage} onChange={e => set('custom_leverage', Number(e.target.value))} className="ui-input ui-input-sm" disabled={!canEditRestrictions} />
                  </Field>
                </div>
              </div>

              {/* Routing */}
              <div className="ui-card p-3">
                <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Routing & Execution</h4>
                <div className="grid grid-cols-2 gap-x-4">
                  <Toggle label="A-Book Override" checked={form.a_book_override} onChange={v => set('a_book_override', v)} disabled={!canSaveTradeRestrictionFields} />
                  <Toggle label="B-Book Override" checked={form.b_book_override} onChange={v => set('b_book_override', v)} disabled={!canSaveTradeRestrictionFields} />
                </div>
                <Field label="Execution Delay (ms)">
                  <input type="number" step="1" value={form.execution_delay_ms} onChange={e => set('execution_delay_ms', Number(e.target.value))} className="ui-input ui-input-sm" disabled={!canSaveTradeRestrictionFields} />
                </Field>
              </div>

              {/* Comment */}
              <Field label="Comment">
                <input type="text" value={form.comment} onChange={e => set('comment', e.target.value)} className="ui-input ui-input-sm" placeholder="e.g. KYC pending" disabled={!canEditRestrictions} />
              </Field>

              {/* Advanced Controls (require existing restriction row) */}
              {hasRestriction && (
                <div className="ui-card p-3 flex flex-col gap-3" style={{ borderColor: 'var(--accent-soft)' }}>
                  <h4 className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>Per-Symbol Spread Override</h4>
                  <div className="flex gap-2 items-end">
                    <Field label="Symbol">
                      <input type="text" value={spreadSymbol} onChange={e => setSpreadSymbol(e.target.value)} className="ui-input ui-input-sm" style={{ width: 120 }} placeholder="Symbol" />
                    </Field>
                    <Field label="Markup">
                      <input type="number" step="1" value={spreadMarkup} onChange={e => setSpreadMarkup(Number(e.target.value))} className="ui-input ui-input-sm" style={{ width: 80 }} />
                    </Field>
                    <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleSpreadSet} disabled={saving || !canManipulateRestrictionTrades || !hasSpreadSymbol(spreadSymbol)} title={!canManipulateRestrictionTrades ? 'Your role does not have permission to change spread overrides.' : (!hasSpreadSymbol(spreadSymbol) ? 'Enter a symbol before setting a spread override.' : undefined)}>Set</button>
                  </div>
                  {data?.spreadOverrides && Object.keys(data.spreadOverrides).length > 0 && (
                    <div className="text-[10px] flex gap-2 flex-wrap" style={{ color: 'var(--text-3)' }}>
                      {Object.entries(data.spreadOverrides).map(([sym, val]) => (
                        <span key={sym} className="ui-badge ui-badge-neutral">{sym}: {val}</span>
                      ))}
                    </div>
                  )}

                  <h4 className="text-xs font-semibold mt-2" style={{ color: 'var(--accent-text)' }}>Execution Mode</h4>
                  <div className="flex gap-2 items-end">
                    <Field label="Mode">
                      <select value={execMode} onChange={e => setExecMode(e.target.value)} className="ui-input ui-input-sm" style={{ width: 120 }}>
                        <option value="instant">Instant</option>
                        <option value="market">Market</option>
                        <option value="requote">Requote</option>
                      </select>
                    </Field>
                    <Field label="Delay (ms)">
                      <input type="number" step="1" value={execDelay} onChange={e => setExecDelay(Number(e.target.value))} className="ui-input ui-input-sm" style={{ width: 80 }} />
                    </Field>
                    <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleExecSet} disabled={saving || !canManipulateRestrictionTrades}>Set</button>
                  </div>

                  <h4 className="text-xs font-semibold mt-2" style={{ color: 'var(--accent-text)' }}>Book Assignment</h4>
                  <div className="flex gap-2 items-end">
                    <Field label="Book">
                      <select value={book} onChange={e => setBook(e.target.value)} className="ui-input ui-input-sm" style={{ width: 120 }}>
                        <option value="auto">Auto</option>
                        <option value="a">A-Book</option>
                        <option value="b">B-Book</option>
                      </select>
                    </Field>
                    <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleBookSet} disabled={saving || !canManipulateRestrictionTrades}>Set</button>
                  </div>
                </div>
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
