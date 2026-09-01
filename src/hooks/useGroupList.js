import { useQuery } from '@tanstack/react-query';
import useNotificationStore from '../store/notificationStore';
import { getGroupsPage } from '../services/api';
import { GROUPS_INITIAL_PARAMS } from '../utils/workspaceQueryOptions.js';

export const useGroupList = (params = {}) => {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const { enabled = true, ...groupParams } = params;

  const queryParams = {
    ...GROUPS_INITIAL_PARAMS,
    ...groupParams,
  };

  const { data, isLoading: loading, error, isError } = useQuery({
    // Match GroupsPage's first-page key so the Navigator's early list request
    // becomes the page's data instead of being discarded and repeated.
    queryKey: ['groups', 'all', queryParams],
    queryFn: ({ signal }) => getGroupsPage(queryParams, { signal }),
    enabled,
    placeholderData: (previousData) => previousData,
    // Show notification on error
    meta: {
      // This list is warmed while the browser is idle for Navigator counts;
      // its request must not look like the active workspace is still loading.
      suppressGlobalLoader: true,
      onError: (err) => {
        addNotification(`Failed to load groups: ${err.message}`, 'error');
      }
    }
  });

  return { 
    groups: data?.rows ?? [],
    total: data?.total ?? null,
    hasMore: Boolean(data?.hasMore),
    loading, 
    error: isError ? error.message : null 
  };
};
