import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    visible: true,
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
  const navigate = useNavigate();

  const isNavigatorOpen = panels[PANEL_NAVIGATOR]?.visible ?? false;
  const isAccountsOpen  = panels[PANEL_ACCOUNTS]?.visible  ?? true;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // ── Symbol Store Initialization ──────────────────────────────────────────
  useEffect(() => {
    useSymbolStore.getState().initWebSocket();
  }, []);

  // ── Keyboard Shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input-like element
      const activeElement = document.activeElement;
      const isInput = activeElement.tagName === 'INPUT' || 
                      activeElement.tagName === 'TEXTAREA' || 
                      activeElement.isContentEditable;
      
      if (isInput) return;

      const key = e.key.toLowerCase();
      const ctrlKey = e.ctrlKey || e.metaKey;

      // Ctrl + O -> Toggle Market Data
      if (ctrlKey && key === 'o') {
        e.preventDefault();
        togglePanel(PANEL_MARKET_DATA);
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

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, togglePanel]);

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
      <MenuBar isAuthenticated={isAuthenticated} onLogin={onLogin} onLogout={onLogout} />
      <ToolBar
        toggleSidebar={() => togglePanel(PANEL_NAVIGATOR)}
        isSidebarOpen={isNavigatorOpen}
        toggleRightSidebar={() => togglePanel(PANEL_ACCOUNTS)}
        isRightSidebarOpen={isAccountsOpen}
        toggleMarketData={() => togglePanel(PANEL_MARKET_DATA)}
        resetLayout={resetLayout}
        onLogout={onLogout}
      />

      {/* ── Main dockable workspace ── */}
      <div className="flex-1 overflow-hidden" style={{ borderTop: '1px solid var(--border)' }}>
        <DockLayout panelContents={panelContents}>
          <div className="h-full w-full overflow-auto relative" style={{ background: 'var(--bg)' }}>
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
