import { describe, it, expect } from 'bun:test';
import { DEFAULT_APP_SETTINGS, APP_THEMES } from '../src/types';
import { sanitizeAppSettings } from '../src/server/routes/system';
import { THEME_CONFIG_LIST } from '../src/lib/theme';

describe('Settings KV Model and Sanitization', () => {
  it('should have valid DEFAULT_APP_SETTINGS', () => {
    expect(DEFAULT_APP_SETTINGS.reading_speed).toBe(280);
    expect(DEFAULT_APP_SETTINGS.theme).toBe('light');
    expect(DEFAULT_APP_SETTINGS.trash_retention_days).toBe(30);
  });

  it('should sanitize valid KV settings while preserving supported fields', () => {
    const settings = sanitizeAppSettings({
      reading_speed: 320,
      theme: 'dark',
      editor_font_size: 'large',
      trash_retention_days: 14,
      voiceover_cues: ['停顿 3s'],
    });
    expect(settings.reading_speed).toBe(320);
    expect(settings.theme).toBe('dark');
    expect(settings.editor_font_size).toBe('large');
    expect(settings.trash_retention_days).toBe(14);
    expect(settings.voiceover_cues).toEqual(['停顿 3s']);
  });

  it('should fallback to defaults on empty or invalid inputs', () => {
    const settings = sanitizeAppSettings({ reading_speed: -50, theme: 'cyberpunk-neon' as never });
    expect(settings.reading_speed).toBe(280);
    expect(settings.theme).toBe(DEFAULT_APP_SETTINGS.theme);
  });

  it('should accept system theme and all editorial theme presets', () => {
    expect(APP_THEMES).toEqual(['warm_paper', 'light', 'dark', 'system']);
    expect(THEME_CONFIG_LIST.map(({ id }) => id)).toEqual(APP_THEMES);
    for (const theme of APP_THEMES) {
      const settings = sanitizeAppSettings({ reading_speed: 260, theme });
      expect(settings.reading_speed).toBe(260);
      expect(settings.theme).toBe(theme);
    }

  });
});
