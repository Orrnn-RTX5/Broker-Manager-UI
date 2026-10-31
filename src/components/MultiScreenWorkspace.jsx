import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
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

const readShellBounds = () => {
  if (typeof document === 'undefined') {
    return { left: 0, top: 64, right: 1280, bottom: 692, width: 1280, height: 628 };
  }
  const shell = document.querySelector('.cc-shell-workspace');
  const rect = shell?.getBoundingClientRect();
  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 720;
  return { left: 0, top: 64, right: w, bottom: h - 28, width: w, height: h - 92 };
};

const readZoneRects = () => {
  if (typeof document === 'undefined') return {};
  const shellRect = readShellBounds();

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
    shell: shellRect,
  };
};

const clampDragDelta = (dx, dy, startRect, shellRect) => {
  if (!startRect || !shellRect || startRect.width <= 0 || startRect.height <= 0) {
    return { dx, dy };
  }
  const minVisibleWidth = Math.min(160, Math.max(80, Math.round(startRect.width * 0.35)));
  const minLeft = shellRect.left - Math.max(0, startRect.width - minVisibleWidth);
  const maxLeft = shellRect.right - minVisibleWidth;
  const minTop = shellRect.top - 6;
  const maxTop = shellRect.bottom - 40;

  const minDx = minLeft - startRect.left;
  const maxDx = Math.max(minDx, maxLeft - startRect.left);
  const minDy = minTop - startRect.top;
  const maxDy = Math.max(minDy, maxTop - startRect.top);

  return {
    dx: Math.min(maxDx, Math.max(minDx, dx)),
    dy: Math.min(maxDy, Math.max(minDy, dy)),
  };
};

const attachWindowDragListeners = (startX, startY, onDeltaMove, onDragEnd) => {
  let active = true;
  let usedPointerEvents = false;

  const handlePointerMove = (moveEvent) => {
    if (!active) return;
    usedPointerEvents = true;
    if (typeof moveEvent.clientX !== 'number' || typeof moveEvent.clientY !== 'number') return;
    onDeltaMove(moveEvent.clientX - startX, moveEvent.clientY - startY, moveEvent);
  };

  const handleMouseMove = (moveEvent) => {
    if (!active || usedPointerEvents) return;
    if (typeof moveEvent.clientX !== 'number' || typeof moveEvent.clientY !== 'number') return;
    onDeltaMove(moveEvent.clientX - startX, moveEvent.clientY - startY, moveEvent);
  };

  const handleUp = (endEvent) => {
    if (!active) return;
    active = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('mouseup', handleUp);
    window.removeEventListener('pointercancel', handleUp);
    onDragEnd?.(endEvent);
  };

  window.addEventListener('pointermove', handlePointerMove, { passive: false });
  window.addEventListener('mousemove', handleMouseMove, { passive: false });
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('mouseup', handleUp);
  window.addEventListener('pointercancel', handleUp);
};

const getScreenFromStore = (mode, screenId) => {
  const state = useMultiScreenStore.getState();
  const list = mode === 'group' ? state.groupScreens : state.accountScreens;
  return list.find((item) => item.id === screenId) || null;
};

const MultiScreenPaneBody = memo(
  function MultiScreenPaneBody({
    mode,
    screen,
    screenNumber,
    isMovable,
    onToggleMovable,
    onMoveButtonPointerDown,
    onHeaderPointerDown,
    onClose,
    onGroupSuccess,
    onAccountSuccess,
  }) {
    if (mode === 'group') {
      return (
        <NewGroupModal
          embedded
          screenNumber={screenNumber}
          initialData={screen.initialData}
          duplicateData={screen.duplicateData}
          presetName={screen.presetName}
          isMovable={isMovable}
          onToggleMovable={(event) => onToggleMovable(event, screen)}
          onMoveButtonPointerDown={(event) => onMoveButtonPointerDown(event, screen)}
          onHeaderPointerDown={(event) => onHeaderPointerDown(event, screen)}
          onClose={() => onClose(screen.id)}
          onSuccess={(saved) => {
            onGroupSuccess?.(saved, screen);
          }}
        />
      );
    }

    return (
      <NewAccountModalContent
        embedded
        screenNumber={screenNumber}
        isMovable={isMovable}
        onToggleMovable={(event) => onToggleMovable(event, screen)}
        onMoveButtonPointerDown={(event) => onMoveButtonPointerDown(event, screen)}
        onHeaderPointerDown={(event) => onHeaderPointerDown(event, screen)}
        onClose={() => onClose(screen.id)}
        onSuccess={(created) => {
          onAccountSuccess?.(created, screen);
        }}
      />
    );
  },
  (prev, next) =>
    prev.mode === next.mode &&
    prev.screen.id === next.screen.id &&
    prev.screen.initialData === next.screen.initialData &&
    prev.screen.duplicateData === next.screen.duplicateData &&
    prev.screen.presetName === next.screen.presetName &&
    prev.screenNumber === next.screenNumber &&
    prev.isMovable === next.isMovable &&
    prev.onToggleMovable === next.onToggleMovable &&
    prev.onMoveButtonPointerDown === next.onMoveButtonPointerDown &&
    prev.onHeaderPointerDown === next.onHeaderPointerDown
);

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
  const [zoneRects, setZoneRects] = useState(() => readZoneRects());
  const workspaceElRef = useRef(null);
  const paneElRefs = useRef({});
  const liveDragOffsetRef = useRef({ target: null, x: 0, y: 0 });
  const suppressWorkspaceToggleClickRef = useRef(false);
  const suppressPaneToggleClickRef = useRef({});

  const isGroupMode = mode === 'group';
  const screens = isGroupMode ? groupScreens : accountScreens;
  const activeScreenId = isGroupMode ? activeGroupScreenId : activeAccountScreenId;
  const closeScreen = isGroupMode ? closeGroupScreen : closeAccountScreen;
  const closeAllScreens = isGroupMode ? closeAllGroupScreens : closeAllAccountScreens;
  const setActiveScreen = isGroupMode ? setActiveGroupScreen : setActiveAccountScreen;
  const anyPaneDocked = screens.some((screen) => Boolean(screen.dockZone));

  const isRectCenterInsideWorkspace = useCallback((rect, dx = 0, dy = 0) => {
    const wsEl = workspaceElRef.current;
    if (!wsEl || !rect) return false;
    const wsRect = wsEl.getBoundingClientRect();
    if (wsRect.width <= 0 || wsRect.height <= 0) return false;
    const cx = rect.left + dx + rect.width / 2;
    const cy = rect.top + dy + rect.height / 2;
    return (
      cx >= wsRect.left + 8 &&
      cx <= wsRect.right - 8 &&
      cy >= wsRect.top + 8 &&
      cy <= wsRect.bottom - 8
    );
  }, []);

  const dockPaneBackToGrid = useCallback((screenId) => {
    const node = paneElRefs.current[screenId];
    if (node) {
      node.style.transform = '';
      node.style.zIndex = '';
    }
    setScreenPosition(mode, screenId, { x: 0, y: 0 });
    setScreenMovable(mode, screenId, false);
  }, [mode, setScreenMovable, setScreenPosition]);

  useEffect(() => {
    if (!screens.length || (!workspaceDockZone && !anyPaneDocked)) return undefined;
    const syncRects = () => setZoneRects(readZoneRects());
    syncRects();
    window.addEventListener('resize', syncRects);
    return () => {
      window.removeEventListener('resize', syncRects);
    };
  }, [screens.length, workspaceDockZone, anyPaneDocked]);

  const beginWorkspaceDragSession = useCallback((startX, startY) => {
    const state = useMultiScreenStore.getState();
    if (state.workspaceDockZone) {
      dockWorkspaceToZone('right');
    }
    const currentPos = useMultiScreenStore.getState().workspacePosition;
    const baseX = Number(currentPos?.x) || 0;
    const baseY = Number(currentPos?.y) || 0;
    const startedDisplaced = Math.hypot(baseX, baseY) > 40;
    const shellRect = readShellBounds();
    const el = workspaceElRef.current;
    const startRect = el?.getBoundingClientRect() || null;
    let latestX = baseX;
    let latestY = baseY;

    liveDragOffsetRef.current = { target: 'workspace', x: baseX, y: baseY };
    setDraggingTarget('workspace');

    attachWindowDragListeners(
      startX,
      startY,
      (dx, dy, moveEvent) => {
        moveEvent.preventDefault?.();
        const clamped = clampDragDelta(dx, dy, startRect, shellRect);
        latestX = Math.round(baseX + clamped.dx);
        latestY = Math.round(baseY + clamped.dy);
        liveDragOffsetRef.current = { target: 'workspace', x: latestX, y: latestY };
        if (workspaceElRef.current) {
          workspaceElRef.current.style.transform = `translate3d(${latestX}px, ${latestY}px, 0)`;
        }
      },
      () => {
        liveDragOffsetRef.current = { target: null, x: 0, y: 0 };
        setDraggingTarget(null);
        if (startedDisplaced && Math.hypot(latestX, latestY) <= 56) {
          if (workspaceElRef.current) {
            workspaceElRef.current.style.transform = '';
          }
          setWorkspacePosition({ x: 0, y: 0 });
          setWorkspaceMovable(false);
        } else {
          setWorkspacePosition({ x: latestX, y: latestY });
        }
      }
    );
  }, [dockWorkspaceToZone, setWorkspaceMovable, setWorkspacePosition]);

  const beginPaneDragSession = useCallback((screenId, startX, startY) => {
    const currentScreen = getScreenFromStore(mode, screenId);
    if (currentScreen?.dockZone) {
      dockScreenToZone(mode, screenId, 'right');
    }
    if (useMultiScreenStore.getState().workspaceDockZone) {
      dockWorkspaceToZone('right');
    }
    const refreshedScreen = getScreenFromStore(mode, screenId);
    const baseX = Number(refreshedScreen?.position?.x) || 0;
    const baseY = Number(refreshedScreen?.position?.y) || 0;
    const startedDisplaced = Math.hypot(baseX, baseY) > 24;
    const shellRect = readShellBounds();
    const el = paneElRefs.current[screenId];
    const startRect = el?.getBoundingClientRect() || null;
    const startedOutsideWorkspace =
      startedDisplaced && !isRectCenterInsideWorkspace(startRect, 0, 0);
    if (el) {
      el.style.zIndex = '600';
      el.style.transform = `translate3d(${baseX}px, ${baseY}px, 0)`;
    }
    let latestX = baseX;
    let latestY = baseY;

    liveDragOffsetRef.current = { target: screenId, x: baseX, y: baseY };
    setActiveScreen(screenId);
    setDraggingTarget(screenId);

    attachWindowDragListeners(
      startX,
      startY,
      (dx, dy, moveEvent) => {
        moveEvent.preventDefault?.();
        const clamped = clampDragDelta(dx, dy, startRect, shellRect);
        latestX = Math.round(baseX + clamped.dx);
        latestY = Math.round(baseY + clamped.dy);
        liveDragOffsetRef.current = { target: screenId, x: latestX, y: latestY };
        const node = paneElRefs.current[screenId];
        if (node) {
          node.style.transform = `translate3d(${latestX}px, ${latestY}px, 0)`;
        }
      },
      () => {
        liveDragOffsetRef.current = { target: null, x: 0, y: 0 };
        setDraggingTarget(null);
        const returnedFromOutside =
          startedOutsideWorkspace &&
          isRectCenterInsideWorkspace(startRect, latestX - baseX, latestY - baseY);
        const snapThreshold = startedDisplaced ? 110 : 16;
        if (returnedFromOutside || Math.hypot(latestX, latestY) <= snapThreshold) {
          dockPaneBackToGrid(screenId);
        } else {
          setScreenPosition(mode, screenId, { x: latestX, y: latestY });
        }
      }
    );
  }, [mode, dockPaneBackToGrid, dockScreenToZone, dockWorkspaceToZone, isRectCenterInsideWorkspace, setActiveScreen, setScreenPosition]);

  const handleWorkspaceMoveButtonPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (isScrollbarOrInteractiveTarget(event) && !event.target.closest('.multi-screen-workspace-move-toggle')) {
      return;
    }
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const state = useMultiScreenStore.getState();
    const currentPos = state.workspacePosition;
    const baseX = Number(currentPos?.x) || 0;
    const baseY = Number(currentPos?.y) || 0;
    const startedDisplaced = Math.hypot(baseX, baseY) > 40;
    const shellRect = readShellBounds();
    const startRect = workspaceElRef.current?.getBoundingClientRect() || null;
    let latestX = baseX;
    let latestY = baseY;
    let moved = false;

    attachWindowDragListeners(
      startX,
      startY,
      (dx, dy, moveEvent) => {
        if (!moved && Math.hypot(dx, dy) >= 3) {
          moved = true;
          suppressWorkspaceToggleClickRef.current = true;
          if (useMultiScreenStore.getState().workspaceDockZone) {
            dockWorkspaceToZone('right');
          }
          if (!useMultiScreenStore.getState().isWorkspaceMovable) {
            setWorkspaceMovable(true);
          }
          liveDragOffsetRef.current = { target: 'workspace', x: baseX, y: baseY };
          setDraggingTarget('workspace');
        }
        if (moved) {
          moveEvent.preventDefault?.();
          const clamped = clampDragDelta(dx, dy, startRect, shellRect);
          latestX = Math.round(baseX + clamped.dx);
          latestY = Math.round(baseY + clamped.dy);
          liveDragOffsetRef.current = { target: 'workspace', x: latestX, y: latestY };
          if (workspaceElRef.current) {
            workspaceElRef.current.style.transform = `translate3d(${latestX}px, ${latestY}px, 0)`;
          }
        }
      },
      () => {
        if (moved) {
          liveDragOffsetRef.current = { target: null, x: 0, y: 0 };
          setDraggingTarget(null);
          if (startedDisplaced && Math.hypot(latestX, latestY) <= 56) {
            if (workspaceElRef.current) {
              workspaceElRef.current.style.transform = '';
            }
            setWorkspacePosition({ x: 0, y: 0 });
            setWorkspaceMovable(false);
          } else {
            setWorkspacePosition({ x: latestX, y: latestY });
          }
        }
      }
    );
  }, [dockWorkspaceToZone, setWorkspaceMovable, setWorkspacePosition]);

  const startWorkspaceDrag = useCallback((event) => {
    if (event.button !== 0) return;
    if (isScrollbarOrInteractiveTarget(event)) return;
    if (event.currentTarget?.classList?.contains('multi-screen-toolbar')) {
      handleWorkspaceMoveButtonPointerDown(event);
      return;
    }
    if (!useMultiScreenStore.getState().isWorkspaceMovable) return;
    event.preventDefault();
    event.stopPropagation();
    beginWorkspaceDragSession(event.clientX, event.clientY);
  }, [beginWorkspaceDragSession, handleWorkspaceMoveButtonPointerDown]);

  const handleWorkspaceMoveButtonClick = useCallback((event) => {
    event.stopPropagation();
    if (suppressWorkspaceToggleClickRef.current) {
      suppressWorkspaceToggleClickRef.current = false;
      return;
    }
    if (workspaceElRef.current && useMultiScreenStore.getState().isWorkspaceMovable) {
      workspaceElRef.current.style.transform = '';
    }
    toggleWorkspaceMovable();
  }, [toggleWorkspaceMovable]);

  const handlePaneMoveButtonPointerDown = useCallback((event, screen) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setActiveScreen(screen.id);
    const startX = event.clientX;
    const startY = event.clientY;
    const currentScreen = getScreenFromStore(mode, screen.id);
    const baseX = Number(currentScreen?.position?.x) || 0;
    const baseY = Number(currentScreen?.position?.y) || 0;
    const startedDisplaced = Math.hypot(baseX, baseY) > 24;
    const shellRect = readShellBounds();
    const startRect = paneElRefs.current[screen.id]?.getBoundingClientRect() || null;
    const startedOutsideWorkspace =
      startedDisplaced && !isRectCenterInsideWorkspace(startRect, 0, 0);
    let latestX = baseX;
    let latestY = baseY;
    let moved = false;

    attachWindowDragListeners(
      startX,
      startY,
      (dx, dy, moveEvent) => {
        if (!moved && Math.hypot(dx, dy) >= 3) {
          moved = true;
          suppressPaneToggleClickRef.current[screen.id] = true;
          const clamped = clampDragDelta(dx, dy, startRect, shellRect);
          latestX = Math.round(baseX + clamped.dx);
          latestY = Math.round(baseY + clamped.dy);
          liveDragOffsetRef.current = { target: screen.id, x: latestX, y: latestY };
          const node = paneElRefs.current[screen.id];
          if (node) {
            node.style.zIndex = '600';
            node.style.transform = `translate3d(${latestX}px, ${latestY}px, 0)`;
          }
          if (getScreenFromStore(mode, screen.id)?.dockZone) {
            dockScreenToZone(mode, screen.id, 'right');
          }
          if (!getScreenFromStore(mode, screen.id)?.movable) {
            setScreenMovable(mode, screen.id, true);
          }
          setDraggingTarget(screen.id);
          return;
        }
        if (moved) {
          moveEvent.preventDefault?.();
          const clamped = clampDragDelta(dx, dy, startRect, shellRect);
          latestX = Math.round(baseX + clamped.dx);
          latestY = Math.round(baseY + clamped.dy);
          liveDragOffsetRef.current = { target: screen.id, x: latestX, y: latestY };
          const node = paneElRefs.current[screen.id];
          if (node) {
            node.style.transform = `translate3d(${latestX}px, ${latestY}px, 0)`;
          }
        }
      },
      () => {
        if (moved) {
          liveDragOffsetRef.current = { target: null, x: 0, y: 0 };
          setDraggingTarget(null);
          const returnedFromOutside =
            startedOutsideWorkspace &&
            isRectCenterInsideWorkspace(startRect, latestX - baseX, latestY - baseY);
          const snapThreshold = startedDisplaced ? 110 : 16;
          if (returnedFromOutside || Math.hypot(latestX, latestY) <= snapThreshold) {
            dockPaneBackToGrid(screen.id);
          } else {
            setScreenPosition(mode, screen.id, { x: latestX, y: latestY });
          }
        }
      }
    );
  }, [mode, dockPaneBackToGrid, dockScreenToZone, isRectCenterInsideWorkspace, setActiveScreen, setScreenMovable, setScreenPosition]);

  const handlePaneHeaderPointerDown = useCallback((event, screen) => {
    if (event.button !== 0) return;
    if (isScrollbarOrInteractiveTarget(event)) return;
    const latestScreen = getScreenFromStore(mode, screen.id) || screen;
    if (!latestScreen.movable && useMultiScreenStore.getState().isWorkspaceMovable) {
      startWorkspaceDrag(event);
      return;
    }
    if (latestScreen.movable) {
      event.preventDefault();
      event.stopPropagation();
      beginPaneDragSession(screen.id, event.clientX, event.clientY);
      return;
    }
    handlePaneMoveButtonPointerDown(event, screen);
  }, [mode, beginPaneDragSession, handlePaneMoveButtonPointerDown, startWorkspaceDrag]);

  const startPaneDrag = useCallback((event, screen) => {
    if (event.button !== 0) return;
    if (isScrollbarOrInteractiveTarget(event)) return;
    const latestScreen = getScreenFromStore(mode, screen.id) || screen;
    if (!latestScreen.movable) {
      if (useMultiScreenStore.getState().isWorkspaceMovable) startWorkspaceDrag(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    beginPaneDragSession(screen.id, event.clientX, event.clientY);
  }, [mode, beginPaneDragSession, startWorkspaceDrag]);

  const handlePaneMoveButtonClick = useCallback((event, screen) => {
    event.stopPropagation();
    if (suppressPaneToggleClickRef.current[screen.id]) {
      suppressPaneToggleClickRef.current[screen.id] = false;
      return;
    }
    const currentScreen = getScreenFromStore(mode, screen.id) || screen;
    if (currentScreen?.movable) {
      const node = paneElRefs.current[screen.id];
      if (node) {
        node.style.transform = '';
        node.style.zIndex = '';
      }
    }
    toggleScreenMovable(mode, screen.id);
  }, [mode, toggleScreenMovable]);

  if (!screens.length) return null;

  const rows = buildScreenGridRows(screens);
  const screenIndexById = new Map(screens.map((screen, index) => [screen.id, index + 1]));
  const anyPaneMovable = screens.some((screen) => Boolean(screen.movable || screen.dockZone));

  const effectiveWorkspacePos =
    draggingTarget === 'workspace' && liveDragOffsetRef.current.target === 'workspace'
      ? liveDragOffsetRef.current
      : workspacePosition;
  const workspaceTargetRect = workspaceDockZone ? zoneRects[workspaceDockZone] : null;
  const workspaceStyle = workspaceTargetRect
    ? {
        position: 'fixed',
        left: `${workspaceTargetRect.left}px`,
        top: `${workspaceTargetRect.top}px`,
        width: `${workspaceTargetRect.width}px`,
        height: `${workspaceTargetRect.height}px`,
        zIndex: draggingTarget === 'workspace' ? 600 : 520,
        transform:
          effectiveWorkspacePos?.x || effectiveWorkspacePos?.y
            ? `translate3d(${effectiveWorkspacePos.x}px, ${effectiveWorkspacePos.y}px, 0)`
            : undefined,
      }
    : (isWorkspaceMovable || draggingTarget === 'workspace') && (effectiveWorkspacePos?.x || effectiveWorkspacePos?.y)
      ? { transform: `translate3d(${effectiveWorkspacePos.x}px, ${effectiveWorkspacePos.y}px, 0)` }
      : undefined;

  return (
    <div
      ref={workspaceElRef}
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
            title={isWorkspaceMovable ? 'Movable mode ON — drag bar or icon to move (click to dock)' : 'Click or drag to move all screens'}
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
        <div
          key={rowIndex}
          className="multi-screen-row"
        >
          {row.map((screen) => {
            const isActive = screen.id === activeScreenId;
            const isMovable = Boolean(screen.movable);
            const isDraggingPane = draggingTarget === screen.id;
            const effectivePanePos =
              isDraggingPane && liveDragOffsetRef.current.target === screen.id
                ? liveDragOffsetRef.current
                : screen.position;
            const screenNumber = screenIndexById.get(screen.id) || 1;
            const paneTargetRect = screen.dockZone ? zoneRects[screen.dockZone] : null;
            const paneStyle = paneTargetRect
              ? {
                  position: 'fixed',
                  left: `${paneTargetRect.left}px`,
                  top: `${paneTargetRect.top}px`,
                  width: `${paneTargetRect.width}px`,
                  height: `${paneTargetRect.height}px`,
                  zIndex: isDraggingPane ? 600 : isActive ? 560 : 520,
                  transform:
                    effectivePanePos?.x || effectivePanePos?.y
                      ? `translate3d(${effectivePanePos.x}px, ${effectivePanePos.y}px, 0)`
                      : undefined,
                }
              : isMovable || isDraggingPane
                ? {
                    zIndex: isDraggingPane ? 600 : isActive ? 560 : 520,
                    transform:
                      effectivePanePos?.x || effectivePanePos?.y
                        ? `translate3d(${effectivePanePos.x}px, ${effectivePanePos.y}px, 0)`
                        : undefined,
                  }
                : undefined;
            return (
              <div
                key={screen.id}
                ref={(node) => {
                  if (node) paneElRefs.current[screen.id] = node;
                  else delete paneElRefs.current[screen.id];
                }}
                className={`multi-screen-pane${isActive ? ' is-active' : ''}${isMovable ? ' is-movable' : ''}${screen.dockZone ? ` is-pane-docked is-pane-docked--${screen.dockZone}` : ''}${isDraggingPane ? ' is-dragging' : ''}`}
                data-testid={`multi-screen-pane-${mode}-${screenNumber}`}
                data-screen-id={screen.id}
                data-screen-active={isActive ? 'true' : 'false'}
                data-screen-movable={isMovable ? 'true' : 'false'}
                data-screen-dock-zone={screen.dockZone || 'right'}
                style={paneStyle}
                onMouseEnter={() => {
                  if (draggingTarget) return;
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
                <MultiScreenPaneBody
                  mode={mode}
                  screen={screen}
                  screenNumber={screenNumber}
                  isMovable={isMovable}
                  onToggleMovable={handlePaneMoveButtonClick}
                  onMoveButtonPointerDown={handlePaneMoveButtonPointerDown}
                  onHeaderPointerDown={handlePaneHeaderPointerDown}
                  onClose={closeScreen}
                  onGroupSuccess={onGroupSuccess}
                  onAccountSuccess={onAccountSuccess}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

