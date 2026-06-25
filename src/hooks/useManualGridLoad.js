import { useCallback, useState } from 'react';

const loadedGridIds = new Set();

export default function useManualGridLoad(gridId) {
  const [hasLoaded, setHasLoaded] = useState(() => loadedGridIds.has(gridId));

  const markLoaded = useCallback(() => {
    loadedGridIds.add(gridId);
    setHasLoaded(true);
  }, [gridId]);

  return [hasLoaded, markLoaded];
}
