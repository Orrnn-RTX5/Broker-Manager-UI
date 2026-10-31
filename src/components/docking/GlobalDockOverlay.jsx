import { useEffect, useId, useRef, useState } from 'react';

/**
 * MT5 Smart Docking Icon (matches MetaTrader 5 Manager docking guide buttons)
 * direction: 'left' | 'right' | 'bottom' | 'top'
 */
function Mt5DockButtonIcon({ direction, active }) {
  const uid = useId().replace(/:/g, '');
  const gradId = `mt5-dock-pane-${direction}-${uid}`;
  const headerGradId = `mt5-dock-hdr-${direction}-${uid}`;

  return (
    <svg
      width="24"
      height="22"
      viewBox="0 0 24 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={active ? '#b8d4fe' : '#d2e3fc'} />
          <stop offset="100%" stopColor={active ? '#7daef8' : '#a6c5f7'} />
        </linearGradient>
        <linearGradient id={headerGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b8ce0" />
          <stop offset="100%" stopColor="#3566b8" />
        </linearGradient>
      </defs>

      {/* Outer miniature window background */}
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="19"
        rx="1"
        fill="#ffffff"
        stroke={active ? '#1d4ed8' : '#4a6596'}
        strokeWidth="1"
      />

      {/* Shaded target half */}
      {direction === 'left' && (
        <rect x="2" y="5.5" width="10" height="14.5" fill={`url(#${gradId})`} />
      )}
      {direction === 'right' && (
        <rect x="12" y="5.5" width="10" height="14.5" fill={`url(#${gradId})`} />
      )}
      {direction === 'bottom' && (
        <rect x="2" y="13" width="20" height="7" fill={`url(#${gradId})`} />
      )}
      {direction === 'top' && (
        <rect x="2" y="5.5" width="20" height="7.5" fill={`url(#${gradId})`} />
      )}

      {/* Top blue window header bar */}
      <rect x="2" y="2" width="20" height="3.5" fill={`url(#${headerGradId})`} />

      {/* Dotted split line + directional arrow */}
      {(direction === 'left' || direction === 'right') && (
        <line
          x1="12"
          y1="5.5"
          x2="12"
          y2="20"
          stroke="#4a6596"
          strokeWidth="1"
          strokeDasharray="1.5 1.5"
        />
      )}
      {(direction === 'bottom' || direction === 'top') && (
        <line
          x1="2"
          y1="13"
          x2="22"
          y2="13"
          stroke="#4a6596"
          strokeWidth="1"
          strokeDasharray="1.5 1.5"
        />
      )}

      {direction === 'left' && (
        <polygon points="14,13 17.5,10 17.5,16" fill="#244785" />
      )}
      {direction === 'right' && (
        <polygon points="10,13 6.5,10 6.5,16" fill="#244785" />
      )}
      {direction === 'bottom' && (
        <polygon points="12,11.8 9,8.5 15,8.5" fill="#244785" />
      )}
      {direction === 'top' && (
        <polygon points="12,14.2 9,17.5 15,17.5" fill="#244785" />
      )}
    </svg>
  );
}

const getButtonStyle = (isHovered) => ({
  width: 32,
  height: 32,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: isHovered
    ? 'linear-gradient(180deg, #ffffff 0%, #dce8fc 100%)'
    : 'linear-gradient(180deg, #f7f9fc 0%, #dcdfe6 100%)',
  border: isHovered ? '1px solid #2563eb' : '1px solid #8c96a8',
  borderRadius: 2,
  boxShadow: isHovered
    ? '0 0 0 2px rgba(37, 99, 235, 0.45), 0 4px 10px rgba(0, 0, 0, 0.35)'
    : 'inset 0 1px 0 #ffffff, 0 2px 6px rgba(0, 0, 0, 0.32)',
  cursor: 'pointer',
  pointerEvents: 'all',
  outline: 'none',
  transition: 'transform 80ms ease, border-color 80ms ease, box-shadow 80ms ease',
  transform: isHovered ? 'scale(1.06)' : 'scale(1)',
});

/**
 * Computes a STATIONARY anchor over the left dock area so the user can move
 * the dragged panel / mouse cursor onto the docking buttons without the guide
 * moving away with the cursor.
 */
const readStationaryGuideAnchor = (activePanelId) => {
  if (typeof document === 'undefined') {
    return {
      left: 24,
      top: 184,
      shellRect: { left: 0, top: 64, width: 1280, height: 640 },
    };
  }

  const shell = document.querySelector('.cc-shell-workspace');
  const shellRect = shell?.getBoundingClientRect() || {
    left: 0,
    top: 64,
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: (typeof window !== 'undefined' ? window.innerHeight : 720) - 90,
  };

  const activePanelEl = activePanelId
    ? document.querySelector(`[data-panel-id="${activePanelId}"]`)
    : null;
  const panelRect = activePanelEl?.getBoundingClientRect();
  if (panelRect && panelRect.width > 0 && panelRect.height > 0) {
    return {
      left: Math.max(12, Math.round(panelRect.left + 18)),
      top: Math.max(Math.round(shellRect.top + 26), Math.round(panelRect.top + 26)),
      shellRect,
    };
  }

  return {
    left: Math.round(shellRect.left + 24),
    top: Math.round(shellRect.top + 121),
    shellRect,
  };
};

const getPreviewStyle = (hoveredZone, shellRect) => {
  if (!hoveredZone || !shellRect) return null;
  const base = {
    position: 'fixed',
    background: 'rgba(59, 130, 246, 0.18)',
    border: '1px solid rgba(59, 130, 246, 0.78)',
    borderRadius: 2,
    pointerEvents: 'none',
    zIndex: 99996,
    transition: 'all 90ms ease',
  };

  const middleHeight = Math.max(220, Math.round(shellRect.height - 190));

  if (hoveredZone === 'outer-left' || hoveredZone === 'left') {
    return {
      ...base,
      left: Math.round(shellRect.left),
      top: Math.round(shellRect.top),
      width: 240,
      height: middleHeight,
    };
  }
  if (hoveredZone === 'right') {
    return {
      ...base,
      left: Math.round(shellRect.left + 244),
      top: Math.round(shellRect.top),
      width: 220,
      height: middleHeight,
    };
  }
  if (hoveredZone === 'bottom') {
    return {
      ...base,
      left: Math.round(shellRect.left),
      top: Math.round(shellRect.top + Math.floor(middleHeight / 2)),
      width: 346,
      height: Math.ceil(middleHeight / 2),
    };
  }
  if (hoveredZone === 'top') {
    return {
      ...base,
      left: Math.round(shellRect.left),
      top: Math.round(shellRect.top),
      width: 346,
      height: Math.floor(middleHeight / 2),
    };
  }
  return null;
};

export default function GlobalDockOverlay({
  visible,
  activePanelId,
  isDragging,
  onDock,
  onDismiss,
}) {
  const [hoveredZone, setHoveredZone] = useState(null);
  const hoveredZoneRef = useRef(null);
  const guideRef = useRef(null);
  const handledActionRef = useRef(false);

  const updateHovered = (zone) => {
    hoveredZoneRef.current = zone;
    setHoveredZone(zone);
  };

  useEffect(() => {
    handledActionRef.current = false;
    hoveredZoneRef.current = null;
  }, [visible, activePanelId]);

  // Coordinate hit-testing while dragging so releasing the mouse over any
  // guide button always docks reliably even during fast pointer movement.
  useEffect(() => {
    if (!visible || !isDragging) return undefined;

    const findZoneAtPoint = (clientX, clientY) => {
      const container = guideRef.current;
      if (!container) return null;
      const buttons = container.querySelectorAll('[data-dock-zone]');
      for (const btn of buttons) {
        const rect = btn.getBoundingClientRect();
        if (
          clientX >= rect.left - 3 &&
          clientX <= rect.right + 3 &&
          clientY >= rect.top - 3 &&
          clientY <= rect.bottom + 3
        ) {
          return btn.getAttribute('data-dock-zone');
        }
      }
      return null;
    };

    const handleWindowMouseMove = (event) => {
      const zone = findZoneAtPoint(event.clientX, event.clientY);
      if (zone !== hoveredZoneRef.current) {
        updateHovered(zone);
      }
    };

    const handleWindowMouseUp = (event) => {
      const zone = findZoneAtPoint(event.clientX, event.clientY) || hoveredZoneRef.current;
      if (zone && !handledActionRef.current) {
        handledActionRef.current = true;
        updateHovered(null);
        onDock?.(zone);
        setTimeout(() => {
          handledActionRef.current = false;
        }, 0);
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove, true);
    window.addEventListener('mouseup', handleWindowMouseUp, true);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove, true);
      window.removeEventListener('mouseup', handleWindowMouseUp, true);
    };
  }, [visible, isDragging, onDock]);

  useEffect(() => {
    if (!visible || isDragging) return undefined;

    const handleOutsidePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (guideRef.current?.contains(target)) return;
      if (target.closest('[data-dock-titlebar="true"]')) return;
      onDismiss?.();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onDismiss?.();
      }
    };

    window.addEventListener('mousedown', handleOutsidePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsidePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, isDragging, onDismiss]);

  if (!visible) return null;

  const { left: anchorLeft, top: anchorTop, shellRect } = readStationaryGuideAnchor(activePanelId);
  const previewStyle = getPreviewStyle(hoveredZone, shellRect);

  const triggerDock = (zoneId, event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    if (handledActionRef.current) return;
    handledActionRef.current = true;
    updateHovered(null);
    onDock?.(zoneId);
    setTimeout(() => {
      handledActionRef.current = false;
    }, 0);
  };

  return (
    <div
      data-testid="mt5-dock-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99997,
        pointerEvents: 'none',
      }}
    >
      {previewStyle && <div data-testid="mt5-dock-preview" style={previewStyle} />}

      {/* MT5 Manager Smart Docking Guide Cluster (Outer-Left + Central Diamond) */}
      <div
        ref={guideRef}
        data-testid="mt5-dock-guide"
        data-active-panel={activePanelId || ''}
        style={{
          position: 'fixed',
          left: anchorLeft,
          top: anchorTop,
          width: 158,
          height: 92,
          zIndex: 99999,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {/* Outer-Left Dock Button */}
        <button
          type="button"
          data-dock-zone="outer-left"
          aria-label="Dock to far left"
          title="Dock to far left"
          style={{
            ...getButtonStyle(hoveredZone === 'outer-left'),
            position: 'absolute',
            left: 0,
            top: 22,
          }}
          onMouseEnter={() => updateHovered('outer-left')}
          onMouseLeave={() => updateHovered(null)}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => triggerDock('outer-left', e)}
          onClick={(e) => triggerDock('outer-left', e)}
        >
          <Mt5DockButtonIcon direction="left" active={hoveredZone === 'outer-left'} />
        </button>

        {/* Central Diamond Guide */}
        <div
          style={{
            position: 'absolute',
            left: 54,
            top: 0,
            width: 100,
            height: 90,
            pointerEvents: 'none',
          }}
        >
          {/* Diamond Backing Polygon with Top Triangle Peak (matches MT5 screenshot) */}
          <svg
            width="100"
            height="90"
            viewBox="0 0 100 90"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: 'absolute',
              inset: 0,
              filter: 'drop-shadow(0 3px 8px rgba(0, 0, 0, 0.42))',
              pointerEvents: 'none',
            }}
          >
            <defs>
              <linearGradient id="mt5-diamond-bg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#dfe3ea" />
              </linearGradient>
            </defs>
            <polygon
              points="50,2 72,22 96,22 96,54 68,54 68,86 32,86 32,54 4,54 4,22 28,22"
              fill="url(#mt5-diamond-bg)"
              stroke="#9099a8"
              strokeWidth="1"
            />
            <polygon
              points="50,6 66,21 34,21"
              fill={hoveredZone === 'top' ? '#cfe0fc' : '#f1f4f9'}
              stroke="#b8c0ce"
              strokeWidth="0.8"
            />
          </svg>

          {/* Top Peak Interactive Zone (stacks panel on top) */}
          <button
            type="button"
            data-dock-zone="top"
            aria-label="Dock to top"
            title="Dock to top"
            style={{
              position: 'absolute',
              left: 32,
              top: 2,
              width: 36,
              height: 20,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              pointerEvents: 'all',
            }}
            onMouseEnter={() => updateHovered('top')}
            onMouseLeave={() => updateHovered(null)}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => triggerDock('top', e)}
            onClick={(e) => triggerDock('top', e)}
          />

          {/* Diamond Left Button */}
          <button
            type="button"
            data-dock-zone="left"
            aria-label="Dock to left"
            title="Dock to left"
            style={{
              ...getButtonStyle(hoveredZone === 'left'),
              position: 'absolute',
              left: 4,
              top: 22,
            }}
            onMouseEnter={() => updateHovered('left')}
            onMouseLeave={() => updateHovered(null)}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => triggerDock('left', e)}
            onClick={(e) => triggerDock('left', e)}
          >
            <Mt5DockButtonIcon direction="left" active={hoveredZone === 'left'} />
          </button>

          {/* Diamond Right Button */}
          <button
            type="button"
            data-dock-zone="right"
            aria-label="Dock to right"
            title="Dock to right"
            style={{
              ...getButtonStyle(hoveredZone === 'right'),
              position: 'absolute',
              left: 64,
              top: 22,
            }}
            onMouseEnter={() => updateHovered('right')}
            onMouseLeave={() => updateHovered(null)}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => triggerDock('right', e)}
            onClick={(e) => triggerDock('right', e)}
          >
            <Mt5DockButtonIcon direction="right" active={hoveredZone === 'right'} />
          </button>

          {/* Diamond Bottom Button */}
          <button
            type="button"
            data-dock-zone="bottom"
            aria-label="Dock to bottom"
            title="Dock to bottom"
            style={{
              ...getButtonStyle(hoveredZone === 'bottom'),
              position: 'absolute',
              left: 34,
              top: 52,
            }}
            onMouseEnter={() => updateHovered('bottom')}
            onMouseLeave={() => updateHovered(null)}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => triggerDock('bottom', e)}
            onClick={(e) => triggerDock('bottom', e)}
          >
            <Mt5DockButtonIcon direction="bottom" active={hoveredZone === 'bottom'} />
          </button>
        </div>
      </div>
    </div>
  );
}
