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
  const docking = useDocking(initialPanels);

  return (
    <DockingContext.Provider value={docking}>
      {children}
    </DockingContext.Provider>
  );
}
