import { useEffect } from 'react';
import { DockingContext } from './DockingContext';
import { useDocking } from './useDocking';

/**
 * DockingProvider
 *
 * Wrap your entire app (or workspace) with this provider.
 *
 * @param {Object} initialPanels - Map of panelId → config
 *   config shape: {
 *     title: string,
 *     icon: string (emoji or symbol),
 *     defaultPosition: 'left'|'right'|'top'|'bottom'|'float'|'center',
 *     floatPos: { x, y },
 *     size: { width, height },
 *     visible: boolean,
 *   }
 */
export default function DockingProvider({ children, initialPanels = {} }) {
  const docking = useDocking();

  useEffect(() => {
    Object.entries(initialPanels).forEach(([id, config]) => {
      docking.registerPanel(id, config);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DockingContext.Provider value={docking}>
      {children}
    </DockingContext.Provider>
  );
}
