export type PwaInstallOutcome = 'accepted' | 'dismissed' | null;

export interface PwaInstallSnapshot {
  canPrompt: boolean;
  isIOS: boolean;
  isInstallable: boolean;
  isSecureContext: boolean;
  isStandalone: boolean;
  isSupported: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const INSTALL_BANNER_DISMISSED_KEY = 'topic_kanban_pwa_install_banner_dismissed_v1';
const subscribers = new Set<() => void>();
const standaloneMediaQuery = '(display-mode: standalone)';

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
let snapshot: PwaInstallSnapshot = {
  canPrompt: false,
  isIOS: false,
  isInstallable: false,
  isSecureContext: false,
  isStandalone: false,
  isSupported: false,
};

function notifySubscribers(): void {
  subscribers.forEach((subscriber) => subscriber());
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  const isAppleMobile = /iPad|iPhone|iPod/i.test(userAgent);
  const isIPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadDesktopMode;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    (window.matchMedia?.(standaloneMediaQuery).matches)
    || standaloneNavigator.standalone === true,
  );
}

function isSecurePwaContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function readSnapshot(): PwaInstallSnapshot {
  const isIOS = isIOSDevice();
  const isStandalone = isStandaloneDisplay();
  const isSupported = typeof navigator !== 'undefined'
    && ('serviceWorker' in navigator || isIOS || deferredInstallPrompt !== null);
  const canPrompt = deferredInstallPrompt !== null;
  return {
    canPrompt,
    isIOS,
    isInstallable: !isStandalone && (isIOS || canPrompt),
    isSecureContext: isSecurePwaContext(),
    isStandalone,
    isSupported,
  };
}

function refreshSnapshot(): void {
  const next = readSnapshot();
  if (
    next.canPrompt === snapshot.canPrompt
    && next.isIOS === snapshot.isIOS
    && next.isInstallable === snapshot.isInstallable
    && next.isSecureContext === snapshot.isSecureContext
    && next.isStandalone === snapshot.isStandalone
    && next.isSupported === snapshot.isSupported
  ) return;
  snapshot = next;
  notifySubscribers();
}

export function initializePwa(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    const installEvent = event as BeforeInstallPromptEvent;
    if (typeof installEvent.prompt !== 'function') return;
    event.preventDefault();
    deferredInstallPrompt = installEvent;
    refreshSnapshot();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    refreshSnapshot();
  });

  const mediaQuery = window.matchMedia?.(standaloneMediaQuery);
  if (mediaQuery) {
    const handleDisplayModeChange = () => refreshSnapshot();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else {
      mediaQuery.addListener(handleDisplayModeChange);
    }
  }

  refreshSnapshot();
}

export function subscribePwaInstall(subscriber: () => void): () => void {
  initializePwa();
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function getPwaInstallSnapshot(): PwaInstallSnapshot {
  return snapshot;
}

export async function promptPwaInstall(): Promise<PwaInstallOutcome> {
  const installEvent = deferredInstallPrompt;
  if (!installEvent) return null;

  deferredInstallPrompt = null;
  refreshSnapshot();
  await installEvent.prompt();
  const choice = await installEvent.userChoice;
  refreshSnapshot();
  return choice.outcome;
}

export function registerPwaServiceWorker(): void {
  if (
    typeof window === 'undefined'
    || !('serviceWorker' in navigator)
    || !isSecurePwaContext()
  ) return;

  void navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  }).catch((error: unknown) => {
    console.warn('PWA Service Worker registration failed:', error);
  });
}

export function isPwaInstallBannerDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissPwaInstallBanner(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, '1');
  } catch {
    // The install prompt remains available from Settings when storage is unavailable.
  }
}
