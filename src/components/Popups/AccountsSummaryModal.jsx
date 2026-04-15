import { X, FileText } from 'lucide-react';

const AccountsSummaryModal = ({ account, onClose }) => {
  const data = Array.isArray(account.data) ? account.data[0] : account.data;

  return (
    <div className="ui-modal-backdrop" style={{ zIndex: 2000 }}>
      <div className="ui-modal" style={{ width: 460 }}>
        <div className="ui-modal-header">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center mr-3"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <FileText size={15} />
          </span>
          Summary · <span className="tabular ml-1" style={{ color: 'var(--text-2)' }}>{account.login}</span>
          <span className="x" onClick={onClose}><X size={16} /></span>
        </div>

        <div className="ui-modal-body" style={{ padding: 0, maxHeight: '60vh' }}>
          {data ? (
            <div>
              {Object.entries(data).map(([key, val], idx) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2.5 px-4"
                  style={{
                    borderBottom: '1px solid var(--border-2)',
                    background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                  }}
                >
                  <span className="text-xs font-medium capitalize" style={{ color: 'var(--text-3)' }}>
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm tabular font-medium truncate ml-3" style={{ color: 'var(--text)' }}>
                    {val !== null && val !== undefined ? String(val) : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>
              No summary data available.
            </div>
          )}
        </div>

        <div className="ui-modal-footer">
          <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default AccountsSummaryModal;
