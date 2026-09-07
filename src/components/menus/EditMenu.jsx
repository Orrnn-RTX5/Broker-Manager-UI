import { useEffect, useState } from 'react';
import { CheckSquare, ChevronRight, Clipboard, Copy, FileJson, FileSpreadsheet, Redo2, Search, Square, Undo2 } from 'lucide-react';
import { MenuDivider, MenuItem } from './MenuItem';
import {
  EDIT_MENU_CONTEXT_EVENT,
  copyFocusedSelection,
  dispatchEditMenuAction,
  isEditableElement,
  pasteIntoFocusedField,
} from '../../utils/editMenuActions';

const CopyAsMenu = ({ onAction, disabled }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <MenuItem
        icon={Copy}
        text="Copy As"
        iconColor="text-blue-500"
        hasSubmenu
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
      />
      {open && !disabled && (
        <div className="manager-menu-dropdown absolute left-full top-0 ml-1 min-w-[180px] bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-lg py-1 z-[70]">
          <MenuItem icon={FileSpreadsheet} text="CSV" iconColor="text-blue-600" onClick={() => onAction('copy-csv')} />
          <MenuItem icon={FileSpreadsheet} text="Excel-compatible" iconColor="text-blue-600" onClick={() => onAction('copy-excel')} />
          <MenuItem icon={FileJson} text="JSON" iconColor="text-yellow-600" onClick={() => onAction('copy-json')} />
        </div>
      )}
    </div>
  );
};

const EditMenu = ({ onClose }) => {
  const [context, setContext] = useState(() => window.__rtx5EditMenuContext || { selectedCount: 0 });

  useEffect(() => {
    const updateContext = (event) => setContext(event.detail || { selectedCount: 0 });
    window.addEventListener(EDIT_MENU_CONTEXT_EVENT, updateContext);
    return () => window.removeEventListener(EDIT_MENU_CONTEXT_EVENT, updateContext);
  }, []);

  const run = async (action) => {
    const handled = dispatchEditMenuAction(action);

    if (!handled) {
      if (action === 'undo' || action === 'redo') document.execCommand(action);
      if (action === 'copy') await copyFocusedSelection().catch(() => false);
      if (action === 'paste') await pasteIntoFocusedField().catch(() => false);
      if (action === 'select-all' && isEditableElement()) document.execCommand('selectAll');
    }

    onClose();
  };

  const hasOneSelectedGroup = context.selectedCount === 1;
  const hasSelectedGroup = context.selectedCount > 0;

  return (
    <div className="manager-menu-dropdown absolute top-full left-0 bg-[#f2f2f2] dark:bg-[var(--surface)] border border-[#a0a0a0] dark:border-[var(--border)] shadow-[2px_2px_4px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.6)] py-1 min-w-[235px] z-[60]">
      <MenuItem icon={Undo2} text="Undo" shortcut="Ctrl+Z" iconColor="text-blue-500" onClick={() => run('undo')} />
      <MenuItem icon={Redo2} text="Redo" shortcut="Ctrl+Y" iconColor="text-blue-500" onClick={() => run('redo')} />
      <MenuDivider />
      <MenuItem icon={Clipboard} text="Copy" shortcut="Ctrl+C" iconColor="text-blue-500" onClick={() => run('copy')} />
      <CopyAsMenu disabled={!hasSelectedGroup} onAction={run} />
      <MenuItem icon={Clipboard} text="Paste" shortcut="Ctrl+V" iconColor="text-blue-500" onClick={() => run('paste')} />
      <MenuDivider />
      <MenuItem icon={CheckSquare} text="Select All" shortcut="Ctrl+A" iconColor="text-blue-500" onClick={() => run('select-all')} />
      <MenuItem icon={Square} text="Clear Selection" shortcut="Esc" iconColor="text-gray-500" onClick={() => run('clear-selection')} />
      <MenuDivider />
      <MenuItem icon={ChevronRight} text="Edit Selected" shortcut="Enter" iconColor="text-blue-500" disabled={!hasOneSelectedGroup} onClick={() => run('edit-selected')} />
      <MenuItem icon={Copy} text="Duplicate Group" iconColor="text-purple-500" disabled={!hasOneSelectedGroup} onClick={() => run('duplicate-group')} />
      <MenuDivider />
      <MenuItem icon={Search} text="Find in Current View" iconColor="text-blue-500" onClick={() => run('find-current-view')} />
    </div>
  );
};

export default EditMenu;
