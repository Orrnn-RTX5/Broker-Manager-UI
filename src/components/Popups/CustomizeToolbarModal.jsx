import { X, Settings, FolderOpen, Printer, Copy, CheckCircle2, CheckSquare, Grid, LayoutGrid, ArrowRightToLine, Cpu, Layers, HelpCircle, RefreshCw, MoreVertical } from 'lucide-react';

const availableButtons = [
  { id: 'open_manager',  icon: FolderOpen,   label: 'Open Manager Data', tone: 'warn' },
  { id: 'print_preview', icon: Printer,      label: 'Print Preview',     tone: 'accent' },
  { id: 'copy',          icon: Copy,         label: 'Copy',              tone: 'accent' },
  { id: 'check_balance', icon: CheckCircle2, label: 'Check Balance',     tone: 'ok' },
  { id: 'fix_balance',   icon: Settings,     label: 'Fix Balance',       tone: 'info' },
  { id: 'bulk_closing',  icon: CheckSquare,  label: 'Bulk Closing',      tone: 'info' },
  { id: 'grid',          icon: Grid,         label: 'Grid',              tone: 'accent' },
  { id: 'tile_windows',  icon: LayoutGrid,   label: 'Tile Windows',      tone: 'info' },
];

const selectedButtons = [
  { id: 'connect',    icon: ArrowRightToLine, label: 'Connect',    tone: 'ok' },
  { id: 'automation', icon: Cpu,              label: 'Automation', tone: 'ok' },
  { id: 'queue',      icon: Layers,           label: 'Queue',      tone: 'accent' },
  { id: 'sep1', isSeparator: true },
  { id: 'help',       icon: HelpCircle,       label: 'Help',       tone: 'accent' },
  { id: 'sep2', isSeparator: true },
  { id: 'bulk_operations', icon: RefreshCw,   label: 'Bulk Operations', tone: 'accent' },
  { id: 'sep3', isSeparator: true },
  { id: 'customize',  icon: MoreVertical,     label: 'Customize',  tone: 'accent' },
];

const toneColor = {
  ok:     'var(--ok-text)',
  danger: 'var(--danger-text)',
  warn:   'var(--warn-text)',
  accent: 'var(--accent-text)',
  info:   'var(--info-text)',
};

const ListBox = ({ title, items, selectedIndex }) => (
  <div className="flex flex-col flex-1 min-w-0">
    <span className="text-xs font-medium mb-2" style={{ color: 'var(--text-2)' }}>{title}</span>
    <div
      className="flex-1 overflow-y-auto rounded-lg"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      {items.map((item, index) => {
        if (item.isSeparator) {
          return (
            <div key={item.id} className="w-full flex justify-center py-1">
              <div style={{ height: 1, background: 'var(--border)', width: '90%' }} />
            </div>
          );
        }
        const isSelected = index === selectedIndex;
        return (
          <div
            key={item.id}
            className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer select-none transition-colors"
            style={{
              background: isSelected ? 'var(--accent-soft)' : 'transparent',
              color: isSelected ? 'var(--accent-text)' : 'var(--text-2)',
            }}
          >
            <item.icon size={15} strokeWidth={1.75} style={{ color: isSelected ? 'var(--accent)' : toneColor[item.tone] }} />
            <span className="text-xs">{item.label}</span>
          </div>
        );
      })}
    </div>
  </div>
);

const CustomizeToolbarModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="ui-modal-backdrop" style={{ zIndex: 99999 }}>
      <div className="ui-modal" style={{ width: 640 }}>
        <div className="ui-modal-header">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center mr-3"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            <Settings size={15} />
          </span>
          Customize Toolbar
          <span className="x" onClick={onClose}><X size={16} /></span>
        </div>

        <div className="ui-modal-body">
          <div className="flex gap-4" style={{ height: 340 }}>
            <ListBox title="Available buttons" items={availableButtons} selectedIndex={0} />

            <div className="flex flex-col justify-center gap-2">
              <button className="ui-btn ui-btn-secondary ui-btn-sm">Insert →</button>
              <button className="ui-btn ui-btn-secondary ui-btn-sm">← Remove</button>
            </div>

            <ListBox title="Selected buttons" items={selectedButtons} selectedIndex={8} />

            <div className="flex flex-col justify-between">
              <div className="flex flex-col gap-2 mt-6">
                <button className="ui-btn ui-btn-secondary ui-btn-sm">Up</button>
                <button className="ui-btn ui-btn-secondary ui-btn-sm">Down</button>
                <div className="h-1" />
                <button className="ui-btn ui-btn-secondary ui-btn-sm">Reset</button>
              </div>
            </div>
          </div>
        </div>

        <div className="ui-modal-footer">
          <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>Close</button>
          <button className="ui-btn ui-btn-primary ui-btn-sm" onClick={onClose}>Apply</button>
        </div>
      </div>
    </div>
  );
};

export default CustomizeToolbarModal;
