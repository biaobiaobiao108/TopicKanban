import { describe, it, expect } from 'vitest';
import type { ShareSnapshot, QuickDropItem, PresenceState } from '../src/types';

describe('KV Feature Types & Utilities', () => {
  it('should construct valid ShareSnapshot structure', () => {
    const snapshot: ShareSnapshot = {
      token: 'rv_test_12345678',
      topic_id: 'topic-1',
      topic_title: '测试爆款人物解说',
      hook: '从普通打工人到全网顶流的反差故事',
      summary: '梳理其关键转折点与争议事件',
      content_html: '<h1>第一章：起因</h1><p>故事要从这里说起……</p>',
      word_count: 3200,
      reading_speed: 280,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
    };

    expect(snapshot.token).toMatch(/^rv_/);
    expect(snapshot.word_count).toBe(3200);
    expect(Math.round(snapshot.word_count / snapshot.reading_speed)).toBe(11);
  });

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
