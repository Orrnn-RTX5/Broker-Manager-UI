import { useState } from 'react';
import { X, Link, Link2Off, Search, User } from 'lucide-react';
import { ibLinkClient, ibUnlinkClient, ibClientList } from '../../../services/api';

const IBClientLinker = ({ ibLogin, onClose, onSuccess }) => {
  const [clientLogin, setClientLogin] = useState('');
  const [source, setSource]           = useState('manual');
  const [clients, setClients]         = useState(null);
  const [loadingClients, setLoadingClients] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);

  const loadClients = async () => {
    setLoadingClients(true);
    setError(null);
    try {
      const data = await ibClientList(ibLogin);
      setClients(Array.isArray(data) ? data : data?.answer || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingClients(false);
    }
  };

  const handleLink = async () => {
    if (!clientLogin) { setError('Client login is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await ibLinkClient({ ib_login: ibLogin, client_login: Number(clientLogin), source: source || 'manual' });
      setClientLogin('');
      onSuccess?.();
      loadClients();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (cl) => {
    if (!window.confirm(`Unlink client ${cl.client_login} from IB ${ibLogin}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await ibUnlinkClient(cl.client_login);
      onSuccess?.();
      loadClients();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const fmtTime = (unix) => unix ? new Date(unix * 1000).toLocaleDateString() : '—';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="ui-card flex flex-col" style={{ width: 500, maxHeight: '85vh', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2">
            <Link size={15} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Client Linker — IB {ibLogin}</span>
          </div>
          <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
          {error && (
            <div className="text-xs px-3 py-2 rounded" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>{error}</div>
          )}

          {/* Link new client */}
          <div className="ui-card p-3 flex flex-col gap-3">
            <h4 className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Link New Client</h4>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Client login"
                value={clientLogin}
                onChange={e => setClientLogin(e.target.value)}
                className="ui-input ui-input-sm flex-1"
              />
              <select value={source} onChange={e => setSource(e.target.value)} className="ui-input ui-input-sm" style={{ width: 130 }}>
                <option value="manual">manual</option>
                <option value="referral_code">referral_code</option>
                <option value="manager">manager</option>
              </select>
              <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleLink} disabled={saving}>
                <Link size={12} /> Link
              </button>
            </div>
          </div>

          {/* Existing clients */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Linked Clients</span>
            <button className="ui-btn ui-btn-secondary ui-btn-sm flex items-center gap-1" onClick={loadClients} disabled={loadingClients}>
              <Search size={11} /> {loadingClients ? 'Loading…' : 'Load'}
            </button>
          </div>

          {clients === null ? (
            <div className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}>Click Load to view linked clients.</div>
          ) : clients.length === 0 ? (
            <div className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}>No clients linked yet.</div>
          ) : (
            <table className="ui-grid">
              <thead>
                <tr>
                  <th>Client Login</th>
                  <th>Source</th>
                  <th>Linked At</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(cl => (
                  <tr key={cl.client_login}>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <User size={12} style={{ color: 'var(--accent)' }} />
                        <span className="tabular font-mono">{cl.client_login}</span>
                      </span>
                    </td>
                    <td><span className="ui-badge ui-badge-neutral text-[9px]">{cl.link_source}</span></td>
                    <td className="tabular text-xs" style={{ color: 'var(--text-3)' }}>{fmtTime(cl.linked_at)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="ui-btn ui-btn-ghost ui-btn-sm px-1.5" title="Unlink" onClick={() => handleUnlink(cl)} disabled={saving}>
                        <Link2Off size={12} style={{ color: 'var(--danger-text)' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default IBClientLinker;
