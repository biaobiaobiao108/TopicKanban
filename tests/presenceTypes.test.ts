import { describe, it, expect } from 'bun:test';
import type { QuickDropItem, PresenceState } from '../src/types';

describe('Quick drop and presence API types', () => {
  it('should construct valid QuickDropItem structure', () => {
    const item: QuickDropItem = {
      id: 'drop_123456',
      content: '某知名主播被曝偷税漏税后续进展',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      source: 'iOS快捷指令',
      created_at: new Date().toISOString(),
    };

    expect(item.id).toMatch(/^drop_/);
    expect(item.url).toContain('bilibili.com');
  });

  it('should handle PresenceState locking logic', () => {
    const unLocked: PresenceState = { is_locked: false };
    expect(unLocked.is_locked).toBe(false);

    const locked: PresenceState = {
      is_locked: true,
      active_editor: {
        client_id: 'client_mac_999',
        device_name: 'Mac (Chrome)',
        updated_at: new Date().toISOString(),
      },
    };
    expect(locked.is_locked).toBe(true);
    expect(locked.active_editor?.device_name).toBe('Mac (Chrome)');
  });
});
