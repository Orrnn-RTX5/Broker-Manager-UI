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
import GlobalLoader from '../components/GlobalLoader';
import ToastContainer from '../components/ToastContainer';
import useWorkspaceNavigation from '../hooks/useWorkspaceNavigation';
import { startPositionSync, stopPositionSync } from '../services/positionSync';
import { resetWorkspaceLayout, toggleDocumentFullscreen } from '../utils/quickSettingsActions.js';
import '../styles/command-center.css';

// ─── Panel IDs ───────────────────────────────────────────────────────────────
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
    size: { width: 216, height: '100%' },
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
    size: { width: 244, height: '100%' },
  },
  [PANEL_OWNER]: {
    title: 'Owner Console',
    icon: 'owner',
    defaultPosition: 'right',
    visible: true,
    size: { width: 310, height: '100%' },
  },
  [PANEL_TERMINAL]: {
    title: 'Operations Terminal',
    icon: 'terminal',
    defaultPosition: 'bottom',
    visible: true,
    canMaximize: true,
    size: { width: '100%', height: 'clamp(118px, 15vh, 148px)' },
  },
};

// ─── Inner layout (needs docking context) ────────────────────────────────────
function WorkspaceInner({ children, isAuthenticated, onLogin, onLogout }) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const { togglePanel, updatePanel, panels, resetLayout } = useDockingContext();
  const navigate = useWorkspaceNavigation();
  const [isToolBarVisible, setIsToolBarVisible] = useState(true);
  const [connectionTelemetry, setConnectionTelemetry] = useState({
    connectionData: null,
    pingMs: null,
    trafficKb: 13.0,
  });

  const isNavigatorOpen = panels[PANEL_NAVIGATOR]?.visible ?? false;
  const isAccountsOpen  = panels[PANEL_ACCOUNTS]?.visible  ?? true;
  const isMarketDataOpen = panels[PANEL_MARKET_DATA]?.visible ?? false;
  const isOwnerConsoleOpen = panels[PANEL_OWNER]?.visible ?? true;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // ── Symbol Store Initialization ──────────────────────────────────────────
  useEffect(() => {
    useSymbolStore.getState().initWebSocket();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      stopPositionSync();
      return undefined;
    }

    startPositionSync();
    return () => stopPositionSync();
  }, [isAuthenticated]);

  const toggleFullscreen = useCallback(() => toggleDocumentFullscreen(document), []);

  const toggleMarketWatch = useCallback(() => {
    togglePanel(PANEL_MARKET_DATA);
  }, [togglePanel]);

  const toggleAccountsPanel = useCallback(() => {
    const isOpeningAccounts = !panels[PANEL_ACCOUNTS]?.visible;

    if (isOpeningAccounts && panels[PANEL_OWNER]?.visible) {
      updatePanel(PANEL_OWNER, { visible: false, maximized: false });
    }

    togglePanel(PANEL_ACCOUNTS);
  }, [panels, togglePanel, updatePanel]);

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
    [PANEL_ACCOUNTS]:  <MarginCallsSidebar isAuthenticated={isAuthenticated} />,
    [PANEL_MARKET_DATA]: <MarketData compact />,
    [PANEL_OWNER]: <OwnerConsole />,
    [PANEL_TERMINAL]: <TerminalDock isAuthenticated={isAuthenticated} />,
  };

  return (
    <div
      className="rtx5-command-shell flex flex-col h-screen overflow-hidden"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <GlobalLoader />
      <ToastContainer />
      {/* ── Top bars ── */}
      <MenuBar
        isAuthenticated={isAuthenticated}
        onLogin={onLogin}
        onLogout={onLogout}
        onViewAction={handleViewAction}
        onStatusChange={setConnectionTelemetry}
      />
      {isToolBarVisible && (
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
      )}

      {/* ── Main dockable workspace ── */}
      <div className="cc-shell-workspace flex-1 overflow-hidden" style={{ borderTop: '1px solid var(--border)' }}>
        <DockLayout panelContents={panelContents}>
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
