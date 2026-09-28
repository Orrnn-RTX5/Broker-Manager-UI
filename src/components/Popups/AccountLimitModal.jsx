import { useState, useEffect } from 'react';
import { X, Info, Loader2, AlertCircle } from 'lucide-react';
import { fetchManagerApi } from '../../services/managerFetch';

const Row = ({ label, value }) => {
  const isBool = typeof value === 'boolean';
  return (
    <div
      className="flex items-center justify-between py-2.5 px-4"
      style={{ borderBottom: '1px solid var(--border-2)' }}
    >
      <span className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</span>
      <span
        className="text-sm tabular font-medium"
        style={{
          color: isBool
            ? (value ? 'var(--ok-text)' : 'var(--danger-text)')
            : 'var(--text)',
        }}
      >
        {isBool ? (value ? 'Yes' : 'No') : (value ?? '—')}
      </span>
    </div>
  );
};

const AccountLimitModal = ({ isOpen, onClose }) => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (isOpen) fetchLimits();
    else { setData(null); setError(null); }
  }, [isOpen]);

  const fetchLimits = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchManagerApi('/AccountLimitStatus', {
        method: 'GET', headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to fetch limit status');
      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ui-modal-backdrop" style={{ zIndex: 99999 }}>
      <div className="ui-modal" style={{ width: 440 }}>
        <div className="ui-modal-header">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center mr-3"
            style={{ background: 'var(--info-soft)', color: 'var(--info-text)' }}
          >
            <Info size={15} />
          </span>
          Account Limit Status
          <span className="x" onClick={onClose}><X size={16} /></span>
        </div>

        <div className="ui-modal-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm" style={{ color: 'var(--text-3)' }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
              Fetching limit status…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2.5 m-5 p-3 rounded-lg text-sm"
              style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)' }}>
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : data ? (
            <div>
              <Row label="Broker ID"              value={data.broker_id} />
              <Row label="Can Create Real"        value={data.can_create_real} />
              <Row label="Demo Account Count"     value={data.demo_account_count} />
              <Row label="Demo Unlimited"         value={data.demo_unlimited} />
              <Row label="Max Real Accounts"      value={data.max_real_accounts} />
              <Row label="Real Account Count"     value={data.real_account_count} />
              <Row label="Remaining Real"         value={data.remaining_real} />
            </div>
          ) : null}
        </div>

        <div className="ui-modal-footer">
          <button onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">Close</button>
        </div>
      </div>
    </div>
  );
};

export default AccountLimitModal;
