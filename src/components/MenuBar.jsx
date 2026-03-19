import { useState, useRef, useEffect } from 'react';
import { Wifi, Activity } from 'lucide-react';
import FileMenu from './menus/FileMenu';
import ViewMenu from './menus/ViewMenu';
import ToolsMenu from './menus/ToolsMenu';
import WindowMenu from './menus/WindowMenu';
import HelpMenu from './menus/HelpMenu';
import NewAccountModal from './Popups/NewAccountModal';
import LoginModal from './Popups/LoginModal';

const MenuBar = ({ isAuthenticated, onLogin, onLogout }) => {
  const [activeMenu, setActiveMenu] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const menuRef = useRef(null);
  const menuItems = ['File', 'Edit', 'View', 'Tools', 'Window', 'Help'];

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
        <div className="absolute top-full left-0 bg-[#f2f2f2] dark:bg-[#252526] border border-[#a0a0a0] dark:border-[#333333] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[200px] z-50">
          <div className="px-6 py-1.5 text-[13px] text-gray-500 dark:text-gray-400 italic">Menu not implemented yet</div>
        </div>
      );
    }
  };

  return (
    <div className="h-8 bg-[#f3f4f6] dark:bg-[#1e1e24] border-b border-gray-300 dark:border-[#333333] flex items-center justify-between px-2 text-[13px] select-none text-gray-700 dark:text-gray-300 relative z-50 transition-colors">
      <div className="flex items-center h-full" ref={menuRef}>
        {/* Logo/Icon Area */}
        <div className="px-2 flex items-center h-full cursor-pointer hover:bg-gray-200 dark:hover:bg-[#2d2d30] transition-colors">
          <div className="w-4 h-4 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-sm"></div>
        </div>

        {/* Menu Items */}
        <div className="flex items-center h-full ml-1 space-x-0.5">
          {menuItems.map((item) => (
            <div
              key={item}
              className="relative flex items-center h-full"
            >
              <div
                onClick={() => setActiveMenu(activeMenu === item ? null : item)}
                onMouseEnter={() => activeMenu && setActiveMenu(item)}
                className={`
                  px-2.5 py-1 flex items-center h-full cursor-pointer rounded-sm transition-colors
                  ${activeMenu === item ? 'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-white' : 'hover:bg-gray-200 dark:hover:bg-[#2d2d30] hover:text-gray-900 dark:hover:text-gray-100'}
                `}
              >
                {item}
              </div>
              {renderDropdown(item)}
            </div>
          ))}
        </div>
      </div>

      {/* Right side status */}
      <div className="flex items-center h-full text-xs text-gray-500 dark:text-gray-400 space-x-3 px-2">
        <div className="flex items-center gap-1.5 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
           <select className="bg-transparent hover:bg-gray-200 dark:hover:bg-[#2d2d30] border-none text-gray-600 dark:text-gray-300 focus:outline-none rounded-sm px-1.5 py-0.5 font-medium cursor-pointer appearance-none text-[11px]">
              {['English (EN)', 'Arabic (AR)', 'Chinese (ZH)', 'French (FR)', 'German (DE)', 'Hindi (HI)', 'Japanese (JA)', 'Russian (RU)', 'Spanish (ES)', 'Turkish (TR)'].map(code => (
                <option key={code} className="bg-white dark:bg-[#252526]">{code}</option>
              ))}
           </select>
        </div>
        <div className="h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
        <div className="flex items-center gap-1.5 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">
          <Activity size={14} className="text-green-500 dark:text-green-400" />
          <span>232 / 13 KB</span>
        </div>
        <div className="h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
        <div className={`flex items-center gap-1.5 cursor-pointer ${isAuthenticated ? 'hover:text-gray-700 dark:hover:text-gray-200 text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-600 cursor-default'}`}>
          <Wifi size={14} />
          <span>{isAuthenticated ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
      {/* Modals */}
      <NewAccountModal isOpen={isNewAccountOpen} onClose={() => setIsNewAccountOpen(false)} />
      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onLoginSuccess={handleLoginSuccess} />
    </div>
  );
};

export default MenuBar;
