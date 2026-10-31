import { useState, useCallback } from 'react';

export const DOCK_POSITIONS = {
  LEFT: 'left',
  RIGHT: 'right',
  TOP: 'top',
  BOTTOM: 'bottom',
  FLOAT: 'float',
  CENTER: 'center',
};

export const LEFT_STACK_MODES = {
  ROW: 'row',
  COLUMN: 'column',
};

const DEFAULT_SIZES = {
  left:   { width: 280, height: '100%' },
  right:  { width: 280, height: '100%' },
  top:    { width: '100%', height: 220 },
  bottom: { width: '100%', height: 'clamp(118px, 15vh, 148px)' },
  float:  { width: 248, height: 360 },
  center: { width: '100%', height: '100%' },
};

const LEFT_WORKBENCH_PANEL_IDS = ['market_data', 'navigator'];

const resolveDockedLeftSize = (panel, initialPanels, id) => {
  const configuredWidth =
    Number(panel?.dockedSize?.width) ||
    Number(initialPanels?.[id]?.size?.width) ||
    (id === 'market_data' ? 346 : id === 'navigator' ? 204 : 280);
  return {
    width: configuredWidth,
    height: '100%',
  };
};

export function applyPanelDockPlacement(
  prevPanels,
  initialPanels,
  prevLeftStackMode,
  id,
  targetZone
) {
  if (!prevPanels || !prevPanels[id]) {
    return { panels: prevPanels, leftStackMode: prevLeftStackMode };
  }

  const panel = prevPanels[id];
  const isLeftWorkbenchPanel = LEFT_WORKBENCH_PANEL_IDS.includes(id);
  const siblingId = id === 'market_data' ? 'navigator' : id === 'navigator' ? 'market_data' : null;
  const sibling = siblingId ? prevPanels[siblingId] : null;

  // MT5 Smart Docking guide positions for Market Watch and Navigator
  if (
    targetZone === 'outer-left' ||
    targetZone === 'guide-left' ||
    targetZone === 'guide-right' ||
    targetZone === 'guide-bottom' ||
    targetZone === 'guide-top' ||
    (isLeftWorkbenchPanel && (targetZone === 'left' || targetZone === 'right' || targetZone === 'bottom' || targetZone === 'top'))
  ) {
    const normalizedZone =
      targetZone === 'guide-left'
        ? 'left'
        : targetZone === 'guide-right'
          ? 'right'
          : targetZone === 'guide-bottom'
            ? 'bottom'
            : targetZone === 'guide-top'
              ? 'top'
              : targetZone;

    const nextLeftStackMode =
      normalizedZone === 'bottom' || normalizedZone === 'top'
        ? LEFT_STACK_MODES.COLUMN
        : LEFT_STACK_MODES.ROW;

    const placeFirst =
      normalizedZone === 'outer-left' ||
      normalizedZone === 'left' ||
      normalizedZone === 'top';

    const nextPanels = { ...prevPanels };

    nextPanels[id] = {
      ...panel,
      position: DOCK_POSITIONS.LEFT,
      size: resolveDockedLeftSize(panel, initialPanels, id),
      visible: true,
      minimized: false,
      maximized: false,
      order: placeFirst ? 0 : 1,
    };

    if (siblingId && sibling) {
      nextPanels[siblingId] = {
        ...sibling,
        position: sibling.position === DOCK_POSITIONS.FLOAT ? DOCK_POSITIONS.LEFT : sibling.position,
        size:
          sibling.position === DOCK_POSITIONS.FLOAT
            ? resolveDockedLeftSize(sibling, initialPanels, siblingId)
            : sibling.size,
        order: placeFirst ? 1 : 0,
      };
    }

    // Keep any additional left-docked panels ordered after the primary pair
    let extraOrder = 2;
    Object.values(nextPanels).forEach((candidate) => {
      if (
        candidate.id !== id &&
        candidate.id !== siblingId &&
        candidate.position === DOCK_POSITIONS.LEFT
      ) {
        nextPanels[candidate.id] = {
          ...candidate,
          order: extraOrder++,
        };
      }
    });

    return {
      panels: nextPanels,
      leftStackMode: nextLeftStackMode,
      terminalFullWidth: false,
    };
  }

  const maxOrder = Math.max(0, ...Object.values(prevPanels).map((p) => p.order || 0));
  return {
    panels: {
      ...prevPanels,
      [id]: {
        ...panel,
        position: targetZone,
        size: DEFAULT_SIZES[targetZone] || DEFAULT_SIZES.left,
        minimized: false,
        maximized: false,
        order: maxOrder + 1,
      },
    },
    leftStackMode: prevLeftStackMode,
    terminalFullWidth: false,
  };
}

let idCounter = 0;

export function useDocking(initialPanels = {}) {
  const [panels, setPanels] = useState(() => {
    const initialLayout = {};
    let panelIndex = 0;

    Object.entries(initialPanels).forEach(([id, config]) => {
      const resolvedSize = config.size || DEFAULT_SIZES[config.defaultPosition || 'float'];
      initialLayout[id] = {
        id,
        title: config.title || id,
        position: config.defaultPosition || DOCK_POSITIONS.FLOAT,
        floatPos: config.floatPos || { x: 42 + panelIndex * 24, y: 118 + panelIndex * 20 },
        size: resolvedSize,
        dockedSize: resolvedSize,
        visible: config.visible !== false,
        userPinned: false,
        minimized: false,
        maximized: false,
        zIndex: 100 + panelIndex,
        order: config.order !== undefined ? config.order : panelIndex,
        icon: config.icon || '\u25a3',
        ...config,
      };
      panelIndex++;
    });

    idCounter = panelIndex;
    return initialLayout;
  });
  const [draggingId, setDraggingId] = useState(null);
  const [activeDockGuideId, setActiveDockGuideId] = useState(null);
  const [leftStackMode, setLeftStackMode] = useState(LEFT_STACK_MODES.ROW);
  const [terminalFullWidth, setTerminalFullWidth] = useState(true);

  const resetLayout = useCallback(() => {
    let freshPanels = {};
    let tempCounter = 0;
    Object.entries(initialPanels).forEach(([id, config]) => {
      const resolvedSize = config.size || DEFAULT_SIZES[config.defaultPosition || 'float'];
      freshPanels[id] = {
        id,
        title: config.title || id,
        position: config.defaultPosition || DOCK_POSITIONS.FLOAT,
        floatPos: config.floatPos || { x: 42 + tempCounter * 24, y: 118 + tempCounter * 20 },
        size: resolvedSize,
        dockedSize: resolvedSize,
        visible: config.visible !== false,
        userPinned: false,
        minimized: false,
        maximized: false,
        zIndex: 100 + tempCounter,
        order: config.order !== undefined ? config.order : tempCounter,
        icon: config.icon || '▣',
        ...config,
      };
      tempCounter++;
    });
    setPanels(freshPanels);
    setDraggingId(null);
    setActiveDockGuideId(null);
    setLeftStackMode(LEFT_STACK_MODES.ROW);
    setTerminalFullWidth(true);
    idCounter = tempCounter;
  }, [initialPanels]);

  const registerPanel = useCallback((id, config) => {
    const resolvedSize = config.size || DEFAULT_SIZES[config.defaultPosition || 'float'];
    setPanels((prev) => ({
      ...prev,
      [id]: {
        id,
        title: config.title || id,
        position: config.defaultPosition || DOCK_POSITIONS.FLOAT,
        floatPos: config.floatPos || { x: 42 + idCounter * 24, y: 118 + idCounter * 20 },
        size: resolvedSize,
        dockedSize: resolvedSize,
        visible: config.visible !== false,
        userPinned: false,
        minimized: false,
        maximized: false,
        zIndex: 100 + idCounter,
        order: config.order !== undefined ? config.order : idCounter,
        icon: config.icon || '▣',
        ...config,
      },
    }));
    idCounter++;
  }, []);

  const updatePanel = useCallback((id, updates) => {
    setPanels((prev) => {
      if (!prev[id]) return prev;
      const current = prev[id];
      const next = { ...current, ...updates };
      if (updates.size && next.position === DOCK_POSITIONS.LEFT) {
        next.dockedSize = updates.size;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  const updatePanels = useCallback((updater) => {
    setPanels((prev) => (typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }));
  }, []);

  const dockPanel = useCallback((id, position) => {
    setPanels((prev) => {
      const result = applyPanelDockPlacement(prev, initialPanels, leftStackMode, id, position);
      if (result.leftStackMode !== leftStackMode) {
        setLeftStackMode(result.leftStackMode);
      }
      return result.panels;
    });
    setTerminalFullWidth(false);
    setDraggingId(null);
    setActiveDockGuideId(null);
  }, [initialPanels, leftStackMode]);

  const bringToFront = useCallback((id) => {
    setPanels((prev) => {
      const current = prev[id];
      if (!current || current.position !== DOCK_POSITIONS.FLOAT) return prev;
      const maxZ = Math.max(...Object.values(prev).map((p) => p.zIndex || 100));
      if ((current.zIndex || 100) >= maxZ) return prev;
      return { ...prev, [id]: { ...current, zIndex: maxZ + 1 } };
    });
  }, []);

  const togglePanel = useCallback((id) => {
    setPanels((prev) => {
      if (!prev[id]) return prev;
      const visible = !prev[id].visible;
      return {
        ...prev,
        [id]: {
          ...prev[id],
          visible,
          // Opening a panel through a click or keyboard shortcut is an
          // explicit user choice. Layout guards must keep that panel open.
          userPinned: visible,
          maximized: visible ? prev[id].maximized : false,
        },
      };
    });
  }, []);

  const closePanel = useCallback((id) => {
    setPanels((prev) => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], visible: false, userPinned: false, maximized: false } };
    });
    setActiveDockGuideId((prevId) => (prevId === id ? null : prevId));
  }, []);

  const floatPanel = useCallback((id, pos) => {
    setPanels((prev) => {
      if (!prev[id]) return prev;
      const current = prev[id];
      const preservedDockedSize =
        current.position !== DOCK_POSITIONS.FLOAT
          ? current.size
          : current.dockedSize || initialPanels?.[id]?.size;
      const defaultFloatPos =
        id === 'navigator'
          ? { x: 24, y: 148 }
          : id === 'market_data'
            ? { x: 24, y: 148 }
            : { x: 100, y: 120 };
      const maxZ = Math.max(100, ...Object.values(prev).map((p) => p.zIndex || 100));
      return {
        ...prev,
        [id]: {
          ...current,
          position: DOCK_POSITIONS.FLOAT,
          floatPos: pos || current.floatPos || defaultFloatPos,
          dockedSize: preservedDockedSize,
          size: current.floatSize || {
            width: Math.max(210, Number(preservedDockedSize?.width) || DEFAULT_SIZES.float.width),
            height: DEFAULT_SIZES.float.height,
          },
          maximized: false,
          zIndex: maxZ + 1,
        },
      };
    });
    setActiveDockGuideId(id);
  }, [initialPanels]);

  const togglePanelMaximized = useCallback((id) => {
    setPanels((prev) => {
      const panel = prev[id];
      if (!panel || !panel.canMaximize || panel.position === DOCK_POSITIONS.FLOAT) return prev;

      const maximize = !panel.maximized;
      const nextPanels = { ...prev };

      // Only one panel can fill the workspace. The original dock position and
      // divider size remain untouched, so Restore returns to the same layout.
      Object.values(prev).forEach((currentPanel) => {
        if (currentPanel.maximized) {
          nextPanels[currentPanel.id] = { ...currentPanel, maximized: false };
        }
      });

      nextPanels[id] = { ...panel, visible: true, maximized: maximize };
      return nextPanels;
    });
  }, []);

  const movePanelInZone = useCallback((id, direction) => {
    setPanels((prev) => {
      const panel = prev[id];
      if (!panel) return prev;

      const siblings = Object.values(prev)
        .filter((p) => p.position === panel.position && p.visible)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      const currentIndex = siblings.findIndex((p) => p.id === id);
      if (currentIndex === -1) return prev;

      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= siblings.length) return prev;

      const targetPanel = siblings[targetIndex];
      const currentOrder = panel.order ?? currentIndex;
      const targetOrder = targetPanel.order ?? targetIndex;

      return {
        ...prev,
        [id]: { ...panel, order: targetOrder },
        [targetPanel.id]: { ...targetPanel, order: currentOrder },
      };
    });
    setTerminalFullWidth(false);
  }, []);

  return {
    panels,
    draggingId,
    setDraggingId,
    activeDockGuideId,
    setActiveDockGuideId,
    leftStackMode,
    setLeftStackMode,
    terminalFullWidth,
    setTerminalFullWidth,
    registerPanel,
    updatePanel,
    updatePanels,
    dockPanel,
    bringToFront,
    togglePanel,
    closePanel,
    floatPanel,
    togglePanelMaximized,
    resetLayout,
    movePanelInZone,
  };
}
