import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_PAGE_LIMIT } from '../utils/pagination';
import { getPagedRows } from '../utils/pagedQueryState.js';

const useDebouncedValue = (value, delayMs) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};

const stableParamsKey = (params) => JSON.stringify(params ?? {});

export default function usePagedData({
  queryKey,
  queryFn,
  params = {},
  pageSize = DEFAULT_PAGE_LIMIT,
  debounceMs = 250,
  enabled = true,
  staleTime = 30_000,
  refetchInterval,
  refetchOnMount = false,
  refetchOnWindowFocus = false,
  refetchOnReconnect = false,
  keepRunningOnUnmount = false,
  initialData,
  // (pagedParams) => data | undefined: seeds each page/search from a local
  // snapshot so it renders on the first frame.
  initialDataForParams,
  initialDataUpdatedAt,
  placeholderData,
  meta,
}) {
  const [pageState, setPageState] = useState(() => ({ page: 0, key: stableParamsKey(params) }));
  const rawSearch = params.search ?? '';
  const debouncedSearch = useDebouncedValue(rawSearch, debounceMs);

  const resetKey = useMemo(() => stableParamsKey(params), [params]);
  const page = pageState.key === resetKey ? pageState.page : 0;

  const pagedParams = useMemo(() => ({
    ...params,
    search: debouncedSearch,
    limit: pageSize,
    offset: page * pageSize,
  }), [params, debouncedSearch, page, pageSize]);

  const query = useQuery({
    queryKey: [...queryKey, pagedParams],
    queryFn: ({ signal }) => queryFn(pagedParams, keepRunningOnUnmount ? {} : { signal }),
    enabled,
    staleTime,
    refetchInterval,
    refetchOnMount,
    refetchOnWindowFocus,
    refetchOnReconnect,
    initialData: initialDataForParams ? () => initialDataForParams(pagedParams) : initialData,
    initialDataUpdatedAt,
    placeholderData: placeholderData || ((previousData) => previousData || initialData),
    meta,
  });

  const rows = getPagedRows(query.data, enabled);
  const total = enabled ? query.data?.total ?? null : null;
  const hasMore = enabled ? Boolean(query.data?.hasMore) : false;

  return {
    ...query,
    rows,
    total,
    hasMore,
    page,
    pageSize,
    offset: pagedParams.offset,
    nextPage: () => setPageState((state) => ({ page: (state.key === resetKey ? state.page : 0) + 1, key: resetKey })),
    prevPage: () => setPageState((state) => ({ page: Math.max(0, (state.key === resetKey ? state.page : 0) - 1), key: resetKey })),
    setPage: (value) => setPageState({ page: Math.max(0, Number(value) || 0), key: resetKey }),
    resetPage: () => setPageState({ page: 0, key: resetKey }),
    isSearchDebouncing: rawSearch !== debouncedSearch,
  };
}
