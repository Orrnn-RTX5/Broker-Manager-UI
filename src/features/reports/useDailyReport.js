import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccountLimitStatus, getDashboardSummary, getTradingAccountsPage } from '../../services/api';
import authService from '../../services/authService';
import { getBrokerInfo } from '../../services/brokerAuth';
import { API_HOST, updateDynamicEndpoints } from '../../config/endpoints';
import { buildPermissionSessionFingerprint } from '../../utils/sessionFingerprint';
import { normalizeAccountLimitStatus } from '../dashboard/dashboardMetrics';
import {
  appendDailyObservation, buildAccountSources, loadCompleteReportAccounts,
  normalizeDailyCashSummary, utcReportDate,
} from './dailyReportData';

const POLL_MS = 30_000;
const EMPTY_HISTORY = [];
const countOrNull = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;

export default function useDailyReport() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => utcReportDate());
  useEffect(() => {
    const timer = window.setInterval(() => setDate(utcReportDate()), POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const broker = getBrokerInfo();
  updateDynamicEndpoints();
  const claims = authService.getSessionClaims();
  const scope = buildPermissionSessionFingerprint({
    token: authService.getSessionScopeKey(), login: claims.login,
    brokerId: `${claims.brokerId || broker?.broker_id || ''}|${API_HOST}`,
  });
  const key = ['daily-report', scope, date];
  const countKey = [...key, 'accounts'];
  const cashKey = [...key, 'cash'];
  const shared = {
    retry: false, staleTime: POLL_MS, gcTime: 86_400_000,
    refetchInterval: POLL_MS, refetchOnWindowFocus: true,
  };

  // Store only successful server observations in this session's query cache.
  // Navigating away and back preserves them; no earlier history is invented.
  const accounts = useQuery({
    ...shared, queryKey: countKey,
    queryFn: async ({ signal }) => {
      const result = normalizeAccountLimitStatus(await getAccountLimitStatus({ signal }));
      const metrics = {
        realAccounts: countOrNull(result?.realAccounts),
        demoAccounts: countOrNull(result?.demoAccounts),
      };
      if (metrics.realAccounts === null && metrics.demoAccounts === null) {
        throw new Error('The server did not provide real or demo account counts.');
      }
      const timestamp = Date.now();
      if (utcReportDate(timestamp) !== date) throw new Error('A new report day has started.');
      return {
        metrics, timestamp,
        observations: appendDailyObservation(
          queryClient.getQueryData(countKey)?.observations || EMPTY_HISTORY,
          { timestamp, realAccounts: metrics.realAccounts },
        ),
      };
    },
  });

  const cash = useQuery({
    ...shared, queryKey: cashKey,
    queryFn: async ({ signal }) => {
      const rows = normalizeDailyCashSummary(await getDashboardSummary({ date, signal }), date);
      if (!rows.some((row) => row.deposits !== null || row.withdrawals !== null)) {
        throw new Error('The server did not provide cash-flow totals for this UTC date.');
      }
      const timestamp = Date.now();
      if (utcReportDate(timestamp) !== date) throw new Error('A new report day has started.');
      return {
        rows, timestamp,
        observations: appendDailyObservation(
          queryClient.getQueryData(cashKey)?.observations || EMPTY_HISTORY,
          { timestamp, cash: rows },
        ),
      };
    },
  });

  const sources = useQuery({
    ...shared, queryKey: [...key, 'sources'], staleTime: 60_000, refetchInterval: 60_000,
    queryFn: async ({ signal }) => {
      const rows = await loadCompleteReportAccounts(
        (params, options) => getTradingAccountsPage(params, { ...options, bypassCache: true }),
        { signal },
      );
      return { ...buildAccountSources(rows), timestamp: Date.now() };
    },
  });

  return {
    brokerName: broker?.name || broker?.broker_name || broker?.broker_id || 'Broker',
    date, accounts, cash, sources,
    refreshing: accounts.isFetching || cash.isFetching || sources.isFetching,
    refresh: () => Promise.allSettled([
      accounts.refetch({ cancelRefetch: false }),
      cash.refetch({ cancelRefetch: false }),
      sources.refetch({ cancelRefetch: false }),
    ]),
  };
}
