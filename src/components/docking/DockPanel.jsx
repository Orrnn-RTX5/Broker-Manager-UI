import { useRef, useCallback, useMemo, useState } from 'react';
import { DockTitleSlotContext } from './DockTitleSlotContext';
import { BarChart3, BriefcaseBusiness, ChevronUp, ChevronDown, FolderTree, Maximize2, Minimize2, TerminalSquare, Users } from 'lucide-react';
import { useDockingContext } from './DockingContext';
import { DOCK_POSITIONS } from './useDocking';
import styles from './DockPanel.module.css';

const RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

// Minimum drag distance (px) before a drag is considered intentional
const DRAG_THRESHOLD = 4;

export default function DockPanel({ id, children, canMoveUp, canMoveDown, layoutStyle }) {
  const {
    panels, updatePanel, bringToFront,
    closePanel, floatPanel, togglePanelMaximized,
    draggingId, setDraggingId, setActiveDockGuideId,
    terminalFullWidth,
    movePanelInZone,
  } = useDockingContext();
  const panel = panels[id];

  const panelRef    = useRef(null);
  const [titleSlot, setTitleSlot] = useState(null);
  const dragState   = useRef(null);
  const resizeState = useRef(null);

  const pos     = panel?.position;
  const isFloat = pos === DOCK_POSITIONS.FLOAT;
  const isMaximized = Boolean(panel?.maximized);
  const isMt5DockPane = id === 'market_data' || id === 'navigator';
  const isCompactToolboxTerminal = id === 'terminal' && !isFloat && !isMaximized && !terminalFullWidth;
  const hideTopTitleBar = isCompactToolboxTerminal;
  const showReorderButtons = !isMt5DockPane;
  const panelIcons = { users: Users, navigator: FolderTree, market: BarChart3, owner: BriefcaseBusiness, terminal: TerminalSquare };
  const PanelIcon = panelIcons[panel?.icon] || null;

  const getMt5DefaultFloatPos = useCallback(() => {
    const shell = typeof document !== 'undefined' ? document.querySelector('.cc-shell-workspace') : null;
    const shellRect = shell?.getBoundingClientRect();
    return {
      x: Math.max(6, Math.round((shellRect?.left ?? 0) + 6)),
      y: Math.max(88, Math.round((shellRect?.top ?? 64) + 122)),
    };
  }, []);

  // ─── Drag to float / show MT5 docking guide ─────────────────────────────────
  const onTitleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (isMaximized) return;
    if (e.target?.closest?.('button')) return;
    e.preventDefault();
    bringToFront(id);

    if (isMt5DockPane && !isFloat) {
      setActiveDockGuideId?.(id);
      setDraggingId(id);
      const onUp = () => {
        setDraggingId(null);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mouseup', onUp);
      return;
    }

    const rect = panelRef.current?.getBoundingClientRect();
    const initialOffsetX = rect
      ? Math.min(Math.max(24, e.clientX - rect.left), Math.max(40, rect.width - 28))
      : 96;
    const initialOffsetY = rect
      ? Math.min(Math.max(8, e.clientY - rect.top), 28)
      : 16;

    if (!isFloat) {
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        offsetX: initialOffsetX,
        offsetY: initialOffsetY,
        didMove: false,
        wasDockedAt: pos,
      };
    } else {
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        offsetX: rect ? e.clientX - rect.left : 96,
        offsetY: rect ? e.clientY - rect.top : 16,
        didMove: false,
        wasDockedAt: null,
      };
    }

    const onMove = (ev) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      const dist = Math.hypot(dx, dy);

      // Only start a real drag after DRAG_THRESHOLD pixels
      if (!dragState.current.didMove && dist < DRAG_THRESHOLD) return;

      if (!dragState.current.didMove) {
        dragState.current.didMove = true;

        if (dragState.current.wasDockedAt && !isMt5DockPane) {
          const floatPos = {
            x: Math.max(8, ev.clientX - dragState.current.offsetX),
            y: Math.max(48, ev.clientY - dragState.current.offsetY),
          };
          floatPanel(id, floatPos);
        }

        // Show global MT5 drop overlay
        setDraggingId(id);
        setActiveDockGuideId?.(id);
      }

      // For MT5 left dock panes (Market Watch / Navigator), keep the floating window
      // anchored under the MT5 Smart Docking Guide unless dragged far away.
      if (isMt5DockPane && dist < 96) {
        return;
      }

      updatePanel(id, {
        floatPos: {
          x: Math.max(8, ev.clientX - dragState.current.offsetX),
          y: Math.max(48, ev.clientY - dragState.current.offsetY),
        },
      });
    };

    const onUp = () => {
      // Stop active drag tracking; keep activeDockGuideId so the user can also click a guide button
      setDraggingId(null);
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [id, pos, isFloat, isMaximized, isMt5DockPane, getMt5DefaultFloatPos, bringToFront, floatPanel, updatePanel, setDraggingId, setActiveDockGuideId]);

  // ─── Resize ─────────────────────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((e, handle) => {
    if (!isFloat) return;
    e.preventDefault();
    e.stopPropagation();
    bringToFront(id);

    const rect = panelRef.current.getBoundingClientRect();
    resizeState.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      startLeft: panel.floatPos.x,
      startTop: panel.floatPos.y,
    };

    const onMove = (ev) => {
      const rs = resizeState.current;
      const dx = ev.clientX - rs.startX;
      const dy = ev.clientY - rs.startY;
      let { startW: w, startH: h, startLeft: x, startTop: y } = rs;

      if (rs.handle.includes('e')) w = Math.max(200, w + dx);
      if (rs.handle.includes('s')) h = Math.max(120, h + dy);
      if (rs.handle.includes('w')) { w = Math.max(200, w - dx); x = rs.startLeft + rs.startW - w; }
      if (rs.handle.includes('n')) { h = Math.max(120, h - dy); y = rs.startTop + rs.startH - h; }

      updatePanel(id, {
        size: { width: Math.round(w), height: Math.round(h) },
        floatPos: { x: Math.round(x), y: Math.round(y) },
      });
    };

    const onUp = () => {
      resizeState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [id, isFloat, panel, bringToFront, updatePanel]);

  const terminalTitle = useMemo(() => ({ slot: titleSlot, onTitleMouseDown }), [titleSlot, onTitleMouseDown]);

  if (!panel || !panel.visible) return null;

  // ─── Container style ─────────────────────────────────────────────────────────
  let containerStyle = {};
  let containerClass = `${styles.panel} ${styles.workspaceUi}`;

  if (pos === DOCK_POSITIONS.FLOAT) {
    containerStyle = {
      position: 'fixed',
      left: panel.floatPos?.x ?? 12,
      top: panel.floatPos?.y ?? 184,
      width: isMt5DockPane ? 228 : (panel.size?.width ?? 248),
      height: isMt5DockPane ? 380 : (panel.size?.height ?? 360),
      zIndex: panel.zIndex ?? 100,
    };
    containerClass += ' ' + styles.panelFloat + (isMt5DockPane ? ' ' + styles.mt5PanelFloat : '');
  } else if (pos === DOCK_POSITIONS.LEFT) {
    containerClass += ' ' + styles.panelLeft;
    const width = Number(panel.size?.width);
    if (Number.isFinite(width) && width > 0) {
      containerStyle = { width: `${Math.round(width)}px` };
    }
  }
  else if (pos === DOCK_POSITIONS.RIGHT)  { containerClass += ' ' + styles.panelRight; }
  else if (pos === DOCK_POSITIONS.TOP)    { containerClass += ' ' + styles.panelTop; }
  else if (pos === DOCK_POSITIONS.BOTTOM) { containerClass += ' ' + styles.panelBottom; }
  else if (pos === DOCK_POSITIONS.CENTER) { containerClass += ' ' + styles.panelCenter; }

  if (draggingId === id) containerClass += ' ' + styles.dragging;

  if (pos === DOCK_POSITIONS.RIGHT) {
    const width = Number(panel.size?.width);
    if (Number.isFinite(width) && width > 0) containerStyle.width = `${Math.round(width)}px`;
  }
  if (pos === DOCK_POSITIONS.BOTTOM || pos === DOCK_POSITIONS.TOP || pos === DOCK_POSITIONS.CENTER) {
    const configuredHeight = panel.size?.height;
    const numericHeight = Number(configuredHeight);
    if (Number.isFinite(numericHeight) && numericHeight > 0) {
      containerStyle.height = `${Math.round(numericHeight)}px`;
    } else if (typeof configuredHeight === 'string' && configuredHeight.trim()) {
      containerStyle.height = configuredHeight;
    }
  }

  return (
    <div
      ref={panelRef}
      data-panel-id={id}
      data-panel-position={pos}
      className={containerClass}
      style={{ ...containerStyle, ...layoutStyle }}
      onMouseDown={() => isFloat && bringToFront(id)}
    >
      {/* Title Bar */}
      {!hideTopTitleBar && (
        <div
          data-dock-titlebar="true"
          className={`${styles.titleBar}${isMt5DockPane ? ` ${styles.mt5PaneTitleBar}` : ''}${isMaximized ? ` ${styles.titleBarStatic}` : ''}`}
          onMouseDown={onTitleMouseDown}
        >
          {!isMt5DockPane && (
            <span className={styles.panelIcon}>{PanelIcon ? <PanelIcon size={15} strokeWidth={1.9} /> : panel.icon}</span>
          )}
          <span
            ref={id === 'market_data' ? setTitleSlot : undefined}
            className={styles.titleText}
          >
            {id === 'market_data' && titleSlot ? null : panel.title}
          </span>
          {id === 'terminal' && <div ref={setTitleSlot} className="cc-terminal-title-slot" onMouseDown={event => event.stopPropagation()} />}
          <div className={styles.titleActions}>
            {showReorderButtons && canMoveUp && pos !== DOCK_POSITIONS.FLOAT && pos !== DOCK_POSITIONS.CENTER && (
              <button
                className={styles.titleBtn}
                title="Move Up"
                onMouseDown={e => { e.stopPropagation(); movePanelInZone(id, -1); }}
              >
                <ChevronUp size={14} />
              </button>
            )}
            {showReorderButtons && canMoveDown && pos !== DOCK_POSITIONS.FLOAT && pos !== DOCK_POSITIONS.CENTER && (
              <button
                className={styles.titleBtn}
                title="Move Down"
                onMouseDown={e => { e.stopPropagation(); movePanelInZone(id, 1); }}
              >
                <ChevronDown size={14} />
              </button>
            )}
            {!isMt5DockPane && panel.canMaximize && !isFloat && (
              <button
                type="button"
                className={styles.titleBtn}
                title={isMaximized ? `Restore ${panel.title}` : `Maximize ${panel.title}`}
                aria-label={isMaximized ? `Restore ${panel.title}` : `Maximize ${panel.title}`}
                aria-pressed={isMaximized}
                onMouseDown={e => e.stopPropagation()}
                onClick={() => togglePanelMaximized(id)}
              >
                {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}
            {!isMt5DockPane && !isFloat && !isMaximized && (
              <button
                className={styles.titleBtn}
                title="Move / Pop out to floating window"
                onMouseDown={e => {
                  e.stopPropagation();
                  if (!isMt5DockPane) {
                    floatPanel(id);
                  }
                  setActiveDockGuideId?.(id);
                }}
              >⧉</button>
            )}
            <button
              className={`${styles.titleBtn} ${styles.closeBtn}${isMt5DockPane ? ` ${styles.mt5CloseBtn}` : ''}`}
              title="Close"
              onMouseDown={e => { e.stopPropagation(); closePanel(id); }}
            >{isMt5DockPane ? '×' : '✕'}</button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={isCompactToolboxTerminal ? styles.terminalBodyRow : styles.content}>
        {isCompactToolboxTerminal && (
          <div
            className={styles.mt5ToolboxStrip}
            data-dock-titlebar="true"
            onMouseDown={onTitleMouseDown}
            title="Toolbox / Operations Terminal"
          >
            <button
              type="button"
              className={styles.mt5ToolboxClose}
              title="Close Toolbox"
              aria-label="Close Toolbox"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => closePanel(id)}
            >
              ×
            </button>
            <span className={styles.mt5ToolboxLabel}>Toolbox</span>
          </div>
        )}
        <div className={isCompactToolboxTerminal ? styles.content : undefined} style={isCompactToolboxTerminal ? undefined : { display: 'contents' }}>
          <DockTitleSlotContext.Provider value={terminalTitle}>{children}</DockTitleSlotContext.Provider>
        </div>
      </div>

      {/* Resize Handles (float only) */}
      {isFloat && RESIZE_HANDLES.map(h => (
        <div
          key={h}
          className={`${styles.resizeHandle} ${styles['resizeHandle_' + h]}`}
          onMouseDown={e => onResizeMouseDown(e, h)}
        />
      ))}
    </div>
  );
}
