import { Link2, Unplug, Play, Square, Plus, LogOut, FolderOpen, Printer, Download } from 'lucide-react';
import { MenuItem, MenuDivider } from './MenuItem';

const FileMenu = ({
  isAuthenticated,
  onConnectClick,
  onDisconnectClick,
  onNewAccountClick,
  onExportClick,
  onPrintClick,
  onExitClick,
}) => {
  return (
    <div className="manager-menu-dropdown absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[240px] z-[60] transition-colors">
      <MenuItem 
        icon={Link2} 
        text="Connect" 
        iconColor="text-blue-500" 
        onClick={onConnectClick} 
        disabled={isAuthenticated}
      />
      <MenuItem 
        icon={Unplug} 
        text="Disconnect" 
        iconColor="text-red-500" 
        onClick={onDisconnectClick}
        disabled={!isAuthenticated}
      />
      <MenuItem icon={Play} text="Start Dealing" iconColor="text-blue-500" disabled={!isAuthenticated} />
      <MenuItem icon={Square} text="Stop Dealing" iconColor="text-gray-400" disabled />
      <MenuDivider />
      <MenuItem 
        icon={Plus} 
        text="New Account" 
        shortcut="Ctrl+Shift+N" 
        iconColor="text-blue-500" 
        onClick={onNewAccountClick}
        disabled={!isAuthenticated}
      />
      <MenuItem icon={Download} text="Export" iconColor="text-sky-500" onClick={onExportClick} disabled={!isAuthenticated} />
      <MenuDivider />
      <MenuItem icon={FolderOpen} text="Open Data Folder" shortcut="Ctrl+Shift+D" iconColor="text-yellow-500" />
      <MenuDivider />
      <MenuItem icon={Printer} text="Print" shortcut="Ctrl+P" iconColor="text-blue-600" onClick={onPrintClick} />
      <MenuDivider />
      <MenuItem icon={LogOut} text="Exit" iconColor="text-red-500" onClick={onExitClick} />
    </div>
  );
};

export default FileMenu;
