import { useState, useEffect, useCallback, useRef } from 'react';
import { User, X, RefreshCw, AlertTriangle, Loader, WifiOff, Maximize2, Minimize2 } from 'lucide-react';
import AccountDetailsModal from './Popups/AccountDetailsModal';
import AccountsSummaryModal from './Popups/AccountsSummaryModal';
import SidebarContextMenu from './menus/SidebarContextMenu';

const MarginCallsSidebar = ({ onClose, isAuthenticated }) => {
  const sidebarRef = useRef(null);
  const [isFloating, setIsFloating] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 260, height: 600 });

  useEffect(() => {
    // Initial floating positions just in case
    setSize(prev => ({ ...prev, height: window.innerHeight * 0.8 }));
    setPosition({ x: window.innerWidth - 300, y: window.innerHeight * 0.1 });
  }, []);

  const handleHeaderMouseDown = (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    let startX = e.clientX;
    let startY = e.clientY;
    
    let currentFloating = isFloating;
    let startPosX = position.x;
    let startPosY = position.y;

    let rect = sidebarRef.current?.getBoundingClientRect();

    const handleMouseMove = (moveEvent) => {
      if (!currentFloating) {
        if (Math.abs(moveEvent.clientX - startX) > 5 || Math.abs(moveEvent.clientY - startY) > 5) {
          setIsFloating(true);
          currentFloating = true;
          startPosX = moveEvent.clientX - (startX - (rect ? rect.left : 0));
          startPosY = moveEvent.clientY - (startY - (rect ? rect.top : 0));
          setPosition({ x: startPosX, y: startPosY });
          if (rect) setSize(prev => ({ ...prev, height: rect.height }));
          startX = moveEvent.clientX;
          startY = moveEvent.clientY;
        }
      } else {
        setPosition({
          x: startPosX + (moveEvent.clientX - startX),
          y: startPosY + (moveEvent.clientY - startY),
        });
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };

    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e, edge) => {
    e.preventDefault();
    e.stopPropagation();
    let startX = e.clientX;
    let startY = e.clientY;
    let startWidth = size.width;
    let startHeight = size.height;
    let startPosX = position.x;

    const handleMouseMove = (moveEvent) => {
      let dx = moveEvent.clientX - startX;
      let dy = moveEvent.clientY - startY;

      if (edge === 'left') {
        if (isFloating) {
          let newWidth = Math.max(200, startWidth - dx);
          let actualDx = startWidth - newWidth;
          setSize(prev => ({ ...prev, width: newWidth }));
          setPosition(prev => ({ ...prev, x: startPosX - actualDx }));
        } else {
          setSize(prev => ({ ...prev, width: Math.max(200, startWidth - dx) }));
        }
      } else if (edge === 'right' && isFloating) {
        setSize(prev => ({ ...prev, width: Math.max(200, startWidth + dx) }));
      } else if (edge === 'bottom' && isFloating) {
        setSize(prev => ({ ...prev, height: Math.max(200, startHeight + dy) }));
      } else if (edge === 'bottom-right' && isFloating) {
        setSize(prev => ({ 
          width: Math.max(200, startWidth + dx),
          height: Math.max(200, startHeight + dy)
        }));
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (edge === 'left' || edge === 'right') document.body.style.cursor = 'ew-resize';
    else if (edge === 'bottom') document.body.style.cursor = 'ns-resize';
    else if (edge === 'bottom-right') document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

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
        const data = await res.json();
        // Assuming success
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
        const data = await res.json();
        // Assuming success
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
    <div 
      ref={sidebarRef}
      style={isFloating ? {
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: 50
      } : {
        width: size.width,
      }}
      className={`bg-white dark:bg-[#1e1e1e] flex flex-col shadow-xl transition-colors relative ${
        isFloating ? 'border border-[#cccccc] dark:border-[#333333] rounded-sm' : 'h-full border-l border-[#cccccc] dark:border-[#333333] shrink-0'
      }`}
    >
      {/* Resizing Handles */}
      <div 
        onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 z-10 ${!isFloating ? '-ml-0.5' : ''}`}
      />
      {isFloating && (
        <>
          <div onMouseDown={(e) => handleResizeMouseDown(e, 'right')} className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 z-10" />
          <div onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')} className="absolute left-0 right-0 bottom-0 h-1 cursor-ns-resize hover:bg-blue-500/50 z-10" />
          <div onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-right')} className="absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize hover:bg-blue-500/50 z-20" />
        </>
      )}

      {/* Header */}
      <div 
        onMouseDown={handleHeaderMouseDown}
        className={`h-6 bg-[#f0f0f0] dark:bg-[#252526] border-b border-[#cccccc] dark:border-[#333333] flex flex-col justify-end px-2 select-none transition-colors ${isFloating ? 'cursor-move' : ''}`}
      >
        <div className="flex justify-between items-center text-black dark:text-gray-200 font-semibold text-[11px] pb-0.5">
          <span>Accounts {!loading && `(${accounts.length})`}</span>
          <div className="flex gap-1 items-center">
            {/* Dock/Undock toggle button */}
            <button
               onClick={() => {
                 if (!isFloating) {
                   const rect = sidebarRef.current?.getBoundingClientRect();
                   if (rect) {
                     setPosition({ x: rect.left - 20, y: rect.top });
                     setSize(prev => ({ ...prev, height: rect.height }));
                   }
                 }
                 setIsFloating(!isFloating);
               }}
               title={isFloating ? "Dock to Right Sidebar" : "Undock to Floating Panel"}
               className="hover:bg-blue-500 hover:text-white text-gray-600 dark:text-gray-400 p-0.5 rounded-sm transition-colors cursor-pointer border border-transparent"
             >
               {isFloating ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            </button>
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
