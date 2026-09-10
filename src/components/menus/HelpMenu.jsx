import { createElement } from 'react';
import { HelpCircle, Lightbulb, Info, MessageSquare, RefreshCw } from 'lucide-react';
const items = [
  ['Guide', 'Help topics', HelpCircle, 'F1'],
  ['Updates', 'Release notes', Lightbulb],
  ['Updates', 'Check for updates', RefreshCw],
  ['Support', 'Contact & support', MessageSquare],
  ['About', 'About RTX5 Manager', Info],
];
export default function HelpMenu({ onOpenHelp }) {
  return <div className="manager-menu-dropdown absolute top-full left-0 bg-[var(--surface)] border border-[var(--border)] shadow-lg py-1 min-w-[220px] z-[60]" role="menu" aria-label="Help">
    {items.map(([section, label, Icon, shortcut]) => <button type="button" role="menuitem" key={label} onClick={() => onOpenHelp(section)} className="manager-menu-dropdown-item flex items-center gap-3 w-full px-4 py-2 text-left text-[11px] text-[var(--text)] hover:bg-[var(--surface-2)]">{createElement(Icon, { size: 14, 'aria-hidden': true })}<span className="flex-1">{label}</span>{shortcut && <span className="text-[var(--text-3)]">{shortcut}</span>}</button>)}
  </div>;
}
