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
import { useT } from '../../i18n/index.js';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions.js';

const WindowMenu = ({ onClose, onViewAction }) => {
  const navigate = useNavigate();
  const t = useT();
  const { canAct } = usePermissions();
  const canViewPositions = canAct(PERMISSIONS.VIEW_POSITIONS);

  const handleMenuClick = (path) => {
    navigate(path);
    if (onClose) onClose();
  };

  return (
    <div className="manager-menu-dropdown absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[260px] z-[60] max-h-[90vh] overflow-y-auto transition-colors">
      <MenuItem icon={LayoutGrid} text={t('window.tileWindows')} shortcut="Alt+R" iconColor="text-blue-500" />
      <MenuDivider />
      <MenuItem icon={Layers} text={t('window.cascade')} iconColor="text-blue-600" />
      <MenuItem icon={SplitSquareHorizontal} text={t('window.tileHorizontally')} iconColor="text-blue-500" />
      <MenuItem icon={SplitSquareVertical} text={t('window.tileVertically')} iconColor="text-blue-500" />
      <MenuItem icon={Rows3} text={t('window.arrangeIcons')} iconColor="text-blue-600" />
      <MenuItem 
        icon={RotateCcw} 
        text={t('window.resetToDefault')} 
        iconColor="text-blue-500" 
        onClick={() => {
          onViewAction?.('reset-layout');
          if (onClose) onClose();
        }}
      />
      <MenuItem text={t('window.layouts')} hasSubmenu />
      <MenuDivider />
      <MenuItem icon={BarChart} text={t('window.analytics')} iconColor="text-blue-400" onClick={() => handleMenuClick('/analytics/trading-accounts')} />
      <MenuItem icon={Users} text={t('window.onlineUsers')} iconColor="text-blue-600" onClick={() => handleMenuClick('/clients/online-users')} />
      <MenuItem icon={User} text={t('window.accounts')} iconColor="text-blue-500" onClick={() => handleMenuClick('/clients/trading-accounts')} />
      <MenuItem icon={Building2} text={t('window.clients')} iconColor="text-blue-500" onClick={() => handleMenuClick('/clients')} />
      {canViewPositions && <MenuItem icon={ListOrdered} text={t('window.positions')} iconColor="text-yellow-500" onClick={() => handleMenuClick('/clients/positions')} />}
      <MenuItem icon={ShoppingCart} text={t('window.orders')} iconColor="text-yellow-500" onClick={() => handleMenuClick('/clients/orders')} />
      <MenuItem icon={FileText} text={t('window.deals')} iconColor="text-yellow-600" onClick={() => handleMenuClick('/dealing')} />
      <MenuItem icon={UserCog} text={t('window.dealer')} iconColor="text-red-500" onClick={() => handleMenuClick('/dealer/queue')} />
      <MenuItem icon={ShieldAlert} text={t('window.restrictions')} iconColor="text-red-400" onClick={() => handleMenuClick('/dealer/restrictions')} />
      <MenuItem icon={Users2} text={t('window.groups')} iconColor="text-blue-500" onClick={() => handleMenuClick('/groups')} />
      <MenuItem icon={Network} text={t('window.ibManagement')} iconColor="text-cyan-500" onClick={() => handleMenuClick('/ib')} />
      <MenuItem icon={Settings} text={t('window.symbolManagement')} iconColor="text-blue-500" onClick={() => handleMenuClick('/symbol-management')} />
      <MenuDivider />
      <MenuItem icon={Check} text="1 Accounts" iconColor="text-black" />
    </div>
  );
};

export default WindowMenu;
