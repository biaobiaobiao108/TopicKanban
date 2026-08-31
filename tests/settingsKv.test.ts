import { describe, it, expect } from 'bun:test';
import { DEFAULT_APP_SETTINGS, APP_THEMES } from '../src/types';
import { sanitizeAppSettings } from '../src/server/routes/system';

describe('Settings KV Model and Sanitization', () => {
  it('should have valid DEFAULT_APP_SETTINGS', () => {
    expect(DEFAULT_APP_SETTINGS.reading_speed).toBe(280);
    expect(DEFAULT_APP_SETTINGS.theme).toBe('light');
  });

  it('should sanitize valid KV settings while preserving supported fields', () => {
    const settings = sanitizeAppSettings({
      reading_speed: 320,
      theme: 'dark',
      editor_font_size: 'large',
      voiceover_cues: ['停顿 3s'],
    });
    expect(settings.reading_speed).toBe(320);
    expect(settings.theme).toBe('dark');
    expect(settings.editor_font_size).toBe('large');
    expect(settings.voiceover_cues).toEqual(['停顿 3s']);
  });

  it('should fallback to defaults on empty or invalid inputs', () => {
    const settings = sanitizeAppSettings({ reading_speed: -50, theme: 'cyberpunk-neon' as never });
    expect(settings.reading_speed).toBe(280);
    expect(settings.theme).toBe('light');
  });

  it('should accept system theme and all editorial theme presets', () => {
    for (const theme of APP_THEMES) {
      const settings = sanitizeAppSettings({ reading_speed: 260, theme });
      expect(settings.reading_speed).toBe(260);
      expect(settings.theme).toBe(theme);
    }
  });
});
