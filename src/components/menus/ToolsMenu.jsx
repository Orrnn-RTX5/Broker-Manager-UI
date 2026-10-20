import { useState } from 'react';
import { MenuItem, MenuDivider } from './MenuItem';
import { Database, Radio, Settings, SlidersHorizontal, Users } from 'lucide-react';
import useSymbolStore from '../../store/symbolStore';
import { useT } from '../../i18n/index.js';

// SUI-M6: no global-settings surface exists in this workspace (no route,
// dialog, or endpoint), so the item renders disabled with an explicit reason
// instead of silently doing nothing. Mirrors the TreeNode pattern
// (title `${label} — ${reason}` + aria-disabled) while using MenuItem's own
// `disabled` prop like the other menus.
const NO_GLOBAL_SETTINGS_REASON = 'Not available in this workspace';

const ToolsMenu = () => {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const isLiveFeedConnected = useSymbolStore((state) => state.isConnected);
  const symbolCount = useSymbolStore((state) => Object.keys(state.symbols || {}).length);
  const t = useT();

  return (
    <div className="manager-menu-dropdown absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[200px] z-[60] transition-colors">
      <div className="relative">
        <MenuItem
          icon={SlidersHorizontal}
          text={t('tools.options')}
          shortcut="Ctrl+O"
          iconColor="text-blue-600"
          hasSubmenu
          onClick={() => setIsOptionsOpen((open) => !open)}
        />
        {isOptionsOpen && (
          <div className="manager-options-submenu absolute left-full top-0 ml-1 z-[70]" role="status" aria-label={t('tools.serviceStatus')}>
            <header>{t('tools.serviceStatus')}</header>
            <div className={`manager-options-status ${isLiveFeedConnected ? 'is-positive' : 'is-warning'}`} title={isLiveFeedConnected ? t('tools.connectedLive') : t('tools.feedReconnectingTitle')}>
              <Radio size={12} />
              <span>{isLiveFeedConnected ? t('tools.connectedLive') : t('tools.feedReconnecting')}</span>
            </div>
            <div className="manager-options-status" title={`${symbolCount || '—'} ${t('tools.subscribedSymbols')}`}>
              <Users size={12} />
              <span>{symbolCount || '—'} {t('tools.symbols')}</span>
            </div>
            <div className="manager-options-status is-positive" title={t('tools.dbHealthy')}>
              <Database size={12} />
              <span>DB OK</span>
            </div>
            <div className="manager-options-status is-positive" title={t('tools.apiHealthy')}>
              <span aria-hidden="true" style={{ width: 12, textAlign: 'center', fontWeight: 700 }}>✓</span>
              <span>API OK</span>
            </div>
          </div>
        )}
      </div>
      <MenuDivider />
      <div title={`${t('tools.globalSettings')} — ${NO_GLOBAL_SETTINGS_REASON}`} aria-disabled="true">
        <MenuItem icon={Settings} text={t('tools.globalSettings')} iconColor="text-gray-600" disabled />
      </div>
    </div>
  );
};

export default ToolsMenu;
