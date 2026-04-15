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

import CustomizeToolbarModal from './Popups/CustomizeToolbarModal';
import NewAccountModal from './Popups/NewAccountModal';
import AccountLimitModal from './Popups/AccountLimitModal';
import AccountDetailsModal from './Popups/AccountDetailsModal';

const ToolButton = ({ icon: Icon, text, tone = 'default', active, disabled, hasDropdown, onClick, title }) => {
  const [hover, setHover] = useState(false);
  const color = {
    default: 'var(--text-3)',
    accent:  'var(--accent)',
    ok:      'var(--ok)',
    warn:    'var(--warn)',
    danger:  'var(--danger)',
    info:    'var(--info)',
  }[tone] || 'var(--text-3)';

  const bg = disabled
    ? 'transparent'
    : active
      ? 'var(--accent-soft)'
      : hover
        ? 'var(--surface-3)'
        : 'transparent';

  const borderColor = active ? 'var(--accent-border)' : 'transparent';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md select-none transition-colors"
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon size={16} style={{ color }} strokeWidth={1.75} />
      {text && (
        <span
          className="text-[12px] pr-1 font-medium"
          style={{ color: disabled ? 'var(--muted)' : 'var(--text-2)' }}
        >
          {text}
        </span>
      )}
      {hasDropdown && <ChevronDown size={11} style={{ color: 'var(--muted)' }} />}
    </button>
  );
};

const ToolSeparator = () => (
  <div className="h-5 w-px mx-1" style={{ background: 'var(--border)' }} />
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
      <div
        className="h-11 flex items-center px-2 overflow-x-auto"
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center w-full h-full gap-0.5 whitespace-nowrap min-w-max">

          {/* Panel toggles */}
          <ToolButton icon={FolderOpen} tone="warn" active={isSidebarOpen} onClick={toggleSidebar} title="Toggle Navigator" />
          <ToolButton icon={Users} tone="accent" active={isRightSidebarOpen} onClick={toggleRightSidebar} title="Toggle Accounts" />
          <ToolButton icon={ArrowUpDown} tone="ok" onClick={toggleMarketData} title="Market Watch" />
          <ToolButton icon={BarChart2} tone="accent" onClick={() => navigate('/analytics/trading-accounts')} title="Analytics" />
          <ToolButton icon={AppWindow} onClick={handleFullscreen} title="Fullscreen" />
          <ToolButton icon={ArrowUpRight} />
          <ToolButton icon={Layers} />

          <ToolSeparator />

          <ToolButton icon={Printer} onClick={handlePrint} title="Print" />
          <ToolButton icon={FileSearch} />

          <ToolSeparator />

          <ToolButton icon={Plus} tone="ok" onClick={() => setIsNewAccountModalOpen(true)} title="New Account" />
          <ToolButton icon={Info} tone="info" onClick={() => setIsAccountLimitModalOpen(true)} title="Account Limits" />
          <ToolButton icon={ClipboardList} />
          <ToolButton icon={Settings} />
          <ToolButton icon={X} />

          <ToolSeparator />

          <ToolButton icon={Search} />
          <ToolButton icon={ZoomIn} />
          <ToolButton icon={ZoomOut} />

          <ToolSeparator />

          <ToolButton icon={UserCog} />
          <ToolButton icon={Contact} />
          <ToolButton icon={Network} />

          <ToolSeparator />

          <ToolButton icon={Mail} />
          <ToolButton icon={Bell} />
          <ToolButton icon={BookOpen} />
          <ToolButton icon={FileBadge} />
          <ToolButton icon={FileText} />
          <ToolButton icon={FileTerminal} />

          <ToolSeparator />

          <ToolButton icon={PanelLeft} hasDropdown />

          <ToolSeparator />

          <ToolButton icon={LayoutGrid} tone="accent" onClick={resetLayout} title="Reset Layout" />

          <ToolSeparator />

          <ToolButton icon={ArrowRightToLine} text="Connect" tone="ok" />
          <ToolButton icon={Cpu} text="Automation" tone="ok" />

          <ToolSeparator />

          <ToolButton icon={Copy} tone="accent" onClick={handleCopy} title="Copy URL" />
          <ToolButton icon={HelpCircle} tone="accent" />
          <ToolButton icon={RefreshCw} onClick={handleReload} title="Reload" />

          <ToolSeparator />

          <ToolButton icon={MoreVertical} tone="accent" onClick={() => setIsCustomizeModalOpen(true)} title="Customize" />

          {/* Right-aligned group */}
          <div className="flex items-center h-full ml-auto pl-2 gap-0.5">
            <ToolButton
              icon={LogOut}
              text="Logout"
              tone="danger"
              onClick={() => {
                localStorage.removeItem('authToken');
                if (onLogout) onLogout();
              }}
            />
            <ToolSeparator />
            <ToolButton icon={Filter} text="Filter" />
            <ToolButton icon={RefreshCw} onClick={handleReload} />

            <div
              className="flex items-center ml-1 h-7 w-56 rounded-md transition-colors"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-3)',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <Search size={13} style={{ color: 'var(--muted)' }} className="ml-2" />
              <input
                type="text"
                value={searchLoginId}
                onChange={(e) => setSearchLoginId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchAccount()}
                placeholder="Search login id…"
                className="h-full w-full px-2 text-[12px] focus:outline-none"
                style={{ background: 'transparent', color: 'var(--text)' }}
              />
              <div
                onClick={handleSearchAccount}
                className="px-2 cursor-pointer h-full flex items-center rounded-r-md"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent-soft)';
                  e.currentTarget.style.color = 'var(--accent-text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--muted)';
                }}
              >
                <span className="text-[11px] font-medium">Go</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <CustomizeToolbarModal isOpen={isCustomizeModalOpen} onClose={() => setIsCustomizeModalOpen(false)} />
      <NewAccountModal isOpen={isNewAccountModalOpen} onClose={() => setIsNewAccountModalOpen(false)} />
      <AccountLimitModal isOpen={isAccountLimitModalOpen} onClose={() => setIsAccountLimitModalOpen(false)} />

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
