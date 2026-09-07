export const WORKSPACE_DATA_PATHS = Object.freeze({
  clients: '/clients',
  tradingAccounts: '/clients/trading-accounts',
  orders: '/clients/orders',
  deals: '/dealing',
  positions: '/clients/positions',
  groups: '/groups',
});

export const WORKSPACE_DATA_STALE_MS = 30_000;
export const WORKSPACE_QUERY_META = Object.freeze({ suppressGlobalLoader: true });

const EMPTY_FILTERS = Object.freeze({});

export const CLIENTS_INITIAL_PARAMS = Object.freeze({
  search: '',
  sort_by: 'id',
  sort_dir: 'asc',
  filters: EMPTY_FILTERS,
  limit: 30,
  offset: 0,
});

export const TRADING_ACCOUNTS_INITIAL_PARAMS = Object.freeze({
  search: '',
  sort_by: 'login',
  sort_dir: 'asc',
  filters: EMPTY_FILTERS,
  limit: 30,
  offset: 0,
});

export const ORDERS_INITIAL_PARAMS = Object.freeze({
  search: '',
  sort_by: 'ticket',
  sort_dir: 'desc',
  filters: EMPTY_FILTERS,
  limit: 30,
  offset: 0,
});

export const DEALS_INITIAL_PARAMS = Object.freeze({
  search: '',
  sort_by: 'ticket',
  sort_dir: 'desc',
  filters: EMPTY_FILTERS,
  limit: 30,
  offset: 0,
});

export const POSITIONS_INITIAL_PARAMS = Object.freeze({
  search: '',
  sort_by: 'time',
  sort_dir: 'desc',
  filters: EMPTY_FILTERS,
  limit: 30,
  offset: 0,
});

export const GROUPS_INITIAL_PARAMS = Object.freeze({
  search: '',
  sort_by: 'name',
  sort_dir: 'asc',
  limit: 100,
  offset: 0,
});

const requireRequest = (request) => {
  if (typeof request !== 'function') throw new TypeError('Workspace query request must be a function.');
  return request;
};

const createInitialPagedQueryOptions = ({ queryKey, params, request }) => ({
  queryKey: [...queryKey, params],
  // These requests begin before a route owns them. Leaving them independent
  // of a short-lived route AbortSignal lets React StrictMode and quick route
  // transitions reuse the same in-flight request instead of restarting it.
  queryFn: () => requireRequest(request)(params),
  staleTime: WORKSPACE_DATA_STALE_MS,
  meta: WORKSPACE_QUERY_META,
});

export const createClientsInitialQueryOptions = ({ request } = {}) => (
  createInitialPagedQueryOptions({
    queryKey: ['clients', 'page'],
    params: CLIENTS_INITIAL_PARAMS,
    request,
  })
);

export const createTradingAccountsInitialQueryOptions = ({ request } = {}) => (
  createInitialPagedQueryOptions({
    queryKey: ['trading-accounts', 'page'],
    params: TRADING_ACCOUNTS_INITIAL_PARAMS,
    request,
  })
);

export const createOrdersInitialQueryOptions = ({ request } = {}) => (
  createInitialPagedQueryOptions({
    queryKey: ['orders', 'page'],
    params: ORDERS_INITIAL_PARAMS,
    request,
  })
);

export const createDealsInitialQueryOptions = ({ request } = {}) => (
  createInitialPagedQueryOptions({
    queryKey: ['deals', 'page'],
    params: DEALS_INITIAL_PARAMS,
    request,
  })
);

export const createPositionsInitialQueryOptions = ({ request } = {}) => (
  createInitialPagedQueryOptions({
    queryKey: ['positions', 'page'],
    params: POSITIONS_INITIAL_PARAMS,
    request,
  })
);

export const createGroupsInitialQueryOptions = ({ request } = {}) => (
  createInitialPagedQueryOptions({
    queryKey: ['groups', 'all'],
    params: GROUPS_INITIAL_PARAMS,
    request,
  })
);

