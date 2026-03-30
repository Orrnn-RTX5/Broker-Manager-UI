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
  bottom: { width: '100%', height: 220 },
  float:  { width: 320, height: 400 },
  center: { width: '100%', height: '100%' },
};

let idCounter = 0;

export function useDocking() {
  const [panels, setPanels] = useState({});
  // Global drag state: which panel is being dragged right now
  const [draggingId, setDraggingId] = useState(null);

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
        minimized: false,
        zIndex: 100 + idCounter,
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
      return {
        ...prev,
        [id]: {
          ...prev[id],
          position,
          size: DEFAULT_SIZES[position],
          minimized: false,
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
      return { ...prev, [id]: { ...prev[id], visible: !prev[id].visible } };
    });
  }, []);

  const closePanel = useCallback((id) => {
    setPanels(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], visible: false } };
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
        },
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
  };
}
