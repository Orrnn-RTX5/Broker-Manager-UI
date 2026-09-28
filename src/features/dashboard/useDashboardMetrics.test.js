import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

const runtime = {
  accounts: [],
  positions: [],
  positionCalls: 0,
  sidebarCalls: 0,
};
globalThis.__dashboardMetricsTest = runtime;

const mocks = new Map([
  ['@tanstack/react-query', 'export const useQuery = () => {}; export const useQueryClient = () => {};'],
  ['../../hooks/usePermissions', 'export default () => ({});'],
  ['../../services/api', `
    export const getAccountLimitStatus = async () => ({ real_account_count: 2, demo_account_count: 1 });
    export const getDashboardSummary = async () => { throw new Error('Summary unavailable'); };
    export const fetchAllPositionsDataset = async () => {
      globalThis.__dashboardMetricsTest.positionCalls += 1;
      return globalThis.__dashboardMetricsTest.positions;
    };
  `],
  ['../../services/sidebarAccounts', `
    export const fetchAllSidebarAccounts = async () => {
      globalThis.__dashboardMetricsTest.sidebarCalls += 1;
      const rows = globalThis.__dashboardMetricsTest.accounts;
      return { rows, total: rows.length, hasMore: false };
    };
    export const getSidebarAccountsQueryOptions = () => ({ queryKey: ['sidebar-accounts', ''] });
  `],
  ['../../services/authService', `export default {
    getSessionClaims: () => ({ login: 'manager', brokerId: 'broker' }),
    getSessionScopeKey: () => 'session',
  };`],
  ['../../utils/permissions', "export const PERMISSIONS = { VIEW_POSITIONS: 'view_positions' };"],
  ['../../utils/sessionFingerprint', "export const buildPermissionSessionFingerprint = () => 'scope';"],
]);

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./useDashboardMetrics.js', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [{
    name: 'dashboard-sources',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => (
        mocks.has(args.path) ? { path: args.path, namespace: 'dashboard-sources' } : undefined
      ));
      builder.onLoad({ filter: /.*/, namespace: 'dashboard-sources' }, (args) => ({
        contents: mocks.get(args.path),
        loader: 'js',
      }));
    },
  }],
});
const { loadDashboardMetrics } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('dashboard totals complete real account equity and the complete positions book', async () => {
  runtime.accounts = [
    { login: '1', group: 'Real\\Standard', Equity: 1500.25 },
    { login: '2', group: 'Real\\Standard', equity: '2,300.50' },
    { login: '3', group: 'Demo\\Standard', Equity: 999999 },
  ];
  runtime.positions = [{ position: 10 }, { position: 11 }];
  runtime.sidebarCalls = 0;
  runtime.positionCalls = 0;

  const result = await loadDashboardMetrics({ includePositions: true });

  assert.equal(result.metrics.equity, 3800.75);
  assert.equal(result.metrics.openPositions, 2);
  assert.equal(runtime.sidebarCalls, 1);
  assert.equal(runtime.positionCalls, 1);
  assert.equal(result.sources.accounts.data, undefined, 'full books should not be retained in the metrics result');
});

test('dashboard refreshes a seeded partial account page before showing equity', async () => {
  runtime.accounts = [{ login: '1', group: 'Real\\Standard', Equity: 1500 }];
  runtime.positionCalls = 0;
  let staleTime;
  const queryClient = {
    getQueryData: () => ({ rows: runtime.accounts, total: 2, hasMore: true }),
    fetchQuery: async (options) => {
      staleTime = options.staleTime;
      return { rows: runtime.accounts, total: 1, hasMore: false };
    },
  };

  const result = await loadDashboardMetrics({ queryClient, includePositions: false });

  assert.equal(staleTime, 0);
  assert.equal(result.metrics.equity, 1500);
  assert.equal(result.metrics.openPositions, null);
  assert.equal(runtime.positionCalls, 0);
});
