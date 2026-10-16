import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import './AccountPanel.css';

export default function AccountDialog({ title, children, footer, onClose, busy = false, className = '' }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const accountRow = dialog.closest('.rtx5-command-shell')?.querySelector('.accounts-sidebar-grid tr.is-selected');
    dialog.showModal();
    return () => {
      dialog.close();
      const restore = previous?.isConnected && previous !== document.body ? previous : accountRow;
      restore?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={ref} className={`account-panel-dialog ${className}`} aria-labelledby={titleId} aria-modal="true"
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
      <header className="account-panel-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="account-panel-close" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={14} aria-hidden="true" /></button>
      </header>
      <div className="account-panel-dialog-body">{children}</div>
      <footer className="account-panel-dialog-footer">{footer}</footer>
    </dialog>
  );
}
