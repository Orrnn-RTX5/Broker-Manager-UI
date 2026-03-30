import { useRef, useCallback, useState } from 'react';
import { useDockingContext } from './DockingContext';
import { DOCK_POSITIONS } from './useDocking';
import styles from './DockPanel.module.css';

const RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

// Minimum drag distance (px) before a drag is considered intentional
const DRAG_THRESHOLD = 8;

export default function DockPanel({ id, children }) {
  const {
    panels, updatePanel, dockPanel, bringToFront,
    closePanel, floatPanel, draggingId, setDraggingId,
  } = useDockingContext();
  const panel = panels[id];

  const panelRef    = useRef(null);
  const dragState   = useRef(null);
  const resizeState = useRef(null);

  const pos     = panel?.position;
  const isFloat = pos === DOCK_POSITIONS.FLOAT;

  // ─── Drag to float ──────────────────────────────────────────────────────────
  const onTitleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    bringToFront(id);

    if (!isFloat) {
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        offsetX: 0,
        offsetY: 0,
        didMove: false,
        wasDockedAt: pos,
      };
    } else {
      const rect = panelRef.current.getBoundingClientRect();
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        didMove: false,
        wasDockedAt: null,
      };
    }

    const onMove = (ev) => {
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;

      // Only start a real drag after DRAG_THRESHOLD pixels
      if (!dragState.current.didMove && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      if (!dragState.current.didMove) {
        dragState.current.didMove = true;

        if (dragState.current.wasDockedAt) {
          // undock → float at cursor
          const floatPos = {
            x: ev.clientX - 120,
            y: ev.clientY - 16,
          };
          floatPanel(id, floatPos);
          dragState.current.offsetX = 120;
          dragState.current.offsetY = 16;
        }

        // Show global drop overlay
        setDraggingId(id);
      }

      updatePanel(id, {
        floatPos: {
          x: ev.clientX - dragState.current.offsetX,
          y: ev.clientY - dragState.current.offsetY,
        },
      });
    };

    const onUp = () => {
      // Hide global overlay (if no zone was hit, panel stays floating)
      setDraggingId(null);
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [id, pos, isFloat, bringToFront, floatPanel, updatePanel, setDraggingId]);

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

  if (!panel || !panel.visible) return null;

  // ─── Container style ─────────────────────────────────────────────────────────
  let containerStyle = {};
  let containerClass = styles.panel;

  if (pos === DOCK_POSITIONS.FLOAT) {
    containerStyle = {
      position: 'fixed',
      left: panel.floatPos?.x ?? 100,
      top: panel.floatPos?.y ?? 100,
      width: panel.size?.width ?? 320,
      height: panel.size?.height ?? 400,
      zIndex: panel.zIndex ?? 100,
    };
    containerClass += ' ' + styles.panelFloat;
  } else if (pos === DOCK_POSITIONS.LEFT)   { containerClass += ' ' + styles.panelLeft; }
  else if (pos === DOCK_POSITIONS.RIGHT)  { containerClass += ' ' + styles.panelRight; }
  else if (pos === DOCK_POSITIONS.TOP)    { containerClass += ' ' + styles.panelTop; }
  else if (pos === DOCK_POSITIONS.BOTTOM) { containerClass += ' ' + styles.panelBottom; }
  else if (pos === DOCK_POSITIONS.CENTER) { containerClass += ' ' + styles.panelCenter; }

  if (draggingId === id) containerClass += ' ' + styles.dragging;

  return (
    <div
      ref={panelRef}
      className={containerClass}
      style={containerStyle}
      onMouseDown={() => isFloat && bringToFront(id)}
    >
      {/* Title Bar */}
      <div className={styles.titleBar} onMouseDown={onTitleMouseDown}>
        <span className={styles.panelIcon}>{panel.icon}</span>
        <span className={styles.titleText}>{panel.title}</span>
        <div className={styles.titleActions}>
          {!isFloat && (
            <button
              className={styles.titleBtn}
              title="Pop out to floating window"
              onMouseDown={e => { e.stopPropagation(); floatPanel(id); }}
            >⧉</button>
          )}
          <button
            className={styles.titleBtn + ' ' + styles.closeBtn}
            title="Close"
            onMouseDown={e => { e.stopPropagation(); closePanel(id); }}
          >✕</button>
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {children}
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
