import { useEffect, useId, useRef } from 'react';
import { Check, CircleHelp, LoaderCircle, X } from 'lucide-react';
import './DepositDialog.css';

export default function DepositDialog({ status, message, onConfirm, onDismiss, title: customTitle, dismissLabel, confirmLabel = 'Confirm deposit' }) {
  const ref = useRef(null);
  const id = useId();
  const busy = status === 'pending';
  const StatusIcon = status === 'success' ? Check : status === 'error' ? X : busy ? LoaderCircle : CircleHelp;
  const title = customTitle || { confirm: 'Confirm deposit', pending: 'Processing deposit', success: 'Deposit successful', error: 'Deposit could not be completed' }[status];
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`deposit-dialog is-${status}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`} onCancel={event => { event.preventDefault(); if (!busy) onDismiss(); }}>
    <div className="deposit-dialog-mark" aria-hidden="true"><StatusIcon size={28} className={busy ? 'animate-spin' : undefined} /></div>
    <h2 id={`${id}-title`}>{title}</h2>
    <p id={`${id}-message`} role={status === 'error' ? 'alert' : 'status'}>{message}</p>
    <div className="deposit-dialog-actions">
      {status === 'confirm' && <button type="button" className="is-secondary" onClick={onDismiss}>Cancel</button>}
      <button type="button" disabled={busy} onClick={status === 'confirm' ? onConfirm : onDismiss}>{status === 'confirm' ? confirmLabel : busy ? 'Please wait...' : dismissLabel || (status === 'error' ? 'Back to deposit' : 'Continue')}</button>
    </div>
  </dialog>;
}
