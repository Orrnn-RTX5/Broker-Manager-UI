import { useSyncExternalStore } from 'react';
import { peekAccountDetails, subscribeToAccountDetails, peekAccountSummary, subscribeToAccountSummary } from '../services/accountDetails';

// Last-known /AccountDetails payload for a login; re-renders when it changes.
export function useAccountDetails(loginId) {
  return useSyncExternalStore(subscribeToAccountDetails, () => peekAccountDetails(loginId) ?? null);
}

export function useAccountSummary(loginId) {
  return useSyncExternalStore(subscribeToAccountSummary, () => peekAccountSummary(loginId) ?? null);
}
