import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Eye, GitBranch, Loader, Plus, RefreshCw, Search, Trash2, User, Users } from 'lucide-react';
import ibApi from '../../services/ibApi';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';
import IBCreateModal from './components/IBCreateModal';
import IBDetailDrawer from './components/IBDetailDrawer';
import GridLoadingState from '../../components/GridLoadingState';
import {
  canRemoveIB,
  getIBStatusActions,
  normalizeIBAccount,
  normalizeRecords,
} from './ibDomain';

const ACCOUNT_STATUS_FILTERS = ['All', 'pending', 'approved', 'active', 'suspended', 'rejected', 'removed'];

const STATUS_BADGE = {
  active: 'ui-badge-success',
  approved: 'ui-badge-info',
  pending: 'ui-badge-warn',
  suspended: 'ui-badge-neutral',
  rejected: 'ui-badge-danger',
  removed: 'ui-badge-danger',
};

const fmtMoney = (value) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtDate = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '-';
  return new Date(number > 1_000_000_000_000 ? number : number * 1000).toLocaleDateString();
};

const StatusBadge = ({ status }) => (
  <span className={`ui-badge text-[9px] px-1 ${STATUS_BADGE[status] || 'ui-badge-neutral'}`}>
    {String(status || '-').toUpperCase()}
  </span>
);

const IBListPage = () => {
  const navigate = useNavigate();
  const { login: routeLogin, tab: routeTab } = useParams();
  const { canAct } = usePermissions();
  const canManageIB = canAct(PERMISSIONS.MANAGE_IB);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showCreate, setShowCreate] = useState(false);
  const [mutatingLogin, setMutatingLogin] = useState(null);

  const selectedLogin = routeLogin || null;

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await ibApi.list();
      setAccounts(normalizeRecords(data, ['accounts']).map(normalizeIBAccount));
    } catch (err) {
      setAccounts([]);
      setError(err.message || 'Failed to load IB accounts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((account) => {
      const statusMatches = statusFilter === 'All' || account.status === statusFilter;
      const searchMatches = !q
        || String(account.login || '').includes(q)
        || String(account.parent_ib_login || '').includes(q)
        || account.company_name.toLowerCase().includes(q)
        || account.referral_code.toLowerCase().includes(q);
      return statusMatches && searchMatches;
    });
  }, [accounts, search, statusFilter]);

  const handleRemove = async (event, account) => {
    event.stopPropagation();
    if (!canManageIB) {
      setError('Your role does not have permission to manage IB accounts.');
      return;
    }
    if (!canRemoveIB(account)) {
      setError('This IB account cannot be removed.');
      return;
    }

    const loginText = String(account.login);
    const typedLogin = window.prompt(`Type ${loginText} to remove IB ${loginText}. This archives the IB and keeps audit history.`, '');
    if (typedLogin === null) return;
    if (typedLogin.trim() !== loginText) {
      setNotice('');
      setError('Typed IB login did not match. Remove cancelled.');
      return;
    }

    setMutatingLogin(account.login);
    setError('');
    setNotice('');
    try {
      await ibApi.remove(account.login, false);
      setNotice(`IB ${account.login} remove request completed.`);
      await load({ quiet: true });
    } catch (err) {
      setError(err.message || 'Failed to remove IB.');
    } finally {
      setMutatingLogin(null);
    }
  };

  const handleAction = async (event, account, action) => {
    event.stopPropagation();
    if (!canManageIB) {
      setError('Your role does not have permission to manage IB accounts.');
      return;
    }

    const label = action === 'activate' ? 'activate' : action;
    const notes = action === 'reject'
      ? window.prompt(`Reason for rejecting IB ${account.login}:`, '')
      : window.prompt(`Optional notes for ${label} IB ${account.login}:`, '');
    if (notes === null) return;
    if (!window.confirm(`Confirm ${label} for IB ${account.login}?`)) return;

    setMutatingLogin(account.login);
    setError('');
    setNotice('');
    try {
      if (action === 'approve') await ibApi.approve(account.login, notes);
      if (action === 'reject') await ibApi.reject(account.login, notes);
      if (action === 'suspend') await ibApi.suspend(account.login, notes);
      if (action === 'activate') await ibApi.activate(account.login, notes);
      setNotice(`IB ${account.login} ${label} request completed.`);
      await load({ quiet: true });
    } catch (err) {
      setError(err.message || `Failed to ${label} IB.`);
    } finally {
      setMutatingLogin(null);
    }
  };

  const openDetail = (login, tab = 'profile') => navigate(`/ib/${login}/${tab}`);
  const closeDetail = () => navigate('/ib');

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>IB Management</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Broker-scoped IB accounts, hierarchy, commissions, and payouts.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => load({ quiet: true })} disabled={loading || refreshing}>
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => setShowCreate(true)} disabled={!canManageIB}>
            <Plus size={13} />
            Create IB
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs px-3 py-2 rounded flex items-center gap-2" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}
      {notice && (
        <div className="text-xs px-3 py-2 rounded flex items-center gap-2" style={{ background: 'var(--ok-soft)', color: 'var(--ok-text)' }}>
          <CheckCircle2 size={13} /> {notice}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search login, parent, company, code..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 32 }}
          />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ui-input ui-input-sm" style={{ width: 150 }}>
          {ACCOUNT_STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>{status === 'All' ? 'All statuses' : status}</option>
          ))}
        </select>
      </div>

      <div className="ui-card flex flex-col w-full flex-1 overflow-hidden">
        {loading ? (
          <GridLoadingState label="Loading IB accounts…" />
        ) : (
        <div className="w-full overflow-x-auto flex-1">
          <table className="ui-grid min-w-max">
            <thead>
              <tr>
                <th>Login</th>
                <th>Status</th>
                <th>Parent</th>
                <th>Level</th>
                <th>Company</th>
                <th>Referral Code</th>
                <th style={{ textAlign: 'right' }}>Clients</th>
                <th style={{ textAlign: 'right' }}>Unpaid</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  <Loader size={16} className="animate-spin inline mr-2" /> Loading IB accounts...
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>
                  No IB accounts found.
                </td></tr>
              ) : filtered.map((account) => {
                const actions = getIBStatusActions(account.status);
                const busy = mutatingLogin === account.login;
                return (
                  <tr key={account.login} onClick={() => openDetail(account.login, 'profile')} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <User size={12} style={{ color: 'var(--accent)' }} />
                        <span className="tabular font-mono">{account.login}</span>
                      </span>
                    </td>
                    <td><StatusBadge status={account.status} /></td>
                    <td className="tabular" style={{ color: 'var(--text-3)' }}>{account.parent_ib_login || '-'}</td>
                    <td className="tabular">{account.level}</td>
                    <td style={{ fontWeight: 500 }}>{account.company_name || '-'}</td>
                    <td className="tabular font-mono text-xs" style={{ color: 'var(--text-3)' }}>{account.referral_code || '-'}</td>
                    <td className="tabular" style={{ textAlign: 'right' }}>{account.client_count}</td>
                    <td className="tabular" style={{ textAlign: 'right', color: account.unpaid_total > 0 ? 'var(--warn-text)' : 'var(--text-3)' }}>
                      {fmtMoney(account.unpaid_total)}
                    </td>
                    <td className="tabular text-xs" style={{ color: 'var(--text-3)' }}>{fmtDate(account.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" title="View details" onClick={() => openDetail(account.login, 'profile')}>
                          <Eye size={13} />
                        </button>
                        <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" title="View tree" onClick={() => openDetail(account.login, 'tree')}>
                          <GitBranch size={13} />
                        </button>
                        {actions.map((action) => (
                          <button
                            key={action}
                            className="ui-btn ui-btn-secondary ui-btn-xs"
                            onClick={(event) => handleAction(event, account, action)}
                            disabled={!canManageIB || busy}
                          >
                            {busy ? '...' : action}
                          </button>
                        ))}
                        {canRemoveIB(account) && (
                          <button
                            className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                            title="Remove IB"
                            onClick={(event) => handleRemove(event, account)}
                            disabled={!canManageIB || busy}
                          >
                            {busy ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} style={{ color: 'var(--danger-text)' }} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
        <div className="px-4 py-2 text-xs shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}>
          <span>{filtered.length} IB account{filtered.length === 1 ? '' : 's'}</span>
          {!canManageIB && <span>No permission to perform IB actions</span>}
        </div>
      </div>

      {selectedLogin && (
        <IBDetailDrawer
          login={selectedLogin}
          initialTab={routeTab || 'profile'}
          onClose={closeDetail}
          onNavigateTab={(nextTab) => navigate(`/ib/${selectedLogin}/${nextTab}`, { replace: true })}
          onRefresh={() => load({ quiet: true })}
        />
      )}

      {showCreate && (
        <IBCreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={(result) => {
            setShowCreate(false);
            setNotice('IB account created.');
            load({ quiet: true });
            const createdLogin = result?.login || result?.ib_login;
            if (createdLogin) openDetail(createdLogin, 'profile');
          }}
        />
      )}
    </div>
  );
};

export default IBListPage;
