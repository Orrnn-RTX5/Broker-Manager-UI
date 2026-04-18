import { useState, useEffect, useCallback } from 'react';
import { User, RefreshCw, AlertTriangle, Loader, WifiOff } from 'lucide-react';
import AccountDetailsModal from './Popups/AccountDetailsModal';
import AccountsSummaryModal from './Popups/AccountsSummaryModal';
import AccountRestrictionsModal from './Popups/AccountRestrictionsModal';
import SidebarContextMenu from './menus/SidebarContextMenu';

/**
 * MarginCallsSidebar — pure content component.
 * All panel chrome (title bar, drag, resize, float) is handled by DockPanel
 * from the docking system. This component renders only data UI.
 */
const MarginCallsSidebar = ({ isAuthenticated }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAccountDetails, setSelectedAccountDetails] = useState(null);
  const [summaryAccount, setSummaryAccount] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [blockedUsers, setBlockedUsers] = useState({});
  const [restrictLogin, setRestrictLogin] = useState(null);

  const fetchAccounts = useCallback(async () => {
    const id = localStorage.getItem('authToken');
    if (!id) {
      setError('Not connected.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/manager/AccountDetailsMany?id=${id}`, {
        method: 'GET',
        headers: { 'accept': 'application/json' },
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Unexpected response: ${text.slice(0, 80)}`);
      }

      if (!response.ok) {
        throw new Error(data?.error || data?.message || `API error ${response.status}`);
      }

      const raw = Array.isArray(data)
        ? data
        : Array.isArray(data?.answer)
          ? data.answer
          : Array.isArray(data?.accounts)
            ? data.accounts
            : Array.isArray(data?.data)
              ? data.data
              : [];

      const list = raw.map(acc => ({
        ...acc,
        login: acc.login || acc.Login,
        Name: acc.Name || acc.name || [acc.FirstName || acc.firstName, acc.LastName || acc.lastName].filter(Boolean).join(' ') || '',
        balance: acc.balance !== undefined ? acc.balance : (acc.Balance !== undefined ? acc.Balance : undefined),
        MarginCallLevel: acc.marginLevel || acc.MarginLevel || acc.MarginCallLevel,
      }));

      setAccounts(list);
    } catch (err) {
      console.error('[MarginCallsSidebar] fetch error:', err);
      setError(err.message || 'Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAccounts();
    }
  }, [isAuthenticated, fetchAccounts]);

  const fullName = (acc) =>
    [acc.FirstName, acc.LastName].filter(Boolean).join(' ') ||
    acc.Name ||
    '—';

  const balanceDisplay = (acc) =>
    acc.balance !== undefined
      ? Number(acc.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '—';

  const handleContextMenu = (e, acc) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, account: acc });
  };

  const handleMenuAction = async (action, acc) => {
    const login = typeof acc === 'object' ? acc.login : acc;

    if (action === 'summary') {
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`/api/manager/AccountsSummary?id=${token}&login%5B%5D=${login}`, {
          method: 'GET',
          headers: { 'accept': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSummaryAccount({ login, data });
      } catch (err) {
        alert("Error fetching summary: " + err.message);
      }
    } else if (action === 'details') {
      setSelectedAccountDetails(acc);
    } else if (action === 'restrictions') {
      setRestrictLogin(login);
    } else if (action === 'block') {
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`/api/manager/UserArchive?id=${token}&login=${login}`, {
          method: 'GET',
          headers: { 'accept': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
        setBlockedUsers(prev => ({ ...prev, [login]: true }));
        alert(`User ${login} blocked successfully.`);
      } catch (err) {
        alert("Error blocking user: " + err.message);
      }
    } else if (action === 'unblock') {
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`/api/manager/UserRestore?id=${token}&login=${login}`, {
          method: 'GET',
          headers: { 'accept': 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
        setBlockedUsers(prev => ({ ...prev, [login]: false }));
        alert(`User ${login} unblocked successfully.`);
      } catch (err) {
        alert("Error unblocking user: " + err.message);
      }
    } else if (action === 'delete') {
      if (!window.confirm(`Are you sure you want to permanently delete account ${login}?`)) return;
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`/api/manager/AccountDelete?id=${token}&login=${login}`, {
          method: 'GET',
          headers: { 'accept': 'application/json' }
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error(`Unexpected response: ${text.slice(0, 80)}`); }

        if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

        if (data.error || (typeof data === 'string' && data.toLowerCase().includes('error'))) {
          throw new Error(data.error || data);
        }

        alert(`Account ${login} deleted successfully.`);
        fetchAccounts();
      } catch (err) {
        alert("Error deleting account: " + err.message);
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full" style={{ background: 'var(--surface)' }}>
      {/* Mini toolbar */}
      <div
        className="h-8 flex items-center justify-between px-3 shrink-0"
        style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xs font-medium tabular" style={{ color: 'var(--text-3)' }}>
          {!loading && `${accounts.length} accounts`}
        </span>
        {isAuthenticated && (
          <button
            onClick={fetchAccounts}
            disabled={loading}
            title="Refresh accounts"
            className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {!isAuthenticated && (
          <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--muted)' }}>
            <WifiOff size={18} />
            <span className="text-xs">Not connected</span>
          </div>
        )}

        {isAuthenticated && loading && (
          <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
            <Loader size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span className="text-xs">Loading accounts…</span>
          </div>
        )}

        {isAuthenticated && !loading && error && (
          <div className="p-4 flex flex-col items-center gap-2 text-center">
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
            <span className="text-xs" style={{ color: 'var(--danger-text)' }}>{error}</span>
            <button onClick={fetchAccounts} className="ui-btn ui-btn-ghost ui-btn-xs" style={{ color: 'var(--accent-text)' }}>
              Retry
            </button>
          </div>
        )}

        {isAuthenticated && !loading && !error && (
          <table className="ui-grid">
            <thead>
              <tr>
                <th>Login</th>
              
                <th style={{ textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-xs" style={{ color: 'var(--muted)' }}>
                    No accounts found
                  </td>
                </tr>
              ) : (
                accounts.map((acc, idx) => {
                  const isPrimitive = typeof acc === 'number' || typeof acc === 'string';
                  const login = isPrimitive ? acc : acc.login;
                  const name = isPrimitive ? '—' : fullName(acc);
                  const bal = isPrimitive ? '—' : balanceDisplay(acc);
                  const mcl = isPrimitive ? undefined : acc.MarginCallLevel;
                  const isUrgent = mcl !== undefined && Number(mcl) < 100;
                  return (
                    <tr
                      key={login ?? idx}
                      onDoubleClick={() => setSelectedAccountDetails(acc)}
                      onContextMenu={(e) => handleContextMenu(e, acc)}
                      style={{
                        cursor: 'pointer',
                        background: isUrgent ? 'var(--danger-soft)' : undefined,
                      }}
                    >
                      <td style={{ color: isUrgent ? 'var(--danger-text)' : 'var(--text)' }}>
                        <span className="inline-flex items-center ">
                          <User  style={{ color: isUrgent ? 'var(--danger)' : 'var(--accent)' }} />
                          <span className="tabular font-mono ">{login}</span>
                        </span>
                      </td>
                     
                      <td className="tabular font-mono" style={{ textAlign: 'right', color: isUrgent ? 'var(--danger-text)' : 'var(--text)' }}>
                        {bal}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Popups */}
      {selectedAccountDetails && (
        <AccountDetailsModal
          account={selectedAccountDetails}
          onClose={() => setSelectedAccountDetails(null)}
        />
      )}

      {summaryAccount && (
        <AccountsSummaryModal
          account={summaryAccount}
          onClose={() => setSummaryAccount(null)}
        />
      )}

      {restrictLogin && (
        <AccountRestrictionsModal login={restrictLogin} onClose={() => setRestrictLogin(null)} />
      )}

      {contextMenu && (
        <SidebarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          account={contextMenu.account}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
          isBlocked={blockedUsers[typeof contextMenu.account === 'object' ? contextMenu.account.login : contextMenu.account]}
        />
      )}
    </div>
  );
};

export default MarginCallsSidebar;
