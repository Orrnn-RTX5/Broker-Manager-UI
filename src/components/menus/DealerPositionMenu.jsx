import { useState, useEffect } from 'react';
import {
  ArrowLeftRight, DollarSign, BarChart3, MessageSquare,
  XCircle, XSquare, AlertTriangle, ChevronRight
} from 'lucide-react';
import {
  positionFlip, positionPriceChange, positionVolumeChange,
  positionCommentChange, positionForceClose, positionForceCloseAll,
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

/** Inline prompt dialog rendered inside the context menu area */
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
            {f.hint && <span className="text-[10px]" style={{ color: 'var(--warn-text)' }}>{f.hint}</span>}
          </div>
        ))}
        <div className="flex gap-2 justify-end mt-1">
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className="ui-btn ui-btn-primary ui-btn-sm"
            disabled={loading}
            onClick={() => onSubmit(values)}
          >
            {loading ? 'Processing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Dealer context menu for positions. Shown on right-click of a position row.
 * Props:
 *   x, y        — screen coords
 *   position     — the position row object { position (ticket), login, symbol, volume, priceOpen, priceCurrent, type, comment, ... }
 *   onClose      — close menu
 *   onRefresh    — refresh the data grid after a mutation
 */
const DealerPositionMenu = ({ x, y, position: pos, onClose, onRefresh }) => {
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
    top: Math.min(y, window.innerHeight - 400),
    left: Math.min(x, window.innerWidth - 260),
  };

  const ticket = pos?.position || pos?.ticket;
  const login = pos?.login;

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

  const handleFlip = () => {
    if (!window.confirm(
      `Flip position #${ticket}?\n\nWarning: SL/TP values may be swapped due to a known issue. Verify after flipping.`
    )) return;
    exec(() => positionFlip(ticket));
  };

  const handlePriceChange = () => {
    setDialog({
      title: `Change Price — #${ticket}`,
      fields: [
        { key: 'new_price', label: 'New Price', type: 'number', step: '0.00001', required: true, defaultValue: pos?.priceOpen || '' },
      ],
      onSubmit: (v) => exec(() => positionPriceChange(ticket, v.new_price)),
    });
  };

  const handleVolumeChange = () => {
    setDialog({
      title: `Change Volume — #${ticket}`,
      fields: [
        { key: 'new_lots', label: 'New Lots', type: 'number', step: '0.01', required: true, defaultValue: pos?.volume || '',
          hint: 'Only decrease is supported. Increase is disabled until fix is deployed.' },
      ],
      onSubmit: (v) => {
        if (Number(v.new_lots) >= Number(pos?.volume)) {
          alert('Only volume decrease is currently supported.');
          return;
        }
        exec(() => positionVolumeChange(ticket, v.new_lots));
      },
    });
  };

  const handleCommentChange = () => {
    setDialog({
      title: `Change Comment — #${ticket}`,
      fields: [
        { key: 'comment', label: 'Comment', type: 'text', defaultValue: pos?.comment || '' },
        { key: 'magic', label: 'Magic Number (optional)', type: 'number' },
      ],
      onSubmit: (v) => exec(() => positionCommentChange({ ticket, comment: v.comment, magic: v.magic || undefined })),
    });
  };

  const handleForceClose = () => {
    setDialog({
      title: `Force Close — #${ticket}`,
      fields: [
        { key: 'price', label: 'Close Price', type: 'number', step: '0.00001', required: true, defaultValue: pos?.priceCurrent || '' },
        { key: 'comment', label: 'Comment', type: 'text' },
      ],
      onSubmit: (v) => exec(() => positionForceClose({ ticket, price: v.price, comment: v.comment || undefined })),
    });
  };

  const handleForceCloseAll = () => {
    setDialog({
      title: `Force Close All — Login ${login}`,
      fields: [
        { key: 'symbol', label: 'Symbol (blank = all)', type: 'text', defaultValue: pos?.symbol || '' },
        { key: 'comment', label: 'Comment', type: 'text' },
      ],
      onSubmit: (v) => {
        if (!window.confirm(`Force close ALL positions for login ${login}${v.symbol ? ` on ${v.symbol}` : ''}?`)) return;
        exec(() => positionForceCloseAll({ login, symbol: v.symbol || undefined, comment: v.comment || undefined }));
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
        DEALER — Position #{ticket}
      </div>
      <Sep />
      <Item text="Flip Position" icon={ArrowLeftRight} iconTone="warn" onClick={handleFlip} />
      <Item text="Change Price" icon={DollarSign} iconTone="accent" onClick={handlePriceChange} />
      <Item text="Change Volume" icon={BarChart3} iconTone="info" onClick={handleVolumeChange} />
      <Item text="Change Comment" icon={MessageSquare} iconTone="ok" onClick={handleCommentChange} />
      <Sep />
      <Item text="Force Close" icon={XCircle} iconTone="danger" onClick={handleForceClose} />
      <Item text="Force Close All (Login)" icon={XSquare} iconTone="danger" onClick={handleForceCloseAll} />
    </div>
  );
};

export default DealerPositionMenu;
