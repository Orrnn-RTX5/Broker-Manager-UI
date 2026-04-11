import { useState, useEffect } from 'react';

export const useGroupList = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchGroups = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setError('No authentication token found');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`/api/manager/GroupList?id=${token}`, {
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
        
        setGroups(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, []);

  return { groups, loading, error };
};
