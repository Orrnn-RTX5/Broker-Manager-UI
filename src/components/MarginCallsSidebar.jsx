import { useState, useEffect, useCallback } from 'react';
import { User, RefreshCw, AlertTriangle, Loader, WifiOff } from 'lucide-react';
import AccountDetailsModal from './Popups/AccountDetailsModal';
import AccountsSummaryModal from './Popups/AccountsSummaryModal';
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
      const response = await fetch(`http://69.197.178.27/manager/Accounts?id=${id}`, {
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

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.accounts)
          ? data.accounts
          : Array.isArray(data?.data)
            ? data.data
            : [];

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
        const res = await fetch(`http://69.197.178.27/manager/AccountsSummary?id=${token}&login%5B%5D=${login}`, {
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
    } else if (action === 'block') {
      try {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`http://69.197.178.27/manager/UserArchive?id=${token}&login=${login}`, {
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
        const res = await fetch(`http://69.197.178.27/manager/UserRestore?id=${token}&login=${login}`, {
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
        const res = await fetch(`http://69.197.178.27/manager/AccountDelete?id=${token}&login=${login}`, {
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
    <div className="bg-white dark:bg-[#1e1e1e] flex flex-col h-full w-full transition-colors">

      {/* Mini toolbar: refresh button */}
      <div className="h-6 bg-[#f8f8f8] dark:bg-[#1e1e1e] border-b border-[#e0e0e0] dark:border-[#333333] flex items-center justify-between px-2 shrink-0">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 select-none">
          {!loading && `${accounts.length} account(s)`}
        </span>
        {isAuthenticated && (
          <button
            onClick={fetchAccounts}
            disabled={loading}
            title="Refresh accounts"
            className="hover:bg-blue-500 hover:text-white text-gray-500 dark:text-gray-400 p-0.5 rounded-sm transition-colors cursor-pointer border border-transparent disabled:opacity-40"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-[#1e1e1e]">

        {/* Not connected */}
        {!isAuthenticated && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400">
            <WifiOff size={16} className="text-gray-400" />
            <span className="text-[11px]">Not connected</span>
          </div>
        )}

        {/* Loading */}
        {isAuthenticated && loading && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400">
            <Loader size={18} className="animate-spin text-blue-400" />
            <span className="text-[11px]">Loading accounts...</span>
          </div>
        )}

        {/* Error */}
        {isAuthenticated && !loading && error && (
          <div className="p-3 flex flex-col items-center gap-2 text-center">
            <AlertTriangle size={16} className="text-red-400" />
            <span className="text-[11px] text-red-400">{error}</span>
            <button onClick={fetchAccounts} className="text-[11px] text-blue-400 hover:underline">
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        {isAuthenticated && !loading && !error && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f8f8f8] dark:bg-[#252526] border-b border-[#cccccc] dark:border-[#333333] text-[11px] text-gray-700 dark:text-gray-300 h-6 select-none transition-colors sticky top-0">
                <th className="px-2 py-0.5 font-normal">Login</th>
                <th className="px-2 py-0.5 font-normal border-l border-[#cccccc] dark:border-[#333333]">Name</th>
                <th className="px-2 py-0.5 font-normal border-l border-[#cccccc] dark:border-[#333333] text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="text-[12px] text-gray-800 dark:text-gray-200 font-sans">
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-[11px] text-gray-400">
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
                      className={`border-b border-[#e0e0e0] dark:border-[#333333] h-6 transition-colors cursor-pointer ${
                        isUrgent
                          ? 'bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-900 dark:text-red-300'
                          : 'hover:bg-blue-50/50 dark:hover:bg-[#2d2d30]'
                      }`}
                    >
                      <td className="px-2 py-0.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <User size={11} className={isUrgent ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'} />
                          <span className="font-mono text-[11px]">{login}</span>
                        </div>
                      </td>
                      <td className="px-2 py-0.5 whitespace-nowrap border-l border-[#e0e0e0] dark:border-[#333333] text-[11px]" style={{ maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name}
                      </td>
                      <td className="px-2 py-0.5 whitespace-nowrap border-l border-[#e0e0e0] dark:border-[#333333] text-right font-mono text-[11px]">
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
