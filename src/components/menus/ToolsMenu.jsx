import { MenuItem, MenuDivider } from './MenuItem';
import { Settings, SlidersHorizontal } from 'lucide-react';

const ToolsMenu = () => {
  return (
    <div className="absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[200px] z-[60] transition-colors">
      <MenuItem icon={SlidersHorizontal} text="Options" shortcut="Ctrl+O" iconColor="text-blue-600" />
      <MenuDivider />
      <MenuItem icon={Settings} text="Global Settings" iconColor="text-gray-600" />
    </div>
  );
};

export default ToolsMenu;
