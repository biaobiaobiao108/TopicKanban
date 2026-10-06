import { describe, it, expect } from 'bun:test';
import { DEFAULT_APP_SETTINGS, APP_THEMES, STALE_ACTION_THRESHOLD_DAYS, TRASH_RETENTION_DAYS, type AppSettings } from '../src/types';
import { sanitizeAppSettings } from '../src/server/routes/system';
import { THEME_CONFIG_LIST } from '../src/lib/theme';
import { VOICEOVER_CUES, getVoiceoverCueTone } from '../src/lib/voiceoverCues';

describe('Settings KV Model and Sanitization', () => {
  it('should have valid DEFAULT_APP_SETTINGS', () => {
    expect(DEFAULT_APP_SETTINGS.reading_speed).toBe(280);
    expect(DEFAULT_APP_SETTINGS.theme).toBe('light');
    expect(STALE_ACTION_THRESHOLD_DAYS).toBe(5);
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });

  it('should sanitize valid KV settings while preserving supported fields', () => {
    const legacySettings = {
      reading_speed: 320,
      theme: 'dark',
      editor_font_size: 'large',
      voiceover_cues: ['停顿 3s'],
    } as Partial<AppSettings>;
    const settings = sanitizeAppSettings(legacySettings);
    expect(settings.reading_speed).toBe(320);
    expect(settings.theme).toBe('dark');
    expect(settings.editor_font_size).toBe('large');
    expect(settings).not.toHaveProperty('voiceover_cues');
    expect(settings).not.toHaveProperty('stale_action_days');
    expect(settings).not.toHaveProperty('trash_retention_days');
    expect(settings).not.toHaveProperty('public_base_url');
    expect(settings).not.toHaveProperty('typewriter_mode_default');
  });

  it('uses the fixed voiceover cue set with distinct semantic tone groups', () => {
    expect(VOICEOVER_CUES.map(({ label }) => label)).toEqual([
      '停顿', '重音', '反问', '反讽', '加快', '放慢', '克制', '迟疑',
    ]);
    expect(getVoiceoverCueTone('停顿')).toBe('rhythm');
    expect(getVoiceoverCueTone('重音')).toBe('emphasis');
    expect(getVoiceoverCueTone('反问')).toBe('intent');
    expect(getVoiceoverCueTone('克制')).toBe('emotion');
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
