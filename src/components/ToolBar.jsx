import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Filter, RefreshCw, Search, Plus, X,
  ZoomIn, ZoomOut, Mail, Bell, AppWindow,
  Printer, Layers, FileSearch, ArrowUpDown, BarChart2,
  FolderOpen, ArrowUpRight, Copy, ChevronDown, LayoutGrid,
  ClipboardList, Settings, UserCog, Contact, Network,
  BookOpen, FileText, FileBadge, FileTerminal, PanelLeft,
  ArrowRightToLine, Cpu, HelpCircle, MoreVertical, LogOut, Users, Info
} from 'lucide-react';

const ToolButton = ({ icon: Icon, text, colorClass = "text-[#666666]", disabled, hasDropdown, onClick, title }) => {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      className={`
        flex items-center gap-1 p-1 h-[26px] rounded-[2px] border border-transparent select-none transition-colors
        ${disabled
          ? 'opacity-40 cursor-default'
          : 'hover:border-[#99c9ef] dark:hover:border-[#007acc] hover:bg-[#e6f0fa] dark:hover:bg-[#3f3f46] active:bg-[#cce4f7] dark:active:bg-[#52525b] cursor-pointer'}
      `}
      disabled={disabled}
    >
      <Icon size={16} className={colorClass} strokeWidth={1.5} />
      {text && <span className={`text-[12px] pr-1 font-sans ${disabled ? 'text-gray-500 dark:text-gray-500' : 'text-black dark:text-gray-300'}`}>{text}</span>}
      {hasDropdown && <ChevronDown size={12} className="text-gray-600 -ml-0.5" />}
    </button>
  );
};

import CustomizeToolbarModal from './Popups/CustomizeToolbarModal';
import NewAccountModal from './Popups/NewAccountModal';
import AccountLimitModal from './Popups/AccountLimitModal';
import MarketData from './Popups/MarketData';
import AccountDetailsModal from './Popups/AccountDetailsModal';

const ToolSeparator = () => (
  <div className="h-5 w-px bg-[#cccccc] dark:bg-[#404040] mx-[3px] transition-colors"></div>
);

const ToolBar = ({ toggleSidebar, isSidebarOpen, toggleRightSidebar, isRightSidebarOpen, toggleMarketData, resetLayout, onLogout }) => {
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [isAccountLimitModalOpen, setIsAccountLimitModalOpen] = useState(false);
  const [searchLoginId, setSearchLoginId] = useState('');
  const [activeSearchedAccount, setActiveSearchedAccount] = useState(null);
  const navigate = useNavigate();

  const handleReload = () => window.location.reload();
  const handleSearchAccount = () => {
    if (searchLoginId.trim()) {
      setActiveSearchedAccount(searchLoginId.trim());
      setSearchLoginId('');
    }
  };
  const handleCopy = () => navigator.clipboard.writeText(window.location.href);
  const handlePrint = () => window.print();
  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  return (
    <>
      <div className="h-9 bg-[#f0f0f0] dark:bg-[#252526] border-b border-[#d4d4d4] dark:border-[#333333] flex items-center px-1 overflow-x-auto transition-colors">
      <div className="flex items-center w-full h-full space-x-[1px] whitespace-nowrap min-w-max">

        {/* View/Charting Group */}
        <button
          onClick={toggleSidebar}
          className={`
            flex items-center gap-1 p-1 h-[26px] rounded-[2px] border border-transparent select-none cursor-pointer transition-colors
            ${isSidebarOpen ? 'bg-[#cce4f7] dark:bg-[#37373d] border-[#99c9ef] dark:border-[#007acc]' : 'hover:border-[#99c9ef] dark:hover:border-[#007acc] hover:bg-[#e6f0fa] dark:hover:bg-[#3f3f46] active:bg-[#cce4f7] dark:active:bg-[#52525b]'}
          `}
          title="Toggle Left Sidebar"
        >
          <FolderOpen size={16} className="text-yellow-500" strokeWidth={1.5} fill="currentColor" />
        </button>

        <button
          onClick={toggleRightSidebar}
          className={`
            flex items-center gap-1 p-1 h-[26px] rounded-[2px] border border-transparent select-none cursor-pointer transition-colors
            ${isRightSidebarOpen ? 'bg-[#cce4f7] dark:bg-[#37373d] border-[#99c9ef] dark:border-[#007acc]' : 'hover:border-[#99c9ef] dark:hover:border-[#007acc] hover:bg-[#e6f0fa] dark:hover:bg-[#3f3f46] active:bg-[#cce4f7] dark:active:bg-[#52525b]'}
          `}
          title="Toggle Accounts (Right Sidebar)"
        >
          <Users size={16} className="text-blue-500" strokeWidth={1.5} fill="currentColor" />
        </button>

        <ToolButton icon={ArrowUpDown} colorClass="text-green-600" onClick={toggleMarketData} />
        <ToolButton icon={BarChart2} colorClass="text-blue-500" onClick={() => navigate('/analytics/trading-accounts')} />
        <ToolButton icon={AppWindow} colorClass="text-blue-500" onClick={handleFullscreen} />
        <ToolButton icon={ArrowUpRight} colorClass="text-blue-500" />
        <ToolButton icon={Layers} colorClass="text-blue-500" />

        <ToolSeparator />

        {/* Printing Group */}
        <ToolButton icon={Printer} colorClass="text-blue-500" onClick={handlePrint} />
        <ToolButton icon={FileSearch} colorClass="text-gray-500" />

        <ToolSeparator />

        {/* CRUD Group */}
        <ToolButton icon={Plus} colorClass="text-green-500" onClick={() => setIsNewAccountModalOpen(true)} />
        <ToolButton icon={Info} colorClass="text-blue-400" onClick={() => setIsAccountLimitModalOpen(true)} />
        <ToolButton icon={ClipboardList} colorClass="text-gray-500" />
        <ToolButton icon={Settings} colorClass="text-gray-500" onClick={() => navigate('/settings')} />
        <ToolButton icon={X} colorClass="text-gray-400" />

        <ToolSeparator />

        {/* Zoom Group */}
        <ToolButton icon={Search} colorClass="text-gray-500" /> {/* Mocking Magnifier */}
        <ToolButton icon={ZoomIn} colorClass="text-gray-500" />
        <ToolButton icon={ZoomOut} colorClass="text-gray-500" />

        <ToolSeparator />

        {/* User Management Group */}
        <ToolButton icon={UserCog} colorClass="text-gray-500" onClick={() => navigate('/settings')} />
        <ToolButton icon={Contact} colorClass="text-gray-500" />
        <ToolButton icon={Network} colorClass="text-gray-500" />

        <ToolSeparator />

        {/* comms/logs Group */}
        <ToolButton icon={Mail} colorClass="text-gray-500" />
        <ToolButton icon={Bell} colorClass="text-gray-500" />
        <ToolButton icon={BookOpen} colorClass="text-gray-500" />
        <ToolButton icon={FileBadge} colorClass="text-gray-500" />
        <ToolButton icon={FileText} colorClass="text-gray-500" />
        <ToolButton icon={FileTerminal} colorClass="text-gray-500" />

        <ToolSeparator />

        {/* Layout Panel Group */}
        <ToolButton icon={PanelLeft} colorClass="text-gray-600" hasDropdown />

        <ToolSeparator />

        {/* Grid/Layout Group */}
        <ToolButton icon={LayoutGrid} colorClass="text-blue-500" onClick={resetLayout} title="Reset Default Layout" />

        <ToolSeparator />

        {/* Connection & Automation Group */}
        <ToolButton icon={ArrowRightToLine} text="Connect" colorClass="text-green-600" />
        <ToolButton icon={Cpu} text="Automation" colorClass="text-green-600" />

        <ToolSeparator />

        {/* Misc Group */}
        <ToolButton icon={Copy} colorClass="text-blue-600" onClick={handleCopy} />
        <ToolButton icon={HelpCircle} colorClass="text-blue-600" />
        <ToolButton icon={RefreshCw} colorClass="text-gray-400" onClick={handleReload} />

        <ToolSeparator />

        {/* More Menu */}
        <ToolButton icon={MoreVertical} colorClass="text-blue-600" onClick={() => setIsCustomizeModalOpen(true)} />

        {/* Right-aligned Filter & Search Group */}
        <div className="flex items-center h-full ml-auto pl-2 space-x-[1px]">
          <ToolButton icon={LogOut} text="Logout" colorClass="text-red-600 dark:text-red-500" onClick={() => { localStorage.removeItem('authToken'); if (onLogout) onLogout(); }} />
          <ToolSeparator />
          <ToolButton icon={Filter} text="Filter" colorClass="text-gray-700 dark:text-gray-400" />
          <ToolButton icon={RefreshCw} colorClass="text-gray-700 dark:text-gray-400" onClick={handleReload} />

          <div className="flex items-center ml-1 bg-white dark:bg-[#1e1e1e] border border-[#cccccc] dark:border-[#404040] h-[22px] w-48 focus-within:border-blue-500 rounded-sm transition-colors">
            <input
              type="text"
              value={searchLoginId}
              onChange={(e) => setSearchLoginId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchAccount()}
              placeholder="Search login id..."
              className="h-full w-full px-1.5 text-[12px] text-black dark:text-gray-200 focus:outline-none bg-transparent"
            />
            <div onClick={handleSearchAccount} className="px-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2d2d30] h-full flex items-center transition-colors hover:text-blue-500">
              <Search size={13} className="text-gray-500 dark:text-gray-400" />
            </div>
          </div>
        </div>

      </div>
      </div>

      <CustomizeToolbarModal
        isOpen={isCustomizeModalOpen}
        onClose={() => setIsCustomizeModalOpen(false)}
      />

      <NewAccountModal 
        isOpen={isNewAccountModalOpen} 
        onClose={() => setIsNewAccountModalOpen(false)} 
      />

      <AccountLimitModal
        isOpen={isAccountLimitModalOpen}
        onClose={() => setIsAccountLimitModalOpen(false)}
      />

      {activeSearchedAccount && (
        <AccountDetailsModal
          account={activeSearchedAccount}
          onClose={() => setActiveSearchedAccount(null)}
          initialTab="Overview"
        />
      )}
    </>
  );
};

export default ToolBar;
