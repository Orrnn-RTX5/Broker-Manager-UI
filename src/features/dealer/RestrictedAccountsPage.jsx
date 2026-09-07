import { useState } from 'react';
import { Shield, Search, RefreshCw, User, AlertTriangle, Edit3, Trash2 } from 'lucide-react';
import useDataSource from '../../hooks/useDataSource';
import { accountRestrictList, accountRestrictClear } from '../../services/tradeApi';
import AccountRestrictionsModal from '../../components/Popups/AccountRestrictionsModal';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';

const RestrictedAccountsPage = () => {
  const { data: rawData, isLoading, error, reload: refetch } = useDataSource(accountRestrictList, []);
  const { canAct } = usePermissions();
  const canEditRestrictions = canAct(PERMISSIONS.EDIT_ACCOUNTS);
  const [search, setSearch] = useState('');
  const [editLogin, setEditLogin] = useState(null);

  const filtered = (Array.isArray(rawData) ? rawData : []).filter(row => {
    if (!search) return true;
    const q = search.toLowerCase();
    return String(row.accountLogin).includes(q) || (row.notes || '').toLowerCase().includes(q);
  });

  const handleClear = async (login) => {
    if (!canEditRestrictions) { alert('Your role does not have permission to clear account restrictions.'); return; }
    if (!window.confirm(`Clear all restrictions for login ${login}?`)) return;
    try {
      await accountRestrictClear(login);
      alert(`Restrictions cleared for ${login}`);
      refetch();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="restricted-accounts-page p-6 w-full h-full flex flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Shield size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h1 className="restricted-accounts-title text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Restricted Accounts</h1>
            <p className="restricted-accounts-subtitle text-[10px]" style={{ color: 'var(--text-3)' }}>Accounts with active trading restrictions. Double-click to edit.</p>
          </div>
        </div>
        <button className="ui-btn ui-btn-secondary ui-btn-sm flex items-center gap-1.5 mt-2 md:mt-0" onClick={refetch} disabled={isLoading}>
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="restricted-accounts-search relative w-full max-w-xs">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
        <input type="text" placeholder="Search login, notes…" value={search}
          onChange={e => setSearch(e.target.value)} className="ui-input ui-input-sm" style={{ paddingLeft: 32 }} />
      </div>

      <div className="restricted-accounts-grid ui-card flex flex-col w-full flex-1 overflow-hidden">
        {error && (
          <div className="restricted-accounts-error px-4 py-2 text-[10px]" style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)', borderBottom: '1px solid var(--danger-border)' }}>
            <AlertTriangle size={12} className="inline mr-1" /> {error}
          </div>
        )}
        <div className="restricted-accounts-table-shell relative w-full flex-1 min-h-0">
          <div className="restricted-accounts-scroll w-full h-full overflow-x-auto">
            <table className="ui-grid min-w-max">
            <thead>
              <tr>
                <th>Login</th>
                <th>No Trading</th>
                <th>No Deposit</th>
                <th>No Withdraw</th>
                <th>Close Only</th>
                <th>Max Lot</th>
                <th>Leverage</th>
                <th>A-Book</th>
                <th>B-Book</th>
                <th>Delay</th>
                <th>Notes</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 && (
                filtered.map((row, idx) => {
                  const Flag = ({ val }) => (
                    <span className={`ui-badge text-[10px] px-1 py-0 ${val ? 'ui-badge-danger' : 'ui-badge-neutral'}`}>
                      {val ? 'YES' : 'no'}
                    </span>
                  );
                  return (
                    <tr key={row.accountLogin ?? idx} onDoubleClick={() => setEditLogin(row.accountLogin)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <User size={12} style={{ color: 'var(--accent)' }} />
                          <span className="tabular font-mono">{row.accountLogin}</span>
                        </span>
                      </td>
                      <td><Flag val={row.noTrading} /></td>
                      <td><Flag val={row.noDeposit} /></td>
                      <td><Flag val={row.noWithdraw} /></td>
                      <td><Flag val={row.closeOnly} /></td>
                      <td className="tabular">{row.maxLot || '—'}</td>
                      <td className="tabular">{row.customLeverage || '—'}</td>
                      <td><Flag val={row.aBookOverride} /></td>
                      <td><Flag val={row.bBookOverride} /></td>
                      <td className="tabular">{row.executionDelayMs ? `${row.executionDelayMs}ms` : '—'}</td>
                      <td className="truncate max-w-[120px]" style={{ color: 'var(--text-3)' }}>{row.notes || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="inline-flex gap-1">
                          <button className="ui-btn ui-btn-ghost ui-btn-sm px-1.5" title="Edit" onClick={e => { e.stopPropagation(); setEditLogin(row.accountLogin); }}>
                            <Edit3 size={12} style={{ color: 'var(--accent)' }} />
                          </button>
                          <button className="ui-btn ui-btn-ghost ui-btn-sm px-1.5" title={canEditRestrictions ? 'Clear' : 'No permission to clear restrictions'} disabled={!canEditRestrictions} onClick={e => { e.stopPropagation(); handleClear(row.accountLogin); }}>
                            <Trash2 size={12} style={{ color: 'var(--danger-text)' }} />
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
            <div className="restricted-accounts-empty-state" style={{ color: 'var(--muted)' }}>
              {isLoading ? 'Loading…' : 'No restricted accounts'}
            </div>
          )}
        </div>

        <div className="restricted-accounts-footer flex items-center px-4 py-2.5 text-[10px] shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}>
          {filtered.length} restricted account{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {editLogin && (
        <AccountRestrictionsModal login={editLogin} onClose={() => { setEditLogin(null); refetch(); }} />
      )}
    </div>
  );
};

export default RestrictedAccountsPage;
