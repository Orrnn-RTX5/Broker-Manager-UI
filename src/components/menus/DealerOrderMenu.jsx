import { useState, useEffect } from 'react';
import {
  DollarSign, CheckCircle2, XCircle, Undo2
} from 'lucide-react';
import {
  orderPriceChange, orderReject, orderApprove, dealRollback,
} from '../../services/tradeApi';

const Sep = () => <div className="ui-ctxmenu-sep" />;

const Item = ({ text, icon: Icon, iconTone, disabled, onClick }) => {
  const toneColor = {
    ok: 'var(--ok-text)', danger: 'var(--danger-text)', warn: 'var(--warn-text)',
    accent: 'var(--accent-text)', info: 'var(--info-text)',
  }[iconTone] || 'var(--text-3)';

  return (
    <div
      className={`ui-ctxmenu-item ${disabled ? 'is-disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
    >
      <span className="w-4 h-4 inline-flex items-center justify-center">
        {Icon && <Icon size={14} strokeWidth={1.75} style={{ color: toneColor }} />}
      </span>
      <span className="flex-1">{text}</span>
    </div>
  );
};

const PromptDialog = ({ title, fields, onSubmit, onCancel, loading }) => {
  const [values, setValues] = useState(() => {
    const init = {};
    fields.forEach(f => { init[f.key] = f.defaultValue ?? ''; });
    return init;
  });

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onCancel}
    >
      <div
        className="ui-card p-4 flex flex-col gap-3"
        style={{ minWidth: 320, maxWidth: 400, boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        {fields.map(f => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--text-3)' }}>{f.label}</label>
            <input
              type={f.type || 'text'}
              step={f.step}
              value={values[f.key]}
              onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="ui-input ui-input-sm"
              placeholder={f.placeholder}
              required={f.required}
              autoFocus={f === fields[0]}
            />
          </div>
        ))}
        <div className="flex gap-2 justify-end mt-1">
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="ui-btn ui-btn-primary ui-btn-sm" disabled={loading} onClick={() => onSubmit(values)}>
            {loading ? 'Processing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Dealer context menu for orders.
 * Props:
 *   x, y      — screen coords
 *   order      — the order row { ticket, login, symbol, priceOpen, ... }
 *   onClose    — close menu
 *   onRefresh  — refresh the data grid
 *   isDeal     — if true, show deal-specific actions (rollback)
 */
const DealerOrderMenu = ({ x, y, order, onClose, onRefresh, isDeal = false }) => {
  const [dialog, setDialog] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dialog) {
      const close = () => onClose();
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }
  }, [onClose, dialog]);

  const style = {
    top: Math.min(y, window.innerHeight - 300),
    left: Math.min(x, window.innerWidth - 260),
  };

  const ticket = order?.ticket || order?.deal;

  const exec = async (fn) => {
    setLoading(true);
    try {
      const result = await fn();
      alert(JSON.stringify(result, null, 2));
      onRefresh?.();
      onClose();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePriceChange = () => {
    setDialog({
      title: `Change Order Price — #${ticket}`,
      fields: [
        { key: 'price', label: 'New Price', type: 'number', step: '0.00001', required: true, defaultValue: order?.priceOpen || '' },
      ],
      onSubmit: (v) => exec(() => orderPriceChange(ticket, v.price)),
    });
  };

  const handleApprove = () => {
    setDialog({
      title: `Approve Order — #${ticket}`,
      fields: [
        { key: 'comment', label: 'Comment (optional)', type: 'text' },
      ],
      onSubmit: (v) => exec(() => orderApprove({ ticket, comment: v.comment || undefined })),
    });
  };

  const handleReject = () => {
    setDialog({
      title: `Reject Order — #${ticket}`,
      fields: [
        { key: 'comment', label: 'Reason', type: 'text', placeholder: 'e.g. invalid size' },
      ],
      onSubmit: (v) => exec(() => orderReject({ ticket, comment: v.comment || undefined })),
    });
  };

  const handleRollback = () => {
    setDialog({
      title: `Rollback Deal — #${ticket}`,
      fields: [
        { key: 'comment', label: 'Reason', type: 'text', placeholder: 'e.g. duplicate' },
      ],
      onSubmit: (v) => {
        if (!window.confirm(`Rollback deal #${ticket}? This will adjust the account balance.`)) return;
        exec(() => dealRollback({ deal: ticket, comment: v.comment || undefined }));
      },
    });
  };

  if (dialog) {
    return (
      <PromptDialog
        title={dialog.title}
        fields={dialog.fields}
        onSubmit={dialog.onSubmit}
        onCancel={() => { setDialog(null); onClose(); }}
        loading={loading}
      />
    );
  }

  return (
    <div
      className="ui-ctxmenu fixed z-[10000]"
      style={{ ...style, width: 260 }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="ui-ctxmenu-item is-disabled" style={{ fontWeight: 600, fontSize: 11, color: 'var(--accent-text)' }}>
        DEALER — {isDeal ? 'Deal' : 'Order'} #{ticket}
      </div>
      <Sep />
      {isDeal ? (
        <Item text="Rollback Deal" icon={Undo2} iconTone="danger" onClick={handleRollback} />
      ) : (
        <>
          <Item text="Change Price" icon={DollarSign} iconTone="accent" onClick={handlePriceChange} />
          <Sep />
          <Item text="Approve Order" icon={CheckCircle2} iconTone="ok" onClick={handleApprove} />
          <Item text="Reject Order" icon={XCircle} iconTone="danger" onClick={handleReject} />
        </>
      )}
    </div>
  );
};

export default DealerOrderMenu;
