import React, { useState } from 'react';
import {
  ArrowLeftRight, DollarSign, BarChart3, MessageSquare,
  XCircle, XSquare, Undo2, CheckCircle2
} from 'lucide-react';
import {
  positionFlip, positionPriceChange, positionVolumeChange,
  positionCommentChange, positionForceClose, positionForceCloseAll,
  orderPriceChange, orderReject, orderApprove, dealRollback
} from '../services/tradeApi';

/** Inline prompt dialog for trading actions */
const PromptDialog = ({ title, fields, onSubmit, onCancel, loading }) => {
  const [values, setValues] = useState(() => {
    const init = {};
    fields.forEach(f => { init[f.key] = f.defaultValue ?? ''; });
    return init;
  });

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="ui-card p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200 shadow-2xl"
        style={{ minWidth: 340, maxWidth: 450 }}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{title}</h3>
          <p className="text-[10px] uppercase tracking-widest font-semibold mt-1" style={{ color: 'var(--muted)' }}>
            Trading Authorization Required
          </p>
        </div>

        <div className="flex flex-col gap-4 my-2">
          {fields.map(f => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>{f.label}</label>
              <input
                type={f.type || 'text'}
                step={f.step}
                value={values[f.key]}
                onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="ui-input"
                placeholder={f.placeholder}
                required={f.required}
                autoFocus={f === fields[0]}
              />
              {f.hint && <span className="text-[10px] leading-tight" style={{ color: 'var(--warn-text)' }}>{f.hint}</span>}
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button 
            className="px-4 py-2 text-sm font-semibold rounded-lg hover:bg-white/5 transition-colors" 
            onClick={onCancel} 
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
            disabled={loading}
            onClick={() => onSubmit(values)}
          >
            {loading ? 'Processing…' : 'Execute Order'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const useDealerMenu = (onRefresh) => {
  const [dialog, setDialog] = useState(null);
  const [loading, setLoading] = useState(false);

  const exec = async (fn) => {
    setLoading(true);
    try {
      const result = await fn();
      // Using simple alert for now, could integrate with toastStore later
      console.log('Action successful:', result);
      onRefresh?.();
      setDialog(null);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getPositionActions = (pos) => {
    const ticket = pos?.position || pos?.ticket;
    const login = pos?.login;

    return [
      {
        text: "Flip Position", icon: ArrowLeftRight, iconTone: "warn",
        onClick: () => {
          if (window.confirm(`Flip position #${ticket}?`)) exec(() => positionFlip(ticket));
        }
      },
      {
        text: "Change Price", icon: DollarSign, iconTone: "accent",
        onClick: () => setDialog({
          title: `Change Price — #${ticket}`,
          fields: [{ key: 'new_price', label: 'New Price', type: 'number', step: '0.00001', required: true, defaultValue: pos?.priceOpen || '' }],
          onSubmit: (v) => exec(() => positionPriceChange(ticket, v.new_price))
        })
      },
      {
        text: "Change Volume", icon: BarChart3, iconTone: "info",
        onClick: () => setDialog({
          title: `Change Volume — #${ticket}`,
          fields: [{ key: 'new_lots', label: 'New Lots', type: 'number', step: '0.01', required: true, defaultValue: pos?.volume || '', hint: 'Only decrease is supported currently.' }],
          onSubmit: (v) => exec(() => positionVolumeChange(ticket, v.new_lots))
        })
      },
      {
        text: "Change Comment", icon: MessageSquare, iconTone: "ok",
        onClick: () => setDialog({
          title: `Change Comment — #${ticket}`,
          fields: [
            { key: 'comment', label: 'Comment', type: 'text', defaultValue: pos?.comment || '' },
            { key: 'magic', label: 'Magic Number', type: 'number' }
          ],
          onSubmit: (v) => exec(() => positionCommentChange({ ticket, comment: v.comment, magic: v.magic || undefined }))
        })
      },
      { isSep: true },
      {
        text: "Force Close", icon: XCircle, iconTone: "danger",
        onClick: () => setDialog({
          title: `Force Close — #${ticket}`,
          fields: [
            { key: 'price', label: 'Close Price', type: 'number', step: '0.00001', required: true, defaultValue: pos?.priceCurrent || '' },
            { key: 'comment', label: 'Comment', type: 'text' }
          ],
          onSubmit: (v) => exec(() => positionForceClose({ ticket, price: v.price, comment: v.comment || undefined }))
        })
      },
      {
        text: "Force Close All (Login)", icon: XSquare, iconTone: "danger",
        onClick: () => setDialog({
          title: `Force Close All — Login ${login}`,
          fields: [
            { key: 'symbol', label: 'Symbol (blank = all)', type: 'text', defaultValue: pos?.symbol || '' },
            { key: 'comment', label: 'Comment', type: 'text' }
          ],
          onSubmit: (v) => {
            if (window.confirm(`Force close ALL positions for login ${login}?`)) 
              exec(() => positionForceCloseAll({ login, symbol: v.symbol || undefined, comment: v.comment || undefined }));
          }
        })
      }
    ];
  };

  const getOrderActions = (order) => {
    const ticket = order?.ticket;
    return [
      {
        text: "Change Price", icon: DollarSign, iconTone: "accent",
        onClick: () => setDialog({
          title: `Change Order Price — #${ticket}`,
          fields: [{ key: 'price', label: 'New Price', type: 'number', step: '0.00001', required: true, defaultValue: order?.priceOpen || '' }],
          onSubmit: (v) => exec(() => orderPriceChange(ticket, v.price))
        })
      },
      { isSep: true },
      {
        text: "Approve Order", icon: CheckCircle2, iconTone: "ok",
        onClick: () => setDialog({
          title: `Approve Order — #${ticket}`,
          fields: [{ key: 'comment', label: 'Comment (optional)', type: 'text' }],
          onSubmit: (v) => exec(() => orderApprove({ ticket, comment: v.comment || undefined }))
        })
      },
      {
        text: "Reject Order", icon: XCircle, iconTone: "danger",
        onClick: () => setDialog({
          title: `Reject Order — #${ticket}`,
          fields: [{ key: 'comment', label: 'Reason', type: 'text', required: true }],
          onSubmit: (v) => exec(() => orderReject({ ticket, comment: v.comment || undefined }))
        })
      }
    ];
  };

  const getDealActions = (deal) => {
    const ticket = deal?.ticket || deal?.deal;
    return [
      {
        text: "Rollback Deal", icon: Undo2, iconTone: "danger",
        onClick: () => setDialog({
          title: `Rollback Deal — #${ticket}`,
          fields: [{ key: 'comment', label: 'Reason', type: 'text', required: true }],
          onSubmit: (v) => {
            if (window.confirm(`Rollback deal #${ticket}?`)) 
              exec(() => dealRollback({ deal: ticket, comment: v.comment || undefined }));
          }
        })
      }
    ];
  };

  const renderDialog = () => {
    if (!dialog) return null;
    return (
      <PromptDialog
        title={dialog.title}
        fields={dialog.fields}
        onSubmit={dialog.onSubmit}
        onCancel={() => setDialog(null)}
        loading={loading}
      />
    );
  };

  return { getPositionActions, getOrderActions, getDealActions, renderDialog };
};
