import { useEffect, useRef } from 'react';
import './DepositDialog.css';

export default function DepositDialog({ status, message, onConfirm, onDismiss }) {
  const ref = useRef(null);
  const busy = status === 'pending';
  const title = { confirm: 'Confirm deposit', pending: 'Processing deposit', success: 'Deposit successful', error: 'Deposit could not be completed' }[status];
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`deposit-dialog is-${status}`} aria-labelledby="deposit-dialog-title" aria-describedby="deposit-dialog-message" onCancel={event => { event.preventDefault(); if (!busy) onDismiss(); }}>
    <div className="deposit-dialog-mark" aria-hidden="true">{status === 'success' ? '?' : status === 'error' ? '×' : busy ? '…' : '?'}</div>
    <h2 id="deposit-dialog-title">{title}</h2>
    <p id="deposit-dialog-message" role={status === 'error' ? 'alert' : 'status'}>{message}</p>
    <div className="deposit-dialog-actions">
      {status === 'confirm' && <button type="button" className="is-secondary" onClick={onDismiss}>Cancel</button>}
      <button type="button" disabled={busy} onClick={status === 'confirm' ? onConfirm : onDismiss}>{status === 'confirm' ? 'Confirm deposit' : busy ? 'Please wait…' : status === 'error' ? 'Back to deposit' : 'Continue'}</button>
    </div>
  </dialog>;
}
