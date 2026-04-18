import { useState, useEffect } from 'react';
import {
  X, User, BarChart3, List, DollarSign, Link, Plus, Trash2,
  RefreshCw, Loader, AlertTriangle, CheckCircle2, Download
} from 'lucide-react';
import {
  ibGet, ibUpdate, ibStats, ibPlanList, ibPlanCreate,
  ibClientListAll, ibCommissions,
} from '../../../services/api';
import IBPayoutModal from './IBPayoutModal';
import IBClientLinker from './IBClientLinker';
import { rowsToCSV, downloadBlob, stampedFilename } from '../../../utils/gridUtils';

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (unix) => unix ? new Date(unix * 1000).toLocaleDateString() : '—';
const fmtTs   = (unix) => unix ? new Date(unix * 1000).toLocaleString()    : '—';

const STATUS_BADGE = {
  active:   'ui-badge-success',
  approved: 'ui-badge-info',
  pending:  'ui-badge-warn',
  removed:  'ui-badge-danger',
};

const today      = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';

const TABS = ['Overview', 'Plans', 'Clients', 'Commissions'];

// ── Sub-components ────────────────────────────────────────────────────────────

const KV = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label}</span>
    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{value ?? '—'}</span>
  </div>
);

const SectionHeader = ({ title }) => (
  <div className="text-[10px] font-semibold uppercase tracking-wider pb-1 mb-2"
    style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
    {title}
  </div>
);

// ── Overview Tab ──────────────────────────────────────────────────────────────
const OverviewTab = ({ ib, stats, statsLoading, onUpdate, onRefresh }) => {
  const [notes, setNotes] = useState(ib?.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await ibUpdate({ login: ib.login, notes });
      onRefresh();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card p-3">
        <SectionHeader title="IB Info" />
        <div className="grid grid-cols-2 gap-3">
          <KV label="Login"         value={<span className="tabular font-mono">{ib?.login}</span>} />
          <KV label="Parent IB"     value={ib?.parent_ib_login ?? 'Top-level'} />
          <KV label="Level"         value={ib?.level} />
          <KV label="Status"        value={<span className={`ui-badge ${STATUS_BADGE[ib?.status] || 'ui-badge-neutral'}`}>{ib?.status}</span>} />
          <KV label="Company"       value={ib?.company_name} />
          <KV label="Website"       value={ib?.website} />
          <KV label="Referral Code" value={<span className="tabular font-mono">{ib?.referral_code}</span>} />
          <KV label="Clients"       value={ib?.client_count} />
          <KV label="Unpaid Total"  value={<span style={{ color: ib?.unpaid_total > 0 ? 'var(--warn-text)' : 'var(--text)' }}>{fmt(ib?.unpaid_total)}</span>} />
          <KV label="Approved At"   value={fmtDate(ib?.approved_at)} />
          <KV label="Created At"    value={fmtDate(ib?.created_at)} />
        </div>
      </div>

      <div className="ui-card p-3">
        <SectionHeader title="Stats (this month)" />
        {statsLoading ? (
          <div className="flex justify-center py-4"><Loader size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <KV label="Total Clients"   value={stats?.client_count} />
            <KV label="Active Clients"  value={stats?.active_clients} />
            <KV label="Total Lots"      value={stats?.total_lots != null ? fmt(stats.total_lots) : '—'} />
            <KV label="Total Commission" value={<span style={{ color: 'var(--ok-text)' }}>{stats?.total_commissions != null ? fmt(stats.total_commissions) : '—'}</span>} />
          </div>
        )}
      </div>

      <div className="ui-card p-3">
        <SectionHeader title="Notes" />
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="ui-input ui-input-sm w-full"
          rows={3}
          style={{ resize: 'vertical' }}
        />
        <div className="flex justify-end mt-2">
          <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Notes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Plans Tab ─────────────────────────────────────────────────────────────────
const PlansTab = ({ login }) => {
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    plan_name: '', commission_type: 'per_lot', rate: '', override_rate: '',
    symbol_filter: '', group_filter: '', min_lots: '0.01', max_lots: '100', enabled: true,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ibPlanList(login);
      setPlans(Array.isArray(data) ? data : data?.answer || []);
    } catch (err) {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [login]);

  const handleCreate = async () => {
    if (!form.plan_name) { alert('Plan name is required.'); return; }
    setSaving(true);
    try {
      await ibPlanCreate({
        ib_login: login,
        plan_name: form.plan_name,
        commission_type: form.commission_type,
        rate: Number(form.rate),
        override_rate: Number(form.override_rate),
        symbol_filter: form.symbol_filter,
        group_filter: form.group_filter,
        min_lots: Number(form.min_lots),
        max_lots: Number(form.max_lots),
        enabled: form.enabled,
      });
      setShowCreate(false);
      load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button className="ui-btn ui-btn-primary ui-btn-sm flex items-center gap-1" onClick={() => setShowCreate(s => !s)}>
          <Plus size={12} /> {showCreate ? 'Cancel' : 'New Plan'}
        </button>
      </div>

      {showCreate && (
        <div className="ui-card p-3 flex flex-col gap-3" style={{ borderColor: 'var(--accent-soft)' }}>
          <h4 className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Create Commission Plan</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Plan Name', 'plan_name', 'text'],
              ['Rate', 'rate', 'number'],
              ['Override Rate', 'override_rate', 'number'],
              ['Symbol Filter (CSV)', 'symbol_filter', 'text'],
              ['Group Filter', 'group_filter', 'text'],
              ['Min Lots', 'min_lots', 'number'],
              ['Max Lots', 'max_lots', 'number'],
            ].map(([label, key, type]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label}</label>
                <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} className="ui-input ui-input-sm" />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-[10px]" style={{ color: 'var(--text-3)' }}>Commission Type</label>
              <select value={form.commission_type} onChange={e => set('commission_type', e.target.value)} className="ui-input ui-input-sm">
                <option value="per_lot">per_lot</option>
                <option value="per_deal">per_deal</option>
                <option value="percentage">percentage</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} id="plan-enabled" />
              <label htmlFor="plan-enabled" className="text-xs" style={{ color: 'var(--text-2)' }}>Enabled</label>
            </div>
          </div>
          <div className="flex justify-end">
            <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create Plan'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
      ) : !plans || plans.length === 0 ? (
        <div className="text-xs text-center py-8" style={{ color: 'var(--muted)' }}>No plans configured.</div>
      ) : (
        <table className="ui-grid">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Rate</th>
              <th style={{ textAlign: 'right' }}>Override</th>
              <th>Symbols</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {plans.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.plan_name}</td>
                <td><span className="ui-badge ui-badge-neutral text-[9px]">{p.commission_type}</span></td>
                <td className="tabular" style={{ textAlign: 'right' }}>{fmt(p.rate)}</td>
                <td className="tabular" style={{ textAlign: 'right' }}>{fmt(p.override_rate)}</td>
                <td style={{ color: 'var(--text-3)' }}>{p.symbol_filter || 'All'}</td>
                <td>
                  <span className={`ui-badge text-[9px] ${p.enabled ? 'ui-badge-success' : 'ui-badge-neutral'}`}>
                    {p.enabled ? 'ON' : 'OFF'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ── Clients Tab ───────────────────────────────────────────────────────────────
const ClientsTab = ({ login, onOpenLinker }) => {
  const [clients, setClients] = useState(null);
  const [loading, setLoading] = useState(false);
  const [includeAll, setIncludeAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = includeAll ? await ibClientListAll(login) : await ibClientListAll(login);
      setClients(Array.isArray(data) ? data : data?.answer || []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [login, includeAll]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-2)' }}>
            <input type="checkbox" checked={includeAll} onChange={e => setIncludeAll(e.target.checked)} />
            Include sub-IB clients
          </label>
        </div>
        <div className="flex gap-1">
          <button className="ui-btn ui-btn-secondary ui-btn-sm flex items-center gap-1" onClick={load} disabled={loading}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="ui-btn ui-btn-primary ui-btn-sm flex items-center gap-1" onClick={onOpenLinker}>
            <Link size={11} /> Manage Links
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
      ) : !clients || clients.length === 0 ? (
        <div className="text-xs text-center py-8" style={{ color: 'var(--muted)' }}>No linked clients.</div>
      ) : (
        <table className="ui-grid">
          <thead>
            <tr>
              <th>Client Login</th>
              <th>IB Login</th>
              <th>Source</th>
              <th>Linked At</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c, i) => (
              <tr key={`${c.client_login}-${i}`}>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <User size={12} style={{ color: 'var(--accent)' }} />
                    <span className="tabular font-mono">{c.client_login}</span>
                  </span>
                </td>
                <td className="tabular" style={{ color: 'var(--text-3)' }}>{c.ib_login}</td>
                <td><span className="ui-badge ui-badge-neutral text-[9px]">{c.link_source}</span></td>
                <td className="tabular text-xs" style={{ color: 'var(--text-3)' }}>{fmtDate(c.linked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ── Commissions Tab ───────────────────────────────────────────────────────────
const CommissionsTab = ({ login, onOpenPayout }) => {
  const [rows, setRows]   = useState(null);
  const [from, setFrom]   = useState(monthStart());
  const [to, setTo]       = useState(today());
  const [paidFilter, setPaidFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ibCommissions({ login, from, to, paid: paidFilter === '' ? undefined : paidFilter === 'true' });
      setRows(Array.isArray(data) ? data : data?.answer || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!rows?.length) return;
    const cols = [
      { key: 'id' }, { key: 'client_login' }, { key: 'deal_ticket' }, { key: 'symbol' },
      { key: 'lots' }, { key: 'commission_type' }, { key: 'commission_amount' },
      { key: 'override_amount' }, { key: 'total_amount' }, { key: 'paid' }, { key: 'paid_at' },
    ];
    const csv = rowsToCSV(rows, cols);
    downloadBlob(csv, stampedFilename(`ib-${login}-commissions`, 'csv'));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px]" style={{ color: 'var(--text-3)' }}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ui-input ui-input-sm" style={{ width: 130 }} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px]" style={{ color: 'var(--text-3)' }}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="ui-input ui-input-sm" style={{ width: 130 }} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px]" style={{ color: 'var(--text-3)' }}>Paid</label>
          <select value={paidFilter} onChange={e => setPaidFilter(e.target.value)} className="ui-input ui-input-sm" style={{ width: 100 }}>
            <option value="">All</option>
            <option value="false">Unpaid</option>
            <option value="true">Paid</option>
          </select>
        </div>
        <button className="ui-btn ui-btn-secondary ui-btn-sm flex items-center gap-1" onClick={load} disabled={loading}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Load
        </button>
        {rows?.length > 0 && (
          <button className="ui-btn ui-btn-ghost ui-btn-sm flex items-center gap-1" onClick={handleExport}>
            <Download size={11} /> CSV
          </button>
        )}
        <button className="ui-btn ui-btn-primary ui-btn-sm flex items-center gap-1 ml-auto"
          style={{ background: 'var(--ok)', color: 'white' }} onClick={onOpenPayout}>
          <DollarSign size={11} /> Pay Out
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
      ) : rows === null ? (
        <div className="text-xs text-center py-8" style={{ color: 'var(--muted)' }}>Select a date range and click Load.</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-center py-8" style={{ color: 'var(--muted)' }}>No commissions found.</div>
      ) : (
        <table className="ui-grid min-w-max">
          <thead>
            <tr>
              <th>ID</th>
              <th>Client</th>
              <th>Deal</th>
              <th>Symbol</th>
              <th style={{ textAlign: 'right' }}>Lots</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Commission</th>
              <th style={{ textAlign: 'right' }}>Override</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="tabular" style={{ color: 'var(--text-3)' }}>{r.id}</td>
                <td className="tabular font-mono">{r.client_login}</td>
                <td className="tabular" style={{ color: 'var(--text-3)' }}>{r.deal_ticket}</td>
                <td style={{ fontWeight: 500 }}>{r.symbol}</td>
                <td className="tabular" style={{ textAlign: 'right' }}>{fmt(r.lots)}</td>
                <td><span className="ui-badge ui-badge-neutral text-[9px]">{r.commission_type}</span></td>
                <td className="tabular" style={{ textAlign: 'right' }}>{fmt(r.commission_amount)}</td>
                <td className="tabular" style={{ textAlign: 'right', color: 'var(--text-3)' }}>{fmt(r.override_amount)}</td>
                <td className="tabular font-semibold" style={{ textAlign: 'right', color: 'var(--ok-text)' }}>{fmt(r.total_amount)}</td>
                <td>
                  <span className={`ui-badge text-[9px] ${r.paid ? 'ui-badge-success' : 'ui-badge-warn'}`}>
                    {r.paid ? 'PAID' : 'UNPAID'}
                  </span>
                </td>
                <td className="tabular text-xs" style={{ color: 'var(--text-3)' }}>{fmtDate(r.calculated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ── Main Drawer ───────────────────────────────────────────────────────────────
const IBDetailDrawer = ({ login, onClose, onRefresh }) => {
  const [ib, setIb]               = useState(null);
  const [stats, setStats]         = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [showPayout, setShowPayout]   = useState(false);
  const [showLinker, setShowLinker]   = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ibGet(login);
      setIb(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const s = await ibStats({ login, from: monthStart(), to: today() });
      setStats(s);
    } catch { /* non-critical */ }
    finally { setStatsLoading(false); }
  };

  useEffect(() => { load(); loadStats(); }, [login]);

  return (
    <>
      {/* Drawer backdrop */}
      <div className="fixed inset-0 z-[8000]" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />

      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 h-full flex flex-col z-[8001]"
        style={{ width: 560, background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-2xl)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2">
            <User size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                IB {login}
                {ib?.company_name && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-3)' }}>{ib.company_name}</span>}
              </div>
              {ib && <div className="text-[10px]" style={{ color: 'var(--muted)' }}>Referral: {ib.referral_code}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={() => { load(); loadStats(); }} title="Refresh">
              <RefreshCw size={13} />
            </button>
            <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className="px-4 py-2.5 text-xs font-medium transition-colors"
              style={{
                color: activeTab === t ? 'var(--accent-text)' : 'var(--text-3)',
                borderBottom: activeTab === t ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'transparent',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex justify-center py-16"><Loader size={20} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded text-xs" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {!loading && !error && (
            <>
              {activeTab === 'Overview'    && <OverviewTab ib={ib} stats={stats} statsLoading={statsLoading} onRefresh={load} />}
              {activeTab === 'Plans'       && <PlansTab login={login} />}
              {activeTab === 'Clients'     && <ClientsTab login={login} onOpenLinker={() => setShowLinker(true)} />}
              {activeTab === 'Commissions' && <CommissionsTab login={login} onOpenPayout={() => setShowPayout(true)} />}
            </>
          )}
        </div>
      </div>

      {showPayout && <IBPayoutModal login={login} onClose={() => setShowPayout(false)} onSuccess={() => { setShowPayout(false); load(); }} />}
      {showLinker && <IBClientLinker ibLogin={login} onClose={() => setShowLinker(false)} onSuccess={onRefresh} />}
    </>
  );
};

export default IBDetailDrawer;
