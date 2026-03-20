import { useState, useEffect } from 'react';
import { X, Info, Loader } from 'lucide-react';

const FieldRow = ({ label, value }) => (
  <div className="flex items-center mb-1.5 min-h-[22px]">
    <div className="w-[180px] text-right pr-2 text-[12px] text-[#e0e0e0] flex-shrink-0">
      {label}
    </div>
    <div className="flex-1 text-[12px] text-white font-medium pl-1 border border-transparent">
      <span className={typeof value === 'boolean' ? (value ? 'text-green-400' : 'text-red-400') : ''}>
        {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}
      </span>
    </div>
  </div>
);

const AccountLimitModal = ({ isOpen, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchLimits();
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen]);

  const fetchLimits = async () => {
    const id = localStorage.getItem('authToken');
    if (!id) {
      setError('Not authenticated. Please log in again.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`http://69.197.178.27/manager/AccountLimitStatus?id=${id}`, {
        method: 'GET',
        headers: { 'accept': 'application/json' },
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

  const handleClose = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 shadow-2xl">
      <div className="w-[400px] bg-[#1e1e1e] border border-[#444] rounded-[2px] flex flex-col font-sans overflow-hidden shadow-2xl">
        
        {/* Title Bar */}
        <div className="h-8 bg-[#1e1e1e] flex items-center justify-between pl-3 pr-2 flex-shrink-0 cursor-default select-none border-b border-[#333]">
          <span className="text-[13px] text-[#e0e0e0] flex items-center gap-1.5">
            <Info size={14} className="text-blue-400" /> Account Limit Status
          </span>
          <button onClick={handleClose} className="hover:text-white text-[#a0a0a0] hover:bg-red-500/80 p-1 rounded transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body content */}
        <div className="p-4 py-6 flex flex-col items-center min-h-[150px] justify-center">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-[#ccc] text-[12px]">
              <Loader size={18} className="animate-spin text-blue-400" />
              Fetching limit status...
            </div>
          ) : error ? (
            <div className="text-red-400 text-[12px] text-center">{error}</div>
          ) : data ? (
            <div className="w-full pl-4">
              <FieldRow label="Broker ID:" value={data.broker_id} />
              <FieldRow label="Can Create Real:" value={data.can_create_real} />
              <FieldRow label="Demo Account Count:" value={data.demo_account_count} />
              <FieldRow label="Demo Unlimited:" value={data.demo_unlimited} />
              <FieldRow label="Max Real Accounts:" value={data.max_real_accounts} />
              <FieldRow label="Real Account Count:" value={data.real_account_count} />
              <FieldRow label="Remaining Real Accounts:" value={data.remaining_real} />
            </div>
          ) : null}
        </div>

        {/* Bottom Buttons */}
        <div className="flex justify-center gap-[10px] pb-4">
          <button
            type="button"
            onClick={handleClose}
            className="w-[85px] h-[24px] bg-[#1e1e1e] hover:bg-[#333] border border-[#555] text-[#ccc] hover:text-white hover:border-white rounded-[2px] text-[12px] flex items-center justify-center transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountLimitModal;
