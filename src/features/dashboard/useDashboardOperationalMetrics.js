import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import authService from '../../services/authService';
import { getGroupsPage } from '../../services/api';
import { getSidebarAccountsQueryOptions } from '../../services/sidebarAccounts';
import usePermissions from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';
import { buildDashboardMarginMetrics } from './dashboardMarginMetrics';
import { collectDashboardGroups } from './dashboardGroupPages';

const EMPTY_GROUPS = [];

const dashboardScope = () => {
  const claims = authService.getSessionClaims();
  return buildPermissionSessionFingerprint({
    token: authService.getSessionScopeKey(),
    login: claims.login,
    brokerId: claims.brokerId,
  });
};

export const loadDashboardGroups = ({ signal } = {}) =>
  collectDashboardGroups(getGroupsPage, { signal });

export default function useDashboardOperationalMetrics() {
  const { resolved, hasPermission } = usePermissions();
  const canViewAccounts = resolved && hasPermission(PERMISSIONS.VIEW_ACCOUNTS);
  const scope = dashboardScope();
  const accountsOptions = getSidebarAccountsQueryOptions('');
  const accountsQuery = useQuery({
    ...accountsOptions,
    enabled: canViewAccounts,
    staleTime: 30_000,
    refetchInterval: canViewAccounts ? 60_000 : false,
  });
  const groupsQuery = useQuery({
    queryKey: ['groups', 'dashboard-complete', scope],
    queryFn: ({ signal }) => loadDashboardGroups({ signal }),
    enabled: canViewAccounts,
    staleTime: 5 * 60_000,
    refetchInterval: canViewAccounts ? 5 * 60_000 : false,
    retry: false,
    meta: { suppressGlobalLoader: true },
  });
  const metrics = useMemo(() => buildDashboardMarginMetrics({
    accountsPage: accountsQuery.data,
    groups: groupsQuery.data?.rows || EMPTY_GROUPS,
    groupsComplete: groupsQuery.data?.complete === true,
  }), [accountsQuery.data, groupsQuery.data]);

  return {
    metrics,
    restricted: resolved && !canViewAccounts,
    loading: canViewAccounts && accountsQuery.isPending,
    accountError: accountsQuery.error,
    groupError: groupsQuery.error,
  };
}
