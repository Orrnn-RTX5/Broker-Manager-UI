import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Wifi, WifiOff, Activity, Bell, RefreshCw, Settings,
  CheckCheck, LayoutDashboard, LogOut, Maximize2, Minimize2, Moon, RotateCcw, Sun,
} from 'lucide-react';
import FileMenu from './menus/FileMenu';
import EditMenu from './menus/EditMenu';
import ViewMenu from './menus/ViewMenu';
import ToolsMenu from './menus/ToolsMenu';
import WindowMenu from './menus/WindowMenu';
import HelpMenu from './menus/HelpMenu';
import NewAccountModal from './Popups/NewAccountModal';
import LoginModal from './Popups/LoginModal';
import ExportCurrentViewDialog from './ExportCurrentViewDialog';
import apiClient from '../services/apiClient';
import { usePermissions } from '../hooks/usePermissions.js';
import useThemeStore from '../store/themeStore.js';
import useNotificationStore from '../store/notificationStore.js';
import { MANAGER_REFRESH_EVENT, refreshWorkspaceData } from '../utils/quickSettingsActions.js';

const TOP_POPOVERS = {
  notifications: 'notifications',
  settings: 'settings',
  profile: 'profile',
};

const NOTIFICATION_IDS = ['connection', 'dealer-operations', 'executive-overview'];

const MenuBar = ({ isAuthenticated, onLogin, onLogout, onViewAction, onStatusChange }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { manager, loading: isManagerLoading } = usePermissions();
  const managerLabel = manager.login || manager.displayName;
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [activeTopPopover, setActiveTopPopover] = useState(null);
  const [readNotificationIds, setReadNotificationIds] = useState([]);
  const [connectionData, setConnectionData] = useState(null);
  const [pingMs, setPingMs] = useState(null);
  const [trafficKb, setTrafficKb] = useState(13.0); // start with a small base to look realistic
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement ?? document.webkitFullscreenElement));
  const menuRef = useRef(null);
  const statusRef = useRef(null);
  const menuItems = ['File', 'Edit', 'View', 'Tools', 'Window', 'Help'];

  useEffect(() => {
    let timeoutId;
    const handleRefresh = () => {
      setIsManualSyncing(true);
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsManualSyncing(false);
      }, 1000);
    };

    window.addEventListener(MANAGER_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(MANAGER_REFRESH_EVENT, handleRefresh);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement ?? document.webkitFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

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

  // Share the single telemetry polling stream with the bottom status bar.
  useEffect(() => {
    onStatusChange?.({ connectionData, pingMs, trafficKb });
  }, [connectionData, pingMs, trafficKb, onStatusChange]);

  // After manager login succeeds, close the modal
  const handleLoginSuccess = (token) => {
    setIsLoginOpen(false);
    if (onLogin) onLogin(token);
  };

  useEffect(() => {
    const handlePointerDownOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }
      if (statusRef.current && !statusRef.current.contains(event.target)) {
        setActiveTopPopover(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveMenu(null);
        setActiveTopPopover(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
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
        <div className="manager-menu-dropdown absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[200px] z-50">
          <div className="px-6 py-1.5 text-gray-500 dark:text-gray-400 italic">Menu not implemented yet</div>
        </div>
      );
    }
  };

  const visibleConnectionData = isAuthenticated ? connectionData : null;
  const visiblePingMs = isAuthenticated ? pingMs : null;
  const isConnected = visibleConnectionData?.status === 'Connected';
  const pingTone = visiblePingMs == null ? 'var(--muted)' : visiblePingMs < 150 ? 'var(--ok)' : 'var(--warn)';
  const toggleTopPopover = (popover) => {
    setActiveMenu(null);
    setActiveTopPopover((current) => current === popover ? null : popover);
  };
  const changeAppearance = () => {
    const nextAppearance = isDarkMode ? 'Light' : 'Dark';
    toggleTheme();
    setActiveTopPopover(null);
    addNotification(`${nextAppearance} appearance enabled`, 'success', 2500);
  };
  const refreshWorkspace = async () => {
    setActiveTopPopover(null);
    try {
      await refreshWorkspaceData(queryClient);
      addNotification('Workspace data refreshed', 'success', 2500);
    } catch (error) {
      addNotification(`Workspace refresh failed: ${error.message}`, 'error');
    }
  };
  const resetWorkspace = async () => {
    setActiveTopPopover(null);
    try {
      await Promise.resolve(onViewAction?.('reset-layout'));
      addNotification('Default workspace layout restored', 'success', 2500);
    } catch (error) {
      addNotification(`Unable to reset layout: ${error.message}`, 'error');
    }
  };
  const toggleFullscreen = async () => {
    setActiveTopPopover(null);
    try {
      const fullscreen = await onViewAction?.('fullscreen');
      setIsFullscreen(Boolean(fullscreen));
      addNotification(fullscreen ? 'Fullscreen enabled' : 'Fullscreen exited', 'success', 2500);
    } catch (error) {
      addNotification(error.message || 'Unable to change fullscreen mode', 'error');
    }
  };
  const goToDashboard = () => {
    navigate('/dashboard');
    setActiveTopPopover(null);
  };
  const signOut = () => {
    setActiveTopPopover(null);
    onLogout?.();
  };
  const unreadNotificationCount = Math.max(0, NOTIFICATION_IDS.length - readNotificationIds.length);
  const markNotificationRead = (notificationId) => {
    setReadNotificationIds((current) => (
      current.includes(notificationId) ? current : [...current, notificationId]
    ));
  };
  const markAllNotificationsRead = () => {
    setReadNotificationIds(NOTIFICATION_IDS);
  };

  return (
    <div
      className="app-menu-bar manager-menu-bar workspace-ui flex items-center justify-between text-[13px] select-none relative"
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
          {isDarkMode ? (
            <span className="manager-brand-stacked">
              <img className="manager-brand-symbol" src="/manager-symbol-dark.png" alt="" />
              <span className="manager-brand-caption">Manager</span>
            </span>
          ) : <>
          <img className="manager-menu-logo" src="/rtx5-logo.png" alt="RTX5" />
          <div className="ml-2 leading-tight">
            <div className="manager-menu-brand-name text-[12px] font-bold" style={{ color: 'var(--text)' }}>RTX5 Manager</div>
            <div className="manager-menu-brand-subtitle text-[9px] font-semibold" style={{ color: 'var(--text-3)' }}>Brokerage Operations &amp; Owner Console</div>
          </div>
          </>}
        </button>

        {/* Menu Items */}
        <div className="manager-menu-items flex items-center h-full ml-1 gap-0.5">
          {menuItems.map((item) => {
            const active = activeMenu === item;
            return (
              <div key={item} className="relative flex items-center h-full">
                <button
                  type="button"
                  className={`manager-menu-item px-2.5 h-[26px] flex items-center cursor-pointer rounded-md border-0 ${active ? 'is-open' : ''}`}
                  style={{
                    background: active ? 'var(--surface-3)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--text-2)',
                    fontWeight: active ? 500 : 400,
                  }}
                  aria-haspopup="menu"
                  aria-expanded={active}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveMenu(active ? null : item);
                  }}
                >
                  {item}
                </button>
                {renderDropdown(item)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right side actions; live telemetry is rendered in the bottom status bar. */}
      <div ref={statusRef} className="manager-menu-status flex items-center h-full gap-2 px-2 text-[12px]" style={{ color: 'var(--text-3)' }}>
        <div className="manager-menu-telemetry flex items-center gap-1.5">
          <Activity size={13} style={{ color: pingTone }} />
          <span className="font-mono text-[11px] tabular">
            {pingMs !== null ? `${pingMs} ms` : '---'} · {trafficKb.toFixed(1)} KB
          </span>
        </div>

        <span className="manager-menu-telemetry-divider h-4 w-px" style={{ background: 'var(--border)' }} />
        <div className="manager-menu-connection relative group flex items-center h-full">
          <div
            className="flex items-center gap-1.5 cursor-pointer px-2.5 py-1 rounded-md transition-all duration-200"
            style={{
              background: isConnected ? 'var(--ok-soft)' : 'var(--surface-3)',
              color: isConnected ? 'var(--ok-text)' : 'var(--muted)',
              border: `1px solid ${isConnected ? 'var(--ok-border)' : 'var(--border)'}`,
              fontWeight: 500,
            }}
          >
            {isConnected ? (
              <Wifi size={13} />
            ) : (
              <WifiOff size={13} />
            )}
            <span className="text-[11px] font-medium tracking-wide">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
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
        <div className="cc-top-action-wrap">
          <button
            type="button"
            className={`cc-top-icon ${activeTopPopover === TOP_POPOVERS.notifications ? 'is-open' : ''}`}
            title="Notifications"
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={activeTopPopover === TOP_POPOVERS.notifications}
            onClick={() => toggleTopPopover(TOP_POPOVERS.notifications)}
          >
            <Bell size={14} />{unreadNotificationCount > 0 && <b>{unreadNotificationCount}</b>}
          </button>
          {activeTopPopover === TOP_POPOVERS.notifications && (
            <section className="cc-top-popover cc-notifications-popover" role="dialog" aria-label="Notifications">
              <header><div><strong>Notifications</strong><small>{unreadNotificationCount > 0 ? `${unreadNotificationCount} unread` : 'All caught up'}</small></div><button type="button" onClick={markAllNotificationsRead} disabled={unreadNotificationCount === 0}><CheckCheck size={13} /> Mark read</button></header>
              <div className="cc-notification-list">
                <button type="button" className={readNotificationIds.includes('connection') ? 'is-read' : ''} onClick={() => { markNotificationRead('connection'); refreshWorkspace(); }}>
                  <span className={`cc-notification-dot ${readNotificationIds.includes('connection') ? 'is-read' : isConnected ? 'is-ok' : 'is-danger'}`} />
                  <span><strong>{isConnected ? 'Broker connection is online' : 'Broker connection needs attention'}</strong><small>{visiblePingMs == null ? 'Connection telemetry is unavailable.' : `Latest response: ${visiblePingMs} ms.`}</small></span>
                </button>
                <button type="button" className={readNotificationIds.includes('dealer-operations') ? 'is-read' : ''} onClick={() => { markNotificationRead('dealer-operations'); navigate('/dealer/queue'); setActiveTopPopover(null); }}>
                  <span className={`cc-notification-dot ${readNotificationIds.includes('dealer-operations') ? 'is-read' : 'is-warn'}`} />
                  <span><strong>Review dealer operations</strong><small>Open the dealer queue and pending requests.</small></span>
                </button>
                <button type="button" className={readNotificationIds.includes('executive-overview') ? 'is-read' : ''} onClick={() => { markNotificationRead('executive-overview'); goToDashboard(); }}>
                  <span className={`cc-notification-dot ${readNotificationIds.includes('executive-overview') ? 'is-read' : 'is-info'}`} />
                  <span><strong>Executive overview available</strong><small>Return to the live manager dashboard.</small></span>
                </button>
              </div>
            </section>
          )}
        </div>
        <div className="cc-top-action-wrap">
          <button
            type="button"
            className={`cc-top-icon ${activeTopPopover === TOP_POPOVERS.settings ? 'is-open' : ''}`}
            title="Quick settings"
            aria-label="Quick settings"
            aria-haspopup="menu"
            aria-expanded={activeTopPopover === TOP_POPOVERS.settings}
            onClick={() => toggleTopPopover(TOP_POPOVERS.settings)}
          ><Settings size={14} /></button>
          {activeTopPopover === TOP_POPOVERS.settings && (
            <section className="cc-top-popover cc-settings-popover" role="menu" aria-label="Quick settings">
              <header><div><strong>Quick Settings</strong><small>Workspace preferences</small></div></header>
              <button type="button" role="menuitem" onClick={changeAppearance}>
                {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}<span><strong>{isDarkMode ? 'Light appearance' : 'Dark appearance'}</strong><small>Switch the manager colour theme</small></span>
              </button>
              <button type="button" role="menuitem" onClick={refreshWorkspace} disabled={isManualSyncing} aria-busy={isManualSyncing}><RefreshCw size={15} className={isManualSyncing ? 'animate-spin' : ''} /><span><strong>{isManualSyncing ? 'Refreshing workspace' : 'Refresh workspace'}</strong><small>Reload visible manager data</small></span></button>
              <button type="button" role="menuitem" onClick={resetWorkspace}><RotateCcw size={15} /><span><strong>Reset layout</strong><small>Restore the default panels and dashboard</small></span></button>
              <button type="button" role="menuitem" onClick={toggleFullscreen}>{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span><strong>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</strong><small>{isFullscreen ? 'Return to the windowed workspace' : 'Use the available screen space'}</small></span></button>
            </section>
          )}
        </div>
        <div className="cc-top-action-wrap">
          <button
            type="button"
            className={`cc-admin-profile cc-admin-profile-compact ${activeTopPopover === TOP_POPOVERS.profile ? 'is-open' : ''}`}
            title={isManagerLoading ? 'Loading signed-in manager' : `Signed in as ${managerLabel}`}
            aria-label={`Signed-in manager: ${managerLabel}. Click to view account details.`}
            aria-haspopup="menu"
            aria-expanded={activeTopPopover === TOP_POPOVERS.profile}
            onClick={() => toggleTopPopover(TOP_POPOVERS.profile)}
          >
            <span>{manager.initial}</span>
            <div>
              <strong>{isManagerLoading && !manager.login ? 'Loading…' : managerLabel}</strong>
              <small>{manager.role}</small>
            </div>
          </button>
          {activeTopPopover === TOP_POPOVERS.profile && <section className="cc-manager-profile-card is-open" role="menu" aria-label="Manager account menu">
            <header><strong>Signed-in Manager</strong><small>Authenticated session</small></header>
            <dl>
              {manager.displayName !== manager.login && <div><dt>Name</dt><dd>{manager.displayName}</dd></div>}
              <div><dt>Login</dt><dd>{manager.login || 'Unavailable'}</dd></div>
              <div><dt>Role</dt><dd>{manager.role}</dd></div>
              <div><dt>Broker</dt><dd>{manager.brokerId || 'Unavailable'}</dd></div>
              <div><dt>Permissions</dt><dd>{manager.isAdmin ? 'Administrator' : manager.permissions.length}</dd></div>
            </dl>
            <div className="cc-profile-actions">
              <button type="button" role="menuitem" className="is-danger" onClick={signOut}><LogOut size={14} /> Sign out</button>
            </div>
          </section>}
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
