import { 
  LayoutGrid, 
  Layers, 
  SplitSquareHorizontal, 
  SplitSquareVertical, 
  Rows3, 
  RotateCcw,
  BarChart,
  FileText,
  Users,
  User,
  Building2,
  ListOrdered,
  ShoppingCart,
  CreditCard,
  Banknote,
  History,
  Target,
  Router,
  LayoutTemplate,
  FileSpreadsheet,
  Activity,
  History as HistoryIcon,
  Settings,
  UserCog,
  Percent,
  Users2,
  Blocks,
  Mail,
  BookOpen,
  Check
} from 'lucide-react';
import { MenuItem, MenuDivider } from './MenuItem';
import { useNavigate } from 'react-router-dom';

const WindowMenu = ({ onClose }) => {
  const navigate = useNavigate();

  const handleMenuClick = (path) => {
    navigate(path);
    if (onClose) onClose();
  };

  return (
    <div className="absolute top-full left-0 bg-[#f2f2f2] dark:bg-[#252526] border border-[#a0a0a0] dark:border-[#333333] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[260px] z-[60] max-h-[90vh] overflow-y-auto transition-colors">
      <MenuItem icon={LayoutGrid} text="Tile Windows" shortcut="Alt+R" iconColor="text-blue-500" />
      <MenuDivider />
      <MenuItem icon={Layers} text="Cascade" iconColor="text-blue-600" />
      <MenuItem icon={SplitSquareHorizontal} text="Tile Horizontally" iconColor="text-blue-500" />
      <MenuItem icon={SplitSquareVertical} text="Tile Vertically" iconColor="text-blue-500" />
      <MenuItem icon={Rows3} text="Arrange Icons" iconColor="text-blue-600" />
      <MenuItem icon={RotateCcw} text="Reset to Default" iconColor="text-blue-500" />
      <MenuItem text="Window Layouts" hasSubmenu />
      <MenuDivider />
      {/* List corresponding to MT5 manager sidebar/sections */}
      <MenuItem icon={BarChart} text="Analytics" iconColor="text-blue-400" onClick={() => handleMenuClick('/analytics/trading-accounts')} />
      <MenuItem icon={FileText} text="Server Reports" iconColor="text-blue-500" />
      <MenuItem icon={Users} text="Online Users" iconColor="text-blue-600" onClick={() => handleMenuClick('/clients/online-users')} />
      <MenuItem icon={User} text="Accounts" iconColor="text-blue-500" onClick={() => handleMenuClick('/clients/trading-accounts')} />
      <MenuItem icon={Building2} text="Clients" iconColor="text-blue-500" onClick={() => handleMenuClick('/clients')} />
      <MenuItem icon={ListOrdered} text="Positions" iconColor="text-yellow-500" onClick={() => handleMenuClick('/clients/positions')} />
      <MenuItem icon={ShoppingCart} text="Orders" iconColor="text-yellow-500" onClick={() => handleMenuClick('/orders')} />
      <MenuItem icon={CreditCard} text="Payments Processing" iconColor="text-blue-400" />
      <MenuItem icon={Banknote} text="Active Payments" iconColor="text-blue-500" />
      <MenuItem icon={History} text="Payments History" iconColor="text-blue-600" />
      <MenuItem icon={Target} text="Ultency Matching Engine" iconColor="text-purple-500" />
      <MenuItem icon={Router} text="Ultency Routing" iconColor="text-blue-400" />
      <MenuItem icon={LayoutTemplate} text="Ultency Templates" iconColor="text-gray-500" />
      <MenuItem icon={FileSpreadsheet} text="Ultency Reporting" iconColor="text-blue-500" />
      <MenuItem icon={Activity} text="Active Subscriptions" iconColor="text-green-500" />
      <MenuItem icon={HistoryIcon} text="Subscriptions History" iconColor="text-green-600" />
      <MenuItem icon={Settings} text="Subscriptions Configuration" iconColor="text-green-500" onClick={() => handleMenuClick('/settings')} />
      <MenuItem icon={UserCog} text="Dealer" iconColor="text-red-500" onClick={() => handleMenuClick('/settings')} />
      <MenuItem icon={Percent} text="Leverages" iconColor="text-green-500" />
      <MenuItem icon={Users2} text="Groups" iconColor="text-blue-500" />
      <MenuItem icon={Blocks} text="Plugins" iconColor="text-blue-500" />
      <MenuItem icon={Mail} text="Mailbox" iconColor="text-yellow-500" />
      <MenuItem icon={BookOpen} text="Journal" iconColor="text-yellow-600" />
      <MenuDivider />
      {/* Currently open windows tracker at bottom */}
      <MenuItem icon={Check} text="1 Accounts" iconColor="text-black" />
    </div>
  );
};

export default WindowMenu;
