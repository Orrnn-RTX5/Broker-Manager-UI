import { useCallback, useState } from 'react';

const loadedGridIds = new Set();
// Kept for compatibility with existing grid components; grids now load their
// first page immediately instead of showing a manual "Load first 30" gate.
const AUTO_LOAD_GRIDS = true;

export default function useManualGridLoad(gridId) {
  const [hasLoaded, setHasLoaded] = useState(() => AUTO_LOAD_GRIDS || loadedGridIds.has(gridId));

  const markLoaded = useCallback(() => {
    loadedGridIds.add(gridId);
    setHasLoaded(true);
  }, [gridId]);

  return [hasLoaded, markLoaded];
}
