import { useState, useEffect, useRef } from 'react';
import {
  Check, ChevronRight, UserPlus, UserSquare, Mail, Copy,
  FileText, Filter, Download, Grid3x3, Columns3, CheckSquare, Square, MinusSquare, BarChart3
} from 'lucide-react';

/**
 * Data-grid context menu — props-driven. Callers supply:
 *   - grid     : useGridController() return value
 *   - rows     : visible (filtered) rows of the grid
 *   - allRows  : unfiltered rows
 *   - selectedRow : the row the user right-clicked on (primary target)
 *   - onNewClient : () => void   (opens NewAccountModal)
 *   - onOpenDetails : (row) => void  (opens ClientDetailsModal)
 *   - entityLabel : "client" | "account" | "position" | "order" | "deal"
 */

const Sep = () => <div className="ui-ctxmenu-sep" />;

const Item = ({ text, icon: Icon, iconTone, rightText, rightIcon: RightIcon, hasCheck, disabled, submenu, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const closeTimeout = useRef(null);
  const toneColor = {
    ok: 'var(--ok-text)', danger: 'var(--danger-text)', warn: 'var(--warn-text)',
    accent: 'var(--accent-text)', info: 'var(--info-text)',
  }[iconTone] || 'var(--text-3)';

  const onEnter = () => { if (closeTimeout.current) clearTimeout(closeTimeout.current); setIsHovered(true); };
  const onLeave = () => { closeTimeout.current = setTimeout(() => setIsHovered(false), 150); };

  return (
    <div
      className={`ui-ctxmenu-item relative ${disabled ? 'is-disabled' : ''} ${isHovered && submenu ? 'is-active' : ''}`}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span className="w-4 h-4 inline-flex items-center justify-center">
        {hasCheck ? <Check size={12} strokeWidth={2.5} style={{ color: 'var(--accent)' }} />
          : Icon ? <Icon size={14} strokeWidth={1.75} style={{ color: toneColor }} /> : null}
      </span>
      <span className="flex-1">{text}</span>
      {rightText && <span className="kbd">{rightText}</span>}
      {RightIcon && <RightIcon size={13} style={{ color: 'var(--muted)' }} />}

      {submenu && isHovered && (
        <div
          className="ui-ctxmenu absolute top-0 left-full ml-1 z-[10000]"
          style={{ minWidth: 220 }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          {submenu.map((it, idx) => it.isSep ? <Sep key={`s-${idx}`} /> : <Item key={idx} {...it} />)}
        </div>
      )}
    </div>
  );
};

const ClientsContextMenu = ({
  x, y, onClose,
  grid, rows = [], allRows = [], selectedRow,
  entityLabel = 'row',
  onNewClient,
  onOpenDetails,
  onCopyAs,       // (format: 'csv' | 'tsv' | 'json') => void
  onExport,       // () => void
}) => {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  // Viewport-safe positioning.
  const style = {
    top:  Math.min(y, window.innerHeight - 520),
    left: Math.min(x, window.innerWidth - 440),
  };

  const selectedCount = grid?.selectedIds?.size ?? 0;
  const hasSelection = selectedCount > 0;
  const rowKey = grid?.rowKey || 'id';

  const selectByMenu = [
    {
      text: `All (${rows.length})`, icon: CheckSquare, iconTone: 'accent',
      onClick: () => grid?.selectAll(rows.map(r => r[rowKey])),
    },
    {
      text: 'None', icon: Square,
      disabled: !hasSelection,
      onClick: () => grid?.clear(),
    },
    {
      text: 'Invert', icon: MinusSquare, iconTone: 'accent',
      onClick: () => grid?.invert(rows.map(r => r[rowKey])),
    },
  ];

  const copyAsMenu = [
    { text: 'CSV',  onClick: () => onCopyAs && onCopyAs('csv') },
    { text: 'TSV',  onClick: () => onCopyAs && onCopyAs('tsv') },
    { text: 'JSON', onClick: () => onCopyAs && onCopyAs('json') },
  ];

  const columnsMenu = (grid?.columns || []).map(c => ({
    text: c.label || c.key,
    hasCheck: !grid.hiddenColumns.has(c.key),
    onClick: () => grid.toggleColumn(c.key),
  }));

  const selectionSuffix = hasSelection ? ` (${selectedCount} selected)` : '';

  return (
    <div
      className="ui-ctxmenu fixed z-[9999]"
      style={{ ...style, width: 260 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Primary actions */}
      {onNewClient && (
        <Item text="New Account" icon={UserPlus} iconTone="ok" rightText="Ctrl+N" onClick={() => { onNewClient(); onClose(); }} />
      )}

      {selectedRow && onOpenDetails && (
        <Item
          text={`${entityLabel === 'client' ? 'Client' : 'Row'} Details`}
          icon={UserSquare}
          iconTone="accent"
          onClick={() => { onOpenDetails(selectedRow); onClose(); }}
        />
      )}

      {selectedRow?.email && (
        <Item
          text="Email"
          icon={Mail}
          iconTone="warn"
          onClick={() => { window.location.href = `mailto:${selectedRow.email}`; onClose(); }}
        />
      )}

      {(onNewClient || selectedRow) && <Sep />}

      {/* Trading actions (if supplied) */}
      {grid?.extraActions && grid.extraActions.length > 0 && (
        <>
          <Item 
            text="Trading Actions" 
            icon={BarChart3} 
            iconTone="accent" 
            rightIcon={ChevronRight} 
            submenu={grid.extraActions} 
          />
          <Sep />
        </>
      )}

      {/* Selection + data operations */}
      <Item text="Select"       icon={CheckSquare} iconTone="accent" rightIcon={ChevronRight} submenu={selectByMenu} />
      <Item
        text={`Copy As${selectionSuffix}`}
        icon={Copy}
        iconTone="accent"
        rightIcon={ChevronRight}
        submenu={copyAsMenu}
      />
      <Item
        text={`Export CSV${selectionSuffix}`}
        icon={Download}
        iconTone="ok"
        onClick={() => { onExport && onExport(); onClose(); }}
      />
      {grid?.clearFilter && (
        <Item
          text="Clear Filter"
          icon={Filter}
          onClick={() => { grid.clearFilter(); onClose(); }}
        />
      )}

      <Sep />

      {/* View toggles */}
      <Item
        text="Gridlines"
        icon={Grid3x3}
        hasCheck={grid?.showGridlines}
        onClick={() => grid?.toggleGridlines()}
      />
      <Item
        text="Columns"
        icon={Columns3}
        iconTone="accent"
        rightIcon={ChevronRight}
        submenu={columnsMenu.length > 0 ? columnsMenu : [{ text: 'No columns configured', disabled: true }]}
      />
    </div>
  );
};

export default ClientsContextMenu;
