import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { logout as clearAuthToken } from '../lib/auth';

type SetAuthenticated = Dispatch<SetStateAction<boolean>>;

/** Owns the app-wide session boundary: user logout and API 401 cleanup. */
export function useWorkspaceSession(
  clearWorkspace: () => void,
  setIsAuthenticated: SetAuthenticated,
) {
  useEffect(() => {
    const handleUnauthorized = () => {
      window.dispatchEvent(new Event('kanban:logout'));
      clearWorkspace();
      setIsAuthenticated(false);
    };
    window.addEventListener('kanban:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('kanban:unauthorized', handleUnauthorized);
  }, [clearWorkspace, setIsAuthenticated]);

  const logout = useCallback(() => {
    window.dispatchEvent(new Event('kanban:logout'));
    clearAuthToken();
    clearWorkspace();
    setIsAuthenticated(false);
  }, [clearWorkspace, setIsAuthenticated]);

  return { logout };
}
