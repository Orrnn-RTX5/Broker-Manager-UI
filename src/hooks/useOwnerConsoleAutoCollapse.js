import { useContext, useEffect, useRef } from 'react';
import { DockingContext } from '../components/docking/DockingContext';

export default function useOwnerConsoleAutoCollapse(filterSelector) {
  const headerRef = useRef(null);
  const autoCollapsedOwner = useRef(false);
  const ctx = useContext(DockingContext);
  const panels = ctx?.panels || {};
  const updatePanel = ctx?.updatePanel;
  const ownerVisible = panels.owner_console?.visible;
  const ownerPosition = panels.owner_console?.position;
  const ownerPinned = panels.owner_console?.userPinned;

  useEffect(() => {
    const header = headerRef.current;
    if (!header || !ownerVisible || ownerPinned || !['left', 'right'].includes(ownerPosition)) return undefined;
    let frame;
    const checkFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Collapse once for this page visit. An explicit reopen using the
        // existing toolbar button takes priority over automatic layout changes.
        if (autoCollapsedOwner.current) return;
        const filters = header.querySelector(filterSelector);
        if (!filters) return;
        if (filters.getBoundingClientRect().right > header.getBoundingClientRect().right + 1) {
          autoCollapsedOwner.current = true;
          updatePanel('owner_console', { visible: false, maximized: false });
        }
      });
    };
    const observer = new ResizeObserver(checkFit);
    observer.observe(header);
    observer.observe(header.querySelector(filterSelector));
    checkFit();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [ownerVisible, ownerPosition, ownerPinned, updatePanel, filterSelector]);
  return headerRef;
}
