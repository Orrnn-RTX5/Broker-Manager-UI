import { MenuItem, MenuDivider } from './MenuItem';
import { 
  ArrowUpDown, Folders, BarChart2, Layers, 
  AppWindow, LayoutPanelTop, Maximize, Moon
} from 'lucide-react';
import useThemeStore from '../../store/themeStore';
import { useDockingContext } from '../../components/docking/DockingContext';

// Panel IDs
const PANEL_NAVIGATOR = 'navigator';
const PANEL_MARKET_DATA = 'market_data';

const ViewMenu = ({ onClose, onViewAction }) => {
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const { togglePanel } = useDockingContext();

  
  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
    if (onClose) onClose();
  };

  const handleThemeToggle = () => {
    toggleTheme();
    if (onClose) onClose();
  };

  const runViewAction = (action, fallback) => () => {
    if (onViewAction) onViewAction(action);
    else fallback?.();
    if (onClose) onClose();
  };
  
  return (
    <div className="absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[240px] z-[60] transition-colors">
      <MenuItem text="Languages" hasSubmenu />
      <MenuItem 
        icon={Moon} 
        text={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"} 
        onClick={handleThemeToggle} 
        iconColor="text-indigo-500"
      />
      <MenuDivider />
      <MenuItem text="Depth Of Market" hasSubmenu />
      <MenuItem icon={ArrowUpDown} text="Market Watch" shortcut="Ctrl+M" iconColor="text-red-500" onClick={runViewAction('market-watch', () => togglePanel(PANEL_MARKET_DATA))} />
      <MenuItem icon={Folders} text="Navigator" shortcut="Alt+N" iconColor="text-yellow-500" onClick={runViewAction('navigator', () => togglePanel(PANEL_NAVIGATOR))} />
      <MenuItem icon={BarChart2} text="Margin Calls" shortcut="Ctrl+L" iconColor="text-red-500" onClick={runViewAction('margin-calls')} />
      <MenuItem icon={Layers} text="Queue" shortcut="Ctrl+Q" iconColor="text-blue-500" onClick={runViewAction('queue')} />
      <MenuItem icon={AppWindow} text="Toolbar" iconColor="text-blue-500" onClick={runViewAction('toolbar')} />
      <MenuItem icon={LayoutPanelTop} text="Toolbox" shortcut="Ctrl+T" iconColor="text-yellow-500" onClick={runViewAction('toolbox')} />
      <MenuDivider />
      <MenuItem 
        icon={Maximize} 
        text="Fullscreen" 
        shortcut="F11" 
        iconColor="text-blue-600" 
        iconBg="bg-[#e6f0fa] border border-[#99c9ef] rounded-[2px]" 
        onClick={runViewAction('fullscreen', handleFullscreen)}
      />
    </div>
  );
};

export default ViewMenu;
