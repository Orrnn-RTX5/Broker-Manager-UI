import { 
  HelpCircle, 
  Lightbulb, 
  Globe, 
  Send,
  Monitor,
  CheckCircle2,
  Info 
} from 'lucide-react';
import { MenuItem, MenuDivider } from './MenuItem';

const HelpMenu = () => {
  return (
    <div className="manager-menu-dropdown absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[240px] z-[60] transition-colors">
      <MenuItem icon={HelpCircle} text="Help Topics" shortcut="F1" iconColor="text-blue-500" />
      <MenuItem icon={Lightbulb} text="What's New" iconColor="text-blue-500" />
      <MenuDivider />
      <MenuItem icon={Globe} text="RTX5 Platform" iconColor="text-blue-600" />
      <MenuItem icon={Send} text="Official News Channel" iconColor="text-blue-400" />
      <MenuDivider />
      {/* Mocking the Mac/Linux icons with Lucide equivalents */}
      <MenuItem icon={Monitor} text="Manager For Mac" iconColor="text-gray-700" />
      <MenuItem icon={CheckCircle2} text="Manager For Linux" iconColor="text-yellow-500" />
      <MenuItem text="Check For Updates" hasSubmenu />
      <MenuDivider />
      <MenuItem icon={Info} text="About" iconColor="text-blue-500" />
    </div>
  );
};

export default HelpMenu;
