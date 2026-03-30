import { createContext, useContext } from 'react';

export const DockingContext = createContext(null);

export function useDockingContext() {
  const ctx = useContext(DockingContext);
  if (!ctx) throw new Error('useDockingContext must be used within a DockingProvider');
  return ctx;
}
