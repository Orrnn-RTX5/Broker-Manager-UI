import { useCallback, useEffect, useState } from 'react';
import MenuBar from '../components/MenuBar';
import ToolBar from '../components/ToolBar';
import NavigatorPanel from '../components/NavigatorPanel';
import MarginCallsSidebar from '../components/MarginCallsSidebar';
import MarketData from '../components/Popups/MarketData';
import useThemeStore from '../store/themeStore';
import useSymbolStore from '../store/symbolStore';

import { DockingProvider } from '../components/docking/index.js';
import DockLayout from '../components/docking/DockLayout';
import { useDockingContext } from '../components/docking/DockingContext';
import GlobalLoader from '../components/GlobalLoader';
import ToastContainer from '../components/ToastContainer';
import useWorkspaceNavigation from '../hooks/useWorkspaceNavigation';

// ─── Panel IDs ───────────────────────────────────────────────────────────────
const PANEL_NAVIGATOR  = 'navigator';
const PANEL_ACCOUNTS   = 'accounts';
const PANEL_MARKET_DATA= 'market_data';

// ─── Initial panel configuration ─────────────────────────────────────────────
const INITIAL_PANELS = {
  [PANEL_NAVIGATOR]: {
    title: 'Navigator',
    icon: '📂',
    defaultPosition: 'left',
    visible: true,         // changed from false to true to be visible by default
    size: { width: 280, height: '100%' },
  },
  [PANEL_ACCOUNTS]: {
    title: 'Accounts',
    icon: '👥',
    defaultPosition: 'right',
    visible: false,
    size: { width: 280, height: '100%' },
  },
  [PANEL_MARKET_DATA]: {
    title: 'Market Watch',
    icon: '📈',
    defaultPosition: 'float',
    visible: false,
    size: { width: 600, height: 500 },
  },
};

// ─── Inner layout (needs docking context) ────────────────────────────────────
function WorkspaceInner({ children, isAuthenticated, onLogin, onLogout }) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const { togglePanel, panels, resetLayout } = useDockingContext();
  const navigate = useWorkspaceNavigation();
  const [isToolBarVisible, setIsToolBarVisible] = useState(true);

  const isNavigatorOpen = panels[PANEL_NAVIGATOR]?.visible ?? false;
  const isAccountsOpen  = panels[PANEL_ACCOUNTS]?.visible  ?? true;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // ── Symbol Store Initialization ──────────────────────────────────────────
  useEffect(() => {
    useSymbolStore.getState().initWebSocket();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
      return;
    }
    document.exitFullscreen?.().catch?.(console.error);
  }, []);

  const handleViewAction = useCallback((action) => {
    switch (action) {
      case 'market-watch':
        togglePanel(PANEL_MARKET_DATA);
        break;
      case 'navigator':
        togglePanel(PANEL_NAVIGATOR);
        break;
      case 'margin-calls':
        togglePanel(PANEL_ACCOUNTS);
        break;
      case 'queue':
        navigate('/dealer/queue');
        break;
      case 'toolbar':
      case 'toolbox':
        setIsToolBarVisible((visible) => !visible);
        break;
      case 'fullscreen':
        toggleFullscreen();
        break;
      default:
        break;
    }
  }, [navigate, toggleFullscreen, togglePanel]);

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
        handleViewAction('fullscreen');
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
    [PANEL_MARKET_DATA]: <MarketData />,
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
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
      />
      {isToolBarVisible && (
        <ToolBar
          toggleSidebar={() => togglePanel(PANEL_NAVIGATOR)}
          isSidebarOpen={isNavigatorOpen}
          toggleRightSidebar={() => togglePanel(PANEL_ACCOUNTS)}
          isRightSidebarOpen={isAccountsOpen}
          toggleMarketData={() => togglePanel(PANEL_MARKET_DATA)}
          resetLayout={resetLayout}
          onLogout={onLogout}
        />
      )}

      {/* ── Main dockable workspace ── */}
      <div className="flex-1 overflow-hidden" style={{ borderTop: '1px solid var(--border)' }}>
        <DockLayout panelContents={panelContents}>
          <div className="flex-1 min-h-0 w-full overflow-auto relative" style={{ background: 'var(--bg)' }}>
            {children}
          </div>
        </DockLayout>
      </div>
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
