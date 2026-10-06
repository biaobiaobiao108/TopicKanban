import {
  APP_THEMES,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppTheme,
} from '../types';

const STORAGE_KEY = 'topic-kanban:preferences';
const FONT_SIZES = ['compact', 'standard', 'large'] as const;
const LINE_HEIGHTS = ['normal', 'relaxed', 'loose'] as const;

export function sanitizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_APP_SETTINGS };
  const settings = value as Partial<AppSettings>;
  const speed = Number(settings.reading_speed);
  return {
    reading_speed: Number.isFinite(speed) && speed > 0 && speed <= 1000
      ? speed
      : DEFAULT_APP_SETTINGS.reading_speed,
    theme: typeof settings.theme === 'string' && APP_THEMES.includes(settings.theme as AppTheme)
      ? settings.theme as AppTheme
      : DEFAULT_APP_SETTINGS.theme,
    editor_font_size: FONT_SIZES.includes(settings.editor_font_size as typeof FONT_SIZES[number])
      ? settings.editor_font_size
      : DEFAULT_APP_SETTINGS.editor_font_size,
    editor_line_height: LINE_HEIGHTS.includes(settings.editor_line_height as typeof LINE_HEIGHTS[number])
      ? settings.editor_line_height
      : DEFAULT_APP_SETTINGS.editor_line_height,
  };
}

export function loadLocalSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return sanitizeAppSettings(stored ? JSON.parse(stored) : null);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function saveLocalSettings(value: unknown): AppSettings {
  const settings = sanitizeAppSettings(value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  return settings;
}
