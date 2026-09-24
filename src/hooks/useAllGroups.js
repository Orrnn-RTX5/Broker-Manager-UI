import { useQuery } from '@tanstack/react-query';
import { getGroupsPage } from '../services/api';
import { WORKSPACE_DATA_STALE_MS, WORKSPACE_QUERY_META } from '../utils/workspaceQueryOptions.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const EMPTY_GROUPS = Object.freeze([]);

// Shares the 'groups' prefix so group create/update/delete invalidations refresh it.
export const GROUP_TREE_QUERY_KEY = ['groups', 'tree'];

/** The Groups explorer nests groups by name, so it needs every page of /GroupList. */
export const loadAllGroups = async ({ signal } = {}) => {
  const rows = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await getGroupsPage({ search: '', sort_by: 'name', sort_dir: 'asc', limit: PAGE_SIZE, offset }, { signal });
    const pageRows = Array.isArray(result?.rows) ? result.rows : [];
    rows.push(...pageRows);
    if (!result?.hasMore || pageRows.length === 0) break;
    offset += pageRows.length;
  }
  return rows;
};

export const useAllGroups = ({ enabled = true } = {}) => {
  const query = useQuery({
    queryKey: GROUP_TREE_QUERY_KEY,
    queryFn: ({ signal }) => loadAllGroups({ signal }),
    enabled,
    staleTime: WORKSPACE_DATA_STALE_MS,
    placeholderData: (previousData) => previousData,
    meta: WORKSPACE_QUERY_META,
  });

  return {
    groups: query.data ?? EMPTY_GROUPS,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.isError ? query.error : null,
    refetch: query.refetch,
  };
};

export default useAllGroups;
