import { useCallback, useSyncExternalStore } from 'react';
import {
  getPwaInstallSnapshot,
  initializePwa,
  promptPwaInstall,
  subscribePwaInstall,
} from '../lib/pwa';

export function usePwaInstall() {
  initializePwa();
  const state = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallSnapshot,
  );
  const promptInstall = useCallback(() => promptPwaInstall(), []);
  return { ...state, promptInstall };
}
