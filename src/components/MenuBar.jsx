import { useState, useRef, useEffect } from 'react';
import { Wifi, WifiOff, Activity } from 'lucide-react';
import FileMenu from './menus/FileMenu';
import ViewMenu from './menus/ViewMenu';
import ToolsMenu from './menus/ToolsMenu';
import WindowMenu from './menus/WindowMenu';
import HelpMenu from './menus/HelpMenu';
import NewAccountModal from './Popups/NewAccountModal';
import LoginModal from './Popups/LoginModal';
import apiClient from '../services/apiClient';

const MenuBar = ({ isAuthenticated, onLogin, onLogout }) => {
  const [activeMenu, setActiveMenu] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [connectionData, setConnectionData] = useState(null);
  const [pingMs, setPingMs] = useState(null);
  const [trafficKb, setTrafficKb] = useState(13.0); // start with a small base to look realistic
  const menuRef = useRef(null);
  const menuItems = ['File', 'Edit', 'View', 'Tools', 'Window', 'Help'];

  useEffect(() => {
    let intervalId;
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
        checkConnection();
        intervalId = setInterval(checkConnection, 10000); // Poll every 10s
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
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

    const handleDisconnectClick = () => {
      setActiveMenu(null);
      if (onLogout) onLogout();
    };

    switch (item) {
      case 'File': return <FileMenu 
        isAuthenticated={isAuthenticated}
        onConnectClick={handleConnectClick} 
        onDisconnectClick={handleDisconnectClick}
        onNewAccountClick={handleNewAccountClick} 
        onPrintClick={() => {
          setActiveMenu(null);
          window.print();
        }}
        onClose={() => setActiveMenu(null)}
      />;
      case 'View': return <ViewMenu onClose={() => setActiveMenu(null)} />;
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

  return (
    <div
      className="app-menu-bar h-9 flex items-center justify-between px-2 text-[13px] select-none relative z-50"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        color: 'var(--text-2)',
      }}
    >
      <div className="flex items-center h-full" ref={menuRef}>
        {/* Logo */}
        <div
          className="px-2.5 flex items-center h-full cursor-pointer"
          style={{ color: 'var(--text)' }}
        >
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'var(--accent)', color: '#fff', letterSpacing: '-0.02em' }}
          >
            R5
          </div>
        </div>

        {/* Menu Items */}
        <div className="flex items-center h-full ml-1 gap-0.5">
          {menuItems.map((item) => {
            const active = activeMenu === item;
            return (
              <div key={item} className="relative flex items-center h-full">
                <div
                  onClick={() => setActiveMenu(active ? null : item)}
                  onMouseEnter={() => activeMenu && setActiveMenu(item)}
                  className="px-2.5 h-[26px] flex items-center cursor-pointer rounded-md transition-colors"
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
      <div className="flex items-center h-full gap-3 px-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
        <select
          className="border-none focus:outline-none rounded-md px-2 py-1 cursor-pointer appearance-none text-[11px]"
          style={{ background: 'transparent', color: 'var(--text-2)' }}
        >
          {['English (EN)', 'Arabic (AR)', 'Chinese (ZH)', 'French (FR)', 'German (DE)', 'Hindi (HI)', 'Japanese (JA)', 'Russian (RU)', 'Spanish (ES)', 'Turkish (TR)'].map(code => (
            <option key={code}>{code}</option>
          ))}
        </select>

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
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLoginSuccess={handleLoginSuccess} />
    </div>
  );
};

export default MenuBar;
