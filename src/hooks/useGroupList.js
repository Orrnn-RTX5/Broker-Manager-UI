import { useQuery } from '@tanstack/react-query';
import useNotificationStore from '../store/notificationStore';
import { getGroupsPage } from '../services/api';

export const useGroupList = (params = {}) => {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const { enabled = true, ...groupParams } = params;

  const queryParams = {
    limit: 100,
    offset: 0,
    sort_by: 'name',
    sort_dir: 'asc',
    ...groupParams,
  };

  const { data, isLoading: loading, error, isError } = useQuery({
    queryKey: ['groups', queryParams],
    queryFn: ({ signal }) => getGroupsPage(queryParams, { signal }),
    enabled,
    placeholderData: (previousData) => previousData,
    // Show notification on error
    meta: {
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
