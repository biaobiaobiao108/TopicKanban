import { describe, it, expect } from 'vitest';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../src/types';
import { parseSettings } from '../src/server/database';

describe('Settings KV Model and Parser', () => {
  it('should have valid DEFAULT_APP_SETTINGS', () => {
    expect(DEFAULT_APP_SETTINGS.reading_speed).toBe(280);
    expect(DEFAULT_APP_SETTINGS.theme).toBe('light');
  });

  it('should parse valid settings from key-value pairs', () => {
    const rows = [
      { key: 'reading_speed', value: '320' },
      { key: 'theme', value: 'dark' },
    ];
    const settings = parseSettings(rows);
    expect(settings.reading_speed).toBe(320);
    expect(settings.theme).toBe('dark');
  });

  it('should fallback to defaults on empty or invalid inputs', () => {
    expect(parseSettings([])).toEqual({ reading_speed: 280, theme: 'light' });
    expect(parseSettings(undefined)).toEqual({ reading_speed: 280, theme: 'light' });

    const invalidRows = [
      { key: 'reading_speed', value: '-50' },
      { key: 'theme', value: 'cyberpunk-neon' },
    ];
    const settings = parseSettings(invalidRows);
    expect(settings.reading_speed).toBe(280);
    expect(settings.theme).toBe('light');
  });

  it('should accept system theme', () => {
    const rows = [
      { key: 'reading_speed', value: '260' },
      { key: 'theme', value: 'system' },
    ];
    const settings = parseSettings(rows);
    expect(settings.reading_speed).toBe(260);
    expect(settings.theme).toBe('system');
  });
});
