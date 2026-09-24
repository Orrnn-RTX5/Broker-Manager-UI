import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSidebarAccountsQueryOptions, normalizeSidebarAccountPage } from '../../services/sidebarAccounts';
import { useGroupList } from '../../hooks/useGroupList';
import { buildGroupMarginLevels, buildMarginAlerts } from './terminalAlerts.js';

const ALERTS_REFRESH_MS = 60_000;

// Shares the Accounts panel's full account list and the Navigator's group list
// through React Query, so the alerts add no requests beyond a periodic refresh.
export default function useMarginAlerts(enabled) {
  const { data, isLoading, isError } = useQuery({
    ...getSidebarAccountsQueryOptions(''),
    enabled,
    refetchInterval: enabled ? ALERTS_REFRESH_MS : false,
    placeholderData: (previous) => previous,
  });
  const { groups } = useGroupList({ enabled });

  const alerts = useMemo(() => {
    const accounts = normalizeSidebarAccountPage(data)?.rows || [];
    return buildMarginAlerts(accounts, buildGroupMarginLevels(groups));
  }, [data, groups]);

  return { alerts, isLoading, isError };
}
