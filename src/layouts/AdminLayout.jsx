import { useCallback, useEffect, useState } from 'react';
import MenuBar from '../components/MenuBar';
import ToolBar from '../components/ToolBar';
import NavigatorPanel from '../components/NavigatorPanel';
import MarginCallsSidebar from '../components/MarginCallsSidebar';
import MarketData from '../components/Popups/MarketData';
import WorkspaceTabs from '../components/shell/WorkspaceTabs';
import StatusBar from '../components/shell/StatusBar';
import OwnerConsole from '../features/owner/OwnerConsole';
import TerminalDock from '../features/terminal/TerminalDock';
import useThemeStore from '../store/themeStore';
import useSymbolStore from '../store/symbolStore';

import { DockingProvider } from '../components/docking/index.js';
import DockLayout from '../components/docking/DockLayout';
import { useDockingContext } from '../components/docking/DockingContext';
import ToastContainer from '../components/ToastContainer';
import useWorkspaceNavigation from '../hooks/useWorkspaceNavigation';
import { startPositionSync, stopPositionSync, subscribeToPositionSync, requiresPositionReconciliation } from '../services/positionSync';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRealtimeCaches } from '../services/api';
import { clearAccountDetailsCache } from '../services/accountDetails';
import { resetWorkspaceLayout, toggleDocumentFullscreen } from '../utils/quickSettingsActions.js';
import '../styles/command-center.css';
const PANEL_NAVIGATOR  = 'navigator';
const PANEL_ACCOUNTS   = 'accounts';
const PANEL_MARKET_DATA= 'market_data';
const PANEL_OWNER      = 'owner_console';
const PANEL_TERMINAL   = 'terminal';

// ─── Initial panel configuration ─────────────────────────────────────────────
const INITIAL_PANELS = {
  [PANEL_NAVIGATOR]: {
    title: 'Navigator',
    icon: '📂',
    defaultPosition: 'left',
    visible: true,
    order: 1,
    size: { width: 204, height: '100%' },
  },
  [PANEL_ACCOUNTS]: {
    title: 'Accounts',
    icon: 'users',
    defaultPosition: 'right',
    visible: false,
    size: { width: 280, height: '100%' },
  },
  [PANEL_MARKET_DATA]: {
    title: 'Market Watch',
    icon: '📈',
    defaultPosition: 'left',
    visible: true,
    canMaximize: true,
    order: 0,
    size: { width: 346, height: '100%' },
  },
  [PANEL_OWNER]: {
    title: 'Owner Console',
    icon: 'owner',
    defaultPosition: 'right',
    visible: false,
    size: { width: 210, height: '100%' },
  },
  [PANEL_TERMINAL]: {
    title: 'Operations Terminal',
    icon: 'terminal',
    defaultPosition: 'bottom',
    visible: true,
    canMaximize: true,
    size: { width: '100%', height: 'clamp(190px, 26vh, 260px)' },
  },
};

// ─── Inner layout (needs docking context) ────────────────────────────────────
function WorkspaceInner({ children, isAuthenticated, onLogin, onLogout }) {
  const queryClient = useQueryClient();
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const { togglePanel, updatePanels, panels, resetLayout: resetDockLayout } = useDockingContext();
  const navigate = useWorkspaceNavigation();
  const [isToolBarVisible, setIsToolBarVisible] = useState(true);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const resetLayout = useCallback(() => {
    resetDockLayout();
    setIsToolBarVisible(true);
    // Restore tab selections and scroll positions along with the panel geometry.
    setWorkspaceRevision((revision) => revision + 1);
  }, [resetDockLayout]);
  const [connectionTelemetry, setConnectionTelemetry] = useState({
    connectionData: null,
    pingMs: null,
    trafficKb: 13.0,
  });

  const isNavigatorOpen = Boolean(panels[PANEL_NAVIGATOR]?.visible);
  const isAccountsOpen  = Boolean(panels[PANEL_ACCOUNTS]?.visible);
  const isMarketDataOpen = Boolean(panels[PANEL_MARKET_DATA]?.visible);
  const isOwnerConsoleOpen = Boolean(panels[PANEL_OWNER]?.visible);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // ── Symbol Store Initialization ──────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    useSymbolStore.getState().initWebSocket();
    return () => useSymbolStore.getState().disconnectWebSocket();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      stopPositionSync();
      clearAccountDetailsCache();
      return undefined;
    }

    startPositionSync();
    let refreshTimer;
    let refreshing = false;
    let dirty = false;
    let stopped = false;
    const refresh = async () => {
      refreshTimer = undefined;
      if (stopped) return;
      if (refreshing) { dirty = true; return; }
      refreshing = true;
      dirty = false;
      try {
        invalidateRealtimeCaches();
        window.dispatchEvent(new Event('manager:refresh-data'));
        // Cancel a pre-mutation request instead of reusing its stale snapshot.
        await queryClient.invalidateQueries({ refetchType: 'active' });
      } finally {
        refreshing = false;
        if (dirty && !stopped && !refreshTimer) refreshTimer = setTimeout(refresh, 50);
      }
    };
    const unsubscribe = subscribeToPositionSync((event) => {
      if (!requiresPositionReconciliation(event?.payload) && event?.reason !== 'connected') return;
      if (refreshing) { dirty = true; return; }
      if (refreshTimer) return;
      refreshTimer = setTimeout(refresh, 50);
    });
    return () => { stopped = true; clearTimeout(refreshTimer); unsubscribe(); stopPositionSync(); };
  }, [isAuthenticated, queryClient]);

  const toggleFullscreen = useCallback(() => toggleDocumentFullscreen(document), []);

  const toggleMarketWatch = useCallback(() => {
    togglePanel(PANEL_MARKET_DATA);
  }, [togglePanel]);

  const toggleAccountsPanel = useCallback(() => {
    updatePanels((prev) => {
      const accounts = prev[PANEL_ACCOUNTS];
      if (!accounts) return prev;
      const nextVisible = !accounts.visible;
      const next = {
        ...prev,
        [PANEL_ACCOUNTS]: {
          ...accounts,
          accountType: 'all',
          title: 'Accounts',
          visible: nextVisible,
          userPinned: nextVisible,
          maximized: nextVisible ? accounts.maximized : false,
        },
      };
      if (nextVisible && prev[PANEL_OWNER]?.visible) {
        next[PANEL_OWNER] = {
          ...prev[PANEL_OWNER],
          visible: false,
          maximized: false,
        };
      }
      return next;
    });
  }, [updatePanels]);

  const handleViewAction = useCallback((action) => {
    switch (action) {
      case 'market-watch':
        toggleMarketWatch();
        break;
      case 'navigator':
        togglePanel(PANEL_NAVIGATOR);
        break;
      case 'margin-calls':
        toggleAccountsPanel();
        break;
      case 'reset-layout':
        resetWorkspaceLayout(resetLayout, navigate);
        return true;
      case 'queue':
        navigate('/dealer/queue');
        break;
      case 'toolbar':
      case 'toolbox':
        setIsToolBarVisible((visible) => !visible);
        break;
      case 'fullscreen':
        return toggleFullscreen();
      default:
        break;
    }
  }, [navigate, toggleAccountsPanel, toggleMarketWatch, toggleFullscreen, togglePanel, resetLayout]);

  // ── Keyboard Shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input-like element
      const activeElement = document.activeElement;
      const isInput = activeElement.tagName === 'INPUT' || 
                      activeElement.tagName === 'TEXTAREA' || 
                      activeElement.isContentEditable;
      
      if (isInput) return;

      const key = e.key?.toLowerCase() || '';
      const ctrlKey = e.ctrlKey || e.metaKey;

      // Ctrl+N is reserved by Chrome for a new window and cannot be safely
      // overridden by a web page, so Navigator uses Alt+N instead.
      if (e.altKey && !ctrlKey && !e.shiftKey && key === 'n') {
        e.preventDefault();
        handleViewAction('navigator');
        return;
      }

      if (e.altKey && !ctrlKey && !e.shiftKey && key === 't') {
        e.preventDefault();
        handleViewAction('reset-layout');
        return;
      }

      if (ctrlKey) {
        const viewShortcutActions = {
          m: 'market-watch',
          l: 'margin-calls',
          q: 'queue',
          t: 'toolbox',
        };
        const action = viewShortcutActions[key];
        if (action) {
          e.preventDefault();
          handleViewAction(action);
          return;
        }
      }

      if (key === 'F11'.toLowerCase() && !ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        handleViewAction('fullscreen')?.catch?.(console.error);
        return;
      }

      // Single Key Shortcuts
      if (!ctrlKey && !e.altKey && !e.shiftKey) {
        switch (key) {
          case 'c':
            navigate('/clients');
            break;
          case 'o':
            navigate('/clients/orders');
            break;
          case 'p':
            navigate('/clients/positions');
            break;
          default:
            break;
        }
      }
    };

    // Capture the event before browser/default handlers so Ctrl+N, Ctrl+L,
    // Ctrl+Q and Ctrl+T do not trigger their browser-level behaviours.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleViewAction, navigate]);

  // ── panel content map ──────────────────────────────────────────────────────
  const panelContents = {
    [PANEL_NAVIGATOR]: <NavigatorPanel />,
    [PANEL_ACCOUNTS]:  <MarginCallsSidebar key={panels[PANEL_ACCOUNTS]?.accountType || 'all'} isAuthenticated={isAuthenticated} accountType={panels[PANEL_ACCOUNTS]?.accountType || 'all'} />,
    [PANEL_MARKET_DATA]: <MarketData compact />,
    [PANEL_OWNER]: <OwnerConsole />,
    [PANEL_TERMINAL]: <TerminalDock isAuthenticated={isAuthenticated} />,
  };


  return (
    <div
      className="rtx5-command-shell flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <ToastContainer />
      {/* ── Top bars ── */}
      <MenuBar
        isAuthenticated={isAuthenticated}
        onLogin={onLogin}
        onLogout={onLogout}
        onViewAction={handleViewAction}
        onStatusChange={setConnectionTelemetry}
        toolbar={isToolBarVisible ? (
          <ToolBar
            toggleSidebar={() => togglePanel(PANEL_NAVIGATOR)}
            isSidebarOpen={isNavigatorOpen}
            toggleRightSidebar={toggleAccountsPanel}
            isRightSidebarOpen={isAccountsOpen}
            toggleMarketData={toggleMarketWatch}
            isMarketDataOpen={isMarketDataOpen}
            toggleOwnerConsole={() => togglePanel(PANEL_OWNER)}
            isOwnerConsoleOpen={isOwnerConsoleOpen}
            resetLayout={resetLayout}
            onLogout={onLogout}
          />
        ) : null}
      />

      {/* ── Main dockable workspace ── */}
      <div className="cc-shell-workspace flex-1 overflow-hidden" style={{ borderTop: '1px solid var(--border)' }}>
        <DockLayout key={workspaceRevision} panelContents={panelContents}>
          <div className="cc-center-workspace flex-1 min-h-0 w-full overflow-hidden relative" style={{ background: 'var(--bg)' }} data-export-current-view>
            <WorkspaceTabs />
            <div className="cc-route-viewport">
              {children}
            </div>
          </div>
        </DockLayout>
      </div>
      <StatusBar
        isAuthenticated={isAuthenticated}
        connectionData={connectionTelemetry.connectionData}
        pingMs={connectionTelemetry.pingMs}
        trafficKb={connectionTelemetry.trafficKb}
      />
    </div>
  );
}

// ─── Public layout wrapper ────────────────────────────────────────────────────
const AdminLayout = ({ children, isAuthenticated, onLogin, onLogout }) => (
  <DockingProvider initialPanels={INITIAL_PANELS}>
    <WorkspaceInner
      isAuthenticated={isAuthenticated}
      onLogin={onLogin}
      onLogout={onLogout}
    >
      {children}
    </WorkspaceInner>
  </DockingProvider>
);

export default AdminLayout;
