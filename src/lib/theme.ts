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
    desc: 'Craft / Linear 极简冷雾青与冷杉青绿，通透冷静',
    tag: '推荐',
    colors: ['#f8fafb', '#edf2f2', '#2d7a64', '#0ea5e9'],
  },
  {
    id: 'warm_paper',
    title: '暖沙纸境',
    desc: '温润燕麦暖纸与莫兰迪暖红，治愈护眼书卷手感',
    colors: ['#faf7f2', '#f0ebe4', '#de5b6d', '#6b5fb5'],
  },
  {
    id: 'light',
    title: '经典浅色',
    desc: '瑞士杂志编辑部调性 (Stone 灰阶 + Rose 强调色)',
    colors: ['#fafaf9', '#ffffff', '#e11d48', '#78716c'],
  },
  {
    id: 'dark',
    title: '深色专注',
    desc: '低照度暗黑风，沉浸夜间码字与写稿',
    colors: ['#0c0a09', '#1c1917', '#f43f5e', '#a8a29e'],
  },
  {
    id: 'system',
    title: '跟随系统',
    desc: '自动跟随操作系统的深浅色模式切换',
  },
];
