import { useQuery } from '@tanstack/react-query';
import apiClient from '../../services/apiClient';
import authService from '../../services/authService';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';
import { normalizeManagerConnection } from './managerConnection';

export const MANAGER_CONNECTION_QUERY_ROOT = ['dashboard', 'manager-connection'];

export default function useManagerConnection() {
  const claims = authService.getSessionClaims();
  const session = authService.getAuthSnapshot();
  const scope = buildPermissionSessionFingerprint({
    token: authService.getSessionScopeKey(),
    login: claims.login,
    brokerId: claims.brokerId,
  });
  const enabled = Boolean(session.token);

  const query = useQuery({
    queryKey: [...MANAGER_CONNECTION_QUERY_ROOT, scope],
    queryFn: async ({ signal }) => {
      const response = await apiClient.get('/ConnectionStatus', { signal });
      return { ...normalizeManagerConnection(response), asOf: Date.now() };
    },
    enabled,
    staleTime: 8_000,
    refetchInterval: 10_000,
    retry: false,
  });

  // A failed refresh must never keep an earlier "Connected" result visible.
  const state = enabled && !query.isError ? query.data?.state ?? 'unavailable' : 'unavailable';
  return {
    state,
    asOf: state === 'unavailable' ? null : query.data.asOf,
    login: state === 'unavailable' ? null : query.data.login,
    isLoading: enabled && query.isPending && query.isFetching,
    error: query.error,
  };
}
