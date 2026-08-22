import type { AppTheme } from '../types';

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;
let mediaQueryList: MediaQueryList | null = null;

export function applyTheme(theme: AppTheme = 'light'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const root = document.documentElement;

  // Clean up previous system theme listener if exists
  if (systemThemeListener && mediaQueryList) {
    mediaQueryList.removeEventListener('change', systemThemeListener);
    systemThemeListener = null;
    mediaQueryList = null;
  }

  // Clear specific theme class tokens
  root.classList.remove(
    'theme-warm-paper',
    'theme-nordic-frost',
    'theme-parisian-dawn',
    'theme-midnight-obsidian',
    'theme-kyoto-zen'
  );

  if (theme === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else if (theme === 'midnight_obsidian') {
    root.classList.add('dark', 'theme-midnight-obsidian');
    root.style.colorScheme = 'dark';
  } else if (theme === 'nordic_frost') {
    root.classList.remove('dark');
    root.classList.add('theme-nordic-frost');
    root.style.colorScheme = 'light';
  } else if (theme === 'parisian_dawn') {
    root.classList.remove('dark');
    root.classList.add('theme-parisian-dawn');
    root.style.colorScheme = 'light';
  } else if (theme === 'kyoto_zen') {
    root.classList.remove('dark');
    root.classList.add('theme-kyoto-zen');
    root.style.colorScheme = 'light';
  } else if (theme === 'warm_paper') {
    root.classList.remove('dark');
    root.classList.add('theme-warm-paper');
    root.style.colorScheme = 'light';
  } else if (theme === 'light') {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  } else if (theme === 'system') {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (matchesDark: boolean) => {
      if (matchesDark) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    };

    updateSystemTheme(mediaQueryList.matches);

    systemThemeListener = (e: MediaQueryListEvent) => {
      updateSystemTheme(e.matches);
    };
    mediaQueryList.addEventListener('change', systemThemeListener);
  }
}
