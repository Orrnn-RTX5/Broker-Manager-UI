import { useState, useEffect } from 'react';
import { X, Shield, Loader, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  accountRestrictGet, accountRestrictSet, accountRestrictClear,
  accountSpreadSet, accountExecutionSet, accountBookSet,
} from '../../services/tradeApi';

const Toggle = ({ label, checked, onChange, disabled }) => (
  <label className="flex items-center justify-between gap-2 py-1.5 cursor-pointer">
    <span className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</span>
    <button
      type="button"
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

const Field = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>{label}</label>
    {children}
  </div>
);

const AccountRestrictionsModal = ({ login, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [hasRestriction, setHasRestriction] = useState(false);

  // Form state
  const [form, setForm] = useState({
    no_trading: false, no_deposit: false, no_withdraw: false, close_only: false,
    max_lot: 0, max_total_lot: 0, spread_markup: 0, custom_leverage: 0,
    a_book_override: false, b_book_override: false, execution_delay_ms: 0, comment: '',
  });

  // Spread/Execution/Book controls
  const [spreadSymbol, setSpreadSymbol] = useState('EURUSD');
  const [spreadMarkup, setSpreadMarkup] = useState(0);
  const [execMode, setExecMode] = useState('market');
  const [execDelay, setExecDelay] = useState(0);
  const [book, setBook] = useState('auto');

  const fetchRestrictions = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await accountRestrictGet(login);
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
    } catch {
      setHasRestriction(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRestrictions(); }, [login]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await accountRestrictSet({ login, ...form });
      setHasRestriction(true);
      alert(`Restrictions updated for login ${login}`);
      fetchRestrictions();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm(`Clear all restrictions for login ${login}?`)) return;
    setSaving(true);
    try {
      await accountRestrictClear(login);
      setHasRestriction(false);
      setForm({
        no_trading: false, no_deposit: false, no_withdraw: false, close_only: false,
        max_lot: 0, max_total_lot: 0, spread_markup: 0, custom_leverage: 0,
        a_book_override: false, b_book_override: false, execution_delay_ms: 0, comment: '',
      });
      alert(`Restrictions cleared for login ${login}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSpreadSet = async () => {
    if (!hasRestriction) { alert('Save a restriction first before setting spread overrides.'); return; }
    setSaving(true);
    try {
      await accountSpreadSet({ login, symbol: spreadSymbol, markup: spreadMarkup });
      alert(`Spread markup set: ${spreadSymbol} = ${spreadMarkup}`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleExecSet = async () => {
    if (!hasRestriction) { alert('Save a restriction first before setting execution mode.'); return; }
    setSaving(true);
    try {
      await accountExecutionSet({ login, mode: execMode, delay_ms: execDelay });
      alert(`Execution set: ${execMode}, delay ${execDelay}ms`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleBookSet = async () => {
    if (!hasRestriction) { alert('Save a restriction first before setting book.'); return; }
    setSaving(true);
    try {
      await accountBookSet({ login, book });
      alert(`Book set to: ${book}`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div
        className="ui-card flex flex-col overflow-hidden"
        style={{ width: 520, maxHeight: '90vh', boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}
        >
          <div className="flex items-center gap-2">
            <Shield size={16} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Account Restrictions — {login}
            </span>
          </div>
          <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-2 rounded text-xs" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {!loading && (
            <>
              {!hasRestriction && (
                <div className="flex items-center gap-2 p-2 rounded text-xs" style={{ background: 'var(--info-soft)', color: 'var(--info-text)' }}>
                  No restrictions set for this account. Configure and save to create.
                </div>
              )}

              {/* Trading Flags */}
              <div className="ui-card p-3">
                <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Trading Flags</h4>
                <div className="grid grid-cols-2 gap-x-4">
                  <Toggle label="No Trading" checked={form.no_trading} onChange={v => set('no_trading', v)} />
                  <Toggle label="No Deposit" checked={form.no_deposit} onChange={v => set('no_deposit', v)} />
                  <Toggle label="No Withdraw" checked={form.no_withdraw} onChange={v => set('no_withdraw', v)} />
                  <Toggle label="Close Only" checked={form.close_only} onChange={v => set('close_only', v)} />
                </div>
              </div>

              {/* Limits */}
              <div className="ui-card p-3">
                <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Limits</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max Lot">
                    <input type="number" step="0.01" value={form.max_lot} onChange={e => set('max_lot', Number(e.target.value))} className="ui-input ui-input-sm" />
                  </Field>
                  <Field label="Max Total Lot">
                    <input type="number" step="0.01" value={form.max_total_lot} onChange={e => set('max_total_lot', Number(e.target.value))} className="ui-input ui-input-sm" />
                  </Field>
                  <Field label="Spread Markup">
                    <input type="number" step="1" value={form.spread_markup} onChange={e => set('spread_markup', Number(e.target.value))} className="ui-input ui-input-sm" />
                  </Field>
                  <Field label="Custom Leverage">
                    <input type="number" step="1" value={form.custom_leverage} onChange={e => set('custom_leverage', Number(e.target.value))} className="ui-input ui-input-sm" />
                  </Field>
                </div>
              </div>

              {/* Routing */}
              <div className="ui-card p-3">
                <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Routing & Execution</h4>
                <div className="grid grid-cols-2 gap-x-4">
                  <Toggle label="A-Book Override" checked={form.a_book_override} onChange={v => set('a_book_override', v)} />
                  <Toggle label="B-Book Override" checked={form.b_book_override} onChange={v => set('b_book_override', v)} />
                </div>
                <Field label="Execution Delay (ms)">
                  <input type="number" step="1" value={form.execution_delay_ms} onChange={e => set('execution_delay_ms', Number(e.target.value))} className="ui-input ui-input-sm" />
                </Field>
              </div>

              {/* Comment */}
              <Field label="Comment">
                <input type="text" value={form.comment} onChange={e => set('comment', e.target.value)} className="ui-input ui-input-sm" placeholder="e.g. KYC pending" />
              </Field>

              {/* Advanced Controls (require existing restriction row) */}
              {hasRestriction && (
                <div className="ui-card p-3 flex flex-col gap-3" style={{ borderColor: 'var(--accent-soft)' }}>
                  <h4 className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>Per-Symbol Spread Override</h4>
                  <div className="flex gap-2 items-end">
                    <Field label="Symbol">
                      <input type="text" value={spreadSymbol} onChange={e => setSpreadSymbol(e.target.value)} className="ui-input ui-input-sm" style={{ width: 120 }} />
                    </Field>
                    <Field label="Markup">
                      <input type="number" step="1" value={spreadMarkup} onChange={e => setSpreadMarkup(Number(e.target.value))} className="ui-input ui-input-sm" style={{ width: 80 }} />
                    </Field>
                    <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleSpreadSet} disabled={saving}>Set</button>
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
                    <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleExecSet} disabled={saving}>Set</button>
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
                    <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleBookSet} disabled={saving}>Set</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}
          >
            <button className="ui-btn ui-btn-danger ui-btn-sm" onClick={handleClear} disabled={saving || !hasRestriction}>
              Clear All
            </button>
            <div className="flex gap-2">
              <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onClose}>Cancel</button>
              <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : hasRestriction ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountRestrictionsModal;
