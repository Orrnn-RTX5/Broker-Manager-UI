import { useState, useCallback } from 'react';

export const DOCK_POSITIONS = {
  LEFT: 'left',
  RIGHT: 'right',
  TOP: 'top',
  BOTTOM: 'bottom',
  FLOAT: 'float',
  CENTER: 'center',
};

const DEFAULT_SIZES = {
  left:   { width: 280, height: '100%' },
  right:  { width: 280, height: '100%' },
  top:    { width: '100%', height: 220 },
  bottom: { width: '100%', height: 'clamp(118px, 15vh, 148px)' },
  float:  { width: 320, height: 400 },
  center: { width: '100%', height: '100%' },
};

let idCounter = 0;

export function useDocking(initialPanels = {}) {
  const [panels, setPanels] = useState(() => {
    const initialLayout = {};
    let panelIndex = 0;

    Object.entries(initialPanels).forEach(([id, config]) => {
      initialLayout[id] = {
        id,
        title: config.title || id,
        position: config.defaultPosition || DOCK_POSITIONS.FLOAT,
        floatPos: config.floatPos || { x: 100 + panelIndex * 30, y: 100 + panelIndex * 30 },
        size: config.size || DEFAULT_SIZES[config.defaultPosition || 'float'],
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

  const resetLayout = useCallback(() => {
    let freshPanels = {};
    let tempCounter = 0;
    Object.entries(initialPanels).forEach(([id, config]) => {
      freshPanels[id] = {
        id,
        title: config.title || id,
        position: config.defaultPosition || DOCK_POSITIONS.FLOAT,
        floatPos: config.floatPos || { x: 100 + tempCounter * 30, y: 100 + tempCounter * 30 },
        size: config.size || DEFAULT_SIZES[config.defaultPosition || 'float'],
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
    idCounter = tempCounter;
  }, [initialPanels]);

  const registerPanel = useCallback((id, config) => {
    setPanels(prev => ({
      ...prev,
      [id]: {
        id,
        title: config.title || id,
        position: config.defaultPosition || DOCK_POSITIONS.FLOAT,
        floatPos: config.floatPos || { x: 100 + idCounter * 30, y: 100 + idCounter * 30 },
        size: config.size || DEFAULT_SIZES[config.defaultPosition || 'float'],
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
    setPanels(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], ...updates } };
    });
  }, []);

  const dockPanel = useCallback((id, position) => {
    setPanels(prev => {
      if (!prev[id]) return prev;
      const maxOrder = Math.max(0, ...Object.values(prev).map(p => p.order || 0));
      return {
        ...prev,
        [id]: {
          ...prev[id],
          position,
          size: DEFAULT_SIZES[position],
          minimized: false,
          maximized: false,
          order: maxOrder + 1,
        },
      };
    });
    setDraggingId(null);
  }, []);

  const bringToFront = useCallback((id) => {
    setPanels(prev => {
      const maxZ = Math.max(...Object.values(prev).map(p => p.zIndex || 100));
      return { ...prev, [id]: { ...prev[id], zIndex: maxZ + 1 } };
    });
  }, []);

  const togglePanel = useCallback((id) => {
    setPanels(prev => {
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
    setPanels(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], visible: false, userPinned: false, maximized: false } };
    });
  }, []);

  const floatPanel = useCallback((id, pos) => {
    setPanels(prev => {
      if (!prev[id]) return prev;
      return {
        ...prev,
        [id]: {
          ...prev[id],
          position: DOCK_POSITIONS.FLOAT,
          floatPos: pos || prev[id].floatPos,
          size: prev[id].floatSize || DEFAULT_SIZES.float,
          maximized: false,
        },
      };
    });
  }, []);

  const togglePanelMaximized = useCallback((id) => {
    setPanels(prev => {
      const panel = prev[id];
      if (!panel || !panel.canMaximize || panel.position === DOCK_POSITIONS.FLOAT) return prev;

      const maximize = !panel.maximized;
      const nextPanels = { ...prev };

      // Only one panel can fill the workspace. The original dock position and
      // divider size remain untouched, so Restore returns to the same layout.
      Object.values(prev).forEach(currentPanel => {
        if (currentPanel.maximized) {
          nextPanels[currentPanel.id] = { ...currentPanel, maximized: false };
        }
      });

      nextPanels[id] = { ...panel, visible: true, maximized: maximize };
      return nextPanels;
    });
  }, []);

  const movePanelInZone = useCallback((id, direction) => {
    setPanels(prev => {
      const panel = prev[id];
      if (!panel) return prev;
      
      const siblings = Object.values(prev)
        .filter(p => p.position === panel.position && p.visible)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
        
      const currentIndex = siblings.findIndex(p => p.id === id);
      if (currentIndex === -1) return prev;
      
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= siblings.length) return prev;
      
      const targetPanel = siblings[targetIndex];
      const currentOrder = panel.order || currentIndex;
      const targetOrder = targetPanel.order || targetIndex;
      
      return {
        ...prev,
        [id]: { ...panel, order: targetOrder },
        [targetPanel.id]: { ...targetPanel, order: currentOrder }
      };
    });
  }, []);

  return {
    panels,
    draggingId,
    setDraggingId,
    registerPanel,
    updatePanel,
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
