import { useSyncExternalStore } from 'react';
import { peekAccountDetails, subscribeToAccountDetails } from '../services/accountDetails';

// Last-known /AccountDetails payload for a login; re-renders when it changes.
export function useAccountDetails(loginId) {
  return useSyncExternalStore(subscribeToAccountDetails, () => peekAccountDetails(loginId) ?? null);
}
