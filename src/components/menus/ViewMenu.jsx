import { useState } from 'react';
import { MenuItem, MenuDivider } from './MenuItem';
import { 
  ArrowUpDown, Folders, BarChart2, Layers, 
  AppWindow, LayoutPanelTop, Maximize, Moon, Check
} from 'lucide-react';
import useThemeStore from '../../store/themeStore';
import { useDockingContext } from '../../components/docking/DockingContext';
import { LANGUAGE_OPTIONS } from '../../config/languages.js';
import { useI18nStore, useT } from '../../i18n/index.js';

// SUI-M6: no depth-of-market panel or action exists in this workspace, so the
// item renders disabled with an explicit reason instead of silently doing
// nothing. Mirrors the TreeNode pattern (title `${label} — ${reason}` +
// aria-disabled) while using MenuItem's own `disabled` prop like the other
// menus.
const NO_DEPTH_REASON = 'Not available in this workspace';

// Panel IDs
const PANEL_NAVIGATOR = 'navigator';
const PANEL_MARKET_DATA = 'market_data';

const ViewMenu = ({ onClose, onViewAction }) => {
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const { togglePanel } = useDockingContext();
  const t = useT();
  const language = useI18nStore((state) => state.language);
  const setLanguage = useI18nStore((state) => state.setLanguage);
  const [isLanguagesOpen, setIsLanguagesOpen] = useState(false);

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
    if (onViewAction) onViewAction(action)?.catch?.(console.error);
    else fallback?.();
    if (onClose) onClose();
  };

  const chooseLanguage = (code) => {
    setLanguage(code);
    setIsLanguagesOpen(false);
    onClose?.();
  };

  return (
    <div className="manager-menu-dropdown absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[240px] z-[60] transition-colors">
      <div className="relative">
        <MenuItem text={t('view.languages')} hasSubmenu onClick={() => setIsLanguagesOpen((open) => !open)} />
        {isLanguagesOpen && (
          <div className="manager-language-submenu absolute left-[calc(100%+3px)] top-[-5px] z-[70] min-w-[190px] rounded-md border p-1">
            <div className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
              {t('view.selectLanguage')}
            </div>
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.code}
                type="button"
                className="manager-language-option flex w-full items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left text-[10px] transition-colors"
                onClick={() => chooseLanguage(option.code)}
                aria-pressed={language === option.code}
              >
                <span>{option.label}</span>
                {language === option.code && <Check size={13} aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <MenuItem 
        icon={Moon} 
        text={isDarkMode ? t('view.switchToLight') : t('view.switchToDark')} 
        onClick={handleThemeToggle} 
        iconColor="text-indigo-500"
      />
      <MenuDivider />
      <div title={`${t('view.depthOfMarket')} — ${NO_DEPTH_REASON}`} aria-disabled="true">
        <MenuItem text={t('view.depthOfMarket')} disabled />
      </div>
      <MenuItem icon={ArrowUpDown} text={t('view.marketWatch')} shortcut="Ctrl+M" iconColor="text-red-500" onClick={runViewAction('market-watch', () => togglePanel(PANEL_MARKET_DATA))} />
      <MenuItem icon={Folders} text={t('view.navigator')} shortcut="Alt+N" iconColor="text-yellow-500" onClick={runViewAction('navigator', () => togglePanel(PANEL_NAVIGATOR))} />
      <MenuItem icon={BarChart2} text={t('view.marginCalls')} shortcut="Ctrl+L" iconColor="text-red-500" onClick={runViewAction('margin-calls')} />
      <MenuItem icon={Layers} text={t('view.queue')} shortcut="Ctrl+Q" iconColor="text-blue-500" onClick={runViewAction('queue')} />
      <MenuItem icon={AppWindow} text={t('view.toolbar')} iconColor="text-blue-500" onClick={runViewAction('toolbar')} />
      <MenuItem icon={LayoutPanelTop} text={t('view.toolbox')} shortcut="Ctrl+T" iconColor="text-yellow-500" onClick={runViewAction('toolbox')} />
      <MenuDivider />
      <MenuItem 
        icon={Maximize} 
        text={t('view.fullscreen')} 
        shortcut="F11" 
        iconColor="text-blue-600" 
        iconBg="bg-[#e6f0fa] border border-[#99c9ef] rounded-[2px]" 
        onClick={runViewAction('fullscreen', handleFullscreen)}
      />
    </div>
  );
};

export default ViewMenu;
