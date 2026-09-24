import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  GitBranch,
  Link,
  Loader,
  Plus,
  RefreshCw,
  Trash2,
  User,
  X,
} from 'lucide-react';
import ibApi from '../../../services/ibApi';
import { rowsToCSV, downloadBlob, stampedFilename } from '../../../utils/gridUtils';
import { usePermissions } from '../../../hooks/usePermissions';
import { PERMISSIONS } from '../../../utils/permissions';
import IBClientLinker from './IBClientLinker';
import IBCreateModal from './IBCreateModal';
import {
  IB_COMMISSION_TYPES,
  buildCommissionPlanPayload,
  canRemoveIB,
  emptyToNull,
  getIBStatusActions,
  isEligibleIBParent,
  normalizeIBAccount,
  normalizeIBCommission,
  normalizeIBPlan,
  normalizeIBTreeNode,
  normalizeObject,
  normalizeRecords,
  validateCommissionPlanInput,
} from '../ibDomain';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'tree', label: 'Tree' },
  { id: 'clients', label: 'Clients' },
  { id: 'plans', label: 'Plans' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'stats', label: 'Stats' },
];

const STATUS_BADGE = {
  active: 'ui-status-ok',
  approved: 'ui-status-info',
  pending: 'ui-status-warn',
  suspended: 'ui-status-neutral',
  rejected: 'ui-status-danger',
  removed: 'ui-status-danger',
  accrued: 'ui-status-neutral',
  pending_review: 'ui-status-warn',
  paid: 'ui-status-ok',
};

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

const fmt = (value) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtDate = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '-';
  return new Date(number > 1_000_000_000_000 ? number : number * 1000).toLocaleString();
};

const StatusBadge = ({ status }) => (
  <span className={`ui-status ${STATUS_BADGE[status] || 'ui-status-neutral'}`}>
    {String(status || '-').toUpperCase()}
  </span>
);

const AlertBox = ({ tone = 'danger', children }) => (
  <div
    className="text-xs px-3 py-2 rounded flex items-start gap-2"
    style={{
      background: tone === 'success' ? 'var(--ok-soft)' : 'var(--danger-soft)',
      color: tone === 'success' ? 'var(--ok-text)' : 'var(--danger-text)',
    }}
  >
    {tone === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
    <span>{children}</span>
  </div>
);

const KV = ({ label, value }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>{label}</span>
    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{value ?? '-'}</span>
  </div>
);

const SectionTitle = ({ children }) => (
  <div className="text-[10px] font-semibold uppercase pb-1 mb-2" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
    {children}
  </div>
);

const EmptyState = ({ children }) => (
  <div className="text-center py-10 text-sm" style={{ color: 'var(--muted)' }}>{children}</div>
);

const normalizeStats = (response) => normalizeObject(response, ['stats']) || {};
const defaultLedgerFilters = () => ({ from: monthStart(), to: today(), paid: '', status: '', client_login: '', symbol: '' });

const ProfileTab = ({ ib, actionBusy, canManageIB, onStatusAction, onRemove, onSaveNotes }) => {
  const [notes, setNotes] = useState(ib?.notes || '');
  const [saving, setSaving] = useState(false);
  const actions = getIBStatusActions(ib?.status);
  const removable = canRemoveIB(ib);

  useEffect(() => {
    setNotes(ib?.notes || '');
  }, [ib?.notes, ib?.login]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveNotes(notes);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card p-3">
        <SectionTitle>IB info</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <KV label="Login" value={<span className="tabular font-mono">{ib?.login}</span>} />
          <KV label="Status" value={<StatusBadge status={ib?.status} />} />
          <KV label="Parent IB" value={ib?.parent_ib_login || 'Top-level'} />
          <KV label="Level" value={ib?.level} />
          <KV label="Company" value={ib?.company_name || '-'} />
          <KV label="Website" value={ib?.website || '-'} />
          <KV label="Referral Code" value={<span className="tabular font-mono">{ib?.referral_code || '-'}</span>} />
          <KV label="Clients" value={ib?.client_count ?? 0} />
          <KV label="Unpaid Total" value={<span className="tabular">{fmt(ib?.unpaid_total)}</span>} />
          <KV label="Approved At" value={fmtDate(ib?.approved_at)} />
          <KV label="Created At" value={fmtDate(ib?.created_at)} />
        </div>
      </div>

      <div className="ui-card p-3">
        <SectionTitle>Status actions</SectionTitle>
        {actions.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>No normal workflow actions are available for this status.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button key={action} className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onStatusAction(action)} disabled={actionBusy}>
                {actionBusy ? <Loader size={13} className="animate-spin" /> : null}
                {action}
              </button>
            ))}
          </div>
        )}
      </div>

      {removable && (
        <div className="ui-card p-3">
          <SectionTitle>Remove IB</SectionTitle>
          <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>
            Soft remove archives this IB and keeps historical records visible for audit.
          </p>
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={onRemove} disabled={!canManageIB || actionBusy}>
            {actionBusy ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} style={{ color: 'var(--danger-text)' }} />}
            Remove IB
          </button>
        </div>
      )}

      <div className="ui-card p-3">
        <SectionTitle>Notes</SectionTitle>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="ui-input ui-input-sm w-full" rows={4} />
        <div className="flex justify-end mt-2">
          <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : null}
            Save notes
          </button>
        </div>
      </div>
    </div>
  );
};

const TreeNode = ({ node, onCreateChild }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const canCreateChild = isEligibleIBParent(node);

  return (
    <div className="pl-3" style={{ borderLeft: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 py-1.5">
        <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-xs" onClick={() => setExpanded((value) => !value)} disabled={!hasChildren}>
          {hasChildren ? (expanded ? '-' : '+') : ''}
        </button>
        <GitBranch size={13} style={{ color: 'var(--accent)' }} />
        <span className="tabular font-mono text-xs">{node.login}</span>
        <span className="text-xs" style={{ color: 'var(--text-2)' }}>{node.company_name || '-'}</span>
        <StatusBadge status={node.status} />
        <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>Lv.{node.level} - {node.client_count} clients</span>
        {canCreateChild && (
          <button className="ui-btn ui-btn-ghost ui-btn-xs" onClick={() => onCreateChild(node.login)}>
            <Plus size={11} /> Sub-IB
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="ml-3">
          {node.children.map((child) => <TreeNode key={child.login} node={child} onCreateChild={onCreateChild} />)}
        </div>
      )}
    </div>
  );
};

const findTreeNode = (node, login) => {
  if (!node) return null;
  if (String(node.login) === String(login)) return node;
  for (const child of node.children || []) {
    const match = findTreeNode(child, login);
    if (match) return match;
  }
  return null;
};

const TreeTab = ({ login, onCreateChild }) => {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await ibApi.tree(login);
      const fullTree = normalizeIBTreeNode(normalizeObject(response, ['tree']) || response);
      setTree(findTreeNode(fullTree, login) || fullTree);
    } catch (err) {
      setTree(null);
      setError(err.message || 'Failed to load IB tree.');
    } finally {
      setLoading(false);
    }
  }, [login]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh tree
        </button>
      </div>
      {error && <AlertBox>{error}</AlertBox>}
      <div className="ui-card p-3 overflow-auto">
        {loading ? <EmptyState>Loading tree...</EmptyState> : tree ? <TreeNode node={tree} onCreateChild={onCreateChild} /> : <EmptyState>No tree data.</EmptyState>}
      </div>
    </div>
  );
};

const ClientsTab = ({ login, onOpenLinker }) => {
  const [mode, setMode] = useState('direct');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = mode === 'all' ? await ibApi.allClients(login) : await ibApi.directClients(login);
      setClients(normalizeRecords(response, ['clients']));
    } catch (err) {
      setClients([]);
      setError(err.message || 'Failed to load clients.');
    } finally {
      setLoading(false);
    }
  }, [login, mode]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {[
            ['direct', 'Direct clients'],
            ['all', 'All downline clients'],
          ].map(([value, label]) => (
            <button key={value} className={`ui-btn ui-btn-sm ${mode === value ? 'ui-btn-primary' : 'ui-btn-ghost'}`} onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button>
          <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={onOpenLinker}><Link size={13} /> Manage links</button>
        </div>
      </div>
      {error && <AlertBox>{error}</AlertBox>}
      <div className="overflow-x-auto">
        <table className="ui-grid min-w-max">
          <thead>
            <tr><th>Client Login</th><th>IB Login</th><th>Source</th><th>Linked At</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4}><EmptyState>Loading clients...</EmptyState></td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={4}><EmptyState>No linked clients.</EmptyState></td></tr>
            ) : clients.map((client, index) => (
              <tr key={`${client.client_login}-${index}`}>
                <td className="tabular font-mono">{client.client_login}</td>
                <td className="tabular">{client.ib_login}</td>
                <td><span className="ui-status ui-status-neutral">{client.link_source || '-'}</span></td>
                <td className="tabular text-xs" style={{ color: 'var(--text-3)' }}>{fmtDate(client.linked_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const planFormDefaults = (login) => ({
  ib_login: login,
  plan_name: '',
  commission_type: 'per_lot',
  rate: '',
  override_rate: 0,
  symbol_filter: '',
  group_filter: '',
  min_lots: 0,
  max_lots: 0,
  enabled: true,
});

const PlansTab = ({ login }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await ibApi.listPlans(login);
      setPlans(normalizeRecords(response, ['plans'])
        .map(normalizeIBPlan)
        .filter((plan) => !plan.ib_login || String(plan.ib_login) === String(login)));
    } catch (err) {
      setPlans([]);
      setError(err.message || 'Failed to load commission plans.');
    } finally {
      setLoading(false);
    }
  }, [login]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const savePlan = async () => {
    const errors = validateCommissionPlanInput(form);
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = buildCommissionPlanPayload(form, login);
      await ibApi.createPlan(payload);
      setForm(null);
      setNotice('Commission plan saved.');
      load();
    } catch (err) {
      setError(err.message || 'Failed to save commission plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <AlertBox>{error}</AlertBox>}
      {notice && <AlertBox tone="success">{notice}</AlertBox>}
      <div className="flex justify-end">
        <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setForm(planFormDefaults(login))}><Plus size={13} /> New plan</button>
      </div>

      {form && (
        <div className="ui-card p-3 flex flex-col gap-3">
          <SectionTitle>Create plan</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <input className="ui-input ui-input-sm" placeholder="Plan name" value={form.plan_name} onChange={(event) => setField('plan_name', event.target.value)} />
            <select className="ui-input ui-input-sm" value={form.commission_type} onChange={(event) => setField('commission_type', event.target.value)}>
              {IB_COMMISSION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input className="ui-input ui-input-sm" type="number" placeholder="Rate" value={form.rate} onChange={(event) => setField('rate', event.target.value)} />
            <input className="ui-input ui-input-sm" type="number" placeholder="Override rate" value={form.override_rate} onChange={(event) => setField('override_rate', event.target.value)} />
            <input className="ui-input ui-input-sm" placeholder="Symbol filter" value={form.symbol_filter} onChange={(event) => setField('symbol_filter', event.target.value)} />
            <input className="ui-input ui-input-sm" placeholder="Group filter" value={form.group_filter} onChange={(event) => setField('group_filter', event.target.value)} />
            <input className="ui-input ui-input-sm" type="number" placeholder="Min lots" value={form.min_lots} onChange={(event) => setField('min_lots', event.target.value)} />
            <input className="ui-input ui-input-sm" type="number" placeholder="Max lots" value={form.max_lots} onChange={(event) => setField('max_lots', event.target.value)} />
            <label className="text-xs flex items-center gap-2" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" checked={form.enabled} onChange={(event) => setField('enabled', event.target.checked)} />
              Enabled
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setForm(null)} disabled={saving}>Cancel</button>
            <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={savePlan} disabled={saving}>{saving ? 'Saving...' : 'Save plan'}</button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="ui-grid min-w-max">
          <thead>
            <tr><th>Plan</th><th>Type</th><th>Rate</th><th>Override</th><th>Symbols</th><th>Groups</th><th>Lots</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}><EmptyState>Loading plans...</EmptyState></td></tr>
            ) : plans.length === 0 ? (
              <tr><td colSpan={8}><EmptyState>No commission plans configured.</EmptyState></td></tr>
            ) : plans.map((plan) => (
              <tr key={plan.id}>
                <td style={{ fontWeight: 500 }}>{plan.plan_name}</td>
                <td><span className="ui-status ui-status-neutral">{plan.commission_type}</span></td>
                <td className="tabular">{fmt(plan.rate)}</td>
                <td className="tabular">{fmt(plan.override_rate)}</td>
                <td>{plan.symbol_filter || 'All'}</td>
                <td>{plan.group_filter || 'All'}</td>
                <td className="tabular">{fmt(plan.min_lots)} - {plan.max_lots > 0 ? fmt(plan.max_lots) : 'unlimited'}</td>
                <td><span className={`ui-status ${plan.enabled ? 'ui-status-ok' : 'ui-status-neutral'}`}>{plan.enabled ? 'ENABLED' : 'DISABLED'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const LedgerTab = ({ login, canManageIB, onRefreshRelated }) => {
  const [filters, setFilters] = useState(defaultLedgerFilters);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const paidLabel = filters.paid === 'true' ? 'paid' : filters.paid === 'false' ? 'unpaid' : 'all';
  const activeFilterText = [
    `Date: ${filters.from || 'any'} to ${filters.to || 'any'}`,
    `Paid: ${paidLabel}`,
    `Status: ${filters.status || 'all'}`,
    ...(emptyToNull(filters.client_login) ? [`Client: ${String(filters.client_login).trim()}`] : []),
    ...(emptyToNull(filters.symbol) ? [`Symbol: ${String(filters.symbol).trim()}`] : []),
  ].join(' | ');

  const query = useMemo(() => ({ ib_login: login }), [login]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await ibApi.commissions(query);
      let nextRows = normalizeRecords(response, ['commissions']).map(normalizeIBCommission);
      if (filters.from) nextRows = nextRows.filter((row) => {
        const value = Number(row.calculated_at);
        const date = Number.isFinite(value) && value > 0
          ? new Date(value > 1_000_000_000_000 ? value : value * 1000).toISOString().slice(0, 10)
          : '';
        return !date || date >= filters.from;
      });
      if (filters.to) nextRows = nextRows.filter((row) => {
        const value = Number(row.calculated_at);
        const date = Number.isFinite(value) && value > 0
          ? new Date(value > 1_000_000_000_000 ? value : value * 1000).toISOString().slice(0, 10)
          : '';
        return !date || date <= filters.to;
      });
      if (filters.paid) nextRows = nextRows.filter((row) => row.paid === (filters.paid === 'true'));
      if (filters.status) nextRows = nextRows.filter((row) => row.status === filters.status);
      if (emptyToNull(filters.client_login)) nextRows = nextRows.filter((row) => String(row.client_login).includes(String(filters.client_login).trim()));
      if (emptyToNull(filters.symbol)) nextRows = nextRows.filter((row) => row.symbol.toLowerCase().includes(String(filters.symbol).trim().toLowerCase()));
      setRows(nextRows);
    } catch (err) {
      setRows([]);
      setError(err.message || 'Failed to load commission ledger.');
    } finally {
      setLoading(false);
    }
  }, [filters, query]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => setFilters(defaultLedgerFilters());

  const payCommissions = async () => {
    if (!canManageIB) {
      setError('Your role does not have permission to manage IB commissions.');
      return;
    }
    if (!window.confirm(`Pay eligible commissions for IB ${login} from ${filters.from || 'the beginning'} through ${filters.to || 'today'}?`)) return;

    setPaying(true);
    setError('');
    setNotice('');
    try {
      await ibApi.payCommissions({
        login: Number(login),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        execute: true,
      });
      setNotice(`Eligible commissions for IB ${login} were submitted for payment.`);
      await load();
      onRefreshRelated?.();
    } catch (err) {
      setError(err.message || 'Failed to pay IB commissions.');
    } finally {
      setPaying(false);
    }
  };

  const exportCsv = () => {
    if (!rows.length) return;
    const cols = [
      { key: 'id' }, { key: 'ib_login' }, { key: 'client_login' }, { key: 'deal_ticket' }, { key: 'symbol' },
      { key: 'lots' }, { key: 'commission_type' }, { key: 'commission_amount' }, { key: 'override_amount' },
      { key: 'total_amount' }, { key: 'status' }, { key: 'paid' }, { key: 'paid_at' }, { key: 'pay_ticket' },
      { key: 'calculated_at' },
    ];
    downloadBlob(rowsToCSV(rows, cols), stampedFilename(`ib-${login}-ledger`, 'csv'));
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <AlertBox>{error}</AlertBox>}
      {notice && <AlertBox tone="success">{notice}</AlertBox>}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <input type="date" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} className="ui-input ui-input-sm" />
        <input type="date" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} className="ui-input ui-input-sm" />
        <select value={filters.paid} onChange={(event) => setFilter('paid', event.target.value)} className="ui-input ui-input-sm">
          <option value="">All paid states</option>
          <option value="false">Unpaid</option>
          <option value="true">Paid</option>
        </select>
        <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)} className="ui-input ui-input-sm">
          <option value="">All statuses</option>
          {['accrued', 'pending_review', 'approved', 'rejected', 'paid'].map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <input placeholder="Client login" value={filters.client_login} onChange={(event) => setFilter('client_login', event.target.value)} className="ui-input ui-input-sm" />
        <input placeholder="Symbol" value={filters.symbol} onChange={(event) => setFilter('symbol', event.target.value)} className="ui-input ui-input-sm" />
      </div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Active filters: {activeFilterText}</span>
        <div className="flex justify-end gap-2">
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={clearFilters} disabled={loading}>Clear filters</button>
          <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Load</button>
          <button className="ui-btn ui-btn-ghost ui-btn-sm" onClick={exportCsv} disabled={!rows.length}><Download size={13} /> CSV</button>
          <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={payCommissions} disabled={paying || !canManageIB}>{paying ? <Loader size={13} className="animate-spin" /> : null} Pay commissions</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="ui-grid min-w-max">
          <thead>
            <tr>
              <th>ID</th><th>Client</th><th>Deal</th><th>Symbol</th><th>Lots</th><th>Type</th><th>Commission</th><th>Override</th><th>Total</th><th>Status</th><th>Paid</th><th>Calculated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12}><EmptyState>Loading commissions...</EmptyState></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={12}><EmptyState>No commissions match the active filters. Check the date range or clear optional filters.</EmptyState></td></tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td className="tabular">{row.id}</td>
                <td className="tabular font-mono">{row.client_login}</td>
                <td className="tabular">{row.deal_ticket}</td>
                <td>{row.symbol}</td>
                <td className="tabular">{fmt(row.lots)}</td>
                <td><span className="ui-status ui-status-neutral">{row.commission_type}</span></td>
                <td className="tabular">{fmt(row.commission_amount)}</td>
                <td className="tabular">{fmt(row.override_amount)}</td>
                <td className="tabular font-semibold">{fmt(row.total_amount)}</td>
                <td><StatusBadge status={row.status} /></td>
                <td><span className={`ui-status ${row.paid ? 'ui-status-ok' : 'ui-status-warn'}`}>{row.paid ? 'PAID' : 'UNPAID'}</span></td>
                <td className="tabular text-xs" style={{ color: 'var(--text-3)' }}>{fmtDate(row.calculated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatsTab = ({ login }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await ibApi.stats({ ib_login: login });
      setStats(normalizeStats(response));
    } catch (err) {
      setStats(null);
      setError(err.message || 'Failed to load IB stats.');
    } finally {
      setLoading(false);
    }
  }, [login]);

  useEffect(() => {
    load();
  }, [load]);

  const cards = [
    ['Client Count', stats?.client_count],
    ['Active Clients', stats?.active_clients],
    ['Total Lots', stats?.total_lots],
    ['Total Commissions', stats?.total_commissions],
  ];

  return (
    <div className="flex flex-col gap-3">
      {error && <AlertBox>{error}</AlertBox>}
      <div className="flex justify-end">
        <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      {loading ? <EmptyState>Loading stats...</EmptyState> : (
        <div className="grid grid-cols-2 gap-3">
          {cards.map(([label, value]) => (
            <div key={label} className="ui-card p-4">
              <div className="text-[10px] uppercase" style={{ color: 'var(--text-3)' }}>{label}</div>
              <div className="text-xl font-semibold tabular mt-1" style={{ color: 'var(--text)' }}>{Number(value || 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const IBDetailDrawer = ({ login, initialTab = 'profile', onClose, onNavigateTab, onRefresh }) => {
  const { canAct } = usePermissions();
  const canManageIB = canAct(PERMISSIONS.MANAGE_IB);
  const [activeTab, setActiveTab] = useState(TABS.some((tab) => tab.id === initialTab) ? initialTab : 'profile');
  const [ib, setIb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showLinker, setShowLinker] = useState(false);
  const [childParentLogin, setChildParentLogin] = useState('');

  useEffect(() => {
    const safeTab = TABS.some((tab) => tab.id === initialTab) ? initialTab : 'profile';
    setActiveTab(safeTab);
  }, [initialTab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await ibApi.get(login);
      setIb(normalizeIBAccount(normalizeObject(response, ['account']) || response));
    } catch (err) {
      setIb(null);
      setError(err.message || 'Failed to load IB details.');
    } finally {
      setLoading(false);
    }
  }, [login]);

  useEffect(() => {
    load();
  }, [load]);

  const selectTab = (tabId) => {
    setActiveTab(tabId);
    onNavigateTab?.(tabId);
  };

  const refreshAll = async () => {
    await load();
    onRefresh?.();
  };

  const handleStatusAction = async (action) => {
    const notes = action === 'reject'
      ? window.prompt(`Reason for rejecting IB ${login}:`, '')
      : window.prompt(`Optional notes for ${action} IB ${login}:`, '');
    if (notes === null) return;
    if (!window.confirm(`Confirm ${action} for IB ${login}?`)) return;

    setStatusBusy(true);
    setError('');
    setNotice('');
    try {
      if (action === 'approve') await ibApi.approve(login, notes);
      if (action === 'reject') await ibApi.reject(login, notes);
      if (action === 'suspend') await ibApi.suspend(login, notes);
      if (action === 'activate') await ibApi.activate(login, notes);
      setNotice(`IB ${login} ${action} completed.`);
      refreshAll();
    } catch (err) {
      setError(err.message || `Failed to ${action} IB.`);
    } finally {
      setStatusBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!canManageIB) {
      setError('Your role does not have permission to manage IB accounts.');
      return;
    }
    if (!canRemoveIB(ib)) {
      setError('This IB account cannot be removed.');
      return;
    }

    const loginText = String(login);
    const typedLogin = window.prompt(`Type ${loginText} to remove IB ${loginText}. This archives the IB and keeps audit history.`, '');
    if (typedLogin === null) return;
    if (typedLogin.trim() !== loginText) {
      setNotice('');
      setError('Typed IB login did not match. Remove cancelled.');
      return;
    }

    setStatusBusy(true);
    setError('');
    setNotice('');
    try {
      await ibApi.remove(login, false);
      setNotice(`IB ${login} remove request completed.`);
      await refreshAll();
    } catch (err) {
      setError(err.message || 'Failed to remove IB.');
    } finally {
      setStatusBusy(false);
    }
  };

  const saveNotes = async (notes) => {
    setError('');
    setNotice('');
    try {
      await ibApi.update({ login, notes });
      setNotice('Notes saved.');
      await refreshAll();
    } catch (err) {
      setError(err.message || 'Failed to save notes.');
    }
  };

  const tabContent = useMemo(() => {
    if (loading) return <EmptyState>Loading IB details...</EmptyState>;
    if (!ib) return <EmptyState>No IB detail found.</EmptyState>;

    if (activeTab === 'profile') {
      return (
        <ProfileTab
          ib={ib}
          actionBusy={statusBusy}
          canManageIB={canManageIB}
          onStatusAction={handleStatusAction}
          onRemove={handleRemove}
          onSaveNotes={saveNotes}
        />
      );
    }
    if (activeTab === 'tree') {
      return <TreeTab login={login} onCreateChild={setChildParentLogin} />;
    }
    if (activeTab === 'clients') {
      return <ClientsTab login={login} onOpenLinker={() => setShowLinker(true)} />;
    }
    if (activeTab === 'plans') {
      return <PlansTab login={login} />;
    }
    if (activeTab === 'ledger') {
      return <LedgerTab login={login} canManageIB={canManageIB} onRefreshRelated={refreshAll} />;
    }
    if (activeTab === 'stats') {
      return <StatsTab login={login} />;
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ib, loading, login, statusBusy]);

  return (
    <>
      <div className="fixed inset-0 z-[8000]" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full flex flex-col z-[8001]"
        style={{ width: 'min(980px, 92vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: 'var(--shadow-2xl)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-2">
            <User size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                IB {login}
                {ib?.company_name && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-3)' }}>{ib.company_name}</span>}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--muted)' }}>
                {ib?.referral_code ? `Referral: ${ib.referral_code}` : 'Broker-scoped detail'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={refreshAll} title="Refresh">
              <RefreshCw size={13} />
            </button>
            <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              className="px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap"
              style={{
                color: activeTab === tab.id ? 'var(--accent-text)' : 'var(--text-3)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'transparent',
              }}
            >
              {tab.id === 'stats' && <BarChart3 size={12} className="inline mr-1" />}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {error && <AlertBox>{error}</AlertBox>}
          {notice && <AlertBox tone="success">{notice}</AlertBox>}
          {tabContent}
        </div>
      </div>

      {showLinker && (
        <IBClientLinker
          ibLogin={login}
          onClose={() => setShowLinker(false)}
          onSuccess={refreshAll}
        />
      )}

      {childParentLogin && (
        <IBCreateModal
          parentLogin={childParentLogin}
          onClose={() => setChildParentLogin('')}
          onSuccess={() => {
            setChildParentLogin('');
            refreshAll();
          }}
        />
      )}
    </>
  );
};

export default IBDetailDrawer;
