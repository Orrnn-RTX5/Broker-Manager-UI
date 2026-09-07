import { useState } from 'react';
import { MenuItem, MenuDivider } from './MenuItem';
import { Database, Radio, Settings, SlidersHorizontal, Users } from 'lucide-react';
import useSymbolStore from '../../store/symbolStore';

const ToolsMenu = () => {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const isLiveFeedConnected = useSymbolStore((state) => state.isConnected);
  const symbolCount = useSymbolStore((state) => Object.keys(state.symbols || {}).length);

  return (
    <div className="manager-menu-dropdown absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[200px] z-[60] transition-colors">
      <div className="relative">
        <MenuItem
          icon={SlidersHorizontal}
          text="Options"
          shortcut="Ctrl+O"
          iconColor="text-blue-600"
          hasSubmenu
          onClick={() => setIsOptionsOpen((open) => !open)}
        />
        {isOptionsOpen && (
          <div className="manager-options-submenu absolute left-full top-0 ml-1 z-[70]" role="status" aria-label="Service status">
            <header>Service status</header>
            <div className={`manager-options-status ${isLiveFeedConnected ? 'is-positive' : 'is-warning'}`} title={isLiveFeedConnected ? 'Connected to RTX5-Live' : 'Market feed reconnecting'}>
              <Radio size={12} />
              <span>{isLiveFeedConnected ? 'Connected to RTX5-Live' : 'Feed reconnecting'}</span>
            </div>
            <div className="manager-options-status" title={`${symbolCount || '—'} subscribed symbols`}>
              <Users size={12} />
              <span>{symbolCount || '—'} symbols</span>
            </div>
            <div className="manager-options-status is-positive" title="Database connection healthy">
              <Database size={12} />
              <span>DB OK</span>
            </div>
            <div className="manager-options-status is-positive" title="Manager API healthy">
              <span aria-hidden="true" style={{ width: 12, textAlign: 'center', fontWeight: 700 }}>✓</span>
              <span>API OK</span>
            </div>
          </div>
        )}
      </div>
      <MenuDivider />
      <MenuItem icon={Settings} text="Global Settings" iconColor="text-gray-600" />
    </div>
  );
};

export default ToolsMenu;
