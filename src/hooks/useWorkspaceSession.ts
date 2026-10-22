import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { AUTH_STORAGE_KEY, logout as clearAuthToken } from '../lib/auth';

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
    const handleCrossTabLogout = (event: StorageEvent) => {
      if (event.key !== AUTH_STORAGE_KEY || event.newValue !== null) return;
      window.dispatchEvent(new Event('kanban:logout'));
      clearWorkspace();
      setIsAuthenticated(false);
    };
    window.addEventListener('kanban:unauthorized', handleUnauthorized);
    window.addEventListener('storage', handleCrossTabLogout);
    return () => {
      window.removeEventListener('kanban:unauthorized', handleUnauthorized);
      window.removeEventListener('storage', handleCrossTabLogout);
    };
  }, [clearWorkspace, setIsAuthenticated]);

  const logout = useCallback(() => {
    window.dispatchEvent(new Event('kanban:logout'));
    clearAuthToken();
    clearWorkspace();
    setIsAuthenticated(false);
  }, [clearWorkspace, setIsAuthenticated]);

  return { logout };
}
