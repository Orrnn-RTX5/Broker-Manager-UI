import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Link, Link2Off, Loader, RefreshCw, User, X } from 'lucide-react';
import ibApi from '../../../services/ibApi';
import {
  normalizeRecords,
  validateClientLinkInput,
} from '../ibDomain';

const fmtDate = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '-';
  return new Date(number > 1_000_000_000_000 ? number : number * 1000).toLocaleString();
};

const IBClientLinker = ({ ibLogin, onClose, onSuccess }) => {
  const [clientLogin, setClientLogin] = useState('');
  const [source, setSource] = useState('manual');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ibApi.directClients(ibLogin);
      setClients(normalizeRecords(data, ['clients']));
    } catch (err) {
      setClients([]);
      setError(err.message || 'Failed to load linked clients.');
    } finally {
      setLoading(false);
    }
  }, [ibLogin]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleLink = async () => {
    const errors = validateClientLinkInput({ ib_login: ibLogin, client_login: clientLogin });
    if (errors.length) {
      setError(errors[0]);
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await ibApi.linkClient({
        ib_login: Number(ibLogin),
        client_login: Number(clientLogin),
        source: source || 'manual',
      });
      setClientLogin('');
      setNotice('Client linked successfully.');
      onSuccess?.();
      loadClients();
    } catch (err) {
      setError(err.message || 'Failed to link client.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (client) => {
    if (!window.confirm(`Unlink client ${client.client_login} from IB ${ibLogin}?`)) return;

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await ibApi.unlinkClient(client.client_login);
      setNotice('Client unlinked successfully.');
      onSuccess?.();
      loadClients();
    } catch (err) {
      setError(err.message || 'Failed to unlink client.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="ui-card flex flex-col" style={{ width: 560, maxHeight: '88vh', boxShadow: 'var(--shadow-lg)' }}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2">
            <Link size={15} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Client links - IB {ibLogin}</span>
          </div>
          <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <div className="text-xs px-3 py-2 rounded flex items-center gap-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
              <AlertTriangle size={13} /> {error}
            </div>
          )}
          {notice && (
            <div className="text-xs px-3 py-2 rounded" style={{ background: 'var(--ok-soft)', color: 'var(--ok-text)' }}>
              {notice}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_auto] gap-2">
            <input
              type="number"
              placeholder="Client login"
              value={clientLogin}
              onChange={(event) => setClientLogin(event.target.value)}
              className="ui-input ui-input-sm"
            />
            <select value={source} onChange={(event) => setSource(event.target.value)} className="ui-input ui-input-sm">
              <option value="manual">manual</option>
              <option value="referral_code">referral_code</option>
              <option value="manager">manager</option>
            </select>
            <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleLink} disabled={saving}>
              {saving ? <Loader size={12} className="animate-spin" /> : <Link size={12} />}
              Link
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Direct clients</span>
            <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={loadClients} disabled={loading}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="ui-grid min-w-max">
              <thead>
                <tr>
                  <th>Client Login</th>
                  <th>IB Login</th>
                  <th>Source</th>
                  <th>Linked At</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>Loading clients...</td></tr>
                ) : clients.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>No direct clients linked.</td></tr>
                ) : clients.map((client) => (
                  <tr key={`${client.client_login}-${client.linked_at || ''}`}>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <User size={12} style={{ color: 'var(--accent)' }} />
                        <span className="tabular font-mono">{client.client_login}</span>
                      </span>
                    </td>
                    <td className="tabular">{client.ib_login}</td>
                    <td><span className="ui-status ui-status-neutral">{client.link_source || '-'}</span></td>
                    <td className="tabular text-xs" style={{ color: 'var(--text-3)' }}>{fmtDate(client.linked_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={() => handleUnlink(client)} disabled={saving} title="Unlink client">
                        <Link2Off size={13} style={{ color: 'var(--danger-text)' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default IBClientLinker;
