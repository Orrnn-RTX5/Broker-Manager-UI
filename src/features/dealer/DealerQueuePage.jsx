import { showResult } from '../../store/resultDialogStore.js';
import { useEffect, useState } from 'react';
import { useI18nStore } from '../../i18n/index.js';
import { Search, AlertTriangle, User, CheckCircle2, XCircle } from 'lucide-react';
import { getDealerQueue, orderApprove, orderReject } from '../../services/tradeApi';
import useDataSource from '../../hooks/useDataSource';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';
import GridLoadingState from '../../components/GridLoadingState';

const DEALER_QUEUE_REFRESH_MS = 4000;

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtTime = (unix, language) => {
  if (!unix) return '—';
  const d = new Date(unix * 1000);
  return d.toLocaleString(language === 'en' ? 'en-US' : language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  const language = useI18nStore((state) => state.language);
  const { data: rawData, isLoading, error, reload: refetch } = useDataSource(
    getDealerQueue,
    [],
    { pollingInterval: DEALER_QUEUE_REFRESH_MS },
  );
  const { canAct } = usePermissions();
  const canDeal = canAct(PERMISSIONS.DEALER_QUEUE);
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [hasSettledInitialLoad, setHasSettledInitialLoad] = useState(false);

  // Polling stays invisible after the first response so an empty queue does not
  // flash back to a loading skeleton every four seconds.
  useEffect(() => {
    if (!isLoading && !hasSettledInitialLoad) setHasSettledInitialLoad(true);
  }, [hasSettledInitialLoad, isLoading]);

  const showInitialLoading = isLoading && !hasSettledInitialLoad;

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
    if (!canDeal) { showResult.error('Your role does not have permission to act on the dealer queue.'); return; }
    setActionDialog({
      title: `Approve Order #${row.orderTicket}`,
      fields: [{ key: 'comment', label: 'Comment (optional)', type: 'text' }],
      onSubmit: async (v) => {
        setActionLoading(true);
        try {
          const result = await orderApprove({ ticket: row.orderTicket, comment: v.comment || undefined });
          showResult(result);
          refetch();
        } catch (err) {
          showResult.error(`Error: ${err.message}`);
        } finally {
          setActionLoading(false);
          setActionDialog(null);
        }
      },
    });
  };

  const handleReject = (row) => {
    if (!canDeal) { showResult.error('Your role does not have permission to act on the dealer queue.'); return; }
    setActionDialog({
      title: `Reject Order #${row.orderTicket}`,
      fields: [{ key: 'comment', label: 'Reason', type: 'text', placeholder: 'e.g. invalid size' }],
      onSubmit: async (v) => {
        setActionLoading(true);
        try {
          const result = await orderReject({ ticket: row.orderTicket, comment: v.comment || undefined });
          showResult(result);
          refetch();
        } catch (err) {
          showResult.error(`Error: ${err.message}`);
        } finally {
          setActionLoading(false);
          setActionDialog(null);
        }
      },
    });
  };

  return (
    <div className="dealer-queue-page p-3 w-full h-full min-h-0 flex flex-col gap-2 overflow-hidden">
      <div className="dealer-queue-header shrink-0">
        <div className="dealer-queue-heading min-w-0">
          <h1 className="dealer-queue-title text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Dealer Queue</h1>
          <p className="dealer-queue-subtitle text-[10px]" style={{ color: 'var(--text-3)' }}>Pending orders awaiting dealer approval · updates every 4 seconds</p>
        </div>
      </div>

      <div className="dealer-queue-search relative w-full max-w-xs shrink-0">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
        <input type="text" placeholder="Search ticket, login, symbol…" value={search}
          onChange={e => setSearch(e.target.value)} className="ui-input ui-input-sm" style={{ paddingLeft: 32 }} />
      </div>

      <div className="dealer-queue-grid ui-card flex flex-col w-full flex-1 min-h-0 overflow-hidden">
        {error && (
          <div className="dealer-queue-error px-4 py-2 text-[10px]" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}>
            <AlertTriangle size={12} className="inline mr-1" /> {error}
          </div>
        )}
        {showInitialLoading ? (
          <GridLoadingState label="Loading dealer queue…" />
        ) : (
        <div className="dealer-queue-table-shell relative w-full flex-1 min-h-0">
          <div className="dealer-queue-scroll w-full h-full overflow-auto">
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
              {filtered.length > 0 && (
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
                        <span className={`ui-badge text-[10px] px-1 py-0 ${isBuy ? 'ui-badge-success' : 'ui-badge-danger'}`}>
                          {(row.side || '').toUpperCase()}
                        </span>
                      </td>
                      <td className="tabular" style={{ textAlign: 'right' }}>{fmt(row.volume)}</td>
                      <td className="tabular" style={{ textAlign: 'right' }}>{fmt(row.requestedPrice)}</td>
                      <td style={{ color: 'var(--text-2)' }}>{row.reason}</td>
                      <td style={{ color: 'var(--text-3)' }}>{fmtTime(row.queuedAt, language)}</td>
                      <td className="truncate max-w-[120px]" style={{ color: 'var(--text-3)' }}>{row.comment || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="inline-flex gap-1">
                          <button
                            className="ui-btn ui-btn-sm px-2 py-0.5 text-[10px]"
                            style={{ background: 'var(--ok-soft)', color: 'var(--ok-text)', border: '1px solid var(--ok-border)' }}
                            title={canDeal ? 'Approve' : 'No permission to act on the dealer queue'}
                            disabled={!canDeal}
                            onClick={e => { e.stopPropagation(); handleApprove(row); }}
                          >
                            <CheckCircle2 size={11} />
                          </button>
                          <button
                            className="ui-btn ui-btn-sm px-2 py-0.5 text-[10px]"
                            style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}
                            title={canDeal ? 'Reject' : 'No permission to act on the dealer queue'}
                            disabled={!canDeal}
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
          {filtered.length === 0 && (
            <div className="dealer-queue-empty-state" style={{ color: 'var(--muted)' }}>
              {rawData.length === 0 ? (
                'Queue is empty'
              ) : (
                <span className="inline-flex items-center gap-2">
                  No queued orders match “{search}”.
                  <button className="ui-btn ui-btn-secondary ui-btn-xs" onClick={() => setSearch('')}>Clear search</button>
                </span>
              )}
            </div>
          )}
        </div>
        )}

        <div className="dealer-queue-footer flex items-center px-4 py-2.5 text-[10px] shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}>
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
