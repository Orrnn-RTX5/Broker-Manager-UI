import { useState, useMemo } from 'react';
import { Search, Plus, RefreshCw, Users, AlertTriangle, User, Loader } from 'lucide-react';
import useDataSource from '../../hooks/useDataSource';
import { ibList, ibDelete } from '../../services/api';
import IBDetailDrawer from './components/IBDetailDrawer';
import IBCreateModal from './components/IBCreateModal';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_BADGE = {
  active:   'ui-badge-success',
  approved: 'ui-badge-info',
  pending:  'ui-badge-warn',
  removed:  'ui-badge-danger',
};

const IBListPage = () => {
  const { data: rawData, isLoading, error, reload } = useDataSource(ibList, []);
  const { canAct } = usePermissions();
  const canManageIB = canAct(PERMISSIONS.MANAGE_IB);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedLogin, setSelectedLogin] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    const list = Array.isArray(rawData) ? rawData : rawData?.answer || [];
    return list.filter(ib => {
      const matchSearch = !search ||
        String(ib.login).includes(search) ||
        (ib.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (ib.referral_code || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || ib.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [rawData, search, statusFilter]);

  const handleDelete = async (e, login) => {
    e.stopPropagation();
    if (!canManageIB) { alert('Your role does not have permission to manage IB accounts.'); return; }
    if (!window.confirm(`Soft-delete IB ${login}? Status will be set to "removed".`)) return;
    try {
      await ibDelete(login);
      reload();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2">
          <Users size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>IB Management</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Click a row to open details · Double-click for full drawer
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="ui-btn ui-btn-secondary ui-btn-sm flex items-center gap-1" onClick={reload} disabled={isLoading}>
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button className="ui-btn ui-btn-primary ui-btn-sm flex items-center gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus size={13} /> New IB
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs w-full">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search login, company, code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ui-input ui-input-sm"
            style={{ paddingLeft: 32 }}
          />
        </div>
        {['All', 'active', 'pending', 'approved', 'removed'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`ui-btn ui-btn-sm ${statusFilter === s ? 'ui-btn-primary' : 'ui-btn-secondary'}`}
          >
            {s === 'All' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="ui-card flex flex-col w-full flex-1 overflow-hidden">
        {error && (
          <div className="px-4 py-2 text-xs flex items-center gap-1.5" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}>
            <AlertTriangle size={12} /> {error}
          </div>
        )}
        <div className="w-full overflow-x-auto flex-1">
          <table className="ui-grid min-w-max">
            <thead>
              <tr>
                <th>Login</th>
                <th>Company</th>
                <th>Referral Code</th>
                <th>Level</th>
                <th>Parent IB</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Clients</th>
                <th style={{ textAlign: 'right' }}>Unpaid</th>
                <th>Created</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16" style={{ color: 'var(--muted)' }}>
                  <Loader size={16} className="animate-spin inline mr-2" style={{ color: 'var(--accent)' }} />Loading…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16 text-sm" style={{ color: 'var(--muted)' }}>No IB accounts found.</td></tr>
              ) : filtered.map(ib => (
                <tr
                  key={ib.login}
                  onClick={() => setSelectedLogin(ib.login)}
                  className={selectedLogin === ib.login ? 'is-selected' : ''}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <User size={12} style={{ color: 'var(--accent)' }} />
                      <span className="tabular font-mono">{ib.login}</span>
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{ib.company_name || '—'}</td>
                  <td className="tabular font-mono text-xs" style={{ color: 'var(--text-3)' }}>{ib.referral_code}</td>
                  <td className="tabular" style={{ textAlign: 'center', color: 'var(--text-3)' }}>{ib.level}</td>
                  <td className="tabular" style={{ color: 'var(--text-3)' }}>{ib.parent_ib_login ?? '—'}</td>
                  <td>
                    <span className={`ui-badge text-[9px] px-1 ${STATUS_BADGE[ib.status] || 'ui-badge-neutral'}`}>
                      {(ib.status || '').toUpperCase()}
                    </span>
                  </td>
                  <td className="tabular" style={{ textAlign: 'right' }}>{ib.client_count ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>
                    {ib.unpaid_total > 0 ? (
                      <span className="ui-badge ui-badge-warn tabular">{fmt(ib.unpaid_total)}</span>
                    ) : (
                      <span className="tabular" style={{ color: 'var(--text-3)' }}>0.00</span>
                    )}
                  </td>
                  <td className="tabular text-xs" style={{ color: 'var(--text-3)' }}>
                    {ib.created_at ? new Date(ib.created_at * 1000).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="ui-btn ui-btn-ghost ui-btn-sm px-1.5"
                      title={canManageIB ? 'Delete (soft)' : 'No permission to manage IB accounts'}
                      disabled={!canManageIB}
                      onClick={e => handleDelete(e, ib.login)}
                      style={{ color: 'var(--danger-text)' }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}>
          {filtered.length} IB account{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Detail drawer */}
      {selectedLogin && (
        <IBDetailDrawer
          login={selectedLogin}
          onClose={() => setSelectedLogin(null)}
          onRefresh={reload}
        />
      )}

      {showCreate && (
        <IBCreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); reload(); }}
        />
      )}
    </div>
  );
};

export default IBListPage;
