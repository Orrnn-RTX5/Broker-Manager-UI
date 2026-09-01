import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, WifiOff, Activity } from 'lucide-react';
import FileMenu from './menus/FileMenu';
import EditMenu from './menus/EditMenu';
import ViewMenu from './menus/ViewMenu';
import ToolsMenu from './menus/ToolsMenu';
import WindowMenu from './menus/WindowMenu';
import HelpMenu from './menus/HelpMenu';
import NewAccountModal from './Popups/NewAccountModal';
import LoginModal from './Popups/LoginModal';
import DesktopAppDownloadButton from './DesktopAppDownloadButton';
import DesktopUpdateButton from './DesktopUpdateButton';
import ExportCurrentViewDialog from './ExportCurrentViewDialog';
import apiClient from '../services/apiClient';
import { isDesktopBackendTarget } from '../config/backendTarget.js';

const MenuBar = ({ isAuthenticated, onLogin, onLogout, onViewAction }) => {
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [connectionData, setConnectionData] = useState(null);
  const [pingMs, setPingMs] = useState(null);
  const [trafficKb, setTrafficKb] = useState(13.0); // start with a small base to look realistic
  const menuRef = useRef(null);
  const menuItems = ['File', 'Edit', 'View', 'Tools', 'Window', 'Help'];

  useEffect(() => {
    let intervalId;
    let initialCheckTimer;
    const checkConnection = async () => {
      if (!isAuthenticated) {
        setConnectionData(null);
        return;
      }
      try {
        const startTime = performance.now();
        const data = await apiClient.get('/ConnectionStatus');
        const endTime = performance.now();
        
        const ms = Math.round(endTime - startTime);
        const downloadedKb = 0.5; // Estimated heartbeat size
        
        setPingMs(ms);
        setTrafficKb(prev => prev + downloadedKb);
        
        const info = Array.isArray(data) ? data[0] : data;
        setConnectionData(info);
      } catch (err) {
        setConnectionData({ status: 'Disconnected', error: err.message });
        setPingMs(null);
      }
    };

    if (isAuthenticated) {
        // Connection telemetry is useful, but it is not dashboard-critical.
        // Let the visible data requests start first on a hard refresh.
        initialCheckTimer = window.setTimeout(() => {
          checkConnection();
          intervalId = window.setInterval(checkConnection, 10000); // Poll every 10s
        }, 1_000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (initialCheckTimer) window.clearTimeout(initialCheckTimer);
    };
  }, [isAuthenticated]);

  // After manager login succeeds, close the modal
  const handleLoginSuccess = (token) => {
    setIsLoginOpen(false);
    if (onLogin) onLogin(token);
  };

  // Handle clicking outside to close the menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const renderDropdown = (item) => {
    if (activeMenu !== item) return null;

    const handleConnectClick = () => {
      setActiveMenu(null);
      setIsLoginOpen(true);
    };

    const handleNewAccountClick = () => {
      setActiveMenu(null);
      setIsNewAccountOpen(true);
    };

    const handleExportClick = () => {
      setActiveMenu(null);
      setIsExportOpen(true);
    };

    const handleDisconnectClick = () => {
      setActiveMenu(null);
      if (onLogout) onLogout();
    };

    const handleExitClick = () => {
      setActiveMenu(null);
      if (onLogout) onLogout();
    };

    switch (item) {
      case 'File': return <FileMenu 
        isAuthenticated={isAuthenticated}
        onConnectClick={handleConnectClick} 
        onDisconnectClick={handleDisconnectClick}
        onNewAccountClick={handleNewAccountClick} 
        onExportClick={handleExportClick}
        onExitClick={handleExitClick}
        onPrintClick={() => {
          setActiveMenu(null);
          window.print();
        }}
        onClose={() => setActiveMenu(null)}
      />;
      case 'Edit': return <EditMenu onClose={() => setActiveMenu(null)} />;
      case 'View': return <ViewMenu onClose={() => setActiveMenu(null)} onViewAction={onViewAction} />;
      case 'Tools': return <ToolsMenu onClose={() => setActiveMenu(null)} />;
      case 'Window': return <WindowMenu onClose={() => setActiveMenu(null)} />;
      case 'Help': return <HelpMenu onClose={() => setActiveMenu(null)} />;
      default: return (
        <div className="absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[200px] z-50">
          <div className="px-6 py-1.5 text-[13px] text-gray-500 dark:text-gray-400 italic">Menu not implemented yet</div>
        </div>
      );
    }
  };

  const visibleConnectionData = isAuthenticated ? connectionData : null;
  const visiblePingMs = isAuthenticated ? pingMs : null;
  const isConnected = visibleConnectionData?.status === 'Connected';
  const pingTone = visiblePingMs == null ? 'var(--muted)' : visiblePingMs < 150 ? 'var(--ok)' : 'var(--warn)';
  const showDesktopDownload = !isDesktopBackendTarget();
  const showDesktopUpdater = typeof window !== 'undefined' && typeof window.rtx5Updater?.checkForUpdates === 'function';

  return (
    <div
      className="app-menu-bar manager-menu-bar flex items-center justify-between text-[13px] select-none relative"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        color: 'var(--text-2)',
      }}
    >
      <div className="flex items-center h-full" ref={menuRef}>
        {/* Logo */}
        <button
          type="button"
          className="manager-menu-brand px-2 flex items-center h-full cursor-pointer border-0 bg-transparent text-left"
          style={{ color: 'var(--text)' }}
          onClick={() => {
            setActiveMenu(null);
            navigate('/');
          }}
          title="Go to dashboard"
          aria-label="Go to dashboard"
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'var(--accent)', color: '#fff', letterSpacing: '-0.02em' }}
          >
            R5
          </div>
          <div className="ml-2 leading-tight">
            <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>RTX5</div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-3)' }}>Manager</div>
          </div>
        </button>

        {/* Menu Items */}
        <div className="manager-menu-items flex items-center h-full ml-1 gap-0.5">
          {menuItems.map((item) => {
            const active = activeMenu === item;
            return (
              <div key={item} className="relative flex items-center h-full">
                <div
                  onClick={() => setActiveMenu(active ? null : item)}
                  onMouseEnter={() => activeMenu && setActiveMenu(item)}
                  className="manager-menu-item px-2.5 h-[26px] flex items-center cursor-pointer rounded-md transition-colors"
                  style={{
                    background: active ? 'var(--surface-3)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--text-2)',
                    fontWeight: active ? 500 : 400,
                  }}
                  onMouseOver={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseOut={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {item}
                </div>
                {renderDropdown(item)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right side status */}
      <div className="manager-menu-status flex items-center h-full gap-2 px-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
        <select
          className="border-none focus:outline-none rounded-md px-2 py-1 cursor-pointer appearance-none text-[11px]"
          style={{ background: 'transparent', color: 'var(--text-2)' }}
        >
          {['English (EN)', 'Arabic (AR)', 'Chinese (ZH)', 'French (FR)', 'German (DE)', 'Hindi (HI)', 'Japanese (JA)', 'Russian (RU)', 'Spanish (ES)', 'Turkish (TR)'].map(code => (
            <option key={code} value={code} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
              {code}
            </option>
          ))}
        </select>

        {showDesktopDownload && (
          <>
            <span className="h-4 w-px" style={{ background: 'var(--border)' }} />
            <DesktopAppDownloadButton variant="menu" />
          </>
        )}

        {showDesktopUpdater && (
          <>
            <span className="h-4 w-px" style={{ background: 'var(--border)' }} />
            <DesktopUpdateButton />
          </>
        )}

        <span className="h-4 w-px" style={{ background: 'var(--border)' }} />

        <div className="flex items-center gap-1.5">
          <Activity size={13} style={{ color: pingTone }} />
          <span className="font-mono text-[11px] tabular">
            {pingMs !== null ? `${pingMs} ms` : '---'} · {trafficKb.toFixed(1)} KB
          </span>
        </div>

        <span className="h-4 w-px" style={{ background: 'var(--border)' }} />

        <div className="relative group flex items-center h-full">
          <div
            className="flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-md"
            style={{
              background: isConnected ? 'var(--ok-soft)' : 'var(--surface-3)',
              color: isConnected ? 'var(--ok-text)' : 'var(--muted)',
              border: `1px solid ${isConnected ? 'var(--ok-border)' : 'var(--border)'}`,
              fontWeight: 500,
            }}
          >
            {isConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span className="text-[11px]">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>

          {isConnected && (
            <div
              className="absolute top-full right-0 mt-2 hidden group-hover:block w-56 py-3 px-4 z-[100] text-xs ui-card"
              style={{ boxShadow: 'var(--shadow-lg)' }}
            >
              <div className="font-semibold pb-2 mb-2" style={{ color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                Connection
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <div style={{ color: 'var(--text-3)' }}>Status</div>
                <div style={{ color: 'var(--ok-text)', fontWeight: 500 }}>{visibleConnectionData.status}</div>
                <div style={{ color: 'var(--text-3)' }}>Login</div>
                <div className="font-mono tabular" style={{ color: 'var(--text)' }}>{visibleConnectionData.login}</div>
                <div style={{ color: 'var(--text-3)' }}>Uptime</div>
                <div className="font-mono tabular" style={{ color: 'var(--text)' }}>{visibleConnectionData.connectedTime}s</div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Modals */}
      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
      <ExportCurrentViewDialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLoginSuccess={handleLoginSuccess} />
    </div>
  );
};

export default MenuBar;
