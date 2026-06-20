import { useQuery } from '@tanstack/react-query';
import { getPositions, getTradingAccounts } from '../../services/api';
import { buildDashboardMetrics } from './dashboardMetrics';

const getErrorMessage = (error) => (
  error instanceof Error ? error.message : String(error || 'Request failed')
);

const settleDashboardSource = async (key, request) => {
  try {
    const data = await request();
    return { key, ok: true, data: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    return { key, ok: false, data: [], error: getErrorMessage(error) };
  }
};

const loadDashboardMetrics = async () => {
  const [accounts, positions] = await Promise.all([
    settleDashboardSource('accounts', getTradingAccounts),
    settleDashboardSource('positions', getPositions),
  ]);

  const metrics = buildDashboardMetrics({
    accounts: accounts.data,
    positions: positions.data,
  });

  return {
    metrics,
    sources: { accounts, positions },
    errors: [accounts, positions].filter((source) => !source.ok),
    asOf: Date.now(),
  };
};

export const useDashboardMetrics = () => useQuery({
  queryKey: ['dashboard', 'metrics'],
  queryFn: loadDashboardMetrics,
  staleTime: 15_000,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
});

export default useDashboardMetrics;
