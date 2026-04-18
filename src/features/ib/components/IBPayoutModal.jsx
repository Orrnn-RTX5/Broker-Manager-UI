import { useState } from 'react';
import { X, DollarSign, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ibCommissionPay } from '../../../services/api';

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const IBPayoutModal = ({ login, onClose, onSuccess }) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  const [from, setFrom] = useState(monthStart);
  const [to, setTo]     = useState(today);
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [committed, setCommitted] = useState(null);

  const handlePreview = async () => {
    if (!from || !to) { setError('Date range is required to avoid all-time payouts.'); return; }
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await ibCommissionPay({ login, from, to, execute: false });
      setPreview(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    if (!window.confirm(`Pay ${fmt(preview.unpaid_total)} to IB ${login}? This cannot be undone.`)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await ibCommissionPay({ login, from, to, execute: true });
      setCommitted(result);
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="ui-card flex flex-col" style={{ width: 420, boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2">
            <DollarSign size={15} style={{ color: 'var(--ok-text)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Commission Payout — IB {login}</span>
          </div>
          <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
              <AlertTriangle size={13} /> {error}
            </div>
          )}

          {!committed ? (
            <>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>From *</label>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ui-input ui-input-sm" />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>To *</label>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ui-input ui-input-sm" />
                </div>
              </div>

              <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--warn-text)' }}>
                <AlertTriangle size={11} /> Date range is required — all-time payout is disabled.
              </div>

              {preview && (
                <div className="rounded p-3 flex flex-col gap-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-3)' }}>Unpaid commissions</span>
                    <span className="tabular font-medium" style={{ color: 'var(--text)' }}>{preview.unpaid_count ?? '—'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-3)' }}>Total to pay</span>
                    <span className="tabular font-semibold text-base" style={{ color: 'var(--ok-text)' }}>{fmt(preview.unpaid_total)}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 size={36} style={{ color: 'var(--ok-text)' }} />
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Payment Completed</div>
              <div className="text-xs text-center" style={{ color: 'var(--text-2)' }}>
                Paid <strong>{fmt(committed.paid_total)}</strong> across {committed.paid_count} commission{committed.paid_count !== 1 ? 's' : ''}.
                {committed.pay_ticket && <div className="mt-1">Pay ticket: <span className="tabular font-mono">{committed.pay_ticket}</span></div>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onClose}>{committed ? 'Close' : 'Cancel'}</button>
          {!committed && !preview && (
            <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={handlePreview} disabled={loading}>
              {loading ? 'Loading…' : 'Preview'}
            </button>
          )}
          {!committed && preview && preview.unpaid_count > 0 && (
            <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleCommit} disabled={loading}
              style={{ background: 'var(--ok)', color: 'white' }}>
              {loading ? 'Processing…' : `Pay ${fmt(preview.unpaid_total)}`}
            </button>
          )}
          {!committed && preview && (preview.unpaid_count === 0 || preview.executed === false && preview.message) && (
            <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={handlePreview} disabled={loading}>Re-check</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default IBPayoutModal;
