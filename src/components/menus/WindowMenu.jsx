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
  Settings,
  UserCog,
  Users2,
  ShieldAlert,
  Network,
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
    <div className="manager-menu-dropdown absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[260px] z-[60] max-h-[90vh] overflow-y-auto transition-colors">
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
      <MenuItem icon={Users} text="Online Users" iconColor="text-blue-600" onClick={() => handleMenuClick('/clients/online-users')} />
      <MenuItem icon={User} text="Accounts" iconColor="text-blue-500" onClick={() => handleMenuClick('/clients/trading-accounts')} />
      <MenuItem icon={Building2} text="Clients" iconColor="text-blue-500" onClick={() => handleMenuClick('/clients')} />
      <MenuItem icon={ListOrdered} text="Positions" iconColor="text-yellow-500" onClick={() => handleMenuClick('/clients/positions')} />
      <MenuItem icon={ShoppingCart} text="Orders" iconColor="text-yellow-500" onClick={() => handleMenuClick('/clients/orders')} />
      <MenuItem icon={FileText} text="Deals" iconColor="text-yellow-600" onClick={() => handleMenuClick('/dealing')} />
      <MenuItem icon={UserCog} text="Dealer" iconColor="text-red-500" onClick={() => handleMenuClick('/dealer/queue')} />
      <MenuItem icon={ShieldAlert} text="Restrictions" iconColor="text-red-400" onClick={() => handleMenuClick('/dealer/restrictions')} />
      <MenuItem icon={Users2} text="Groups" iconColor="text-blue-500" onClick={() => handleMenuClick('/groups')} />
      <MenuItem icon={Network} text="IB Management" iconColor="text-cyan-500" onClick={() => handleMenuClick('/ib')} />
      <MenuItem icon={Settings} text="Symbol Management" iconColor="text-blue-500" onClick={() => handleMenuClick('/symbol-management')} />
      <MenuDivider />
      {/* Currently open windows tracker at bottom */}
      <MenuItem icon={Check} text="1 Accounts" iconColor="text-black" />
    </div>
  );
};

export default WindowMenu;
