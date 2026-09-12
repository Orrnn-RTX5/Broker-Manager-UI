import { createElement } from 'react';
import { HelpCircle, Lightbulb, Info, MessageSquare, RefreshCw } from 'lucide-react';
import { useT } from '../../i18n/index.js';

const items = [
  ['Guide', 'help.topics', HelpCircle, 'F1'],
  ['Updates', 'help.releaseNotes', Lightbulb],
  ['Updates', 'help.checkUpdates', RefreshCw],
  ['Support', 'help.contact', MessageSquare],
  ['About', 'help.about', Info],
];
export default function HelpMenu({ onOpenHelp }) {
  const t = useT();
  return <div className="manager-menu-dropdown absolute top-full left-0 bg-[var(--surface)] border border-[var(--border)] shadow-lg py-1 min-w-[220px] z-[60]" role="menu" aria-label={t('menu.help')}>
    {items.map(([section, labelKey, Icon, shortcut]) => <button type="button" role="menuitem" key={labelKey} onClick={() => onOpenHelp(section)} className="manager-menu-dropdown-item flex items-center gap-3 w-full px-4 py-2 text-left text-[11px] text-[var(--text)] hover:bg-[var(--surface-2)]">{createElement(Icon, { size: 14, 'aria-hidden': true })}<span className="flex-1">{t(labelKey)}</span>{shortcut && <span className="text-[var(--text-3)]">{shortcut}</span>}</button>)}
  </div>;
}
