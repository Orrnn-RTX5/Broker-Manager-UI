import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Move, X } from 'lucide-react';
import { NewAccountModalContent } from './Popups/NewAccountModal';
import NewGroupModal from '../features/groups/components/NewGroupModal';
import { MAX_MULTI_SCREENS, buildScreenGridRows, useMultiScreenStore } from '../store/multiScreenStore';

const INTERACTIVE_DRAG_EXCLUDE =
  'button, input, select, textarea, a, label, [role="listbox"], [role="option"], [role="combobox"]';

const isScrollbarOrInteractiveTarget = (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest(INTERACTIVE_DRAG_EXCLUDE)) return true;
  const scrollBody = target.closest('.new-account-modal-body, .group-create-body');
  if (scrollBody instanceof HTMLElement && scrollBody.scrollHeight > scrollBody.clientHeight) {
    const rect = scrollBody.getBoundingClientRect();
    if (event.clientX >= rect.right - 14) return true;
  }
  return false;
};

const readZoneRects = () => {
  if (typeof document === 'undefined') return {};
  const shell = document.querySelector('.cc-shell-workspace');
  const shellRect = shell?.getBoundingClientRect() || {
    left: 0,
    top: 64,
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: (typeof window !== 'undefined' ? window.innerHeight : 720) - 92,
    right: typeof window !== 'undefined' ? window.innerWidth : 1280,
    bottom: (typeof window !== 'undefined' ? window.innerHeight : 720) - 28,
  };

  const marketPanel =
    document.querySelector('[data-panel-id="market_data"]') ||
    document.querySelector('[data-panel-id="navigator"]');
  const marketRect = marketPanel?.getBoundingClientRect();
  const leftRect =
    marketRect && marketRect.width > 40 && marketRect.height > 40
      ? {
          left: Math.round(marketRect.left),
          top: Math.round(marketRect.top),
          width: Math.round(marketRect.width),
          height: Math.round(marketRect.height),
          right: Math.round(marketRect.right),
          bottom: Math.round(marketRect.bottom),
        }
      : {
          left: Math.round(shellRect.left),
          top: Math.round(shellRect.top),
          width: 346,
          height: Math.round(shellRect.height * 0.72),
          right: Math.round(shellRect.left + 346),
          bottom: Math.round(shellRect.top + shellRect.height * 0.72),
        };

  const terminalPanel = document.querySelector('[data-panel-id="terminal"]');
  const terminalRect = terminalPanel?.getBoundingClientRect();
  const bottomRect =
    terminalRect && terminalRect.width > 40 && terminalRect.height > 40
      ? {
          left: Math.round(terminalRect.left),
          top: Math.round(terminalRect.top),
          width: Math.round(terminalRect.width),
          height: Math.round(terminalRect.height),
          right: Math.round(terminalRect.right),
          bottom: Math.round(terminalRect.bottom),
        }
      : {
          left: Math.round(shellRect.left),
          top: Math.round(shellRect.bottom - 220),
          width: Math.round(shellRect.width),
          height: 220,
          right: Math.round(shellRect.right),
          bottom: Math.round(shellRect.bottom),
        };

  const centerWorkspace = document.querySelector('.cc-center-workspace');
  const centerRect = centerWorkspace?.getBoundingClientRect() || shellRect;
  const rightWidth = Math.max(320, Math.round(centerRect.width * 0.58));
  const rightRect = {
    left: Math.round(centerRect.right - rightWidth),
    top: Math.round(centerRect.top),
    width: rightWidth,
    height: Math.round(centerRect.height),
    right: Math.round(centerRect.right),
    bottom: Math.round(centerRect.bottom),
  };

  return {
    left: leftRect,
    bottom: bottomRect,
    right: rightRect,
  };
};

const isPointInRect = (x, y, rect) =>
  Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);

const detectHoveredDockZone = (clientX, clientY, rects, allowRightFullRect) => {
  if (!rects) return null;
  if (isPointInRect(clientX, clientY, rects.left)) return 'left';
  if (isPointInRect(clientX, clientY, rects.bottom)) return 'bottom';
  if (isPointInRect(clientX, clientY, rects.right)) {
    if (allowRightFullRect || clientX >= rects.right.right - 110) {
      return 'right';
    }
  }
  return null;
};

const attachWindowDragListeners = (startX, startY, onDeltaMove, onDragEnd) => {
  let active = true;
  const handleMove = (moveEvent) => {
    if (!active) return;
    if (typeof moveEvent.clientX !== 'number' || typeof moveEvent.clientY !== 'number') return;
    onDeltaMove(moveEvent.clientX - startX, moveEvent.clientY - startY, moveEvent);
  };
  const handleUp = (endEvent) => {
    if (!active) return;
    active = false;
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('mouseup', handleUp);
    window.removeEventListener('pointercancel', handleUp);
    onDragEnd?.(endEvent);
  };
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('mouseup', handleUp);
  window.addEventListener('pointercancel', handleUp);
};

const getScreenFromStore = (mode, screenId) => {
  const state = useMultiScreenStore.getState();
  const list = mode === 'group' ? state.groupScreens : state.accountScreens;
  return list.find((item) => item.id === screenId) || null;
};

export default function MultiScreenWorkspace({ mode = 'account', onGroupSuccess, onAccountSuccess }) {
  const accountScreens = useMultiScreenStore((state) => state.accountScreens);
  const activeAccountScreenId = useMultiScreenStore((state) => state.activeAccountScreenId);
  const closeAccountScreen = useMultiScreenStore((state) => state.closeAccountScreen);
  const closeAllAccountScreens = useMultiScreenStore((state) => state.closeAllAccountScreens);
  const setActiveAccountScreen = useMultiScreenStore((state) => state.setActiveAccountScreen);

  const groupScreens = useMultiScreenStore((state) => state.groupScreens);
  const activeGroupScreenId = useMultiScreenStore((state) => state.activeGroupScreenId);
  const closeGroupScreen = useMultiScreenStore((state) => state.closeGroupScreen);
  const closeAllGroupScreens = useMultiScreenStore((state) => state.closeAllGroupScreens);
  const setActiveGroupScreen = useMultiScreenStore((state) => state.setActiveGroupScreen);

  const isWorkspaceMovable = useMultiScreenStore((state) => state.isWorkspaceMovable);
  const workspacePosition = useMultiScreenStore((state) => state.workspacePosition);
  const workspaceDockZone = useMultiScreenStore((state) => state.workspaceDockZone);
  const toggleWorkspaceMovable = useMultiScreenStore((state) => state.toggleWorkspaceMovable);
  const setWorkspaceMovable = useMultiScreenStore((state) => state.setWorkspaceMovable);
  const setWorkspacePosition = useMultiScreenStore((state) => state.setWorkspacePosition);
  const dockWorkspaceToZone = useMultiScreenStore((state) => state.dockWorkspaceToZone);
  const toggleScreenMovable = useMultiScreenStore((state) => state.toggleScreenMovable);
  const setScreenMovable = useMultiScreenStore((state) => state.setScreenMovable);
  const setScreenPosition = useMultiScreenStore((state) => state.setScreenPosition);
  const dockScreenToZone = useMultiScreenStore((state) => state.dockScreenToZone);

  const [draggingTarget, setDraggingTarget] = useState(null);
  const [hoveredDockZone, setHoveredDockZone] = useState(null);
  const [zoneRects, setZoneRects] = useState(() => readZoneRects());
  const hoveredDockZoneRef = useRef(null);
  const suppressWorkspaceToggleClickRef = useRef(false);
  const suppressPaneToggleClickRef = useRef({});

  const isGroupMode = mode === 'group';
  const screens = isGroupMode ? groupScreens : accountScreens;
  const activeScreenId = isGroupMode ? activeGroupScreenId : activeAccountScreenId;
  const closeScreen = isGroupMode ? closeGroupScreen : closeAccountScreen;
  const closeAllScreens = isGroupMode ? closeAllGroupScreens : closeAllAccountScreens;
  const setActiveScreen = isGroupMode ? setActiveGroupScreen : setActiveAccountScreen;
  const anyPaneDocked = screens.some((screen) => Boolean(screen.dockZone));

  useEffect(() => {
    if (!screens.length) return undefined;
    const syncRects = () => setZoneRects(readZoneRects());
    syncRects();
    window.addEventListener('resize', syncRects);
    const ResizeObserverImpl = globalThis.ResizeObserver;
    const observer = ResizeObserverImpl ? new ResizeObserverImpl(syncRects) : null;
    const marketEl = document.querySelector('[data-panel-id="market_data"]');
    const navEl = document.querySelector('[data-panel-id="navigator"]');
    const termEl = document.querySelector('[data-panel-id="terminal"]');
    const centerEl = document.querySelector('.cc-center-workspace');
    if (marketEl) observer?.observe(marketEl);
    if (navEl) observer?.observe(navEl);
    if (termEl) observer?.observe(termEl);
    if (centerEl) observer?.observe(centerEl);
    return () => {
      window.removeEventListener('resize', syncRects);
      observer?.disconnect();
    };
  }, [screens.length, workspaceDockZone, anyPaneDocked]);

  if (!screens.length) return null;

  const rows = buildScreenGridRows(screens);
  const screenIndexById = new Map(screens.map((screen, index) => [screen.id, index + 1]));
  const anyPaneMovable = screens.some((screen) => Boolean(screen.movable));

  const updateHoveredZone = (zone) => {
    if (hoveredDockZoneRef.current !== zone) {
      hoveredDockZoneRef.current = zone;
      setHoveredDockZone(zone);
    }
  };

  const applyPaneDropToZone = (screenId, zone) => {
    if (!zone) return;
    const currentList = useMultiScreenStore.getState()[isGroupMode ? 'groupScreens' : 'accountScreens'];
    if (currentList.length === 1) {
      dockWorkspaceToZone(zone);
      dockScreenToZone(mode, screenId, 'right');
    } else {
      dockScreenToZone(mode, screenId, zone);
    }
  };

  const beginWorkspaceDragSession = (startX, startY) => {
    const state = useMultiScreenStore.getState();
    const currentPos = state.workspacePosition;
    const baseX = Number(currentPos?.x) || 0;
    const baseY = Number(currentPos?.y) || 0;
    const rects = readZoneRects();
    setZoneRects(rects);
    let allowRightFull = Boolean(state.workspaceDockZone) || Math.hypot(baseX, baseY) > 20;
    setDraggingTarget('workspace');

    attachWindowDragListeners(
      startX,
      startY,
      (dx, dy, moveEvent) => {
        moveEvent.preventDefault?.();
        if (!isPointInRect(moveEvent.clientX, moveEvent.clientY, rects.right)) {
          allowRightFull = true;
        }
        const zone = detectHoveredDockZone(moveEvent.clientX, moveEvent.clientY, rects, allowRightFull);
        updateHoveredZone(zone);
        setWorkspacePosition({
          x: baseX + dx,
          y: baseY + dy,
        });
      },
      () => {
        const dropZone = hoveredDockZoneRef.current;
        updateHoveredZone(null);
        setDraggingTarget(null);
        if (dropZone) {
          dockWorkspaceToZone(dropZone);
        }
      }
    );
  };

  const beginPaneDragSession = (screenId, startX, startY) => {
    const currentScreen = getScreenFromStore(mode, screenId);
    const baseX = Number(currentScreen?.position?.x) || 0;
    const baseY = Number(currentScreen?.position?.y) || 0;
    const rects = readZoneRects();
    setZoneRects(rects);
    let allowRightFull =
      Boolean(currentScreen?.dockZone) ||
      Boolean(useMultiScreenStore.getState().workspaceDockZone) ||
      Math.hypot(baseX, baseY) > 20;
    setActiveScreen(screenId);
    setDraggingTarget(screenId);

    attachWindowDragListeners(
      startX,
      startY,
      (dx, dy, moveEvent) => {
        moveEvent.preventDefault?.();
        if (!isPointInRect(moveEvent.clientX, moveEvent.clientY, rects.right)) {
          allowRightFull = true;
        }
        const zone = detectHoveredDockZone(moveEvent.clientX, moveEvent.clientY, rects, allowRightFull);
        updateHoveredZone(zone);
        setScreenPosition(mode, screenId, {
          x: baseX + dx,
          y: baseY + dy,
        });
      },
      () => {
        const dropZone = hoveredDockZoneRef.current;
        updateHoveredZone(null);
        setDraggingTarget(null);
        if (dropZone) {
          applyPaneDropToZone(screenId, dropZone);
        }
      }
    );
  };

  const startWorkspaceDrag = (event) => {
    if (!isWorkspaceMovable || event.button !== 0) return;
    if (isScrollbarOrInteractiveTarget(event)) return;
    event.preventDefault();
    event.stopPropagation();
    beginWorkspaceDragSession(event.clientX, event.clientY);
  };

  const startPaneDrag = (event, screen) => {
    if (event.button !== 0) return;
    if (isScrollbarOrInteractiveTarget(event)) return;
    if (!screen.movable) {
      if (isWorkspaceMovable) startWorkspaceDrag(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    beginPaneDragSession(screen.id, event.clientX, event.clientY);
  };

  const handleWorkspaceMoveButtonPointerDown = (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const state = useMultiScreenStore.getState();
    const currentPos = state.workspacePosition;
    const baseX = Number(currentPos?.x) || 0;
    const baseY = Number(currentPos?.y) || 0;
    const rects = readZoneRects();
    setZoneRects(rects);
    let allowRightFull = Boolean(state.workspaceDockZone) || Math.hypot(baseX, baseY) > 20;
    let moved = false;

    attachWindowDragListeners(
      startX,
      startY,
      (dx, dy, moveEvent) => {
        if (!moved && Math.hypot(dx, dy) >= 4) {
          moved = true;
          suppressWorkspaceToggleClickRef.current = true;
          if (!useMultiScreenStore.getState().isWorkspaceMovable) {
            setWorkspaceMovable(true);
          }
          setDraggingTarget('workspace');
        }
        if (moved) {
          moveEvent.preventDefault?.();
          if (!isPointInRect(moveEvent.clientX, moveEvent.clientY, rects.right)) {
            allowRightFull = true;
          }
          const zone = detectHoveredDockZone(moveEvent.clientX, moveEvent.clientY, rects, allowRightFull);
          updateHoveredZone(zone);
          setWorkspacePosition({
            x: baseX + dx,
            y: baseY + dy,
          });
        }
      },
      () => {
        const dropZone = hoveredDockZoneRef.current;
        updateHoveredZone(null);
        setDraggingTarget(null);
        if (moved && dropZone) {
          dockWorkspaceToZone(dropZone);
        }
      }
    );
  };

  const handleWorkspaceMoveButtonClick = (event) => {
    event.stopPropagation();
    if (suppressWorkspaceToggleClickRef.current) {
      suppressWorkspaceToggleClickRef.current = false;
      return;
    }
    toggleWorkspaceMovable();
  };

  const handlePaneMoveButtonPointerDown = (event, screen) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setActiveScreen(screen.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const currentScreen = getScreenFromStore(mode, screen.id);
    const baseX = Number(currentScreen?.position?.x) || 0;
    const baseY = Number(currentScreen?.position?.y) || 0;
    const rects = readZoneRects();
    setZoneRects(rects);
    let allowRightFull =
      Boolean(currentScreen?.dockZone) ||
      Boolean(useMultiScreenStore.getState().workspaceDockZone) ||
      Math.hypot(baseX, baseY) > 20;
    let moved = false;

    attachWindowDragListeners(
      startX,
      startY,
      (dx, dy, moveEvent) => {
        if (!moved && Math.hypot(dx, dy) >= 4) {
          moved = true;
          suppressPaneToggleClickRef.current[screen.id] = true;
          if (!getScreenFromStore(mode, screen.id)?.movable) {
            setScreenMovable(mode, screen.id, true);
          }
          setDraggingTarget(screen.id);
        }
        if (moved) {
          moveEvent.preventDefault?.();
          if (!isPointInRect(moveEvent.clientX, moveEvent.clientY, rects.right)) {
            allowRightFull = true;
          }
          const zone = detectHoveredDockZone(moveEvent.clientX, moveEvent.clientY, rects, allowRightFull);
          updateHoveredZone(zone);
          setScreenPosition(mode, screen.id, {
            x: baseX + dx,
            y: baseY + dy,
          });
        }
      },
      () => {
        const dropZone = hoveredDockZoneRef.current;
        updateHoveredZone(null);
        setDraggingTarget(null);
        if (moved && dropZone) {
          applyPaneDropToZone(screen.id, dropZone);
        }
      }
    );
  };

  const handlePaneMoveButtonClick = (event, screen) => {
    event.stopPropagation();
    if (suppressPaneToggleClickRef.current[screen.id]) {
      suppressPaneToggleClickRef.current[screen.id] = false;
      return;
    }
    toggleScreenMovable(mode, screen.id);
  };

  const workspaceTargetRect = workspaceDockZone ? zoneRects[workspaceDockZone] : null;
  const workspaceStyle = workspaceTargetRect
    ? {
        position: 'fixed',
        left: `${workspaceTargetRect.left}px`,
        top: `${workspaceTargetRect.top}px`,
        width: `${workspaceTargetRect.width}px`,
        height: `${workspaceTargetRect.height}px`,
        zIndex: draggingTarget === 'workspace' ? 140 : 95,
        transform:
          workspacePosition?.x || workspacePosition?.y
            ? `translate3d(${workspacePosition.x}px, ${workspacePosition.y}px, 0)`
            : undefined,
      }
    : isWorkspaceMovable && (workspacePosition?.x || workspacePosition?.y)
      ? { transform: `translate3d(${workspacePosition.x}px, ${workspacePosition.y}px, 0)` }
      : undefined;

  const attachOverlay =
    draggingTarget && typeof document !== 'undefined'
      ? createPortal(
          <div className="multi-screen-dock-overlay" data-testid="multi-screen-dock-overlay">
            {[
              { id: 'left', label: '◀ Attach to Market Watch', rect: zoneRects.left },
              { id: 'bottom', label: '▼ Attach to Operations Terminal', rect: zoneRects.bottom },
              { id: 'right', label: '▶ Attach to Right Workspace', rect: zoneRects.right },
            ].map((zone) => {
              if (!zone.rect) return null;
              const isHovered = hoveredDockZone === zone.id;
              return (
                <div
                  key={zone.id}
                  data-dock-zone={zone.id}
                  className={`multi-screen-dock-zone multi-screen-dock-zone--${zone.id}${isHovered ? ' is-hovered' : ''}`}
                  style={{
                    left: `${zone.rect.left}px`,
                    top: `${zone.rect.top}px`,
                    width: `${zone.rect.width}px`,
                    height: `${zone.rect.height}px`,
                  }}
                >
                  <span className="multi-screen-dock-zone-badge">{zone.label}</span>
                </div>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {attachOverlay}
      <div
        className={`multi-screen-workspace multi-screen-workspace--${mode} multi-screen-count-${screens.length}${isWorkspaceMovable ? ' is-workspace-movable' : ''}${anyPaneMovable ? ' has-movable-pane' : ''}${workspaceDockZone ? ` is-workspace-docked is-workspace-docked--${workspaceDockZone}` : ''}${draggingTarget === 'workspace' ? ' is-dragging' : ''}`}
        data-testid={`multi-screen-workspace-${mode}`}
        data-screen-count={screens.length}
        data-workspace-movable={isWorkspaceMovable ? 'true' : 'false'}
        data-workspace-dock-zone={workspaceDockZone || 'right'}
        style={workspaceStyle}
        onPointerDown={startWorkspaceDrag}
      >
        <div
          className={`multi-screen-toolbar${isWorkspaceMovable ? ' is-movable' : ''}`}
          onPointerDown={startWorkspaceDrag}
        >
          <div className="multi-screen-toolbar-title">
            <span>{isGroupMode ? 'New group workspace' : 'New account workspace'}</span>
            <span className="multi-screen-badge">{screens.length} / {MAX_MULTI_SCREENS}</span>
          </div>
          <div className="multi-screen-toolbar-actions">
            <button
              type="button"
              className={`ui-btn ui-btn-ghost ui-btn-sm multi-screen-workspace-move-toggle${isWorkspaceMovable ? ' is-active' : ''}`}
              onClick={handleWorkspaceMoveButtonClick}
              onPointerDown={handleWorkspaceMoveButtonPointerDown}
              aria-pressed={isWorkspaceMovable}
              aria-label={isWorkspaceMovable ? 'Dock all screens' : 'Make all screens movable'}
              title={isWorkspaceMovable ? 'Movable mode ON — drag bar or icon to move or attach (click to dock)' : 'Click or drag to move all screens'}
              data-testid={`multi-screen-workspace-move-toggle-${mode}`}
            >
              <Move size={13} />
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm multi-screen-close-all"
              onClick={(event) => {
                event.stopPropagation();
                closeAllScreens();
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label="Close all screens"
              title="Close all screens"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {rows.map((row, rowIndex) => (
          <div key={row.map((item) => item.id).join(':') || rowIndex} className="multi-screen-row">
            {row.map((screen) => {
              const isActive = screen.id === activeScreenId;
              const isMovable = Boolean(screen.movable);
              const isDraggingPane = draggingTarget === screen.id;
              const screenNumber = screenIndexById.get(screen.id) || 1;
              const paneTargetRect = screen.dockZone ? zoneRects[screen.dockZone] : null;
              const wsOffsetX = workspaceTargetRect ? 0 : (Number(workspacePosition?.x) || 0);
              const wsOffsetY = workspaceTargetRect ? 0 : (Number(workspacePosition?.y) || 0);
              const paneStyle = paneTargetRect
                ? {
                    position: 'fixed',
                    left: `${paneTargetRect.left - wsOffsetX}px`,
                    top: `${paneTargetRect.top - wsOffsetY}px`,
                    width: `${paneTargetRect.width}px`,
                    height: `${paneTargetRect.height}px`,
                    zIndex: isDraggingPane ? 150 : 100,
                    transform:
                      screen.position?.x || screen.position?.y
                        ? `translate3d(${screen.position.x}px, ${screen.position.y}px, 0)`
                        : undefined,
                  }
                : isMovable && (screen.position?.x || screen.position?.y)
                  ? { transform: `translate3d(${screen.position.x}px, ${screen.position.y}px, 0)` }
                  : undefined;
              return (
                <div
                  key={screen.id}
                  className={`multi-screen-pane${isActive ? ' is-active' : ''}${isMovable ? ' is-movable' : ''}${screen.dockZone ? ` is-pane-docked is-pane-docked--${screen.dockZone}` : ''}${isDraggingPane ? ' is-dragging' : ''}`}
                  data-testid={`multi-screen-pane-${mode}-${screenNumber}`}
                  data-screen-id={screen.id}
                  data-screen-active={isActive ? 'true' : 'false'}
                  data-screen-movable={isMovable ? 'true' : 'false'}
                  data-screen-dock-zone={screen.dockZone || 'right'}
                  style={paneStyle}
                  onMouseEnter={() => {
                    if (!isActive) setActiveScreen(screen.id);
                  }}
                  onPointerDown={(event) => {
                    if (!isActive) setActiveScreen(screen.id);
                    startPaneDrag(event, screen);
                  }}
                  onFocusCapture={() => {
                    if (!isActive) setActiveScreen(screen.id);
                  }}
                >
                  {isGroupMode ? (
                    <NewGroupModal
                      embedded
                      screenNumber={screenNumber}
                      initialData={screen.initialData}
                      duplicateData={screen.duplicateData}
                      presetName={screen.presetName}
                      isMovable={isMovable}
                      onToggleMovable={(event) => handlePaneMoveButtonClick(event, screen)}
                      onMoveButtonPointerDown={(event) => handlePaneMoveButtonPointerDown(event, screen)}
                      onHeaderPointerDown={(event) => startPaneDrag(event, screen)}
                      onClose={() => closeScreen(screen.id)}
                      onSuccess={(saved) => {
                        onGroupSuccess?.(saved, screen);
                      }}
                    />
                  ) : (
                    <NewAccountModalContent
                      embedded
                      screenNumber={screenNumber}
                      isMovable={isMovable}
                      onToggleMovable={(event) => handlePaneMoveButtonClick(event, screen)}
                      onMoveButtonPointerDown={(event) => handlePaneMoveButtonPointerDown(event, screen)}
                      onHeaderPointerDown={(event) => startPaneDrag(event, screen)}
                      onClose={() => closeScreen(screen.id)}
                      onSuccess={(created) => {
                        onAccountSuccess?.(created, screen);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
