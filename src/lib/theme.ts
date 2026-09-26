import type { AppTheme } from '../types';
import { syncPwaChrome } from './pwa';

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;
let mediaQueryList: MediaQueryList | null = null;

export function applyTheme(theme: AppTheme = 'nordic_frost'): void {
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
    'theme-nordic-frost'
  );

  if (theme === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else if (theme === 'nordic_frost') {
    root.classList.remove('dark');
    root.classList.add('theme-nordic-frost');
    root.style.colorScheme = 'light';
  } else if (theme === 'warm_paper') {
    root.classList.remove('dark');
    root.classList.add('theme-warm-paper');
    root.style.colorScheme = 'light';
  } else if (theme === 'system') {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (matchesDark: boolean) => {
      if (matchesDark) {
        root.classList.remove('theme-nordic-frost');
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.classList.add('theme-nordic-frost');
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
  tag?: string;
  colors?: string[];
}

export const THEME_CONFIG_LIST: ThemeConfig[] = [
  {
    id: 'nordic_frost',
    title: '北欧冷杉',
    desc: '冷雾青画布与松柏绿操作色，清爽安静',
    tag: '推荐',
    colors: ['#f6faf9', '#edf2f2', '#356b5b', '#5f7474'],
  },
  {
    id: 'warm_paper',
    title: '暖沙纸境',
    desc: '温润暖纸画布与松柏绿操作色，适合长时间阅读',
    colors: ['#f7f4ed', '#fdfcf7', '#365f4d', '#6c655c'],
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
