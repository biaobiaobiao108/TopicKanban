import type { AppTheme } from '../types';
import { syncPwaChrome } from './pwa';

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;
let mediaQueryList: MediaQueryList | null = null;

export function applyTheme(theme: AppTheme = 'light'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const root = document.documentElement;

  // Theme changes can otherwise leave translucent surfaces and text in an
  // intermediate color frame while accessibility checks or assistive tech
  // inspect the page. Apply the new palette atomically, then restore motion.
  root.classList.add('theme-change-in-progress');
  const restoreThemeMotion = () => root.classList.remove('theme-change-in-progress');

  // Clean up previous system theme listener if exists
  if (systemThemeListener && mediaQueryList) {
    mediaQueryList.removeEventListener('change', systemThemeListener);
    systemThemeListener = null;
    mediaQueryList = null;
  }

  // Clear specific theme class tokens
  root.classList.remove(
    'theme-warm-paper',
    'theme-light'
  );

  if (theme === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else if (theme === 'warm_paper') {
    root.classList.remove('dark');
    root.classList.add('theme-warm-paper');
    root.style.colorScheme = 'light';
  } else if (theme === 'light') {
    root.classList.remove('dark');
    root.classList.add('theme-light');
    root.style.colorScheme = 'light';
  } else if (theme === 'system') {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (matchesDark: boolean) => {
      if (matchesDark) {
        root.classList.remove('theme-light');
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.classList.add('theme-light');
        root.style.colorScheme = 'light';
      }
      syncPwaChrome('system', matchesDark);
    };

    updateSystemTheme(mediaQueryList.matches);

    systemThemeListener = (e: MediaQueryListEvent) => {
      updateSystemTheme(e.matches);
    };
    mediaQueryList.addEventListener('change', systemThemeListener);
  }

  if (theme !== 'system') syncPwaChrome(theme, theme === 'dark');

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(restoreThemeMotion);
  } else {
    window.setTimeout(restoreThemeMotion, 0);
  }
}

export interface ThemeConfig {
  id: AppTheme;
  title: string;
  desc: string;
  colors?: string[];
}

export const THEME_CONFIG_LIST: ThemeConfig[] = [
  {
    id: 'warm_paper',
    title: '暖沙纸境',
    desc: '温润暖沙纸境与典雅茶木操作色，自然优雅',
    colors: ['#f5f0e5', '#faf6ee', '#784c31', '#6d635a'],
  },
  {
    id: 'light',
    title: '经典浅色',
    desc: '象映温润自然纸境与苍松墨绿，漫反射护眼质感',
    colors: ['#f6f4ef', '#faf9f6', '#365e4e', '#718078'],
  },
  {
    id: 'dark',
    title: 'Tokyo Night',
    desc: '靛蓝夜色画布与柔和蓝紫强调色，适合夜间写稿',
    colors: ['#1a1b26', '#24283b', '#7aa2f7', '#a9b1d6'],
  },
  {
    id: 'system',
    title: '跟随系统',
    desc: '自动跟随操作系统的深浅色模式切换',
  },
];
