import { useState, useCallback } from 'react';
import { Search, Gavel, RefreshCw, Loader, AlertTriangle, User, CheckCircle2, XCircle } from 'lucide-react';
import { getDealerQueue, orderApprove, orderReject } from '../../services/tradeApi';
import useDataSource from '../../hooks/useDataSource';

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtTime = (unix) => {
  if (!unix) return '—';
  const d = new Date(unix * 1000);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const PromptDialog = ({ title, fields, onSubmit, onCancel, loading }) => {
  const [values, setValues] = useState(() => {
    const init = {};
    fields.forEach(f => { init[f.key] = f.defaultValue ?? ''; });
    return init;
  });
  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onCancel}>
      <div className="ui-card p-4 flex flex-col gap-3" style={{ minWidth: 320, boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        {fields.map(f => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--text-3)' }}>{f.label}</label>
            <input type={f.type || 'text'} value={values[f.key]} onChange={e => setValues(p => ({ ...p, [f.key]: e.target.value }))}
              className="ui-input ui-input-sm" placeholder={f.placeholder} autoFocus={f === fields[0]} />
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

const DealerQueuePage = () => {
  const { data: rawData, isLoading, error, reload: refetch } = useDataSource(getDealerQueue, []);
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const filtered = rawData.filter(row => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(row.orderTicket).includes(q) ||
      String(row.accountLogin).includes(q) ||
      (row.symbol || '').toLowerCase().includes(q) ||
      (row.reason || '').toLowerCase().includes(q)
    );
  });

  const handleApprove = (row) => {
    setActionDialog({
      title: `Approve Order #${row.orderTicket}`,
      fields: [{ key: 'comment', label: 'Comment (optional)', type: 'text' }],
      onSubmit: async (v) => {
        setActionLoading(true);
        try {
          const result = await orderApprove({ ticket: row.orderTicket, comment: v.comment || undefined });
          alert(JSON.stringify(result, null, 2));
          refetch();
        } catch (err) {
          alert(`Error: ${err.message}`);
        } finally {
          setActionLoading(false);
          setActionDialog(null);
        }
      },
    });
  };

  const handleReject = (row) => {
    setActionDialog({
      title: `Reject Order #${row.orderTicket}`,
      fields: [{ key: 'comment', label: 'Reason', type: 'text', placeholder: 'e.g. invalid size' }],
      onSubmit: async (v) => {
        setActionLoading(true);
        try {
          const result = await orderReject({ ticket: row.orderTicket, comment: v.comment || undefined });
          alert(JSON.stringify(result, null, 2));
          refetch();
        } catch (err) {
          alert(`Error: ${err.message}`);
        } finally {
          setActionLoading(false);
          setActionDialog(null);
        }
      },
    });
  };

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Gavel size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Dealer Queue</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Pending orders awaiting dealer approval</p>
          </div>
        </div>
        <button className="ui-btn ui-btn-secondary ui-btn-sm flex items-center gap-1.5 mt-2 md:mt-0" onClick={refetch} disabled={isLoading}>
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="relative w-full max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
        <input type="text" placeholder="Search ticket, login, symbol…" value={search}
          onChange={e => setSearch(e.target.value)} className="ui-input ui-input-sm" style={{ paddingLeft: 32 }} />
      </div>

      <div className="ui-card flex flex-col w-full flex-1 overflow-hidden">
        {error && (
          <div className="px-4 py-2 text-xs" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}>
            <AlertTriangle size={12} className="inline mr-1" /> {error}
          </div>
        )}
        <div className="w-full overflow-x-auto flex-1">
          <table className="ui-grid min-w-max">
            <thead>
              <tr>
                <th>ID</th>
                <th>Order</th>
                <th>Login</th>
                <th>Symbol</th>
                <th>Side</th>
                <th style={{ textAlign: 'right' }}>Volume</th>
                <th style={{ textAlign: 'right' }}>Req. Price</th>
                <th>Reason</th>
                <th>Queued At</th>
                <th>Comment</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>Loading queue…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>Queue is empty</td></tr>
              ) : (
                filtered.map((row, idx) => {
                  const isBuy = (row.side || '').toLowerCase() === 'buy';
                  return (
                    <tr
                      key={row.id ?? idx}
                      onClick={() => setSelectedRow(selectedRow === row.id ? null : row.id)}
                      className={selectedRow === row.id ? 'is-selected' : ''}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="tabular" style={{ color: 'var(--text-3)' }}>{row.id}</td>
                      <td className="tabular font-mono">{row.orderTicket}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <User size={12} style={{ color: 'var(--accent)' }} />
                          <span className="tabular">{row.accountLogin}</span>
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{row.symbol}</td>
                      <td>
                        <span className={`ui-badge text-[9px] px-1 py-0 ${isBuy ? 'ui-badge-success' : 'ui-badge-danger'}`}>
                          {(row.side || '').toUpperCase()}
                        </span>
                      </td>
                      <td className="tabular" style={{ textAlign: 'right' }}>{fmt(row.volume)}</td>
                      <td className="tabular" style={{ textAlign: 'right' }}>{fmt(row.requestedPrice)}</td>
                      <td style={{ color: 'var(--text-2)' }}>{row.reason}</td>
                      <td style={{ color: 'var(--text-3)' }}>{fmtTime(row.queuedAt)}</td>
                      <td className="truncate max-w-[120px]" style={{ color: 'var(--text-3)' }}>{row.comment || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="inline-flex gap-1">
                          <button
                            className="ui-btn ui-btn-sm px-2 py-0.5 text-[10px]"
                            style={{ background: 'var(--ok-soft)', color: 'var(--ok-text)', border: '1px solid var(--ok-border)' }}
                            title="Approve"
                            onClick={e => { e.stopPropagation(); handleApprove(row); }}
                          >
                            <CheckCircle2 size={11} />
                          </button>
                          <button
                            className="ui-btn ui-btn-sm px-2 py-0.5 text-[10px]"
                            style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}
                            title="Reject"
                            onClick={e => { e.stopPropagation(); handleReject(row); }}
                          >
                            <XCircle size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center px-4 py-2.5 text-xs shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''} in queue
        </div>
      </div>

      {actionDialog && (
        <PromptDialog
          title={actionDialog.title}
          fields={actionDialog.fields}
          onSubmit={actionDialog.onSubmit}
          onCancel={() => setActionDialog(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
};

export default DealerQueuePage;
