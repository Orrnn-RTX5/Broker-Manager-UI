import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export const useWorkspaceNavigation = () => {
  const navigate = useNavigate();

  return useCallback((path, options) => {
    if (!path) return;
    navigate(path, options);
  }, [navigate]);
};

export default useWorkspaceNavigation;
