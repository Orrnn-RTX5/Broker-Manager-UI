import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllSidebarAccounts } from '../../services/sidebarAccounts';
import { getGroupsPage } from '../../services/api';
import { getDataAccessScope } from '../../services/dataAccessScope.js';
import { usePermissions } from '../../hooks/usePermissions';
import { useLiveAccountRows } from '../../hooks/useLiveTrading';
import { PERMISSIONS } from '../../utils/permissions.js';
import { buildGroupMarginLevels, assessConfiguredMarginAlerts } from './terminalAlerts.js';
import { collectTerminalGroups } from './terminalOperationsData.js';

const ALERTS_REFRESH_MS = 60_000;

const EMPTY = [];
const accessDenied = (query) => query.isError && [401, 403].includes(Number(query.error?.status));

// Summary and Alerts share complete, session-scoped account/group snapshots.
export default function useMarginAlerts(enabled) {
  const { resolved, hasPermission } = usePermissions();
  const canViewAccounts = resolved && hasPermission(PERMISSIONS.VIEW_ACCOUNTS);
  const active = enabled && canViewAccounts;
  const scope = getDataAccessScope();
  const accountsQuery = useQuery({
    queryKey: ['terminal-accounts', scope],
    queryFn: ({ signal }) => fetchAllSidebarAccounts({ signal }),
    enabled: active, staleTime: 30_000, refetchInterval: active ? ALERTS_REFRESH_MS : false,
    meta: { suppressGlobalLoader: true },
  });
  const groupsQuery = useQuery({
    queryKey: ['groups', 'terminal-alerts', scope],
    queryFn: ({ signal }) => collectTerminalGroups(getGroupsPage, { signal }),
    enabled: active, staleTime: ALERTS_REFRESH_MS, refetchInterval: active ? ALERTS_REFRESH_MS : false,
    meta: { suppressGlobalLoader: true },
  });
  const accounts = useLiveAccountRows(active && !accountsQuery.isError ? accountsQuery.data?.rows ?? EMPTY : EMPTY);
  const groups = active && !groupsQuery.isError ? groupsQuery.data ?? EMPTY : EMPTY;
  const assessment = useMemo(() => assessConfiguredMarginAlerts(accounts,
    buildGroupMarginLevels(groups)), [accounts, groups]);
  return { ...assessment, accounts, accountsLoaded: active && !!accountsQuery.data && !accessDenied(accountsQuery),
    canViewAccounts, isLoading: active && (accountsQuery.isLoading || groupsQuery.isLoading),
    isFetching: active && (accountsQuery.isFetching || groupsQuery.isFetching),
    isError: active && (accountsQuery.isError || groupsQuery.isError),
    accountError: accountsQuery.error, dataUpdatedAt: accountsQuery.dataUpdatedAt,
    refetch: () => Promise.all([accountsQuery.refetch(), groupsQuery.refetch()]) };
}
