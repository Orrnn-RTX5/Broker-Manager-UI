import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import NavigatorPanel from '../components/NavigatorPanel';
import MarginCallsSidebar from '../components/MarginCallsSidebar';
import MenuBar from '../components/MenuBar';
import ToolBar from '../components/ToolBar';
import useThemeStore from '../store/themeStore';

const AdminLayout = ({ children, isAuthenticated, onLogin, onLogout }) => {
  // Navigator starts closed to show the toggle functionality clearly
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [isMarginCallsOpen, setIsMarginCallsOpen] = useState(true);

  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  // Apply dark class to html document globally
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <div className={`flex flex-col h-screen overflow-hidden font-sans selection:bg-blue-200 ${isDarkMode ? 'bg-[#1e1e1e] text-gray-200' : 'bg-gray-300'}`}>
      {/* Top Level Navbars spanning full width (Desktop App Style) */}
      <MenuBar isAuthenticated={isAuthenticated} onLogin={onLogin} onLogout={onLogout} />
      <ToolBar
        toggleSidebar={() => setIsNavigatorOpen(!isNavigatorOpen)}
        isSidebarOpen={isNavigatorOpen}
        toggleRightSidebar={() => setIsMarginCallsOpen(!isMarginCallsOpen)}
        isRightSidebarOpen={isMarginCallsOpen}
        onLogout={onLogout}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden border-t border-[#a0a0a0]">

        {/* Toggleable Navigator Tree Panel */}
        <NavigatorPanel
          isOpen={isNavigatorOpen}
          onClose={() => setIsNavigatorOpen(false)}
        />

        {/* Scrollable Content Workspace */}
        <main className={`flex-1 overflow-auto shadow-inner relative ${isDarkMode ? 'bg-[#121212]' : 'bg-[#e8eaf6]'}`}>
          {children}
        </main>

        {/* Fixed Right Sidebar (Margin Calls) */}
        {isMarginCallsOpen && (
          <MarginCallsSidebar isAuthenticated={isAuthenticated} onClose={() => setIsMarginCallsOpen(false)} />
        )}
      </div>
    </div>
  );
};

export default AdminLayout;
