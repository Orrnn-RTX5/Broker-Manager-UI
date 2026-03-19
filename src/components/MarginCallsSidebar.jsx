import { useState, useEffect, useCallback } from 'react';
import { User, X, RefreshCw, AlertTriangle, Loader, WifiOff } from 'lucide-react';
import AccountDetailsModal from './Popups/AccountDetailsModal';

const MarginCallsSidebar = ({ onClose, isAuthenticated }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAccountDetails, setSelectedAccountDetails] = useState(null);

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

      // Try parsing as JSON
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Unexpected response: ${text.slice(0, 80)}`);
      }

      if (!response.ok) {
        throw new Error(data?.error || data?.message || `API error ${response.status}`);
      }

      // Normalise: could be array, or { accounts: [...] }, or { data: [...] }
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

  // Fetch when component mounts AND whenever isAuthenticated flips to true
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

  return (
    <div className="w-[260px] bg-white dark:bg-[#1e1e1e] h-full flex flex-col border-l border-[#cccccc] dark:border-[#333333] shadow-xl shrink-0 transition-colors">

      {/* Header */}
      <div className="h-6 bg-[#f0f0f0] dark:bg-[#252526] border-b border-[#cccccc] dark:border-[#333333] flex flex-col justify-end px-2 select-none transition-colors">
        <div className="flex justify-between items-center text-black dark:text-gray-200 font-semibold text-[11px] pb-0.5">
          <span>Accounts {!loading && `(${accounts.length})`}</span>
          <div className="flex gap-1 items-center">
            {isAuthenticated && (
              <button
                onClick={fetchAccounts}
                disabled={loading}
                title="Refresh accounts"
                className="hover:bg-blue-500 hover:text-white text-gray-600 dark:text-gray-400 p-0.5 rounded-sm transition-colors cursor-pointer border border-transparent disabled:opacity-40"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
            {onClose && (
              <button onClick={onClose} className="hover:bg-red-500 hover:text-white text-gray-600 dark:text-gray-400 p-0.5 rounded-sm transition-colors cursor-pointer border border-transparent">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
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

      {/* Footer count */}
      {isAuthenticated && !loading && !error && accounts.length > 0 && (
        <div className="h-5 bg-[#f0f0f0] dark:bg-[#252526] border-t border-[#cccccc] dark:border-[#333333] flex items-center px-2 select-none">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{accounts.length} account(s)</span>
        </div>
      )}

      {/* Popups */}
      {selectedAccountDetails && (
        <AccountDetailsModal 
          account={selectedAccountDetails} 
          onClose={() => setSelectedAccountDetails(null)} 
        />
      )}
    </div>
  );
};

export default MarginCallsSidebar;
