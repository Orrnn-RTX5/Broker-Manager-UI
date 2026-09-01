export const ANALYTICS_PATHS = Object.freeze({
  onlineUsers: '/analytics/online-users',
  openPositions: '/analytics/open-positions',
  openOrders: '/analytics/open-orders',
});

export const ANALYTICS_VIEWS = Object.freeze({
  onlineUsers: 'online-users',
  openPositions: 'open-positions',
  openOrders: 'open-orders',
});

export const ONLINE_USERS_STALE_MS = 5_000;
export const OPEN_POSITIONS_STALE_MS = 30_000;
export const OPEN_ORDERS_STALE_MS = 5_000;
export const ANALYTICS_QUERY_META = Object.freeze({ suppressGlobalLoader: true });

export const ONLINE_USERS_INITIAL_PARAMS = Object.freeze({
  search: '',
  sort_by: 'login',
  sort_dir: 'asc',
  limit: 30,
  offset: 0,
});

export const OPEN_POSITIONS_INITIAL_PARAMS = Object.freeze({
  search: '',
  sort_by: 'position',
  sort_dir: 'asc',
  filters: Object.freeze({}),
  limit: 30,
  offset: 0,
});

const requireRequest = (request) => {
  if (typeof request !== 'function') throw new TypeError('Analytics query request must be a function.');
  return request;
};

export const createOnlineUsersQueryOptions = ({
  request,
  params = ONLINE_USERS_INITIAL_PARAMS,
} = {}) => ({
  queryKey: ['online-users', 'page', params],
  queryFn: ({ signal }) => requireRequest(request)(params, { signal }),
  staleTime: ONLINE_USERS_STALE_MS,
  meta: ANALYTICS_QUERY_META,
});

export const createOpenPositionsQueryOptions = ({
  request,
  params = OPEN_POSITIONS_INITIAL_PARAMS,
} = {}) => ({
  queryKey: ['positions', 'page', params],
  queryFn: ({ signal }) => requireRequest(request)(params, { signal }),
  staleTime: OPEN_POSITIONS_STALE_MS,
  meta: ANALYTICS_QUERY_META,
});

export const createOpenedOrdersQueryOptions = ({ login, request } = {}) => {
  const normalizedLogin = String(login || '').trim();
  return {
    queryKey: ['opened-orders', normalizedLogin],
    queryFn: ({ signal }) => requireRequest(request)(normalizedLogin, { signal }),
    staleTime: OPEN_ORDERS_STALE_MS,
    enabled: Boolean(normalizedLogin),
    meta: ANALYTICS_QUERY_META,
  };
};
