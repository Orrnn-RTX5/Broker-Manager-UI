import { useEffect, useCallback } from 'react';
import MenuBar from '../components/MenuBar';
import ToolBar from '../components/ToolBar';
import NavigatorPanel from '../components/NavigatorPanel';
import MarginCallsSidebar from '../components/MarginCallsSidebar';
import MarketData from '../components/Popups/MarketData';
import useThemeStore from '../store/themeStore';

import { DockingProvider } from '../components/docking/index.js';
import DockLayout from '../components/docking/DockLayout';
import { useDockingContext } from '../components/docking/DockingContext';

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
    visible: false,        // starts hidden; toolbar button toggles it
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

  const isNavigatorOpen = panels[PANEL_NAVIGATOR]?.visible ?? false;
  const isAccountsOpen  = panels[PANEL_ACCOUNTS]?.visible  ?? true;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // ── panel content map ──────────────────────────────────────────────────────
  const panelContents = {
    [PANEL_NAVIGATOR]: <NavigatorPanel />,
    [PANEL_ACCOUNTS]:  <MarginCallsSidebar isAuthenticated={isAuthenticated} />,
    [PANEL_MARKET_DATA]: <MarketData />,
  };

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden font-sans selection:bg-blue-200 ${
        isDarkMode ? 'bg-[#1e1e1e] text-gray-200' : 'bg-gray-100'
      }`}
    >
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
      <div className="flex-1 overflow-hidden border-t border-[#a0a0a0]">
        <DockLayout panelContents={panelContents}>
          <div className={`h-full w-full overflow-auto relative ${isDarkMode ? 'bg-[#1e1e1e]' : 'bg-[#e8eaf6]'}`}>
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
