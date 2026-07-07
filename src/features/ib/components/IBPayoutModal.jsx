import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, DollarSign, Loader, X } from 'lucide-react';
import ibApi from '../../../services/ibApi';
import {
  emptyToNull,
  validatePayoutDecisionInput,
  validatePayoutRequestInput,
} from '../ibDomain';

const fmt = (value) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const AlertBox = ({ tone = 'danger', children }) => (
  <div
    className="flex items-start gap-2 text-xs px-3 py-2 rounded"
    style={{
      background: tone === 'success' ? 'var(--ok-soft)' : 'var(--danger-soft)',
      color: tone === 'success' ? 'var(--ok-text)' : 'var(--danger-text)',
    }}
  >
    {tone === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
    <span>{children}</span>
  </div>
);

const emptyForm = {
  amount: '',
  payment_method: '',
  payout_method: '',
  external_ref: '',
  payout_reference: '',
  notes: '',
  rejection_reason: '',
};

const IBPayoutModal = ({ login, embedded = false, onClose, onSuccess }) => {
  const [form, setForm] = useState(emptyForm);
  const [request, setRequest] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const buildRequestParams = () => ({
    login,
    ...(emptyToNull(form.amount) ? { amount: Number(form.amount) } : {}),
    ...(emptyToNull(form.payment_method) ? { payment_method: emptyToNull(form.payment_method) } : {}),
    ...(emptyToNull(form.payout_method) ? { payout_method: emptyToNull(form.payout_method) } : {}),
    ...(emptyToNull(form.external_ref) ? { external_ref: emptyToNull(form.external_ref) } : {}),
    ...(emptyToNull(form.payout_reference) ? { payout_reference: emptyToNull(form.payout_reference) } : {}),
    ...(emptyToNull(form.notes) ? { notes: emptyToNull(form.notes) } : {}),
  });

  const handleCreateRequest = async () => {
    const errors = validatePayoutRequestInput({ login, amount: form.amount });
    if (errors.length) {
      setError(errors[0]);
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await ibApi.payoutRequest(buildRequestParams());
      setRequest(response);
      setCopied(false);
      onSuccess?.('request', response);
    } catch (err) {
      setError(err.message || 'Failed to create payout request.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPayoutId = async () => {
    const payoutId = request?.payout_id;
    if (!payoutId) return;
    if (!globalThis.navigator?.clipboard?.writeText) {
      setError('Clipboard copy is not available in this browser context.');
      return;
    }

    try {
      await globalThis.navigator.clipboard.writeText(String(payoutId));
      setError('');
      setCopied(true);
      globalThis.window?.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Unable to copy payout ID.');
    }
  };

  const handleApprove = async () => {
    const payoutId = request?.payout_id;
    const errors = validatePayoutDecisionInput({ payout_id: payoutId, action: 'approve' });
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    if (!window.confirm(`Approve and pay payout request #${payoutId}? This moves money and cannot be undone.`)) return;

    setLoading(true);
    setError('');
    try {
      const response = await ibApi.payoutApprove({
        payout_id: payoutId,
        ...(emptyToNull(form.payment_method) ? { payment_method: emptyToNull(form.payment_method) } : {}),
        ...(emptyToNull(form.payout_method) ? { payout_method: emptyToNull(form.payout_method) } : {}),
        ...(emptyToNull(form.external_ref) ? { external_ref: emptyToNull(form.external_ref) } : {}),
        ...(emptyToNull(form.payout_reference) ? { payout_reference: emptyToNull(form.payout_reference) } : {}),
        ...(emptyToNull(form.notes) ? { notes: emptyToNull(form.notes) } : {}),
      });
      setResult(response);
      onSuccess?.('approve', response);
    } catch (err) {
      setError(err.message || 'Failed to approve payout.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    const payoutId = request?.payout_id;
    const reason = emptyToNull(form.rejection_reason);
    const errors = validatePayoutDecisionInput({ payout_id: payoutId, action: 'reject', reason });
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    if (!window.confirm(`Reject payout request #${payoutId} and release its commissions?`)) return;

    setLoading(true);
    setError('');
    try {
      const response = await ibApi.payoutReject({
        payout_id: payoutId,
        reason,
        rejection_reason: reason,
        ...(emptyToNull(form.notes) ? { notes: emptyToNull(form.notes) } : {}),
      });
      setResult(response);
      onSuccess?.('reject', response);
    } catch (err) {
      setError(err.message || 'Failed to reject payout.');
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div className="flex flex-col gap-4">
      {error && <AlertBox>{error}</AlertBox>}
      {result && (
        <AlertBox tone="success">
          Payout #{result.payout_id || request?.payout_id} is {result.status || 'updated'}.
          {result.pay_ticket ? ` Pay ticket: ${result.pay_ticket}.` : ''}
        </AlertBox>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Amount override</span>
          <input
            type="number"
            min="0"
            value={form.amount}
            onChange={(event) => setField('amount', event.target.value)}
            className="ui-input ui-input-sm"
            placeholder="Leave blank for backend total"
            disabled={Boolean(request)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Payment method</span>
          <input value={form.payment_method} onChange={(event) => setField('payment_method', event.target.value)} className="ui-input ui-input-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Payout method</span>
          <input value={form.payout_method} onChange={(event) => setField('payout_method', event.target.value)} className="ui-input ui-input-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>External reference</span>
          <input value={form.external_ref} onChange={(event) => setField('external_ref', event.target.value)} className="ui-input ui-input-sm" />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Payout reference</span>
          <input value={form.payout_reference} onChange={(event) => setField('payout_reference', event.target.value)} className="ui-input ui-input-sm" />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Notes</span>
          <textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} className="ui-input ui-input-sm" rows={2} />
        </label>
      </div>

      {!request ? (
        <button className="ui-btn ui-btn-primary ui-btn-sm self-start" onClick={handleCreateRequest} disabled={loading}>
          {loading ? <Loader size={13} className="animate-spin" /> : <DollarSign size={13} />}
          Create payout request
        </button>
      ) : (
        <div className="rounded p-3 flex flex-col gap-3" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <span className="inline-flex items-center gap-2">
              <strong>ID:</strong>
              <span className="tabular">{request.payout_id}</span>
              <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-xs" type="button" onClick={handleCopyPayoutId} title="Copy payout ID">
                {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
              </button>
            </span>
            <span><strong>Status:</strong> {request.status || 'requested'}</span>
            <span><strong>Amount:</strong> <span className="tabular">{fmt(request.amount ?? request.requested_amount)}</span></span>
            <span><strong>Rows:</strong> <span className="tabular">{request.commission_count ?? '-'}</span></span>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Rejection reason</span>
            <input value={form.rejection_reason} onChange={(event) => setField('rejection_reason', event.target.value)} className="ui-input ui-input-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleApprove} disabled={loading || Boolean(result)}>
              {loading ? <Loader size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Approve and pay
            </button>
            <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={handleReject} disabled={loading || Boolean(result)}>
              Reject request
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="ui-card flex flex-col" style={{ width: 560, maxHeight: '88vh', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2">
            <DollarSign size={15} style={{ color: 'var(--ok-text)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Payout workflow - IB {login}</span>
          </div>
          <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="p-4 overflow-y-auto">{content}</div>
      </div>
    </div>
  );
};

export default IBPayoutModal;
