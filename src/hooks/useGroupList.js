import { useQuery } from '@tanstack/react-query';
import useNotificationStore from '../store/notificationStore';
import { fetchManagerApi } from '../services/managerFetch';

export const useGroupList = () => {
  const addNotification = useNotificationStore((state) => state.addNotification);

  const { data: groups = [], isLoading: loading, error, isError } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const res = await fetchManagerApi(`/GroupList?id=${token}`, {
        headers: { 'accept': 'application/json' }
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON response');
      }
      
      if (!res.ok) throw new Error(data.error || 'Failed to fetch groups');
      
      return Array.isArray(data) ? data : [];
    },
    // Show notification on error
    meta: {
      onError: (err) => {
        addNotification(`Failed to load groups: ${err.message}`, 'error');
      }
    }
  });

  return { 
    groups, 
    loading, 
    error: isError ? error.message : null 
  };
};
